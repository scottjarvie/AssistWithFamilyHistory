import { v, type Infer } from "convex/values";
import { internalQuery, internalMutation, internalAction, type QueryCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { formatPersonName, normalizeVaultOwnerId, matchesVaultOwner, sortByTimestampDesc } from "./vaultCore";

/** Array membership needs a reverse table; ordinary Convex indexes cannot index array elements. */
export async function syncMediaPeople(ctx: {db: MutationCtx["db"]}, mediaId: Doc<"media">["_id"]) {
  const media = await ctx.db.get(mediaId);
  const old = await ctx.db.query("mediaPeople").withIndex("by_media", q => q.eq("mediaId", mediaId)).collect();
  const wanted = new Set(media?.personIds ?? []);
  for (const link of old) {
    if (wanted.delete(link.personId)) continue;
    await ctx.db.delete(link._id);
  }
  for (const personId of wanted) await ctx.db.insert("mediaPeople", {personId, mediaId});
}

const status = v.optional(v.union(v.literal("not_started"), v.literal("basic"), v.literal("in_progress"), v.literal("thorough"), v.literal("complete")));
export const pageArgs = {vaultOwnerId: v.string(), search: v.optional(v.string()), researchStatus: status, cursor: v.union(v.string(), v.null())};

type PeoplePageArgs = {vaultOwnerId: string; cursor: string | null; search?: string; researchStatus?: Infer<typeof status>};

async function placesForPerson(ctx: Pick<QueryCtx, "db">, person: Doc<"persons">) {
  const owner = normalizeVaultOwnerId(person.vaultOwnerId);
  const visible = <T extends {vaultOwnerId?: string; archivedAt?: number}>(row: T | null): row is T => !!row && matchesVaultOwner(row.vaultOwnerId, owner) && row.archivedAt === undefined;
  const links = (await ctx.db.query("personEvents").withIndex("by_person", q => q.eq("personId", person._id)).collect()).filter(visible);
  const events = (await Promise.all(links.map(link => ctx.db.get(link.eventId)))).filter(visible);
  const ids = [...new Set([person.birth?.place?.placeId, person.death?.place?.placeId, ...events.map(e => e.place?.placeId)].filter(id => id !== undefined))];
  const places = (await Promise.all(ids.map(id => ctx.db.get(id)))).filter(visible);
  return {events, keyPlaces: places.slice(0, 2).map(p => p.fullName || p.name)};
}

async function rowForPerson(ctx: Pick<QueryCtx, "db">, person: Doc<"persons">, events: Doc<"events">[], legacyMedia: Doc<"media">[] | null) {
  const owner = normalizeVaultOwnerId(person.vaultOwnerId);
  const visible = <T extends {vaultOwnerId?: string; archivedAt?: number}>(row: T | null): row is T => !!row && matchesVaultOwner(row.vaultOwnerId, owner) && row.archivedAt === undefined;
  const [personLinks, eventLinks, documents, stories, importsById, importsByFsId, media] = await Promise.all([
    ctx.db.query("citationLinks").withIndex("by_target", q => q.eq("targetType", "person").eq("targetId", String(person._id))).collect(),
    Promise.all(events.map(e => ctx.db.query("citationLinks").withIndex("by_target", q => q.eq("targetType", "event").eq("targetId", String(e._id))).collect())),
    ctx.db.query("documents").withIndex("by_owner_personId", q => q.eq("vaultOwnerId", owner).eq("personId", person.fsId || String(person._id))).collect(),
    ctx.db.query("stories").withIndex("by_person", q => q.eq("personId", person._id)).collect(),
    ctx.db.query("importRuns").withIndex("by_person", q => q.eq("personId", person._id)).collect(),
    person.fsId ? ctx.db.query("importRuns").withIndex("by_owner_person_fsId", q => q.eq("vaultOwnerId", owner).eq("personFsId", person.fsId!)).collect() : [],
    legacyMedia === null
      ? ctx.db.query("mediaPeople").withIndex("by_person", q => q.eq("personId", person._id)).collect().then(links => Promise.all(links.map(link => ctx.db.get(link.mediaId))))
      : legacyMedia,
  ]);
  const citationIds = [...new Set([...personLinks, ...eventLinks.flat()].filter(visible).map(l => l.citationId))];
  const citations = (await Promise.all(citationIds.map(id => ctx.db.get(id)))).filter(visible);
  const sources = (await Promise.all([...new Set(citations.map(c => c.sourceId))].map(id => ctx.db.get(id)))).filter(visible);
  const imports = sortByTimestampDesc([...new Map([...importsById, ...importsByFsId].filter(visible).map(r => [String(r._id), r])).values()].sort((a,b) => a._creationTime - b._creationTime));
  return {
    _id: String(person._id), routeId: person.fsId || String(person._id), displayName: formatPersonName(person), living: person.living, researchStatus: person.researchStatus,
    birth: person.birth ? {date: {year: person.birth.date?.year}} : undefined,
    death: person.death ? {date: {year: person.death.date?.year}} : undefined,
    creationProvenance: person.creationProvenance ? {evidenceStatus: person.creationProvenance.evidenceStatus} : undefined,
    stats: {sources: sources.length, memories: media.filter(m => m !== null && visible(m) && m.personIds.includes(person._id)).length, documents: documents.filter(visible).length, stories: stories.filter(visible).length, imports: imports.length},
    latestImport: imports[0] ? {importedAt: imports[0].importedAt} : null,
  };
}

/** A bounded scan preserves the existing arbitrary substring search, including joined place names.
 * A sparse/empty page is not end-of-results: callers must retain its cursor. */
export type PeoplePageResult = {page: Awaited<ReturnType<typeof rowForPerson>>[]; continueCursor: string; isDone: boolean};
async function scopedPeoplePage(ctx: QueryCtx, args: PeoplePageArgs): Promise<PeoplePageResult> {
    const owner = normalizeVaultOwnerId(args.vaultOwnerId);
    const mediaReady = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete ?? false;
    const legacyMedia = mediaReady ? null : await ctx.db.query("media").withIndex("by_owner", q => q.eq("vaultOwnerId", owner)).collect();
    const base = ctx.db.query("persons");
    const candidates = args.researchStatus
      ? base.withIndex("by_owner_status_updated", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined).eq("researchStatus", args.researchStatus!))
      : base.withIndex("by_owner_updated", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined));
    const result = await candidates.order("desc").paginate({cursor: args.cursor, numItems: 50, maximumBytesRead: 500_000});
    const needle = args.search?.trim().toLowerCase();
    const rows = await Promise.all(result.page.map(async person => {
      const {events, keyPlaces} = await placesForPerson(ctx, person);
      if (needle && ![formatPersonName(person), person.fsId || "", String(person._id), person.birth?.date?.original || "", person.death?.date?.original || "", ...keyPlaces].join(" ").toLowerCase().includes(needle)) return null;
      return rowForPerson(ctx, person, events, legacyMedia);
    }));
    return {page: rows.filter(row => row !== null), continueCursor: result.continueCursor, isDone: result.isDone};
}
export const scopedPage = internalQuery({args: pageArgs, handler: scopedPeoplePage});

