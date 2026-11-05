/* eslint-disable @typescript-eslint/no-explicit-any -- Privacy traversal checks a fixed record-table allowlist. */
import type { Doc, TableNames } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";
import { matchesVaultOwner } from "./vaultCore";

const NOTE_CONTEXT_TABLE: Record<string, TableNames> = {
  person: "persons", relationship: "relationships", event: "events", source: "sources",
  citation: "citations", media: "media", note: "notes", place: "places",
};

async function noteContextRow(ctx: QueryCtx, owner: string, kind: string, id: string): Promise<any | null> {
  const table = NOTE_CONTEXT_TABLE[kind];
  if (!table) return null;
  const normalized = ctx.db.normalizeId(table, id);
  const row = normalized ? await ctx.db.get(normalized) : null;
  return row && matchesVaultOwner((row as any).vaultOwnerId, owner) ? row : null;
}

/** A bounded, fail-closed privacy walk; cycles never skip an unchecked record. */
export async function canReadImportedNotes(ctx: QueryCtx, owner: string, kind: string, id: string,
  state = { seen: new Set<string>(), remaining: FAMILY_HISTORY_MCP_LIMITS.contextRows as number }): Promise<boolean> {
  const key = `${kind}:${id}`;
  if (state.seen.has(key)) return true;
  if (state.seen.size >= FAMILY_HISTORY_MCP_LIMITS.contextRows) return false;
  const row = await noteContextRow(ctx, owner, kind, id);
  if (!row) return false;
  state.seen.add(key);
  let refs: Array<{ kind: string; id: string }> = [];
  const limit = state.remaining + 1;
  if (kind === "person") return row.living === false;
  if (kind === "place") return true;
  if (kind === "relationship") refs = [row.person1, row.person2].map(id => ({ kind: "person", id: String(id) }));
  else if (kind === "event") {
    const roles = await ctx.db.query("personEvents").withIndex("by_event", q => q.eq("eventId", row._id)).take(limit);
    if (roles.some(role => !matchesVaultOwner(role.vaultOwnerId, owner))) return false;
    refs = roles.map(role => ({ kind: "person", id: String(role.personId) }));
  } else if (kind === "media") {
    if (row.aiUseAllowed !== true || row.privacyLevel === undefined || row.privacyLevel === "private"
      || !["reviewed", "redacted"].includes(row.reviewStatus) || row.rightsStatus === "restricted") return false;
    if (row.sourceId && !await noteContextRow(ctx, owner, "source", String(row.sourceId))) return false;
    refs = row.personIds.map((id: string) => ({ kind: "person", id: String(id) }));
  } else if (kind === "source") {
    const [citations, facts, media] = await Promise.all([
      ctx.db.query("citations").withIndex("by_source", q => q.eq("sourceId", row._id)).take(limit),
      ctx.db.query("sourceFacts").withIndex("by_source", q => q.eq("sourceId", row._id)).take(limit),
      ctx.db.query("media").withIndex("by_source", q => q.eq("sourceId", row._id)).take(limit),
    ]);
    if ([...citations, ...facts, ...media].some(item => !matchesVaultOwner(item.vaultOwnerId, owner))) return false;
    refs = [...citations.map(item => ({ kind: "citation", id: String(item._id) })),
      ...facts.map(item => ({ kind: "person", id: String(item.personId) })),
      ...media.map(item => ({ kind: "media", id: String(item._id) }))];
  } else if (kind === "citation") {
    if (!await noteContextRow(ctx, owner, "source", String(row.sourceId))) return false;
    const [links, facts] = await Promise.all([
      ctx.db.query("citationLinks").withIndex("by_citation", q => q.eq("citationId", row._id)).take(limit),
      ctx.db.query("sourceFacts").withIndex("by_citation", q => q.eq("citationId", row._id)).take(limit),
    ]);
    if ([...links, ...facts].some(item => !matchesVaultOwner(item.vaultOwnerId, owner))) return false;
    refs = [...links.map(link => ({ kind: link.targetType, id: link.targetId })), ...facts.map(fact => ({ kind: "person", id: String(fact.personId) }))];
  } else if (kind === "note") refs = [row.subject];
  else return false;
  if (refs.length > state.remaining) return false;
  state.remaining -= refs.length;
  for (const ref of refs) if (!await canReadImportedNotes(ctx, owner, ref.kind, ref.id, state)) return false;
  return true;
}


