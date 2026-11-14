import { projectPeopleCollectionRow } from "../lib/vault/peopleCollection";
import type { PeopleExplorerPayload } from "../lib/vault/peopleExplorerValidator";
import { readLegacyPeopleExplorer } from "./vault";
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
export type PeoplePageResult = {page: PeopleExplorerPayload[]; continueCursor: string; isDone: boolean};
async function legacyPeoplePage(ctx: QueryCtx, args: PeoplePageArgs): Promise<PeoplePageResult> {
  const parsed = args.cursor?.startsWith("s:") ? Number(args.cursor.slice(2)) : 0;
  const offset = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  const rows = await readLegacyPeopleExplorer(ctx, {...args, limit: offset + 51});
  return {page: rows.slice(offset, offset + 50).map(projectPeopleCollectionRow), continueCursor: `s:${offset + 50}`, isDone: rows.length <= offset + 50};
}

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
    return legacyPeoplePage(ctx, args);
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
    if (!needle || candidate.text.includes(needle)) rows.push(candidate.payload);
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

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ExplorerChange = {table: string; before: any; after: any};
export const EXPLORER_TABLES = ["persons", "personEvents", "events", "places", "citationLinks", "citations", "sources", "media", "documents", "stories", "importRuns"];
const RELEVANT: Record<string, string[]> = {
  places: ["name", "fullName", "archivedAt", "vaultOwnerId"], sources: ["archivedAt", "vaultOwnerId"],
  citations: ["sourceId", "archivedAt", "vaultOwnerId"], events: ["place.placeId", "archivedAt", "vaultOwnerId"],
  media: ["personIds", "archivedAt", "vaultOwnerId"], documents: ["personId", "archivedAt", "vaultOwnerId"],
  stories: ["personId", "archivedAt", "vaultOwnerId"],
  importRuns: ["personId", "personFsId", "importedAt", "archivedAt", "vaultOwnerId"],
};
export function affectsExplorer(change: ExplorerChange): boolean {
  if (!change.before || !change.after) return true;
  const fields = RELEVANT[change.table];
  if (!fields) return true;
  const field = (row: any, key: string) => key.split(".").reduce((value, part) => value?.[part], row);
  return fields.some(key => JSON.stringify(field(change.before, key)) !== JSON.stringify(field(change.after, key)));
}
class DeferredProjection extends Error {}
/** Never spend the source mutation's entire read budget on an optional projection. */
function budgetDb(db: MutationCtx["db"], limit = 75): MutationCtx["db"] {
  let operations = 0, rows = 0, bytes = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const run = <T>(read: () => Promise<T>): Promise<T> => {
    const result = pending.then(async () => {
      if (++operations > limit || bytes > 2_000_000) throw new DeferredProjection();
      const value = await read();
      bytes += new TextEncoder().encode(JSON.stringify(value) ?? "").length;
      return value;
    });
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
  const query = (value: any): any => new Proxy(value, {get(target, key) {
    if (key === "collect") return async () => {
      const result = await run(() => target.take(2)) as any[]; rows += result.length;
      if (result.length > 1 || rows > 250) throw new DeferredProjection();
      return result;
    };
    const method = Reflect.get(target, key);
    if (typeof method !== "function") return method;
    if (key === "unique" || key === "first") return (...args: any[]) => {return run(() => method.apply(target, args));};
    return (...args: any[]) => query(method.apply(target, args));
  }});
  return new Proxy(db, {get(target, key) {
    if (key === "query") return (...args: any[]) => query((target.query as any)(...args));
    if (key === "get") return (...args: any[]) => {return run(() => (target.get as any)(...args));};
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  }});
}

const jobArgs = {kind: v.string(), id: v.string(), owner: v.optional(v.string()), stage: v.optional(v.number()), cursor: v.optional(v.union(v.string(), v.null()))};
type DependencyJob = {kind: string; id: string; owner?: string; stage?: number; cursor?: string | null};
async function scheduleJob(ctx: MutationCtx, job: DependencyJob) {
  await ctx.scheduler.runAfter(0, internal.peopleExplorer.dependencyPage, job);
}
async function schedulePerson(ctx: MutationCtx, personId: Doc<"persons">["_id"]) {
  if (!ctx.db.normalizeId("persons", personId)) return;
  await ctx.scheduler.runAfter(0, internal.peopleExplorer.refreshScheduled, {personId});
}

/** Paged dependency discovery. Every hop uses one bounded range; child jobs are transactional. */
export const dependencyPage = internalMutation({args: jobArgs, handler: async (ctx, job) => {
  const stage = job.stage ?? 0;
  let range: any;
  if (job.kind === "owner") range = ctx.db.query("persons").withIndex("by_owner", q => q.eq("vaultOwnerId", job.id));
  else if (job.kind === "personKey") range = ctx.db.query("persons").withIndex("by_owner_fsId", q => q.eq("vaultOwnerId", job.owner).eq("fsId", job.id));
  else if (job.kind === "event") range = ctx.db.query("personEvents").withIndex("by_event", q => q.eq("eventId", ctx.db.normalizeId("events", job.id)!));
  else if (job.kind === "citation") range = ctx.db.query("citationLinks").withIndex("by_citation", q => q.eq("citationId", ctx.db.normalizeId("citations", job.id)!));
  else if (job.kind === "source") range = ctx.db.query("citations").withIndex("by_source", q => q.eq("sourceId", ctx.db.normalizeId("sources", job.id)!));
  else if (job.kind === "place") {
    const id = ctx.db.normalizeId("places", job.id)!;
    if (stage === 0) range = ctx.db.query("persons").withIndex("by_birth_place", q => q.eq("vaultOwnerId", job.owner).eq("birth.place.placeId", id));
    else if (stage === 1) range = ctx.db.query("persons").withIndex("by_death_place", q => q.eq("vaultOwnerId", job.owner).eq("death.place.placeId", id));
    else range = ctx.db.query("events").withIndex("by_place", q => q.eq("place.placeId", id));
  } else throw new Error("Unknown explorer dependency job");
  const result = await range.paginate({cursor: job.cursor ?? null, numItems: 25, maximumBytesRead: 100_000});
  for (const row of result.page) {
    if (job.kind === "source") await scheduleJob(ctx, {kind: "citation", id: String(row._id)});
    else if (job.kind === "citation") {
      if (row.targetType === "event") await scheduleJob(ctx, {kind: "event", id: row.targetId});
      else if (row.targetType === "person") await schedulePerson(ctx, row.targetId);
    } else if (job.kind === "place" && stage === 2) await scheduleJob(ctx, {kind: "event", id: String(row._id)});
    else await schedulePerson(ctx, job.kind === "event" ? row.personId : row._id);
  }
  if (!result.isDone) await scheduleJob(ctx, {...job, cursor: result.continueCursor});
  else if (job.kind === "place" && stage < 2) await scheduleJob(ctx, {...job, stage: stage + 1, cursor: null});
}});

export const rebuildOne = internalMutation({args: {personId: v.id("persons")}, handler: async (ctx, {personId}) => {
  await refreshPerson(ctx, personId);
  const failed = await ctx.db.query("peopleExplorerFailures").withIndex("by_person", q => q.eq("personId", personId)).unique();
  if (failed) await ctx.db.delete(failed._id);
  // A repaired skipped row can release the migration gate, but never before traversal finishes.
  const traversal = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerTraversal")).unique();
  if (traversal?.complete && !await ctx.db.query("peopleExplorerFailures").first()) {
    const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique();
    if (state && !state.complete) await ctx.db.patch(state._id, {complete: true});
  }
}});
export const recordFailure = internalMutation({args: {personId: v.id("persons")}, handler: async (ctx, {personId}) => {
  const old = await ctx.db.query("peopleExplorerFailures").withIndex("by_person", q => q.eq("personId", personId)).unique();
  const value = {personId, reason: "Projection refresh failed; retry with refreshPeople after investigating the execution log", failedAt: Date.now()};
  if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert("peopleExplorerFailures", value);
  console.warn("People Explorer projection refresh failed", {personId});
}});
/** An action isolates limit failures from source edits and from the migration cursor transaction. */
export const refreshScheduled = internalAction({args: {personId: v.id("persons")}, handler: async (ctx, {personId}): Promise<boolean> => {
  try {await ctx.runMutation(internal.peopleExplorer.rebuildOne, {personId}); return true;}
  catch {await ctx.runMutation(internal.peopleExplorer.recordFailure, {personId}); return false;}
}});
export const refreshPeople = internalMutation({args: {personIds: v.array(v.id("persons"))}, handler: async (ctx, {personIds}) => {
  if (personIds.length > 100) throw new Error("Repair at most 100 people per call");
  for (const personId of new Set(personIds)) await schedulePerson(ctx, personId);
  return {scheduled: new Set(personIds).size};
}});
export const failures = internalQuery({args: {cursor: v.union(v.string(), v.null())}, handler: (ctx, {cursor}) => ctx.db.query("peopleExplorerFailures").paginate({cursor, numItems: 100})});

export const projectionStep = internalMutation({args: {}, handler: async ctx => {
  const mediaReady = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete;
  if (!mediaReady) throw new Error("Run media membership backfill first");
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique();
  if (state?.complete) return true;
  const result = await ctx.db.query("persons").paginate({cursor: state?.cursor ?? null, numItems: 5, maximumBytesRead: 100_000});
  for (const person of result.page) await refreshPerson(ctx, person._id);
  const value = {table: "peopleExplorerRows", cursor: result.continueCursor, complete: result.isDone && !await ctx.db.query("peopleExplorerFailures").first()};
  if (state) await ctx.db.patch(state._id, value); else await ctx.db.insert("searchBuildState", value);
  return value.complete;
}});
export const nextBackfillPerson = internalQuery({args: {}, handler: async ctx => {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique();
  const traversal = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerTraversal")).unique();
  if (state?.complete || traversal?.complete) return null;
  const result = await ctx.db.query("persons").paginate({cursor: state?.cursor ?? null, numItems: 1, maximumBytesRead: 100_000});
  return {personId: result.page[0]?._id, expectedCursor: state?.cursor ?? null, cursor: result.continueCursor, done: result.isDone};
}});
export const advanceBackfill = internalMutation({args: {expectedCursor: v.union(v.string(), v.null()), cursor: v.string(), done: v.boolean()}, handler: async (ctx, args) => {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerRows")).unique();
  if ((state?.cursor ?? null) !== args.expectedCursor || state?.complete) return;
  const complete = args.done && !await ctx.db.query("peopleExplorerFailures").first();
  const value = {table: "peopleExplorerRows", cursor: args.cursor, complete};
  if (state) await ctx.db.patch(state._id, value); else await ctx.db.insert("searchBuildState", value);
  if (args.done) {
    const traversal = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "peopleExplorerTraversal")).unique();
    const value = {table: "peopleExplorerTraversal", cursor: args.cursor, complete: true};
    if (traversal) await ctx.db.patch(traversal._id, value); else await ctx.db.insert("searchBuildState", value);
  }
}});
export const backfill = internalAction({args: {skipErrors: v.optional(v.boolean())}, handler: async (ctx, args): Promise<{complete: boolean; traversalComplete: boolean}> => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !await ctx.runMutation(internal.peopleExplorer.backfillStep, {})) { /* membership */ }
  while (Date.now() < deadline) {
    const next = await ctx.runQuery(internal.peopleExplorer.nextBackfillPerson, {});
    if (!next) break;
    if (next.personId) {
      const ok = await ctx.runAction(internal.peopleExplorer.refreshScheduled, {personId: next.personId});
      if (!ok && !args.skipErrors) throw new Error("Projection failed; inspect failures, repair it, or rerun backfill with skipErrors:true");
    }
    await ctx.runMutation(internal.peopleExplorer.advanceBackfill, {expectedCursor: next.expectedCursor, cursor: next.cursor, done: next.done});
  }
  const status = await ctx.runQuery(internal.peopleExplorer.backfillStatus, {});
  return {complete: status.complete, traversalComplete: status.traversalComplete};
}});
export const backfillStatus = internalQuery({args: {}, handler: async ctx => {
  const state = async (table: string) => (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", table)).unique())?.complete ?? false;
  const mediaComplete = await state("mediaPeople"), peopleComplete = await state("peopleExplorerRows");
  return {complete: mediaComplete && peopleComplete, mediaComplete, peopleComplete, traversalComplete: peopleComplete || await state("peopleExplorerTraversal"), hasFailures: !!await ctx.db.query("peopleExplorerFailures").first()};
}});

export async function applyExplorerChanges(ctx: MutationCtx, changes: ExplorerChange[], defer = false) {
  changes = changes.filter(affectsExplorer);
  if (!changes.length) return;
  const ready = (await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "mediaPeople")).unique())?.complete;
  if (!ready) return; // The subsequent complete backfill includes these writes.
  // Ownership changes must not leave a private display row in its former tree.
  for (const change of changes) if (change.table === "persons" && change.before && (!change.after || change.after.archivedAt !== undefined || change.before.vaultOwnerId !== change.after.vaultOwnerId)) {
    const row = await ctx.db.query("peopleExplorerRows").withIndex("by_person", q => q.eq("personId", change.before._id)).unique();
    if (row) await ctx.db.delete(row._id);
  }
  if (defer) {
    const owners = new Set<string>(changes.filter(c => c.table === "persons" && c.after).map(c => normalizeVaultOwnerId(c.after.vaultOwnerId)));
    for (const owner of owners) await scheduleJob(ctx, {kind: "owner", id: owner});
    return;
  }
  const sourceCtx = ctx;
  ctx = {...ctx, db: budgetDb(ctx.db, 1000)};
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
  const deferred = new Map<string, DependencyJob>();
  const queue = (job: DependencyJob) => deferred.set(JSON.stringify(job), job);
  const queueChange = (change: ExplorerChange) => {
    for (const row of [change.before, change.after]) if (row) {
      const owner = normalizeVaultOwnerId(row.vaultOwnerId);
      if (change.table === "persons") person(row._id);
      else if (change.table === "personEvents" || change.table === "stories") person(row.personId);
      else if (change.table === "media") for (const id of row.personIds) person(id);
      else if (change.table === "documents") {person(row.personId); queue({kind: "personKey", id: row.personId, owner});}
      else if (change.table === "importRuns") {person(row.personId); queue({kind: "personKey", id: row.personFsId, owner});}
      else if (change.table === "citationLinks") {
        if (row.targetType === "person") person(row.targetId);
        else if (row.targetType === "event") queue({kind: "event", id: row.targetId});
      } else queue({kind: ({places: "place", sources: "source", citations: "citation", events: "event"} as Record<string,string>)[change.table], id: String(row._id), ...(change.table === "places" ? {owner} : {})});
    }
  };
  for (const change of changes) {try {for (const row of [change.before, change.after]) {
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
  } catch {queueChange(change);}}
  for (const job of deferred.values()) await scheduleJob(sourceCtx, job);
  let refreshed = 0;
  for (const id of ids) {
    if (refreshed >= 25) {await schedulePerson(sourceCtx, id); continue;}
    refreshed++;
    try {await refreshPerson(ctx, id);}
    catch {await schedulePerson(sourceCtx, id);}
  }
}