/** Projection refresh happens once per affected person at the end of a central mutation. */
export async function refreshPerson(ctx: {db: MutationCtx["db"]}, personId: Doc<"persons">["_id"]) {
  const old = await ctx.db.query("peopleExplorerRows").withIndex("by_person", q => q.eq("personId", personId)).unique();
  const person = await ctx.db.get(personId);
  if (!person || person.archivedAt !== undefined) {
    if (old) await ctx.db.delete(old._id);
    return;
  }
  const {events, keyPlaces} = await placesForPerson(ctx, person);
  const payload = await rowForPerson(ctx, person, events, null);
  // Lexical key preserves updated-desc / creation-asc ordering, including ties.
  const orderKey = `${(Number.MAX_SAFE_INTEGER - person.updatedAt).toFixed(3).padStart(24, "0")}:${person._creationTime.toFixed(6).padStart(24, "0")}:${person._id}`;
  const value = {personId, vaultOwnerId: normalizeVaultOwnerId(person.vaultOwnerId), researchStatus: person.researchStatus, orderKey, payload,
    text: [formatPersonName(person), person.fsId || "", String(person._id), person.birth?.date?.original || "", person.death?.date?.original || "", ...keyPlaces].join(" ").toLowerCase()};
  if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert("peopleExplorerRows", value);
}

export const page = internalQuery({args: pageArgs, handler: async (ctx, args): Promise<PeoplePageResult> => {
  const ready = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique())?.complete;
  // Existing scoped read until BOTH membership and person projections are ready.
  if (!ready) {
    const result = await scopedPeoplePage(ctx, {...args, cursor: args.cursor?.startsWith("s:") ? args.cursor.slice(2) : null});
    return {...result, continueCursor: `s:${result.continueCursor}`};
  }
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  const needle = args.search?.trim().toLowerCase();
  const cap = needle && args.cursor?.startsWith("p:l:") ? 2000 : 50;
  const after = args.cursor?.startsWith("p:") ? args.cursor.slice(4) : "";
  const base = ctx.db.query("peopleExplorerRows");
  const candidates = args.researchStatus
    ? await base.withIndex("by_owner_status_order", q => q.eq("vaultOwnerId", owner).eq("researchStatus", args.researchStatus!).gt("orderKey", after)).paginate({cursor: null, numItems: cap, maximumBytesRead: 2_000_000})
    : await base.withIndex("by_owner_order", q => q.eq("vaultOwnerId", owner).gt("orderKey", after)).paginate({cursor: null, numItems: cap, maximumBytesRead: 2_000_000});
  const rows: PeoplePageResult["page"] = [];
  const page = candidates.page;
  let cursor = after;
  let processed = 0;
  for (const candidate of page) {
    cursor = candidate.orderKey; processed++;
    if (!needle || candidate.text.includes(needle)) rows.push(candidate.payload as PeoplePageResult["page"][number]);
    if (rows.length === 50) break;
  }
  return {page: rows, continueCursor: `p:${rows.length < 50 ? "l" : "s"}:${cursor}`, isDone: processed === page.length && candidates.isDone};
}});