/** Filter every aggregated payload with the same predicate as direct citation reads. */
export async function filterMcpCitationRows<T extends Doc<"citations">>(ctx: QueryCtx, owner: string, rows: T[]) {
  const citations: T[] = [];
  const max = FAMILY_HISTORY_MCP_LIMITS.contextRows;
  for (const citation of rows.slice(0, max)) {
    if (matchesVaultOwner(citation.vaultOwnerId, owner) && await canReadImportedNotes(ctx, owner, "citation", String(citation._id))) citations.push(citation);
  }
  return { citations, allowedIds: new Set(citations.map(row => String(row._id))),
    withheld: citations.length !== rows.length, truncated: rows.length > max };
}

export function withoutInlineSourceNotes(source: Doc<"sources">): Doc<"sources"> {
  const result = { ...source };
  delete result.notes;
  return result;
}

export async function filterMcpSourceRows(ctx: QueryCtx, owner: string, rows: Doc<"sources">[]) {
  const sources: Doc<"sources">[] = [];
  const decisions = new Map<string, boolean>();
  let withheld = false;
  for (const source of rows.slice(0, FAMILY_HISTORY_MCP_LIMITS.contextRows)) {
    if (!matchesVaultOwner(source.vaultOwnerId, owner)) { withheld = true; continue; }
    const id = String(source._id);
    if (source.notes !== undefined && !decisions.has(id)) decisions.set(id, await canReadImportedNotes(ctx, owner, "source", id));
    if (source.notes !== undefined && decisions.get(id) === false) {
      sources.push(withoutInlineSourceNotes(source));
      withheld = true;
    } else sources.push(source);
  }
  return { sources, withheld, truncated: rows.length > FAMILY_HISTORY_MCP_LIMITS.contextRows };
}

/** MCP views are filtered before derived groups/claims are built; stored records stay intact. */
export async function filterMcpCitationSnapshot<T extends {
  citations: Doc<"citations">[]; citationLinks: Doc<"citationLinks">[]; sourceFacts: Doc<"sourceFacts">[]; stories: Doc<"stories">[]; sources: Doc<"sources">[];
}>(ctx: QueryCtx, owner: string, snapshot: T) {
  const result = await filterMcpCitationRows(ctx, owner, snapshot.citations);
  const checked = new Set(snapshot.citations.slice(0, FAMILY_HISTORY_MCP_LIMITS.contextRows).map(row => String(row._id)));
  const additional = [...new Set(snapshot.sourceFacts.map(row => String(row.citationId)))].filter(id => !checked.has(id));
  const remaining = Math.max(0, FAMILY_HISTORY_MCP_LIMITS.contextRows - checked.size);
  for (const id of additional.slice(0, remaining)) {
    if (await canReadImportedNotes(ctx, owner, "citation", id)) result.allowedIds.add(id);
  }
  const sourceFacts = snapshot.sourceFacts.filter(row => result.allowedIds.has(String(row.citationId)));
  const citationLinks = snapshot.citationLinks.filter(row => result.allowedIds.has(String(row.citationId)));
  const factIds = new Set(sourceFacts.map(row => String(row._id)));
  const sourceIds = new Set([...result.citations.map(row => String(row.sourceId)), ...sourceFacts.map(row => String(row.sourceId))]);
  const sourceView = await filterMcpSourceRows(ctx, owner, snapshot.sources.filter(row => sourceIds.has(String(row._id))));
  return { snapshot: { ...snapshot, citations: result.citations,
    citationLinks, sourceFacts, sources: sourceView.sources,
    stories: snapshot.stories.map(row => ({ ...row, citationIds: row.citationIds.filter(id => result.allowedIds.has(String(id))),
      ...(row.sourceFactIds ? { sourceFactIds: row.sourceFactIds.filter(id => factIds.has(String(id))) } : {}) })),
  }, citationsWithheld: result.withheld || sourceFacts.length !== snapshot.sourceFacts.length || citationLinks.length !== snapshot.citationLinks.length,
    citationReadTruncated: result.truncated || additional.length > remaining,
    sourceNotesWithheld: sourceView.withheld, sourceReadTruncated: sourceView.truncated };
}
