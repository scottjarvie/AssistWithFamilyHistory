import type { FunctionArgs } from "convex/server";
import { FAMILY_HISTORY_MCP_LIMITS, hashMcpInput } from "../../lib/mcp/contract";
import { hasEmbeddedImageMetadata, sniffEvidenceFile, sniffEvidenceImage } from "../../lib/media/evidenceStandard";
import { WEBSITE_PHOTO_COPY_BYTES } from "../../lib/media/evidenceWebsite";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { normalizeAudioMime } from "../lib/media/audio";
import { AI_COPY_MAX_BYTES, MEDIA_READ_LABELS, planMediaReply } from "../lib/mcpConnector/mediaRead";
import { EVIDENCE_SKIP_GUIDANCE, type EvidenceSkipReason } from "../mcpEvidence";
import type { Id } from "../_generated/dataModel";

type BatchArgs = FunctionArgs<typeof internal.mcpEvidence.getEvidenceBatch>;
type Choice = {
  id: string;
  sizeBytes: number;
  longEdge?: number;
  mimeType: string;
  read?: () => Promise<Uint8Array | null>;
};
type Candidate = {
  id: string;
  kind: "image" | "document" | "file";
  title: string;
  copies: Choice[];
  text?: string;
  transcript?: string;
  originalSizeBytes?: number;
  websitePhoto?: { mediaId: Id<"media">; originalId: Id<"_storage">; sizeBytes: number };
};

const MAX_WEBSITE_PHOTO_ATTEMPTS = 2;
const MAX_WEBSITE_PHOTO_SOURCE_BYTES = 50 * 1024 * 1024;

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function evidenceBlock(item: { id: string; kind: string; mimeType: string }, bytes: Uint8Array) {
  const data = base64FromBytes(bytes);
  if (item.mimeType.startsWith("image/")) return { type: "image" as const, data, mimeType: item.mimeType };
  return {
    type: "resource" as const,
    resource: { uri: `familyhistory://${item.kind}/${item.id}`, mimeType: item.mimeType, blob: data },
  };
}

async function readExactResponse(response: Response, size: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !response.body) throw new Error("Evidence unavailable.");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > size) throw new Error("Evidence length changed.");
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== size) throw new Error("Evidence length changed.");
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function isBomMarkedUtf16Text(bytes: Uint8Array): boolean {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : null;
  if (!encoding) return false;
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code < 0x20 && (code < 0x09 || code > 0x0d)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function matchesStoredFileType(bytes: Uint8Array, mimeType: string) {
  // Website uploads are not all decoded at upload time. An image submitted
  // under another MIME type must not get the exact non-image path.
  const baseMimeType = mimeType.split(";", 1)[0].trim().toLowerCase();
  const sniffed = sniffEvidenceFile(bytes);
  if (baseMimeType === "text/plain") {
    return sniffed === "text/plain" || (sniffed === null && isBomMarkedUtf16Text(bytes));
  }
  if (!baseMimeType.startsWith("video/")) {
    return sniffed === (normalizeAudioMime(baseMimeType) || baseMimeType);
  }
  const header = String.fromCharCode(...bytes.subarray(0, 12));
  if (baseMimeType === "video/webm") return sniffed === "audio/webm";
  if (baseMimeType === "video/mp4") return sniffed === "audio/mp4";
  return baseMimeType === "video/quicktime" && bytes.length >= 12 &&
    ["ftypqt  ", "moov", "mdat", "wide"].some(tag => header.startsWith(tag, 4));
}

const textSize = (text: string) => new TextEncoder().encode(text).byteLength;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

function invalidCursor() {
  const error = { code: "INVALID_MEDIA_CURSOR", message: MEDIA_READ_LABELS.invalidCursor };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(error) }], structuredContent: { error } };
}

