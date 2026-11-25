/**
 * Protected evidence delivery for `family_history_get_evidence`.
 *
 * The point of this tool is that a model never has to — and never gets to —
 * fetch a private file itself. A raw storage URL is on the NEVER_EXPOSED list;
 * bytes come back through this connection or they do not come back at all.
 *
 * Three kinds of item exist, in descending order of trust:
 *
 * 1. **Stored files** — private Convex uploads and pinned Backblaze objects.
 *    The transport serves cleaned image copies and eligible inline files.
 * 2. **Documents** — person document text, which genuinely lives in Convex.
 * 3. **Remote references** (`url`) — usually a FamilySearch memory. These stay
 *    user-mediated. The server does not fetch arbitrary record URLs; the item
 *    reports honestly that its bytes are unavailable until the person uploads
 *    them through the vault.
 *
 * `BYTES_NOT_AVAILABLE` still exists, and still means what it says: a row that
 * holds only a `filePath` hint, or a remote reference the server cannot read,
 * comes back as honest metadata plus a recovery. We do not pretend byte
 * delivery works where it does not.
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { matchesVaultOwner } from "./vaultCore";
import { assertGrantPermits } from "./mcpGrants";
import { resolveOwnedDocumentPerson } from "./documents";
import { effectiveExpiry } from "../lib/mcp/grantDefaults";
import { FAMILY_HISTORY_MCP_LIMITS, hashMcpInput } from "../lib/mcp/contract";
import { isRenderedEvidenceImage } from "../lib/media/evidenceStandard";
import { isAcceptedMediaUploadType } from "../lib/media/uploadContract";
import { WEBSITE_IMAGE_FORMATS, WEBSITE_PHOTO_MAX_BYTES } from "../lib/media/evidenceWebsite";

const principalValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
  clientId: v.string(),
  scopes: v.array(v.string()),
});
const photoArgs = {
  principal: principalValidator,
  grantId: v.optional(v.string()),
  mediaId: v.id("media"),
  originalId: v.id("_storage"),
};

export type EvidenceSkipReason =
  | "NOT_REVIEWED"
  | "AI_USE_NOT_ALLOWED"
  | "RIGHTS_RESTRICTED"
  | "TOO_LARGE"
  | "CLEAN_COPY_UNAVAILABLE"
  | "BYTES_NOT_AVAILABLE"
  | "OUTSIDE_GRANT_BOUNDARY";

/**
 * Every reason says what happened and what to do about it. `OUTSIDE_GRANT_BOUNDARY`
 * covers "does not exist", "belongs to someone else", and "outside the approved
 * boundary" on purpose — a skip reason must never work as an existence oracle.
 */
export const EVIDENCE_SKIP_GUIDANCE: Record<EvidenceSkipReason, string> = {
  NOT_REVIEWED:
    "The person has not reviewed this item yet. Ask them to review it in Assist With Family History, or work from what you already have and say which evidence you could not see.",
  AI_USE_NOT_ALLOWED:
    "The person has not allowed AI use for this item. Do not ask again in this pass; note the gap in your result instead.",
  RIGHTS_RESTRICTED:
    "This item's rights status is restricted, so it cannot be sent to an AI. Cite it by title in your result rather than quoting it.",
  TOO_LARGE:
    "This item exceeds a protected delivery limit. Work from its title and any linked citation.",
  CLEAN_COPY_UNAVAILABLE:
    "A cleaned image could not be delivered. Work from its title and any linked citation.",
  BYTES_NOT_AVAILABLE:
    "Assist With Family History holds a reference to this file but not its bytes, so there is nothing to deliver. Use its title, description, and any linked citation, and tell the person that uploading the file to this item would let you read it.",
  OUTSIDE_GRANT_BOUNDARY:
    "This item is not inside the part of the research this connection was approved for. Stay with the records this connection already returned.",
};

type Skip = { id: string; kind: string; reason: EvidenceSkipReason; whatToDo: string };

function skip(id: string, kind: string, reason: EvidenceSkipReason): Skip {
  return { id, kind, reason, whatToDo: EVIDENCE_SKIP_GUIDANCE[reason] };
}

