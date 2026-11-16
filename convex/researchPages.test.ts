import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal, api } from "./_generated/api";
import { withSearchWrites } from "./searchWrites";
const modules = import.meta.glob("./**/*.ts");
const owner = "user_syntheticResearch";
test("Research pages reproduce legacy rows/order with exact global facets and owner-safe person hydration", async () => {
  const t = convexTest(schema, modules);
  const personId = await t.run(async ctx => {
    const person = await ctx.db.insert("persons", {vaultOwnerId: owner, name: {given: "Invented", surname: "Reed"}, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1});
    const foreign = await ctx.db.insert("persons", {vaultOwnerId: "user_foreign", name: {given: "Other", surname: "Synthetic"}, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1});
    for (let i = 0; i < 122; i++) {
      await ctx.db.insert("researchTasks", {vaultOwnerId: owner, title: `Synthetic ${i}`, personId: i % 3 === 0 ? foreign : person, type: "other", status: i % 2 === 0 ? "done" : "todo", priority: "medium", aiSuggested: false, createdAt: i, updatedAt: i === 119 ? 42.0001 : i === 118 ? 42.0002 : 42, ...(i === 121 ? {archivedAt: 0} : {})});
      await ctx.db.insert("researchLog", {vaultOwnerId: owner, entityType: "person", entityId: i % 3 === 0 ? foreign : person, activityType: "other", status: "done", summary: `Synthetic ${i}`, createdAt: i, updatedAt: 42});
    }
    return person;
  });
  const legacy = await t.query(internal.vault.getResearchOverview, {vaultOwnerId: owner});
  const publicBefore = await t.withIdentity({subject: owner}).action(api.vaultReads.getResearchOverview, {vaultOwnerId: owner});
  expect(publicBefore).toEqual(legacy);
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* resume */ }
  const stripKey = <T extends {researchOrderTime?: number}>(row: T) => {const {researchOrderTime: _key, ...rest} = row; void _key; return rest;};
  let cursor: string | null = null;
  const tasks = [];
  do {
    const page = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, cursor});
    expect(page.page.length).toBeLessThanOrEqual(50);
    expect(page.totals).toEqual({active: 121, "status:done": 61, "status:todo": 60});
    tasks.push(...page.page.map(stripKey));
    if (page.isDone) break;
    cursor = page.continueCursor;
  } while (true);
  expect(tasks).toEqual(legacy.tasks);
  const filtered = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, status: "done", cursor: null});
  expect(filtered.page.map(stripKey)).toEqual(legacy.tasks.filter(t => t.status === "done").slice(0, 50));
  expect(filtered.totals.active).toBe(121);
  const after = await t.withIdentity({subject: owner}).action(api.vaultReads.getResearchOverview, {vaultOwnerId: owner});
  expect(after.tasks.map(stripKey)).toEqual(legacy.tasks);
  expect(after.logEntries.map(stripKey)).toEqual(legacy.logEntries);
  await t.run(ctx => withSearchWrites(ctx).db.patch(personId, {archivedAt: 0}));
  const archived = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, cursor: null});
  expect(archived.page.every(t => t.person === null)).toBe(true);
});

test("filtered continuation and large task descriptions remain complete", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    for (let i = 0; i < 110; i++) await db.insert("researchTasks", {vaultOwnerId: owner, title: `Synthetic large ${i}`, description: "Synthetic ".repeat(2000), type: "other", status: "blocked", priority: "medium", aiSuggested: false, createdAt: i, updatedAt: i});
  });
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* resume */ }
  let cursor: string | null = null;
  const titles: string[] = [];
  do {
    const r = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, cursor, status: "blocked"});
    expect(r.page.length).toBeLessThanOrEqual(50);
    titles.push(...r.page.map(x => x.title));
    if (r.isDone) break;
    cursor = r.continueCursor;
  } while (true);
  expect(titles).toEqual(Array.from({length: 110}, (_, i) => `Synthetic large ${109-i}`));
});

test("Research retries changed revisions, then fails explicitly under continuous edits", async () => {
  let calls = 0, tick = 0;
  let mode: "once" | "always" = "once";
  const {internalQuery} = await import("./_generated/server");
  const {v} = await import("convex/values");
  const t = convexTest(schema, {...modules, "./researchPages.ts": async () => {
    const real = await import("./researchPages");
    return {...real, version: internalQuery({args: {vaultOwnerId: v.string()}, handler: async () => {
      calls++;
      if (mode === "always" || calls === 2) tick++;
      return {ready: true, revisions: [tick, 0, 0], tasks: 0, log: 0};
    }})};
  }});
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* resume */ }
  expect(await t.withIdentity({subject: owner}).action(api.vaultReads.getResearchOverview, {vaultOwnerId: owner})).toEqual({tasks: [], logEntries: []});
  expect(calls).toBe(4);
  mode = "always"; calls = 0;
  await expect(t.withIdentity({subject: owner}).action(api.vaultReads.getResearchOverview, {vaultOwnerId: owner})).rejects.toThrow("Research changed while loading");
  expect(calls).toBe(6);
});