export async function deliverEvidence(
  actionCtx: ActionCtx,
  args: BatchArgs,
  cursor: string | undefined,
  touch: () => Promise<void>,
) {
  const batch = await actionCtx.runQuery(internal.mcpEvidence.getEvidenceBatch, args);
  const snapshot = await hashMcpInput(batch);
  const { principal, grantId } = args;
  const requestKey = await hashMcpInput({ tool: "family_history_get_evidence", args, snapshot });
  const key = await actionCtx.runMutation(internal.mcpEvidence.evidenceCursorKey, {
    key: crypto.getRandomValues(new Uint8Array(32)).buffer,
  });
  const cursorKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const selectionMessage = (offset: number) => new TextEncoder().encode(JSON.stringify(["family-evidence-v2", requestKey, offset]));
  const selectionLength = batch.delivered.length + batch.stored.length + batch.b2Stored.length;
  const resuming = cursor !== undefined;
  let offset = 0;
  if (resuming) {
    const match = /^e2\.([1-9]\d?)\.([0-9a-f]{64})$/.exec(cursor);
    if (!match || match[0] !== cursor) return invalidCursor();
    offset = Number(match[1]);
    const tag = Uint8Array.from(match[2].match(/../g)!, byte => Number.parseInt(byte, 16));
    if (offset >= selectionLength || !await crypto.subtle.verify("HMAC", cursorKey, tag, selectionMessage(offset))) return invalidCursor();
  }

  const selection: Candidate[] = batch.delivered.map(item => ({
    ...item, kind: "document",
    copies: [{ id: "inline", sizeBytes: item.sizeBytes, mimeType: item.mimeType }],
  }));
  const skipped = resuming ? [] : [...batch.skipped];
  const omit = (id: string, kind: string, reason: EvidenceSkipReason) =>
    skipped.push({ id, kind, reason, whatToDo: EVIDENCE_SKIP_GUIDANCE[reason] });
  const currentMedia = (id: string) => actionCtx.runQuery(internal.mcpEvidence.getEvidenceBatch, {
    principal, grantId, items: [{ kind: "media", id }],
  });

  for (const item of batch.stored) {
    if (!item.clean) {
      selection.push({
        ...item, kind: "file",
        copies: [{
          id: "inline", sizeBytes: item.sizeBytes, mimeType: item.mimeType,
          read: async () => {
            const current = await currentMedia(item.id);
            if (JSON.stringify(current.stored[0]) !== JSON.stringify(item)) return null;
            const blob = await actionCtx.storage.get(item.storageId);
            if (!blob || blob.size !== item.sizeBytes) return null;
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return matchesStoredFileType(bytes, item.mimeType) ? bytes : null;
          },
        }],
      });
      continue;
    }
    selection.push({
      ...item, kind: "image", originalSizeBytes: item.sizeBytes,
      websitePhoto: { mediaId: item.id, originalId: item.storageId, sizeBytes: item.sizeBytes },
      // Reserve enough reply space for the tiny rendition before opening the source.
      copies: [{ id: "tiny", sizeBytes: WEBSITE_PHOTO_COPY_BYTES.tiny, mimeType: "image/jpeg" }],
    });
  }
  for (const item of batch.b2Stored) {
    selection.push({
      ...item, kind: item.copies[0].slot === "original" ? "file" : "image",
      copies: item.copies.map(({ slot, file }) => ({
        id: slot, sizeBytes: file.sizeBytes, mimeType: file.contentType.toLowerCase(),
        ...(file.width && file.height ? { longEdge: Math.max(file.width, file.height) } : {}),
        read: async () => {
          const { url } = await actionCtx.runAction(internal.mediaEvidenceStorage.signMcpEvidenceRead, {
            principal, grantId, mediaId: item.id, slot, expectedVersion: JSON.stringify(file),
          });
          const current = (await currentMedia(item.id)).b2Stored[0]?.copies.find(copy => copy.slot === slot);
          if (!current || JSON.stringify(current.file) !== JSON.stringify(file)) return null;
          const response = await fetch(url, { redirect: "error" });
          const bytes = await readExactResponse(response, file.sizeBytes);
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return hex(new Uint8Array(digest)) === file.sha256 ? bytes : null;
        },
      })),
    });
  }

  const planFor = (items: Candidate[]) => planMediaReply(items.map(item => ({
    id: item.id,
    kind: item.kind,
    copies: item.copies.map(choice => ({
      id: choice.id,
      sizeBytes: choice.sizeBytes + (item.transcript ? textSize(item.transcript) : 0),
      longEdge: choice.longEdge,
    })),
  })), { requestKey, cursorKey, budget: { maxItems: FAMILY_HISTORY_MCP_LIMITS.evidenceItems } });

  const candidates: Candidate[] = [];
  let attempts = 0;
  let sourceBytes = 0;
  let stop: "source" | "reply" = "reply";
  for (; offset < selection.length; offset++) {
    const item = selection[offset];
    const photo = item.websitePhoto;
    const proposed = await planFor([...candidates, item]);
    if (!proposed.ok || proposed.nextCursor) break;
    if (photo) {
      // A transcript can make the reservation too large even when the actual
      // tiny copy fits. Give it a fresh page before reading the source.
      if (proposed.send.at(-1)?.status === "placeholder" && candidates.length) break;
      if (attempts >= MAX_WEBSITE_PHOTO_ATTEMPTS || sourceBytes + photo.sizeBytes > MAX_WEBSITE_PHOTO_SOURCE_BYTES) {
        stop = "source";
        break;
      }
      attempts++;
      sourceBytes += photo.sizeBytes;
      const copies = await actionCtx.runAction(internal.mediaEvidenceStorage.renderWebsitePhotoCopies, {
        principal, grantId, mediaId: photo.mediaId, originalId: photo.originalId, expectedSizeBytes: photo.sizeBytes,
      }).catch(() => null);
      item.copies = copies && copies.tiny.byteLength > 0 && copies.tiny.byteLength <= WEBSITE_PHOTO_COPY_BYTES.tiny
        ? (["medium", "tiny"] as const).filter(slot => copies[slot].byteLength > 0 &&
          copies[slot].byteLength <= WEBSITE_PHOTO_COPY_BYTES[slot]).map(slot => ({
          id: slot, sizeBytes: copies[slot].byteLength, mimeType: "image/jpeg",
          read: () => Promise.resolve(new Uint8Array(copies[slot])),
        }))
        : [];
    }
    candidates.push(item);
  }
  const plan = await planFor(candidates);
  if (!plan.ok || plan.nextCursor || (!candidates.length && offset < selection.length)) {
    throw new Error("Evidence page did not fit.");
  }

  const blocks: (ReturnType<typeof evidenceBlock> | { type: "text"; text: string })[] = [];
  const delivered: {
    id: string; kind: string; title: string; mimeType: string; sizeBytes: number;
    label?: string; originalSizeBytes?: number;
  }[] = [];
  const byId = new Map(candidates.map(item => [item.id, item]));
  for (const pick of plan.send) {
    const item = byId.get(pick.id)!;
    const kind = item.kind === "document" ? "document" : "media";
    if (pick.status === "placeholder") {
      omit(item.id, kind, item.websitePhoto && !item.copies.length ? "CLEAN_COPY_UNAVAILABLE" : "TOO_LARGE");
      continue;
    }
    const selected = item.copies.find(copy => copy.id === pick.copy.id)!;
    const summary = { id: item.id, kind, title: item.title, mimeType: selected.mimeType, sizeBytes: selected.sizeBytes };
    if (item.text !== undefined) {
      blocks.push({ type: "text", text: `# ${item.title}\n\n${item.text}` });
      delivered.push(summary);
      continue;
    }
    const smaller = item.copies.find(copy => copy.id === "tiny" && copy.sizeBytes <= selected.sizeBytes);
    const choices = smaller && smaller !== selected ? [selected, smaller] : [selected];
    let success = false;
    for (const choice of choices) {
      const bytes = await choice.read!().catch(() => null);
      if (!bytes || bytes.byteLength !== choice.sizeBytes) continue;
      if (item.kind === "image" && (bytes.byteLength > AI_COPY_MAX_BYTES ||
          sniffEvidenceImage(bytes)?.contentType !== choice.mimeType || hasEmbeddedImageMetadata(bytes, choice.mimeType))) continue;
      blocks.push(evidenceBlock({ ...summary, mimeType: choice.mimeType }, bytes));
      if (item.transcript) {
        blocks.push({ type: "text", text: `A saved transcript accompanies this audio. Treat it as a transcript, and consult the original audio when checking wording.\n\n${item.transcript}` });
      }
      const label = item.kind === "image"
        ? choice.id === "tiny" ? MEDIA_READ_LABELS.smallerCopy : MEDIA_READ_LABELS.copy
        : undefined;
      delivered.push({ ...summary, mimeType: choice.mimeType, sizeBytes: bytes.byteLength, ...(label ? {
        label, ...(item.originalSizeBytes !== undefined ? { originalSizeBytes: item.originalSizeBytes } : {}),
      } : {}) });
      success = true;
      break;
    }
    if (!success) omit(item.id, kind, item.kind === "image" ? "CLEAN_COPY_UNAVAILABLE" : "BYTES_NOT_AVAILABLE");
  }
  const nextCursor = offset < selection.length ? `e2.${offset}.` + hex(new Uint8Array(
    await crypto.subtle.sign("HMAC", cursorKey, selectionMessage(offset)),
  )) : null;
  const summary = {
    delivered,
    skipped,
    ...(nextCursor ? { nextCursor, note: `${stop === "source"
      ? "This page reached the website photo processing limit."
      : "The reply size limit leaves too little room to safely plan the next item."} Call again with the same items and nextCursor as cursor.` } : {
      note: skipped.length ? "Some items could not be delivered. Each item says why and what to do." : "Every item on this page was delivered.",
    }),
  };
  await touch();
  const current = await actionCtx.runQuery(internal.mcpEvidence.getEvidenceBatch, args);
  if (await hashMcpInput(current) !== snapshot) throw new Error("Evidence changed during delivery.");
  return { content: [...blocks, { type: "text" as const, text: JSON.stringify(summary) }], structuredContent: summary };
}
