import { RESEARCH_CHECK_DEFINITIONS } from "./vaultCore";
import { v, type Infer } from "convex/values";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildPeopleRows, loadPersonScopedSnapshot, type VaultSnapshot } from "./vault";
import { counterShard, ownerTableCounter, BUILD, scopedReadsReady } from "./vaultCounts";
import { missingFlags, orderedNumber, STALE_AGE, staleCount, type OperationRow, type OperationsPage, type ReadinessPage } from "./personScoreModel";
export function personScore(snapshot: VaultSnapshot, personId: Id<"persons">) {
    const row = buildPeopleRows({ ...snapshot, people: snapshot.people.filter(p => p._id === personId) })[0];
    if (!row || !row.vaultOwnerId)
        return null;
    const operation: OperationRow = { rowType: "person", id: row.routeId, personIdentifier: row.routeId, displayName: row.displayName, lifespan: `${row.birth?.date?.year || "?"} to ${row.death?.date?.year || "?"}`, keyPlaces: row.keyPlaces, completionPercent: row.operations.completionPercent, sourceCount: row.stats.sources, memoryCount: row.stats.memories, documentCount: row.stats.documents, storyCount: row.stats.stories, openTaskCount: row.stats.tasks, contextReportCount: row.stats.contextReports, storyWorkflow: row.storyWorkflow, latestImportAt: row.latestImport?.importedAt ?? null, lastTouched: row.lastTouched, missingCritical: row.operations.criticalMissing, nextActions: row.operations.nextActions, staleChecksCount: 0, researchChecks: row.researchChecks.map(c => ({ checkKey: c.checkKey, status: c.status, applicability: c.applicability, lastReviewedAt: c.lastReviewedAt })), storyReadinessScore: (row.operations.requiredMissingCount === 0 ? 100 : row.operations.completionPercent) + (row.hasStory ? 20 : 0), anchorPersonIdentifier: row.routeId, badge: row.researchStatus };
    const birth = row.birth?.date?.year ?? row.birth?.date?.original ?? "?", death = row.death?.date?.year ?? row.death?.date?.original ?? "?";
    const readiness = { _id: row._id, displayName: row.displayName, routeId: row.routeId, lifespan: `${birth} to ${death}`, storyWorkflow: row.storyWorkflow, completionPercent: row.operations.completionPercent, sourceCount: row.stats.sources, contextReportCount: row.stats.contextReports, storyCount: row.stats.stories, nextActions: row.operations.nextActions };
    const reviews = row.researchChecks.filter(c => c.applicability !== "not_applicable" && (c.lastReviewedAt ?? 0) > 0).map(c => c.lastReviewedAt!);
    return scoreValue(String(row._id), row.vaultOwnerId, row._creationTime, operation, reviews, readiness, row.storyReadinessScore);
}
function scoreValue(recordId: string, vaultOwnerId: string, created: number, operation: OperationRow, reviews: number[], readiness?: Doc<"personScoreRows">["readiness"], score = 0) {
    const tie = `${orderedNumber(created)}:${recordId}`;
    const key = (n: number) => `${orderedNumber(-n)}:${tie}`;
    const counts: Record<string, number> = { rows: 1, people: operation.rowType === "person" ? 1 : 0, provisional: operation.rowType === "provisional" ? 1 : 0, completion: operation.completionPercent, required: operation.missingCritical.length, recommended: operation.researchChecks.filter(c => c.applicability === "recommended" && (c.status === "missing" || c.status === "needs_review")).length, [`workflow:${operation.storyWorkflow}`]: operation.rowType === "person" ? 1 : 0 };
    if (operation.rowType === "person") {
        counts.withoutSources = Number(operation.sourceCount === 0);
        counts.withoutContext = Number(operation.contextReportCount === 0);
        counts.withoutStories = Number(operation.storyCount === 0);
    }
    return { missing: Object.fromEntries(RESEARCH_CHECK_DEFINITIONS.map(c => [c.key, operation.missingCritical.includes(c.key)])) as Infer<typeof missingFlags>, hasStory: operation.storyCount > 0, recordId, vaultOwnerId, rowType: operation.rowType, storyWorkflow: operation.storyWorkflow, operation, readiness, counts, reviews, oldestReview: reviews.length ? Math.min(...reviews) : undefined, readinessOrder: key(score), missingCriticalOrder: key(operation.missingCritical.length), completionOrder: key(operation.completionPercent), lastTouchedOrder: key(operation.lastTouched), sourceCountOrder: key(operation.sourceCount), storyReadinessOrder: key(operation.storyReadinessScore), newestImportOrder: key(operation.latestImportAt ?? 0) };
}
type Value = ReturnType<typeof scoreValue>;
/** Row and weighted exact totals commit together, on the existing 32-shard pattern. */
function canonical(value:unknown):string {
 return JSON.stringify(value,(_key,item:unknown)=>{
  if(item&&typeof item==="object"&&!Array.isArray(item)) {
   const row=item as Record<string,unknown>;
   return Object.fromEntries(Object.keys(row).sort().filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
  }
  return item;
 });
}
async function put(ctx: Pick<MutationCtx, "db">, id: string, next: Value | null) {
    const old = await ctx.db.query("personScoreRows").withIndex("by_record", q => q.eq("recordId", id)).unique();
    if (old && canonical({ ...old, _id: undefined, _creationTime: undefined }) === canonical(next)) return;
    // Complete every budgeted read before the first write: inline refresh can
    // catch a budget deferral and commit its source edit in the same transaction.
    const reviews = await ctx.db.query("personScoreReviews").withIndex("by_record", q => q.eq("recordId", id)).collect();
    const shard = counterShard(id);
    const counters = [];
    for (const vaultOwnerId of new Set([old?.vaultOwnerId, next?.vaultOwnerId].filter((owner): owner is string => !!owner))) {
        const counter = await ctx.db.query("vaultCounterShards").withIndex("by_owner_table_shard", q => q.eq("vaultOwnerId", vaultOwnerId).eq("table", "personScores").eq("shard", shard)).unique();
        const counts = {...counter?.counts};
        for (const [row, sign] of [[old, -1], [next, 1]] as const) if (row?.vaultOwnerId === vaultOwnerId)
            for (const [key,n] of Object.entries(row.counts)) counts[key] = (counts[key] ?? 0) + sign*n;
        if (Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid score counter");
        counters.push({counter, value:{vaultOwnerId, table:"personScores", shard, counts, revision:(counter?.revision ?? 0)+1}});
    }
    for (const {counter,value} of counters) {
        if (counter) await ctx.db.replace(counter._id,value); else await ctx.db.insert("vaultCounterShards",value);
    }
    for (const review of reviews) await ctx.db.delete(review._id);
    if (next) for (const reviewedAt of next.reviews) await ctx.db.insert("personScoreReviews", { recordId: id, vaultOwnerId: next.vaultOwnerId, reviewedAt });
    if (next) { if (old) await ctx.db.replace(old._id, next); else await ctx.db.insert("personScoreRows", next); }
    else if (old) await ctx.db.delete(old._id);
}
export async function removeScore(ctx: Pick<MutationCtx, "db">, id: string) { await put(ctx, id, null); }
export async function refreshPersonScore(ctx: Pick<MutationCtx, "db">, id: Id<"persons">, force = false) {
    if (!force && !await scopedReadsReady(ctx))
        return;
    const p = await ctx.db.get(id);
    const snapshot = p?.vaultOwnerId && p.archivedAt === undefined ? await loadPersonScopedSnapshot(ctx as unknown as QueryCtx, p.vaultOwnerId, String(id), false, true) : null;
    await put(ctx, String(id), snapshot ? personScore(snapshot, id) : null);
}
export async function refreshProvisionalScore(ctx: Pick<MutationCtx, "db">, id: Id<"provisionalRelatives">) {
    const r = await ctx.db.get(id);
    if (!r?.vaultOwnerId || r.mergeState !== "provisional") {
        await put(ctx, String(id), null);
        return;
    }
    const anchor = await ctx.db.get(r.anchorPersonId);
    const active = anchor?.vaultOwnerId === r.vaultOwnerId && anchor.archivedAt === undefined ? anchor : null;
    const stories = active ? (await ctx.db.query("stories").withIndex("by_person", q => q.eq("personId", active._id)).collect()).filter(s => s.vaultOwnerId === r.vaultOwnerId && s.archivedAt === undefined) : [];
    const op: OperationRow = { rowType: "provisional", id: String(id), personIdentifier: null, displayName: r.displayName, relationshipHint: r.relationshipHint, lifespan: r.possibleBirthYear || r.possibleDeathYear ? `${r.possibleBirthYear || "?"} to ${r.possibleDeathYear || "?"}` : "Undated", keyPlaces: r.possiblePlaces || [], completionPercent: 0, sourceCount: r.evidenceCount, memoryCount: 0, documentCount: 0, storyCount: stories.length, openTaskCount: 0, contextReportCount: 0, storyWorkflow: "needs_genealogy_evidence", latestImportAt: null, lastTouched: r.updatedAt, missingCritical: ["identity_review", "relationships"], nextActions: [`Review ${r.displayName} and decide whether to promote or merge.`], staleChecksCount: 0, researchChecks: [], storyReadinessScore: 0, anchorPersonIdentifier: active?.fsId || String(r.anchorPersonId), badge: r.relationshipHint || "provisional" };
    await put(ctx, String(id), scoreValue(String(id), r.vaultOwnerId, r._creationTime, op, []));
}
export async function scoresReady(ctx: Pick<QueryCtx, "db">) { return !!(await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique())?.complete; }
export const status = internalQuery({ args: {}, handler: ctx => scoresReady(ctx) });
export const totals = internalQuery({ args: { vaultOwnerId: v.string() }, handler: (ctx, a) => ownerTableCounter(ctx, a.vaultOwnerId, "personScores") });
async function staleReviewsPage(ctx: Pick<QueryCtx, "db">, a: {vaultOwnerId: string; now: number; cursor: string | null}) {
    const p = await ctx.db.query("personScoreReviews").withIndex("by_owner_review", q => q.eq("vaultOwnerId", a.vaultOwnerId).gt("reviewedAt", 0).lt("reviewedAt", a.now - STALE_AGE)).paginate({ cursor: a.cursor, numItems: 250, maximumBytesRead: 250000 });
    return { count: p.page.length, continueCursor: p.continueCursor, isDone: p.isDone };
}
export const stalePage = internalQuery({ args: { vaultOwnerId: v.string(), now: v.number(), cursor: v.union(v.string(), v.null()) }, handler: staleReviewsPage });
/** One snapshot covers the common case: totals plus at most 250 stale reviews. */
export const totalsAndStale = internalQuery({args: {vaultOwnerId: v.string(), now: v.number()}, handler: async (ctx, a) => {
    const [total, page] = await Promise.all([ownerTableCounter(ctx, a.vaultOwnerId, "personScores"), staleReviewsPage(ctx, {...a, cursor: null})]);
    return {...total, page};
}});
const sortValidator = v.optional(v.union(v.literal("missingCritical"), v.literal("completion"), v.literal("lastTouched"), v.literal("sourceCount"), v.literal("storyReadiness"), v.literal("newestImport")));
const workflowValidator=v.union(v.literal("needs_genealogy_evidence"),v.literal("needs_context_research"),v.literal("ready_to_draft"),v.literal("ready_to_review"),v.literal("published"));
export const operationsArgs = { vaultOwnerId: v.string(), cursor: v.optional(v.union(v.string(), v.null())), search: v.optional(v.string()), rowType: v.optional(v.union(v.literal("person"), v.literal("provisional"))), missingCheck: v.optional(v.string()), storyStatus: v.optional(v.union(v.literal("has_story"), v.literal("no_story"))), storyWorkflow: v.optional(workflowValidator), staleOnly: v.optional(v.boolean()), sortBy: sortValidator, sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))), limit: v.optional(v.number()) };
export const operationsPage = internalQuery({ args: { ...operationsArgs, now: v.number(), candidateLimit:v.optional(v.number()) }, handler: async (ctx, a): Promise<Omit<OperationsPage, "summary" | "summaryScope" | "exact"> & {scanned:number}> => {
        const base = ctx.db.query("personScoreRows");
        const priority = !a.sortBy || a.sortBy === "missingCritical";
        const range = priority && a.missingCheck && RESEARCH_CHECK_DEFINITIONS.some(c => c.key === a.missingCheck)
            ? base.withIndex(`by_missing_${a.missingCheck}` as "by_missing_identity_review", q => q.eq("vaultOwnerId", a.vaultOwnerId).eq(`missing.${a.missingCheck}` as "missing.identity_review", true))
            : priority && a.rowType ? base.withIndex("by_type_priority", q => q.eq("vaultOwnerId", a.vaultOwnerId).eq("rowType", a.rowType!))
                : priority && a.storyWorkflow ? base.withIndex("by_workflow_priority", q => q.eq("vaultOwnerId", a.vaultOwnerId).eq("storyWorkflow", a.storyWorkflow!))
                    : priority && a.storyStatus ? base.withIndex("by_story_priority", q => q.eq("vaultOwnerId", a.vaultOwnerId).eq("hasStory", a.storyStatus === "has_story"))
                        : base.withIndex(`by_${a.sortBy ?? "missingCritical"}`, q => q.eq("vaultOwnerId", a.vaultOwnerId));
        const p = await range.order(a.sortDirection === "asc" ? "desc" : "asc").paginate({ cursor: a.cursor ?? null, numItems: Math.max(1, Math.min(50, Math.floor(a.candidateLimit ?? 50))), maximumBytesRead: 250000 });
        const needle = a.search?.trim().toLowerCase();
        const active = await Promise.all(p.page.map(async s => {
            // Guest adoption defers score removal; recheck this narrow transitional
            // case before returning a former guest's display data.
            if (!s.vaultOwnerId.startsWith("guest_")) return true;
            const id = ctx.db.normalizeId(s.rowType === "person" ? "persons" : "provisionalRelatives", s.recordId);
            const source = id ? await ctx.db.get(id) : null;
            return source?.vaultOwnerId === s.vaultOwnerId;
        }));
        const rows = p.page.filter((s, i) => active[i]).filter(s => { const r = s.operation; return (!a.rowType || s.rowType === a.rowType) && (!a.storyStatus || (r.storyCount > 0) === (a.storyStatus === "has_story")) && (!a.storyWorkflow || s.storyWorkflow === a.storyWorkflow) && (!a.staleOnly || staleCount(s.reviews, a.now) > 0) && (!a.missingCheck || r.missingCritical.includes(a.missingCheck)) && (!needle || [r.displayName, r.relationshipHint || "", ...r.keyPlaces, r.lifespan].join(" ").toLowerCase().includes(needle)); }).map(s => ({ ...s.operation, staleChecksCount: staleCount(s.reviews, a.now) }));
        return { rows, scanned:p.page.length, continueCursor: p.continueCursor, isDone: p.isDone };
    } });
