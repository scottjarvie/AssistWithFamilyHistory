/**
 * Protected evidence delivery for `family_history_get_evidence`.
 *
 * The point of this tool is that a model never has to — and never gets to —
 * fetch a private file itself. A raw storage URL is on the NEVER_EXPOSED list;
 * bytes come back through this connection or they do not come back at all.
 *
 * HONEST LIMIT, and the reason `BYTES_NOT_AVAILABLE` exists:
 * `media` rows in this product carry `filePath`/`url` references, and the byte
 * store (`lib/storage/objectStore.ts`, Backblaze B2) lives in the Node/Next
 * runtime, not the Convex runtime — today nothing writes to it. So we deliver
 * bytes where a fetchable `url` genuinely exists, deliver `documents` text
 * (which really is stored in Convex), and return honest metadata plus a
 * recovery for everything else. We do not pretend byte delivery works.
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { matchesVaultOwner } from "./vaultCore";
import { assertGrantPermits } from "./mcpGrants";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";

const principalValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
  clientId: v.string(),
  scopes: v.array(v.string()),
});

export type EvidenceSkipReason =
  | "NOT_REVIEWED"
  | "AI_USE_NOT_ALLOWED"
  | "RIGHTS_RESTRICTED"
  | "TOO_LARGE"
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
    "This item is larger than one protected delivery allows. Ask for it on its own, or work from its title and description.",
  BYTES_NOT_AVAILABLE:
    "Assist With Family History holds a reference to this file but not its bytes, so there is nothing to deliver. Use its title, description, and any linked citation, and tell the person the original file is not reachable from here.",
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

/**
 * Resolve one batch of evidence items. Text that genuinely lives in Convex is
 * returned inline; anything whose bytes live behind a URL is handed to the
 * transport action to fetch under a byte budget, so this query stays pure.
 */
export const getEvidenceBatch = internalQuery({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    items: v.array(v.object({ kind: v.union(v.literal("media"), v.literal("document")), id: v.string() })),
  },
  handler: async (ctx, args) => {
    const owner = args.principal.subject.trim();
    const grant = await assertGrantPermits(ctx, {
      owner,
      grantId: args.grantId,
      toolName: "family_history_get_evidence",
      input: { items: args.items },
    });
    const boundary = grant!.boundary;

    const delivered: Array<{
      id: string;
      kind: string;
      title: string;
      mimeType: string;
      sizeBytes: number;
      text: string;
    }> = [];
    const fetchable: Array<{
      id: string;
      kind: string;
      title: string;
      mimeType: string;
      url: string;
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
        if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) {
          skipped.push(skip(item.id, item.kind, "OUTSIDE_GRANT_BOUNDARY"));
          continue;
        }
        if (!boundaryAllowsPerson(boundary, row.personIds.map(String))) {
          skipped.push(skip(item.id, item.kind, "OUTSIDE_GRANT_BOUNDARY"));
          continue;
        }
        // Exactly the gate the existing person-context path uses, plus rights.
        if (row.reviewStatus !== "reviewed") {
          skipped.push(skip(item.id, item.kind, "NOT_REVIEWED"));
          continue;
        }
        if (row.aiUseAllowed !== true) {
          skipped.push(skip(item.id, item.kind, "AI_USE_NOT_ALLOWED"));
          continue;
        }
        if (row.rightsStatus === "restricted") {
          skipped.push(skip(item.id, item.kind, "RIGHTS_RESTRICTED"));
          continue;
        }
        if (!row.url || !/^https:\/\//i.test(row.url)) {
          skipped.push(skip(item.id, item.kind, "BYTES_NOT_AVAILABLE"));
          continue;
        }
        fetchable.push({
          id: String(row._id),
          kind: "media",
          title: row.title,
          mimeType: row.mimeType ?? "application/octet-stream",
          url: row.url,
        });
        continue;
      }

      const id = ctx.db.normalizeId("documents", item.id);
      const row = id ? await ctx.db.get(id) : null;
      if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) {
        skipped.push(skip(item.id, item.kind, "OUTSIDE_GRANT_BOUNDARY"));
        continue;
      }
      if (!boundaryAllowsPerson(boundary, [String(row.personId)])) {
        skipped.push(skip(item.id, item.kind, "OUTSIDE_GRANT_BOUNDARY"));
        continue;
      }
      // Person documents carry no separate AI-use review flag, so the
      // living-person rule that governs the rest of this surface governs them.
      const personId = ctx.db.normalizeId("persons", String(row.personId));
      const person = personId ? await ctx.db.get(personId) : null;
      if (person && matchesVaultOwner(person.vaultOwnerId, owner) && person.living === true) {
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

    return { delivered, fetchable, skipped };
  },
});
