import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { COUNT_TABLES } from "./vaultCounts";
import { withSearchWrites } from "./searchWrites";
import type { Id } from "./_generated/dataModel";
const modules = import.meta.glob("./**/*.ts");
const owner = "user_syntheticCounts";
const other = "user_syntheticOther";
const task = (i: number) => ({vaultOwnerId: owner, title: `Invented task ${i}`, type: "other" as const, status: "todo" as const, priority: "medium" as const, aiSuggested: false, createdAt: i, updatedAt: i});

async function build(t: ReturnType<typeof convexTest>) {
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* bounded restartable steps */ }
}
async function parity(t: ReturnType<typeof convexTest>) {
  const expected = await t.run(async ctx => {
    const counts: Record<string, Record<string, Record<string, number>>> = {};
    for (const table of COUNT_TABLES) for (const row of await ctx.db.query(table).collect()) {
      if (("archivedAt" in row && row.archivedAt !== undefined) || !row.vaultOwnerId) continue;
      const byTable = counts[row.vaultOwnerId] ??= {};
      const byKey = byTable[table] ??= {};
      byKey.active = (byKey.active ?? 0) + 1;
      const add = (key: string) => {byKey[key] = (byKey[key] ?? 0) + 1;};
      if(table === "researchTasks" && "status" in row && row.status !== "done")add("open");
      if(table === "stories" && "status" in row)add(`status:${row.status}`);
      if(table === "places") {
        const context=await ctx.db.query("historicalContext").collect();
        if(!context.some(c=>c.vaultOwnerId===row.vaultOwnerId&&c.archivedAt===undefined&&c.placeId===row._id))add("withoutContext");
      }
      if (table === "researchTasks" || table === "researchLog") add(`status:${"status" in row ? row.status : ""}`);
      if (table === "provisionalRelatives") add(`mergeState:${"mergeState" in row ? row.mergeState : ""}`);
      if (table === "researchLog" && "activityType" in row) {
        add(`activity:${row.activityType}`);
        add(`author:${row.creationProvenance?.actorKind ?? "unattributed"}`);
      }
    }
    return counts;
  });
  for (const vaultOwnerId of [owner, other]) {
    const actual = (await t.query(internal.vaultCounts.read, {vaultOwnerId})).counts;
    for (const table of COUNT_TABLES) {
      const want = expected[vaultOwnerId]?.[table] ?? {};
      for (const key of new Set([...Object.keys(want), ...Object.keys(actual[table] ?? {})])) expect(actual[table]?.[key] ?? 0, `${vaultOwnerId}/${table}/${key}`).toBe(want[key] ?? 0);
    }
  }
}

test("randomized write/archive/restore/delete/owner moves match a full recount after writes interleaved with backfill and after completion", async () => {
  const t = convexTest(schema, modules);
  const ids: Id<"researchTasks">[] = [];
  await t.run(async ctx => {
    // Legacy rows have no ledger. Include a page boundary and archivedAt=0.
    for (let i = 0; i < 135; i++) ids.push(await ctx.db.insert("researchTasks", {...task(i), ...(i % 7 === 0 ? {archivedAt: 0} : {})}));
    await ctx.db.insert("researchTasks", {...task(999), vaultOwnerId: undefined});
    await ctx.db.insert("places", {vaultOwnerId: owner, name: "Invented", fullName: "Synthetic Parish", type: "parish", createdAt: 1, updatedAt: 1});
  });
  expect((await t.query(internal.vaultCounts.read, {vaultOwnerId: owner})).complete).toBe(false);
  // Walk through the earlier tables and the FIRST task page, then interrupt.
  for (let i = 0; i <= COUNT_TABLES.indexOf("researchTasks"); i++) await t.mutation(internal.vaultCounts.backfillStep, {});
  let seed = 142857;
  const random = (max: number) => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max;};
  for (let i = 0; i < 220; i++) {
    await t.run(async ctx => {
      const db = withSearchWrites(ctx).db;
      const at = random(ids.length), id = ids[at];
      switch (random(7)) {
        case 0: ids.push(await db.insert("researchTasks", {...task(200 + i), vaultOwnerId: random(2) ? owner : other})); break;
        case 1: await db.patch(id, {archivedAt: i}); break;
        case 2: await db.patch("researchTasks", id, {archivedAt: undefined}); break;
        case 3: await db.patch(id, {vaultOwnerId: random(2) ? owner : other}); break;
        case 4: await db.patch(id, {status: (["todo", "in_progress", "blocked", "done"] as const)[random(4)]}); break;
        case 5: await db.replace(id, {...task(i), vaultOwnerId: other}); break;
        case 6: await db.delete(id); ids.splice(at, 1); break;
      }
    });
    if (i === 79) {await build(t); await parity(t);}
  }
  await build(t); await parity(t);
  const before = await t.query(internal.vaultCounts.read, {vaultOwnerId: owner});
  await build(t);
  expect(await t.query(internal.vaultCounts.read, {vaultOwnerId: owner})).toEqual(before);
});