export const readinessArgs = { vaultOwnerId: v.string(), storyWorkflow: v.optional(workflowValidator), cursor: v.optional(v.union(v.string(), v.null())), limit: v.optional(v.number()) };
export const readinessPage = internalQuery({ args: readinessArgs, handler: async (ctx, a): Promise<ReadinessPage> => {
        const base = ctx.db.query("personScoreRows");
        const query = a.storyWorkflow ? base.withIndex("by_workflow_readiness", q => q.eq("vaultOwnerId", a.vaultOwnerId).eq("rowType", "person").eq("storyWorkflow", a.storyWorkflow!)) : base.withIndex("by_readiness", q => q.eq("vaultOwnerId", a.vaultOwnerId).eq("rowType", "person"));
        const p = await query.paginate({ cursor: a.cursor ?? null, numItems: 24, maximumBytesRead: 250000 });
        const visible = await Promise.all(p.page.map(async r => {
            if (!r.vaultOwnerId.startsWith("guest_")) return true;
            const id = ctx.db.normalizeId("persons", r.recordId);
            return id && (await ctx.db.get(id))?.vaultOwnerId === r.vaultOwnerId;
        }));
        return { page: p.page.flatMap((r, i) => visible[i] && r.readiness ? [r.readiness] : []), continueCursor: p.continueCursor, isDone: p.isDone };
    } });