function boundaryAllowsPerson(
  boundary: Doc<"mcpGrants">["boundary"],
  personIds: string[],
): boolean {
  if (boundary.kind === "queue_only") return false;
  if (boundary.kind === "whole_workspace") return true;
  const allowed = new Set(boundary.personIds ?? []);
  // An item with no person attached cannot be shown to be inside a
  // selected-people boundary, so it is refused rather than guessed at.
  return personIds.length > 0 && personIds.some((id) => allowed.has(id));
}

function mediaSkipReason(row: Doc<"media"> | null, grant: Doc<"mcpGrants">): EvidenceSkipReason | null {
  if (!row || row.archivedAt !== undefined || !matchesVaultOwner(row.vaultOwnerId, grant.vaultOwnerId) ||
      !boundaryAllowsPerson(grant.boundary, row.personIds.map(String))) return "OUTSIDE_GRANT_BOUNDARY";
  if (row.reviewStatus !== "reviewed") return "NOT_REVIEWED";
  if (row.aiUseAllowed !== true) return "AI_USE_NOT_ALLOWED";
  if (row.rightsStatus === "restricted") return "RIGHTS_RESTRICTED";
  if (row.mediaState !== undefined && row.mediaState !== "ready") return "BYTES_NOT_AVAILABLE";
  return null;
}

async function evidenceGrant(ctx: QueryCtx, args: {
  principal: { subject: string; issuer: string; clientId: string };
  grantId?: string;
  items: { kind: string; id: string }[];
}) {
  return (await assertGrantPermits(ctx, {
    owner: args.principal.subject.trim(),
    principal: args.principal,
    grantId: args.grantId,
    toolName: "family_history_get_evidence",
    input: { items: args.items },
  }))!;
}

export const authorizeWebsitePhoto = internalQuery({
  args: photoArgs,
  handler: async (ctx, args) => {
    const grant = await evidenceGrant(ctx, { ...args, items: [{ kind: "media", id: args.mediaId }] });
    const row = await ctx.db.get(args.mediaId);
    if (!row || mediaSkipReason(row, grant) || row.b2Original || row.b2Renditions || row.storageId !== args.originalId) return null;
    const mimeType = row.mimeType?.toLowerCase() ?? "";
    if (!WEBSITE_IMAGE_FORMATS.has(mimeType)) return null;
    const file = await ctx.db.system.get(args.originalId);
    if (!file || file.size <= 0 || file.size > WEBSITE_PHOTO_MAX_BYTES ||
        (file.contentType && file.contentType.toLowerCase() !== mimeType)) return null;
    return { mimeType, sizeBytes: file.size };
  },
});

export const evidenceCursorKey = internalMutation({
  args: { key: v.bytes() },
  handler: async (ctx, { key }) => {
    const existing = await ctx.db.query("mcpEvidenceCursorKeys").first();
    if (existing) return existing.key;
    if (key.byteLength !== 32) throw new Error("Invalid evidence cursor key.");
    await ctx.db.insert("mcpEvidenceCursorKeys", { key });
    return key;
  },
});

// The owner approved exact bytes through the existing evidence path for legacy
// Convex files and B2 items with no display copy. For B2 records with a display
// copy, that approval covered the cleaned copy only.
async function originalForGrant(ctx: QueryCtx, grant: Doc<"mcpGrants">, mediaId: Doc<"media">["_id"]) {
  const row = await ctx.db.get(mediaId);
  if (!row || mediaSkipReason(row, grant)) return null;
  if (row.mediaState === "ready" && row.b2Renditions) return null;
  if (row.mediaState === "ready" && row.b2Original) {
    if (row.b2Original.bucketClass !== "private") return null;
    return { original: row.b2Original, version: JSON.stringify([row.b2Original.bucketName, row.b2Original.objectKey, row.b2Original.versionId]), mimeType: row.b2Original.contentType };
  }
  if (row.storageId) return { storageId: row.storageId, version: row.storageId, mimeType: row.mimeType ?? "application/octet-stream" };
  return null;
}

