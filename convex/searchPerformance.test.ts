/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { withSearchWrites } from "./searchWrites";
const modules = import.meta.glob("./**/*.ts");
const principal = { issuer: "https://synthetic.example", subject: "user_search_synthetic", clientId: "synthetic", scopes: ["family_history:read"] };

function syntheticPerson(given: string) {
  return {
    vaultOwnerId: principal.subject,
    name: { given, surname: "Synthetic" },
    sex: "unknown" as const,
    living: false,
    researchStatus: "basic" as const,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("a full recent window signals uncertainty with one or zero matches", async () => {
  const t = convexTest(schema, modules);
  const oldest = await t.run(async ctx => {
    const id = await ctx.db.insert("persons", syntheticPerson("Rareancestor"));
    for (let i = 0; i < 250; i++) await ctx.db.insert("persons", syntheticPerson("Common"));
    return id;
  });
  const search = (query: string) => t.query(internal.mcpFamilyHistory.search, { principal, query, kinds: ["person"] });
  expect(await search("Rareancestor")).toMatchObject({
    results: [{ id: oldest }],
    truncated: true,
    coverage: {
      visitedKinds: [{ kind: "person", source: "recent_window", windowReached: true, matchesOmitted: false }],
      unvisitedKinds: [],
      replyCapReached: false,
    },
  });
  await t.run(ctx => ctx.db.insert("persons", syntheticPerson("Common")));
  expect(await search("Rareancestor")).toMatchObject({
    results: [], truncated: true,
    coverage: { visitedKinds: [{ kind: "person", windowReached: true }], replyCapReached: false },
  });
  while (!await t.mutation(internal.searchBackfill.step, { table: "persons" })) { /* page through migration */ }
  expect(await search("Rareancestor")).toMatchObject({
    results: [{ id: oldest }], truncated: false,
    coverage: { visitedKinds: [{ kind: "person", source: "text_index" }], replyCapReached: false },
  });
  expect((await search("")).coverage).toMatchObject({
    visitedKinds: [{ kind: "person", source: "recent_window", windowReached: true, matchesOmitted: true }],
  });
});

test("reply cap separates proven omitted matches from kinds the search never visited", async () => {
  const t = convexTest(schema, modules);
  const first = await t.run(ctx => ctx.db.insert("persons", syntheticPerson("Common")));
  const search = () => t.query(internal.mcpFamilyHistory.search, {
    principal, query: "Common", kinds: ["topic", "place", "source", "person"], limit: 1,
  });
  expect(await search()).toMatchObject({
    results: [{ kind: "person", id: first }], truncated: true,
    coverage: {
      visitedKinds: [{ kind: "person", source: "recent_window", windowReached: false, matchesOmitted: false }],
      unvisitedKinds: ["source", "place", "topic"],
      replyCapReached: true,
    },
  });
  const newest = await t.run(ctx => ctx.db.insert("persons", syntheticPerson("Common")));
  expect(await search()).toMatchObject({
    results: [{ kind: "person", id: newest }], truncated: true,
    coverage: { visitedKinds: [{ kind: "person", source: "recent_window", windowReached: false, matchesOmitted: true }] },
  });
  await t.mutation(internal.searchBackfill.step, { table: "persons" });
  const indexed = await search();
  expect(indexed.results).toHaveLength(1);
  expect(indexed.truncated).toBe(true);
  expect(indexed.coverage).toEqual({
    status: "reported", visitedKinds: [{ kind: "person", source: "text_index" }],
    unvisitedKinds: ["source", "place", "topic"], replyCapReached: true,
  });
});

test("migration gates old-row search; indexed names, aliases and tags survive edits without cross-owner or archived hits", async () => {
 const t = convexTest(schema, modules);
 const id = await t.run(async ctx => {
  const db = withSearchWrites(ctx).db;
  const row = { vaultOwnerId: principal.subject, name: { given: "Rareancestor", surname: "Synthetic" }, alternateNames: [{ type: "alias", given: "Oldalias", surname: "Synthetic" }], tags: ["researchtag"], sex: "unknown" as const, living: false, researchStatus: "basic" as const, createdAt: 1, updatedAt: 1 };
  const id = await ctx.db.insert("persons", row); // legacy row without derived fields
  await db.insert("persons", { ...row, vaultOwnerId: "user_other_synthetic" });
  await db.insert("persons", { ...row, archivedAt: 1 });
  for (let i=0;i<300;i++) await db.insert("persons", { ...row, name: { given: "Common", surname: `Synthetic${i}` }, alternateNames: [], tags: [] });
  return id;
 });
 const search = (query: string) => t.query(internal.mcpFamilyHistory.search, { principal, query, kinds: ["person"] });
 expect((await search("Rareancestor")).results).toHaveLength(0);
 while (!await t.mutation(internal.searchBackfill.step, { table: "persons" })) { /* page through migration */ }
 for (const query of ["Rareancestor", "Oldalias", "researchtag"]) expect((await search(query)).results.map(r=>r.id)).toEqual([id]);
 await t.run(ctx => withSearchWrites(ctx).db.patch(id, { name: { given: "Changedancestor", surname: "Synthetic" }, alternateNames: [], tags: [] }));
 expect((await search("Rareancestor")).results).toHaveLength(0);
 expect((await search("Changedancestor")).results.map(r=>r.id)).toEqual([id]);
 expect((await search("researchtag")).results).toHaveLength(0);
 const authenticated = t.withIdentity({ subject: principal.subject, issuer: principal.issuer });
 const duplicate = await authenticated.mutation(api.vaultMutations.upsertPerson, { vaultOwnerId: principal.subject, name: { given: " CHANGEDANCESTOR ", surname: "Synthetic" }, sex: "unknown", living: false });
 expect(duplicate).toMatchObject({ personId: id, created: false });
 const sourceInput = { vaultOwnerId: principal.subject, title: "Synthetic source", type: "census" as const, url: "https://synthetic.example/source" };
 const source = await authenticated.mutation(api.vaultMutations.upsertSource, sourceInput);
 expect(await authenticated.mutation(api.vaultMutations.upsertSource, sourceInput)).toMatchObject({ sourceId: source.sourceId, created: false });
 await t.mutation(internal.searchBackfill.step, { table: "sources" });
 expect((await t.query(internal.mcpFamilyHistory.search, { principal, query: "Synthetic", kinds: ["source"] })).results.map(r=>r.id)).toEqual([source.sourceId]);
 await t.run(ctx => withSearchWrites(ctx).db.patch("persons", id, { name: { given: "Thirdstyle", surname: "Synthetic" } }));
 expect((await search("Thirdstyle")).results.map(r=>r.id)).toEqual([id]);
 await expect(search("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen")).rejects.toThrow(/16 terms/);
 expect((await search("Common")).results).toHaveLength(25);
 const restricted = await t.query(internal.mcpFamilyHistory.search, { principal, query: "Thirdstyle", personIds: [id] });
 expect(restricted.results.map(r=>r.id)).toEqual([id]);
 expect((await t.query(internal.mcpFamilyHistory.search, { principal, query: "Common", personIds: [id] })).results).toHaveLength(0);
 expect((await t.query(internal.mcpFamilyHistory.search, { principal, query: "Common", personIds: [] })).results).toHaveLength(0);
});