export const backfillStep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique();
    if (state?.complete) return true;
    const rows = await ctx.db.query("media").paginate({cursor: state?.cursor ?? null, numItems: 100, maximumBytesRead: 500_000});
    for (const media of rows.page) await syncMediaPeople(ctx, media._id);
    const value = {table: "mediaPeople", cursor: rows.continueCursor, complete: rows.isDone};
    if (state) await ctx.db.patch(state._id, value); else await ctx.db.insert("searchBuildState", value);
    return rows.isDone;
  },
});
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{complete: boolean}> => {
    const deadline = Date.now() + 120_000;
    let membershipReady = false;
    while (Date.now() < deadline) {
      if (!membershipReady) membershipReady = await ctx.runMutation(internal.peopleExplorer.backfillStep, {});
      else if (await ctx.runMutation(internal.peopleExplorer.projectionStep, {})) return {complete: true};
    }
    return {complete: false};
  },
});
export const backfillStatus = internalQuery({args: {}, handler: async ctx => {
  const mediaComplete = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete ?? false;
  const peopleComplete = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique())?.complete ?? false;
  return {complete: mediaComplete && peopleComplete, mediaComplete, peopleComplete};
}});

export const projectionStep = internalMutation({args: {}, handler: async ctx => {
  const mediaReady = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete;
  if (!mediaReady) throw new Error("Run media membership backfill first");
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique();
  if (state?.complete) return true;
  const result = await ctx.db.query("persons").paginate({cursor: state?.cursor ?? null, numItems: 5, maximumBytesRead: 100_000});
  for (const person of result.page) await refreshPerson(ctx, person._id);
  const value = {table: "peopleExplorerRows", cursor: result.continueCursor, complete: result.isDone};
  if (state) await ctx.db.patch(state._id, value); else await ctx.db.insert("searchBuildState", value);
  return result.isDone;
}});

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ExplorerChange = {table: string; before: any; after: any};
export const EXPLORER_TABLES = ["persons", "personEvents", "events", "places", "citationLinks", "citations", "sources", "media", "documents", "stories", "importRuns"];
export async function applyExplorerChanges(ctx: MutationCtx, changes: ExplorerChange[]) {
  if (!changes.length) return;
  const ready = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete;
  if (!ready) return; // The subsequent complete backfill includes these writes.
  const ids = new Set<Doc<"persons">["_id"]>();
  const person = (id: any) => {if (id) {const key = ctx.db.normalizeId("persons", id); if (key) ids.add(key);}};
  const event = async (id: any) => {
    for (const link of await ctx.db.query("personEvents").withIndex("by_event", q => q.eq("eventId", id)).collect()) person(link.personId);
  };
  const link = async (row: any) => {
    if (row.targetType === "person") person(row.targetId);
    if (row.targetType === "event") {const id = ctx.db.normalizeId("events", row.targetId); if (id) await event(id);}
  };
  const citation = async (id: any) => {
    for (const row of await ctx.db.query("citationLinks").withIndex("by_citation", q => q.eq("citationId", id)).collect()) await link(row);
  };
  const personKey = async (row: any, key: string) => {
    const direct = ctx.db.normalizeId("persons", key); if (direct) person(direct);
    const owner = normalizeVaultOwnerId(row.vaultOwnerId);
    for (const p of await ctx.db.query("persons").withIndex("by_owner_fsId", q => q.eq("vaultOwnerId", owner).eq("fsId", key)).collect()) person(p._id);
  };
  for (const change of changes) for (const row of [change.before, change.after]) {
    if (!row) continue;
    switch (change.table) {
      case "persons": person(row._id); break;
      case "personEvents": case "stories": person(row.personId); break;
      case "media": for (const id of row.personIds) person(id); break;
      case "documents": await personKey(row, row.personId); break;
      case "importRuns": person(row.personId); await personKey(row, row.personFsId); break;
      case "events": await event(row._id); break;
      case "citationLinks": await link(row); break;
      case "citations": await citation(row._id); break;
      case "sources":
        for (const c of await ctx.db.query("citations").withIndex("by_source", q => q.eq("sourceId", row._id)).collect()) await citation(c._id);
        break;
      case "places":
        for (const p of await ctx.db.query("persons").withIndex("by_birth_place", q => q.eq("vaultOwnerId", normalizeVaultOwnerId(row.vaultOwnerId)).eq("birth.place.placeId", row._id)).collect()) person(p._id);
        for (const p of await ctx.db.query("persons").withIndex("by_death_place", q => q.eq("vaultOwnerId", normalizeVaultOwnerId(row.vaultOwnerId)).eq("death.place.placeId", row._id)).collect()) person(p._id);
        for (const e of await ctx.db.query("events").withIndex("by_place", q => q.eq("place.placeId", row._id)).collect()) await event(e._id);
        break;
    }
  }
  for (const id of ids) await refreshPerson(ctx, id);
}