export const mintOriginalLink = internalMutation({
  args: { principal: principalValidator, grantId: v.string(), mediaId: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const grant = await assertGrantPermits(ctx, {
      owner: args.principal.subject, grantId: args.grantId, principal: args.principal,
      toolName: "family_history_get_evidence", input: { items: [{ kind: "media", id: args.mediaId }] },
    });
    const mediaId = ctx.db.normalizeId("media", args.mediaId);
    if (!grant || !mediaId) return null;
    const file = await originalForGrant(ctx, grant, mediaId);
    if (!file) return null;
    const now = Date.now();
    const expiresAt = Math.min(now + 60_000, effectiveExpiry(grant) ?? Infinity);
    const expired = await ctx.db.query("mcpEvidenceOriginalLinks").withIndex("by_expiry", q => q.lte("expiresAt", now)).take(20);
    for (const row of expired) await ctx.db.delete(row._id);
    await ctx.db.insert("mcpEvidenceOriginalLinks", {
      tokenHash: args.tokenHash, grantId: grant._id, owner: grant.vaultOwnerId, issuer: grant.issuer,
      clientId: grant.clientId, mediaId, fileVersion: file.version, expiresAt,
    });
    return { expiresAt };
  },
});

export const resolveOriginalLink = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashMcpInput(token);
    const link = await ctx.db.query("mcpEvidenceOriginalLinks").withIndex("by_hash", q => q.eq("tokenHash", tokenHash)).unique();
    if (!link || link.expiresAt <= Date.now()) return null;
    const grant = await assertGrantPermits(ctx, {
      owner: link.owner, grantId: link.grantId, principal: link,
      toolName: "family_history_get_evidence", input: { items: [{ kind: "media", id: link.mediaId }] },
    });
    const file = grant ? await originalForGrant(ctx, grant, link.mediaId) : null;
    return file?.version === link.fileVersion ? file : null;
  },
});

/**
 * Resolve one batch of evidence items. Text that genuinely lives in Convex is
 * available inline. Private object descriptors stay inside the backend, where
 * the transport uses them to plan and reauthorize each read.
 */
