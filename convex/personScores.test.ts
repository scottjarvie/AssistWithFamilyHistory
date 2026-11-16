import { expect, test, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { getVaultSnapshot, buildPeopleRows } from "./vault";
import { withSearchWrites } from "./searchWrites";
import { applyExplorerChanges, type ExplorerChange } from "./peopleExplorer";
import { personScore } from "./personScores";
import { staleCount, STALE_AGE } from "./personScoreModel";
const modules = import.meta.glob("./**/*.ts");
const owner = "user_syntheticScores", other = "user_syntheticOther";
const fields = (i: number) => ({ vaultOwnerId: owner, name: { given: `Invented ${i}`, surname: "Synthetic" }, living: false, sex: "unknown" as const, researchStatus: "basic" as const, createdAt: i, updatedAt: i });
const setup = () => convexTest(schema, modules);
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function migrate(t: ReturnType<typeof setup>) { while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* resumable */ } }
async function settle(t: ReturnType<typeof setup>) { await t.finishAllScheduledFunctions(() => vi.runAllTimers()); }
async function write(t: ReturnType<typeof setup>, fn: (db: ReturnType<typeof withSearchWrites>["db"]) => Promise<unknown>) { await t.run(async (ctx) => { const changes: ExplorerChange[] = []; await fn(withSearchWrites(ctx, changes).db); await applyExplorerChanges(ctx, changes); }); await settle(t); }
async function recount(t: ReturnType<typeof setup>) {
    const expected = await t.run(async (ctx) => { const snap = await getVaultSnapshot(ctx, owner); const c: Record<string, number> = {}; const add = (k: string, n: number) => c[k] = (c[k] ?? 0) + n; for (const r of buildPeopleRows(snap)) {
        add("rows", 1);
        add("people", 1);
        add("completion", r.operations.completionPercent);
        add("required", r.operations.requiredMissingCount);
        add("recommended", r.operations.recommendedMissingCount);
        add(`workflow:${r.storyWorkflow}`, 1);
        add("withoutSources", Number(!r.stats.sources));
        add("withoutContext", Number(!r.contextCoverage.count));
        add("withoutStories", Number(!r.stats.stories));
    } return { c, snap }; });
    const actual = (await t.query(internal.personScores.totals, { vaultOwnerId: owner })).counts;
    for (const key of new Set([...Object.keys(expected.c), ...Object.keys(actual)]))
        expect(actual[key] ?? 0, key).toBe(expected.c[key] ?? 0);
    return expected.snap;
}
test("old vs maintained operations, readiness order including ties, exact totals and clock-only stale changes", async () => {
    vi.useFakeTimers();
    const now = 1800000000000;
    vi.setSystemTime(now);
    const t = setup();
    const ids = await t.run(async (ctx) => {
        const ids = [];
        for (let i = 0; i < 65; i++)
            ids.push(await ctx.db.insert("persons", { ...fields(i), birth: { date: { original: `about ${1800 + i}`, year: 1800 + i } } }));
        const source = await ctx.db.insert("sources", { vaultOwnerId: owner, title: "Invented birth register", type: "other", notes: "baptism", createdAt: 1, updatedAt: 1 });
        const citation = await ctx.db.insert("citations", { vaultOwnerId: owner, sourceId: source, isEvidence: true, confidence: "high", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("citationLinks", { vaultOwnerId: owner, citationId: citation, targetType: "person", targetId: String(ids[0]), createdAt: 1 });
        await ctx.db.insert("stories", { vaultOwnerId: owner, personId: ids[0], title: "Synthetic story", content: "Invented", type: "biography", citationIds: [], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("researchChecks", { vaultOwnerId: owner, personId: ids[0], checkKey: "identity_review", status: "complete", applicability: "required", completionSource: "user", confidence: 1, lastReviewedAt: now - STALE_AGE + 1, createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("persons", { ...fields(999), vaultOwnerId: other });
        return ids;
    });
    const legacy = await t.query(internal.vault.getOperationsQueue, { vaultOwnerId: owner });
    const oldReady = await t.query(internal.vault.getStoryReadinessCandidates, { vaultOwnerId: owner });
    await migrate(t);
    let cursor: string | null = null;
    const all = [];
    for (;;) {
        const p = await t.query(internal.personScores.readinessPage, { vaultOwnerId: owner, cursor });
        all.push(...p.page);
        if (p.isDone)
            break;
        cursor = p.continueCursor;
    }
    expect(all).toEqual(oldReady);
    const projected = await t.run(ctx => ctx.db.query("personScoreRows").collect());
    for (const row of projected.filter(r => r.vaultOwnerId === owner)) {
        const old = legacy.rows.find(r => r.id === row.operation.id)!;
        const { researchChecks, ...op } = row.operation;
        const { researchChecks: oldChecks, ...oldOp } = old;
        expect(op).toEqual(oldOp);
        expect(researchChecks).toEqual(oldChecks.map(c => ({ checkKey: c.checkKey, status: c.status, applicability: c.applicability, lastReviewedAt: c.lastReviewedAt })));
    }
    expect((await t.query(internal.personScores.stalePage, { vaultOwnerId: owner, now, cursor: null })).count).toBe(0);
    expect((await t.query(internal.personScores.stalePage, { vaultOwnerId: owner, now: now + 2, cursor: null })).count).toBe(1);
    expect(staleCount(projected.find(r => r.recordId === ids[0])!.reviews, now + 2)).toBe(1);
    await recount(t);
    const operations: string[] = [];
    cursor = null;
    for (;;) {
        const p = await t.query(internal.personScores.operationsPage, { vaultOwnerId: owner, now, cursor, search: "Invented 0 " });
        operations.push(...p.rows.map(r => r.id));
        if (p.isDone)
            break;
        cursor = p.continueCursor;
    }
    expect(operations).toEqual([String(ids[0])]);
});
test("randomized source changes recount exactly, dependency expansion and ownership removal", async () => {
    vi.useFakeTimers();
    const t = setup();
    const ids = await t.run(async (ctx) => { const a = await ctx.db.insert("persons", fields(1)), b = await ctx.db.insert("persons", fields(2)); const place = await ctx.db.insert("places", { vaultOwnerId: owner, name: "Invented", fullName: "Invented", type: "parish", createdAt: 1, updatedAt: 1 }); await ctx.db.patch(a, { birth: { place: { original: "Invented", placeId: place } } }); const source = await ctx.db.insert("sources", { vaultOwnerId: owner, title: "Invented", type: "other", createdAt: 1, updatedAt: 1 }); const citation = await ctx.db.insert("citations", { vaultOwnerId: owner, sourceId: source, isEvidence: true, confidence: "high", createdAt: 1, updatedAt: 1 }); await ctx.db.insert("citationLinks", { vaultOwnerId: owner, citationId: citation, targetType: "person", targetId: String(a), createdAt: 1 }); return { a, b, source, place }; });
    await migrate(t);
    let random = 123;
    for (let i = 0; i < 80; i++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const action = random % 4;
        await write(t, async (db) => { if (action === 0)
            await db.patch(ids.source, { title: i % 2 ? "Invented birth register" : "Invented death register", archivedAt: i % 5 === 0 ? 0 : undefined });
        else if (action === 1)
            await db.patch(ids.a, { researchStatus: i % 2 ? "complete" : "basic", updatedAt: i, vaultOwnerId: i % 7 === 0 ? other : owner });
        else if (action === 2)
            await db.insert("relationships", { vaultOwnerId: owner, person1: ids.a, person2: ids.b, type: i % 2 ? "Couple" : "ParentChild", createdAt: i, updatedAt: i });
        else
            await db.insert("historicalContext", { vaultOwnerId: owner, placeId: i % 2 ? ids.place : undefined, timePeriod: { startYear: 1700, endYear: 2000 }, topic: "other", title: "Invented", content: "Invented", sources: [], createdAt: i, updatedAt: i }); });
        const snap = await recount(t);
        const stored = await t.run(ctx => ctx.db.query("personScoreRows").collect());
        for (const p of snap.people)
            expect(stored.find(s => s.recordId === p._id)?.readiness).toEqual(personScore(snap, p._id)?.readiness);
    }
});
test("provisional rows follow anchor stories, merges, deletes and v6 backfill is idempotent", async () => {
    vi.useFakeTimers();
    const t = setup();
    const ids = await t.run(async (ctx) => { const a = await ctx.db.insert("persons", fields(1)); const r = await ctx.db.insert("provisionalRelatives", { vaultOwnerId: owner, anchorPersonId: a, displayName: "Invented relative", dedupeKey: "synthetic", sourceKeys: [], evidenceCount: 2, mergeState: "provisional", createdAt: 1, updatedAt: 1 }); return { a, r }; });
    await migrate(t);
    await write(t, db => db.insert("stories", { vaultOwnerId: owner, personId: ids.a, title: "Invented", content: "Invented", type: "biography", citationIds: [], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 }));
    expect(await t.run(ctx => ctx.db.query("personScoreRows").withIndex("by_record", q => q.eq("recordId", ids.r)).unique())).toMatchObject({ operation: { storyCount: 1 } });
    await write(t, db => db.patch(ids.r, { mergeState: "dismissed" }));
    expect(await t.run(ctx => ctx.db.query("personScoreRows").withIndex("by_record", q => q.eq("recordId", ids.r)).unique())).toBeNull();
    await recount(t);
    const before = await t.query(internal.personScores.totals, { vaultOwnerId: owner });
    expect(await t.mutation(internal.vaultCounts.backfillStep, {})).toBe(true);
    expect(await t.query(internal.personScores.totals, { vaultOwnerId: owner })).toEqual(before);
    await write(t, db => db.delete(ids.a));
    await recount(t);
});
test("migration resumes with concurrent writes behind its cursor; authenticated summaries and pages remain owner scoped", async () => {
 vi.useFakeTimers();vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");const t=setup();
 const ids=await t.run(async ctx=>{const ids=[];for(let i=0;i<4;i++)ids.push(await ctx.db.insert("persons",fields(i)));return ids;});
 for(let i=0;i<24;i++)await t.mutation(internal.vaultCounts.backfillStep,{});
 expect((await t.query(internal.vaultCounts.backfillStatus,{})).table).toBe("personScores");
 await t.mutation(internal.vaultCounts.backfillStep,{});
 await write(t,db=>db.patch(ids[0],{researchStatus:"complete",updatedAt:999}));
 while(!await t.mutation(internal.vaultCounts.backfillStep,{})){/* resume */}
 await recount(t);
 const authed=t.withIdentity({subject:owner});
 expect(await authed.action(api.vaultReads.getOperationsSummary,{vaultOwnerId:owner})).toEqual(await t.query(internal.vault.getOperationsSummary,{vaultOwnerId:owner}));
 const p=await authed.action(api.vaultReads.getOperationsQueue,{vaultOwnerId:owner});expect(p.summary.visibleRows).toBe(4);expect(p.rows).toHaveLength(4);
 await expect(t.withIdentity({subject:other}).action(api.vaultReads.getStoryReadinessPage,{vaultOwnerId:owner})).rejects.toThrow(/owner_mismatch/);
 await expect(t.withIdentity({subject:other}).action(api.vaultReads.getOperationsQueue,{vaultOwnerId:owner})).rejects.toThrow(/owner_mismatch/);
});
test("inline budget deferral cannot commit counter deltas without their score row",async()=>{
 vi.useFakeTimers();const t=setup();const id=await t.run(async ctx=>{const id=await ctx.db.insert("persons",fields(1));for(const checkKey of ["identity_review","biography"])await ctx.db.insert("researchChecks",{vaultOwnerId:owner,personId:id,checkKey,status:"complete",applicability:"required",completionSource:"user",confidence:1,lastReviewedAt:1,createdAt:1,updatedAt:1});return id;});await migrate(t);
 const before=await t.query(internal.personScores.totals,{vaultOwnerId:owner});
 await t.run(async ctx=>{const changes:ExplorerChange[]=[];await withSearchWrites(ctx,changes).db.patch(id,{birth:{date:{original:"1800",year:1800}}});await applyExplorerChanges(ctx,changes);});
 expect((await t.query(internal.personScores.totals,{vaultOwnerId:owner})).counts).toEqual(before.counts);
 await settle(t);await recount(t);
});
test("zero-valued sort keys match old primary orders in both directions and readiness order exactly",async()=>{
 const {orderedNumber}=await import("./personScoreModel");expect(orderedNumber(-0)).toBe(orderedNumber(0));expect([0,1,2,100,-2].sort((a,b)=>orderedNumber(-a).localeCompare(orderedNumber(-b)))).toEqual([100,2,1,0,-2]);
 const {RESEARCH_CHECK_DEFINITIONS}=await import("./vaultCore");const t=setup();await t.run(async ctx=>{
  const ids=[];for(let i=0;i<3;i++)ids.push(await ctx.db.insert("persons",{...fields(i),...(i===1?{birth:{date:{original:"1800",year:1800}}}:{})}));
  for(const d of RESEARCH_CHECK_DEFINITIONS)await ctx.db.insert("researchChecks",{vaultOwnerId:owner,personId:ids[2],checkKey:d.key,status:"complete",applicability:"required",completionSource:"user",confidence:1,createdAt:1,updatedAt:1});
 });await migrate(t);
 const fieldsBySort={missingCritical:"missingCritical",completion:"completionPercent",lastTouched:"lastTouched",sourceCount:"sourceCount",storyReadiness:"storyReadinessScore",newestImport:"latestImportAt"} as const;
 for(const sortBy of Object.keys(fieldsBySort) as (keyof typeof fieldsBySort)[])for(const sortDirection of ["asc","desc"] as const){
  const old=await t.query(internal.vault.getOperationsQueue,{vaultOwnerId:owner,sortBy,sortDirection});
  const next=await t.query(internal.personScores.operationsPage,{vaultOwnerId:owner,sortBy,sortDirection,now:Date.now(),cursor:null});
  const value=(r:typeof next.rows[number])=>sortBy==="missingCritical"?r.missingCritical.length:r[fieldsBySort[sortBy]]??0;
  expect(next.rows.map(value),`${sortBy}/${sortDirection}`).toEqual(old.rows.map(value));
 }
 expect((await t.query(internal.personScores.readinessPage,{vaultOwnerId:owner,cursor:null})).page).toEqual(await t.query(internal.vault.getStoryReadinessCandidates,{vaultOwnerId:owner}));
});
test("event type changes refresh census, immigration and military evidence",async()=>{
 vi.useFakeTimers();const t=setup();const ids=await t.run(async ctx=>{const p=await ctx.db.insert("persons",fields(1));const e=await ctx.db.insert("events",{vaultOwnerId:owner,type:"residence",createdAt:1,updatedAt:1});await ctx.db.insert("personEvents",{vaultOwnerId:owner,personId:p,eventId:e,role:"primary",createdAt:1});return {p,e};});await migrate(t);
 for(const type of ["census","immigration","military","residence"] as const){await write(t,db=>db.patch(ids.e,{type}));const snap=await recount(t);expect((await t.run(ctx=>ctx.db.query("personScoreRows").withIndex("by_record",q=>q.eq("recordId",ids.p)).unique()))?.operation).toEqual(personScore(snap,ids.p)?.operation);}
});
test("stale aggregates retry on concurrent score refresh and refuse a persistently moving vault",async()=>{
 const {readScoreTotals}=await import("./vaultReads");const {getFunctionName}=await import("convex/server");let reads=0;
 const runQuery=vi.fn(async(ref:unknown)=>{if(getFunctionName(ref as never).endsWith(":totals")){reads++;return {revision:reads===1?1:2,counts:{people:2}};}return {count:reads===1?99:2,isDone:true,continueCursor:""};});
 expect(await readScoreTotals({runQuery} as never,owner,Date.now())).toEqual({counts:{people:2},staleChecks:2});
 const unstable=vi.fn(async(ref:unknown)=>getFunctionName(ref as never).endsWith(":totals")?{revision:++reads,counts:{people:2}}:{count:1,isDone:true,continueCursor:""});
 await expect(readScoreTotals({runQuery:unstable} as never,owner,Date.now())).rejects.toThrow(/vault changed/);
});
test("no-op score refresh ignores stored object key order",async()=>{
 const t=setup();const id=await t.run(ctx=>ctx.db.insert("persons",fields(1)));await migrate(t);
 await t.run(async ctx=>{const old=(await ctx.db.query("personScoreRows").withIndex("by_record",q=>q.eq("recordId",id)).unique())!;const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;const {_id,_creationTime,...value}=old;void _creationTime;await ctx.db.replace(_id,reorder(value) as typeof value);});
 const before=await t.query(internal.personScores.totals,{vaultOwnerId:owner});await t.mutation(internal.peopleExplorer.rebuildOne,{personId:id});expect(await t.query(internal.personScores.totals,{vaultOwnerId:owner})).toEqual(before);
});
test("sparse Operations search fills a user page across candidate pages without extra clicks",async()=>{
 const t=setup();await t.run(async ctx=>{for(let i=0;i<65;i++)await ctx.db.insert("persons",fields(i));});await migrate(t);
 const result=await t.withIdentity({subject:owner}).action(api.vaultReads.getOperationsQueue,{vaultOwnerId:owner,search:"Invented 64 "});expect(result.rows.map(r=>r.displayName)).toEqual(["Invented 64 Synthetic"]);expect(result.isDone).toBe(true);
});
