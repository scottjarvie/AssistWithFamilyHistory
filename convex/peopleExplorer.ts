import { v } from "convex/values";
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

async function placesForPerson(ctx: QueryCtx, person: Doc<"persons">) {
  const owner = normalizeVaultOwnerId(person.vaultOwnerId);
  const visible = <T extends {vaultOwnerId?: string; archivedAt?: number}>(row: T | null): row is T => !!row && matchesVaultOwner(row.vaultOwnerId, owner) && row.archivedAt === undefined;
  const links = (await ctx.db.query("personEvents").withIndex("by_person", q => q.eq("personId", person._id)).collect()).filter(visible);
  const events = (await Promise.all(links.map(link => ctx.db.get(link.eventId)))).filter(visible);
  const ids = [...new Set([person.birth?.place?.placeId, person.death?.place?.placeId, ...events.map(e => e.place?.placeId)].filter(id => id !== undefined))];
  const places = (await Promise.all(ids.map(id => ctx.db.get(id)))).filter(visible);
  return {events, keyPlaces: places.slice(0, 2).map(p => p.fullName || p.name)};
}

async function rowForPerson(ctx: QueryCtx, person: Doc<"persons">, events: Doc<"events">[], legacyMedia: Doc<"media">[] | null) {
  const owner = normalizeVaultOwnerId(person.vaultOwnerId);
  const visible = <T extends {vaultOwnerId?: string; archivedAt?: number}>(row: T | null): row is T => !!row && matchesVaultOwner(row.vaultOwnerId, owner) && row.archivedAt === undefined;
  const [personLinks, eventLinks, documents, stories, importsById, importsByFsId, media] = await Promise.all([
    ctx.db.query("citationLinks").withIndex("by_target", q => q.eq("targetType", "person").eq("targetId", String(person._id))).collect(),
    Promise.all(events.map(e => ctx.db.query("citationLinks").withIndex("by_target", q => q.eq("targetType", "event").eq("targetId", String(e._id))).collect())),
    ctx.db.query("documents").withIndex("by_personId", q => q.eq("personId", person.fsId || String(person._id))).collect(),
    ctx.db.query("stories").withIndex("by_person", q => q.eq("personId", person._id)).collect(),
    ctx.db.query("importRuns").withIndex("by_person", q => q.eq("personId", person._id)).collect(),
    person.fsId ? ctx.db.query("importRuns").withIndex("by_person_fsId", q => q.eq("personFsId", person.fsId!)).collect() : [],
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
    stats: {sources: sources.length, memories: media.filter(visible).filter(m => m.personIds.includes(person._id)).length, documents: documents.filter(visible).length, stories: stories.filter(visible).length, imports: imports.length},
    latestImport: imports[0] ? {importedAt: imports[0].importedAt} : null,
  };
}

/** A bounded scan preserves the existing arbitrary substring search, including joined place names.
 * A sparse/empty page is not end-of-results: callers must retain its cursor. */
export type PeoplePageResult = {page: Awaited<ReturnType<typeof rowForPerson>>[]; continueCursor: string; isDone: boolean};
export const page = internalQuery({
  args: pageArgs,
  handler: async (ctx, args): Promise<PeoplePageResult> => {
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
  },
});

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
    while (Date.now() < deadline) if (await ctx.runMutation(internal.peopleExplorer.backfillStep, {})) return {complete: true};
    return {complete: false};
  },
});
export const backfillStatus = internalQuery({args: {}, handler: async ctx => ({complete: (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete ?? false})});