export const getEvidenceBatch = internalQuery({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    items: v.array(v.object({ kind: v.union(v.literal("media"), v.literal("document")), id: v.string() })),
  },
  handler: async (ctx, args) => {
    const owner = args.principal.subject.trim();
    const grant = await evidenceGrant(ctx, args);
    const boundary = grant.boundary;

    const delivered: Array<{
      id: string;
      kind: string;
      title: string;
      mimeType: string;
      sizeBytes: number;
      text: string;
    }> = [];
    // Bytes the vault actually holds. The transport reads these objects
    // directly out of private storage — no URL is minted, so there is nothing
    // for a model or a proxy to follow.
    const stored: Array<{
      id: Doc<"media">["_id"];
      kind: string;
      title: string;
      mimeType: string;
      storageId: NonNullable<Doc<"media">["storageId"]>;
      sizeBytes: number;
      clean: boolean;
      transcript?: string;
    }> = [];
    const b2Stored: Array<{
      transcript?: string;
      id: string;
      kind: string;
      title: string;
      originalSizeBytes?: number;
      copies: {
        slot: "medium" | "tiny" | "original";
        file: NonNullable<Doc<"media">["b2Original"]>;
      }[];
    }> = [];
    const skipped: Skip[] = [];

    const seen = new Set<string>();
    for (const item of args.items.slice(0, FAMILY_HISTORY_MCP_LIMITS.evidenceItems)) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (item.kind === "media") {
        const id = ctx.db.normalizeId("media", item.id);
        const row = id ? await ctx.db.get(id) : null;
        const reason = mediaSkipReason(row, grant);
        if (reason || !row) {
          skipped.push(skip(item.id, item.kind, reason ?? "OUTSIDE_GRANT_BOUNDARY"));
          continue;
        }
        const common = { id: row._id, kind: "media" as const, title: row.title,
          ...(row.type === "audio" && row.transcript ? { transcript: row.transcript } : {}) };
        if (row.b2Original || row.b2Renditions) {
          if (row.mediaState !== "ready") {
            skipped.push(skip(item.id, item.kind, "BYTES_NOT_AVAILABLE"));
            continue;
          }
          const copies: (typeof b2Stored)[number]["copies"] = [];
          if (row.b2Renditions) {
            for (const slot of ["medium", "tiny"] as const) {
              const file = row.b2Renditions[slot];
              if (file.metadataClean && file.bucketClass === "private" &&
                  isRenderedEvidenceImage(file.contentType) &&
                  (!file.sourceSha256 || file.sourceSha256 === row.b2Original?.sha256) &&
                  Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > 0) copies.push({ slot, file });
            }
            if (!copies.length) skipped.push(skip(item.id, item.kind, "CLEAN_COPY_UNAVAILABLE"));
          } else if (row.b2Original) {
            const file = row.b2Original;
            if (file.contentType.toLowerCase().startsWith("image/")) {
              skipped.push(skip(item.id, item.kind, "CLEAN_COPY_UNAVAILABLE"));
            } else if (file.sizeBytes > FAMILY_HISTORY_MCP_LIMITS.evidencePerItemBytes) {
              skipped.push(skip(item.id, item.kind, "TOO_LARGE"));
            } else if (file.bucketClass === "private" && isAcceptedMediaUploadType(file.contentType) &&
                Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > 0) {
              copies.push({ slot: "original", file });
            } else {
              skipped.push(skip(item.id, item.kind, "BYTES_NOT_AVAILABLE"));
            }
          }
          if (copies.length) b2Stored.push({ ...common, copies, ...(row.b2Original ? {
            originalSizeBytes: row.b2Original.sizeBytes,
          } : {}) });
        } else if (row.storageId) {
          const mimeType = row.mimeType?.toLowerCase() ?? "";
          const clean = mimeType.startsWith("image/");
          const limit = clean ? WEBSITE_PHOTO_MAX_BYTES : FAMILY_HISTORY_MCP_LIMITS.evidencePerItemBytes;
          const file = await ctx.db.system.get(row.storageId);
          if ((row.sizeBytes ?? 0) > limit || (file?.size ?? 0) > limit) {
            skipped.push(skip(item.id, item.kind, "TOO_LARGE"));
          } else if (!file || file.size <= 0 || (file.contentType && file.contentType.toLowerCase() !== mimeType) ||
              !(clean ? WEBSITE_IMAGE_FORMATS.has(mimeType) : isAcceptedMediaUploadType(mimeType))) {
            skipped.push(skip(item.id, item.kind, clean ? "CLEAN_COPY_UNAVAILABLE" : "BYTES_NOT_AVAILABLE"));
          } else {
            stored.push({ ...common, storageId: row.storageId, mimeType, sizeBytes: file.size, clean });
          }
        } else {
          // FamilySearch and other remote references are always user-mediated.
          skipped.push(skip(item.id, item.kind, "BYTES_NOT_AVAILABLE"));
        }
        continue;
      }

      const id = ctx.db.normalizeId("documents", item.id);
      const row = id ? await ctx.db.get(id) : null;
      if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) {
        skipped.push(skip(item.id, item.kind, "OUTSIDE_GRANT_BOUNDARY"));
        continue;
      }
      const person = await resolveOwnedDocumentPerson(ctx, owner, row.personId, true);
      if (!person || !boundaryAllowsPerson(boundary, [String(person._id)])) {
        skipped.push(skip(item.id, item.kind, "OUTSIDE_GRANT_BOUNDARY"));
        continue;
      }
      // Person documents carry no separate AI-use review flag, so the
      // living-person rule that governs the rest of this surface governs them.
      if (person.living !== false) {
        skipped.push(skip(item.id, item.kind, "AI_USE_NOT_ALLOWED"));
        continue;
      }
      const text = row.contentMarkdown || row.contentText;
      if (!text) {
        skipped.push(skip(item.id, item.kind, "BYTES_NOT_AVAILABLE"));
        continue;
      }
      const sizeBytes = new TextEncoder().encode(text).byteLength;
      if (sizeBytes > FAMILY_HISTORY_MCP_LIMITS.evidencePerItemBytes) {
        skipped.push(skip(item.id, item.kind, "TOO_LARGE"));
        continue;
      }
      delivered.push({
        id: String(row._id),
        kind: "document",
        title: row.title,
        mimeType: "text/markdown",
        sizeBytes,
        text,
      });
    }

    if (args.items.length > FAMILY_HISTORY_MCP_LIMITS.evidenceItems) {
      for (const extra of args.items.slice(FAMILY_HISTORY_MCP_LIMITS.evidenceItems)) {
        skipped.push({
          id: extra.id,
          kind: extra.kind,
          reason: "TOO_LARGE",
          whatToDo: `Ask for at most ${FAMILY_HISTORY_MCP_LIMITS.evidenceItems} evidence items per call and request the rest in a second call.`,
        });
      }
    }

    // Kept as an always-empty field for old internal consumers while the
    // former arbitrary remote-fetch path is retired.
    return { delivered, stored, b2Stored, fetchable: [] as never[], skipped, boundary };
  },
});