test("all four status facets and log attribution survive replacement, owner moves and deletion", async () => {
  const t = convexTest(schema, modules);
  await build(t);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    const logId = await db.insert("researchLog", {vaultOwnerId: owner, entityType: "other", activityType: "other", status: "done", summary: "Invented", createdAt: 1, updatedAt: 1});
    await db.patch(logId, {vaultOwnerId: other, status: "blocked", activityType: "context_research"});
    await db.patch(logId, {archivedAt: 0});
    await db.patch(logId, {archivedAt: undefined});
    const source = await db.insert("sources", {vaultOwnerId: owner, title: "Synthetic", type: "other", createdAt: 1, updatedAt: 1});
    await db.patch(source, {vaultOwnerId: other});
    await db.delete("sources", source);
  });
  await parity(t);
  const result = await t.query(internal.vaultCounts.read, {vaultOwnerId: other});
  expect(result.counts.researchLog).toEqual({active: 1, "status:blocked": 1, "activity:context_research": 1, "author:unattributed": 1});
});

test("source and counters roll back together", async () => {
  const t = convexTest(schema, modules);
  await build(t);
  await expect(t.run(async ctx => {
    await withSearchWrites(ctx).db.insert("researchTasks", task(1));
    throw new Error("synthetic failure");
  })).rejects.toThrow("synthetic failure");
  expect(await t.run(ctx => ctx.db.query("researchTasks").collect())).toEqual([]);
  await parity(t);
});

test("parallel adapter writes serialize counter creation and owner deltas", async () => {
  const t = convexTest(schema, modules);
  await build(t);
  const ids = await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    return Promise.all(Array.from({length: 40}, (_, i) => db.insert("researchTasks", task(i))));
  });
  await parity(t);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    await Promise.all(ids.map((id, i) => db.patch(id, {vaultOwnerId: other, ...(i % 2 ? {archivedAt: 0} : {status: "done" as const})})));
  });
  await parity(t);
  expect((await t.query(internal.vaultCounts.read, {vaultOwnerId: other})).counts.researchTasks?.active).toBe(20);
});

test("deferred guest adapter still tracks non-person owner moves and content revisions", async () => {
  const t = convexTest(schema, modules);
  await build(t);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx, [], true).db;
    const source = await db.insert("sources", {vaultOwnerId: owner, title: "Synthetic", type: "other", createdAt: 0, updatedAt: 0});
    const work = await db.insert("researchTasks", task(0));
    await Promise.all([db.patch(source, {vaultOwnerId: other}), db.patch(work, {vaultOwnerId: other, updatedAt: 123.123456})]);
  });
  await parity(t);
  const page = await t.query(internal.researchPages.tasks, {vaultOwnerId: other, cursor: null});
  expect(page.page[0].researchOrderTime).toBe(-123.123456);
  const before = await t.query(internal.researchPages.version, {vaultOwnerId: other});
  await t.run(ctx => withSearchWrites(ctx).db.patch(page.page[0]._id, {title: "Renamed synthetic task"}));
  const after = await t.query(internal.researchPages.version, {vaultOwnerId: other});
  expect(after.tasks).toBe(before.tasks);
  expect(after.revisions[1]).toBe(before.revisions[1] + 1);
  const audit = await t.query(internal.vaultCounts.recountPage, {vaultOwnerId: other, table: "researchTasks", cursor: null});
  expect(audit.isDone).toBe(true);
  for (const [key, n] of Object.entries(audit.counter)) expect(audit.subtotal[key] ?? 0).toBe(n);
});

test("v1 unsharded memberships migrate atomically with edits before the v4 completion gate",async()=>{
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  await ctx.db.insert("searchBuildState",{table:"vaultCounts:v1",cursor:null,complete:true});
  await ctx.db.insert("vaultCounts",{vaultOwnerId:owner,table:"researchTasks",counts:{active:2,"status:todo":2},revision:7});
  const ids=[];
  for(let i=0;i<2;i++){const id=await ctx.db.insert("researchTasks",task(i));ids.push(id);await ctx.db.insert("vaultCountMembers",{recordId:String(id),table:"researchTasks",owner,keys:["active","status:todo"]});}
  return ids;
 });
 expect((await t.query(internal.vaultCounts.read,{vaultOwnerId:owner})).complete).toBe(false);
 await t.run(async ctx=>{const db=withSearchWrites(ctx).db;await db.patch(ids[0],{archivedAt:0});await db.patch(ids[1],{vaultOwnerId:other});});
 await build(t);await parity(t);
 expect((await t.query(internal.vaultCounts.read,{vaultOwnerId:owner})).counts.researchTasks?.active).toBe(0);
 expect((await t.query(internal.vaultCounts.read,{vaultOwnerId:other})).counts.researchTasks?.active).toBe(1);
 expect(await t.run(ctx=>ctx.db.query("vaultCountMembers").withIndex("by_record",q=>q.eq("recordId",String(ids[1]))).unique())).toMatchObject({owner:other,shard:expect.any(Number)});
});
