import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { seedGrant } from "../lib/mcp/testSupport";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";

const modules = import.meta.glob("./**/*.ts");
const principal = { issuer: "https://identity.example.test", subject: "synthetic-search-owner", clientId: "synthetic-search-client", scopes: ["family_history:context:read"] };
const person = (given: string, patch: Partial<Doc<"persons">> = {}) => ({
  vaultOwnerId: principal.subject, name: { given, surname: "Fixture" },
  sex: "unknown" as const, living: true, researchStatus: "not_started" as const,
  createdAt: 1, updatedAt: 1, ...patch,
});
const allKinds = ["person", "source", "story", "research_task", "research_finding", "event", "place", "topic"];

describe("legacy MCP search coverage honesty", () => {
  test("empty exhausted windows visit all requested families and retain the array payload", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "missing" });
    expect(result).toMatchObject({ query: "missing", results: [], limit: 25, truncated: false,
      coverage: { status: "complete", requestedKinds: allKinds, visitedKinds: allKinds, unvisitedKinds: [], candidateWindowLimitedKinds: [], resultLimited: false, continuation: "unavailable" } });
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("nextCursor");
  });

  test("exactly limit hits in an exhausted single family is complete", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    await t.run(async ctx => { for (let i = 0; i < 3; i++) await ctx.db.insert("persons", person("match")); });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "match", kinds: ["person", "person"], limit: 3 });
    expect(result.results).toHaveLength(3);
    expect(result).toMatchObject({ truncated: false, coverage: { status: "complete", requestedKinds: ["person"], resultLimited: false } });
  });

  test("discarded matches set resultLimited, independently of candidate saturation", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    await t.run(async ctx => { for (let i = 0; i < 4; i++) await ctx.db.insert("persons", person("match")); });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "match", kinds: ["person"], limit: 3 });
    expect(result.results).toHaveLength(3);
    expect(result).toMatchObject({ truncated: true, coverage: { status: "resultLimited", resultLimited: true, candidateWindowLimitedKinds: [] } });
  });

  test("only a hit beyond the old window cannot make an empty response look exhaustive", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    await t.run(async ctx => {
      await ctx.db.insert("persons", person("beyond-window-only"));
      for (let i = 0; i <= FAMILY_HISTORY_MCP_LIMITS.searchScanPerType; i++) await ctx.db.insert("persons", person("unrelated"));
    });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "beyond-window-only", kinds: ["person"] });
    expect(result).toMatchObject({ results: [], truncated: true, coverage: { status: "budgetLimited", candidateWindowLimitedKinds: ["person"], resultLimited: false } });
  });

  test("preserves the existing sentinel-row match and still reports a saturated window", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    const id = await t.run(async ctx => {
      const id = await ctx.db.insert("persons", person("sentinel-only"));
      for (let i = 0; i < FAMILY_HISTORY_MCP_LIMITS.searchScanPerType; i++) await ctx.db.insert("persons", person("unrelated"));
      return id;
    });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "sentinel-only", kinds: ["person"] });
    expect(result.results.map(row => row.id)).toEqual([id]);
    expect(result).toMatchObject({ truncated: true, coverage: { status: "budgetLimited", candidateWindowLimitedKinds: ["person"] } });
  });

  test("a full earlier family never claims later requested families were visited", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    await t.run(async ctx => { await ctx.db.insert("persons", person("match")); });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "match", kinds: ["topic", "person", "source"], limit: 1 });
    expect(result).toMatchObject({ truncated: true, coverage: { status: "resultLimited", requestedKinds: ["person", "source", "topic"], visitedKinds: ["person"], unvisitedKinds: ["source", "topic"], resultLimited: true } });
  });

  test("foreign owners, archived rows, and private person-note edits do not change observable search coverage", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    const id = await t.run(async ctx => {
      await ctx.db.insert("persons", person("secret-token", { vaultOwnerId: "synthetic-foreign-owner" }));
      await ctx.db.insert("persons", person("secret-token", { archivedAt: 1 }));
      return await ctx.db.insert("persons", person("ordinary", { notes: "private unrelated note" }));
    });
    const args = { principal, query: "secret-token", kinds: ["person"] };
    const before = await t.query(internal.mcpFamilyHistory.search, args);
    await t.run(async ctx => { await ctx.db.patch(id, { notes: "private secret-token" }); });
    expect(await t.query(internal.mcpFamilyHistory.search, args)).toEqual(before);
    expect(before).toMatchObject({ results: [], truncated: false, coverage: { status: "complete" } });
  });

  test("literal infix, AKA, Unicode and punctuation matching retain the same private discovery DTO", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, issuer: principal.issuer });
    const id = await t.run(ctx => ctx.db.insert("persons", person("Latest", {
      alternateNames: [{ type: "AlsoKnownAs", given: "Élodie 東京", surname: "O’Neil" }], tags: ["e\u0301"], notes: "never in discovery",
    })));
    for (const query of ["test", " ÉLODIE ", "東京", "O’N", "e\u0301"]) {
      const result = await t.query(internal.mcpFamilyHistory.search, { principal, query, kinds: ["person"] });
      expect(result.results).toEqual([{ kind: "person", id, name: "Latest Fixture", living: true, researchStatus: "not_started", updatedAt: 1 }]);
      expect(result.truncated).toBe(false);
    }
  });
});

describe("FH-A-01 restricted-grant containment and held authorized-source prototype", () => {
  test("paired selected grants expose no new saturation metadata; inherited FH-R006 results are explicitly not certified", async () => {
    const t = convexTest(schema, modules);
    const allowed = await t.run(ctx => ctx.db.insert("persons", person("Allowed")));
    const grantId = await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, boundary: { kind: "selected_people", personIds: [allowed] } });
    const args = { principal, query: "hidden-only", kinds: ["person"] };
    await t.run(async ctx => { for (let i = 0; i < 249; i++) await ctx.db.insert("persons", person("unrelated")); });
    const before = await t.query(internal.mcpFamilyHistory.search, args);
    const hidden = await t.run(ctx => ctx.db.insert("persons", person("unrelated")));
    const saturated = await t.query(internal.mcpFamilyHistory.search, args);
    expect(saturated).toEqual(before); // 250 -> 251 owner rows, same selected corpus.
    expect(before).toMatchObject({ results: [], truncated: true, coverage: { status: "unavailable", continuation: "unavailable" } });
    expect(before.coverage).not.toHaveProperty("visitedKinds");
    expect(before.coverage).not.toHaveProperty("candidateWindowLimitedKinds");
    await t.run(ctx => ctx.db.patch(hidden, { name: { given: "hidden-only", surname: "Fixture" } }));
    const inherited = await t.query(internal.mcpFamilyHistory.search, args);
    // FH-R006 PRE-EXISTING RESULT LEAK: containment does not call it a pass.
    expect(inherited.results.map(row => row.id)).toEqual([hidden]);
    expect(inherited.coverage).toEqual(before.coverage);
    expect(inherited.truncated).toBe(before.truncated);
    const prototypeArgs = { principal, query: "hidden-only" };
    const safe = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, prototypeArgs);
    await t.run(ctx => ctx.db.patch(hidden, { name: { given: "other-forbidden-term", surname: "Fixture" } }));
    expect(await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, prototypeArgs)).toEqual(safe);
    expect(safe.results).toEqual([]);
    // Current governing grant is re-read within the source query.
    await t.run(ctx => ctx.db.patch(grantId as Doc<"mcpGrants">["_id"], { pausedAt: Date.now() }));
    await expect(t.query(internal.mcpFamilyHistory.search, args)).rejects.toThrow(/GRANT/);
    await expect(t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, prototypeArgs)).rejects.toThrow(/GRANT/);
  });

  test("prototype crosses 251 and 1024 with empty nonterminal pages and no dropped overflow", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId });
    const ids = await t.run(async ctx => {
      const ids = [];
      for (let i = 0; i < 1030; i++) ids.push(await ctx.db.insert("persons", person(i === 0 ? "selective-needle" : "common")));
      return ids;
    });
    const args = { principal, query: "selective-needle", pageSize: 50 };
    let page = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, args);
    expect(page.results).toEqual([]);
    expect(page.cursor).not.toBeNull();
    const found = [...page.results];
    let calls = 1;
    while (page.cursor) {
      if (++calls > 25) throw new Error("nonterminating traversal");
      page = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, { ...args, cursor: page.cursor });
      found.push(...page.results);
    }
    expect(found.map(row => row.id)).toEqual([ids[0]]);
    const commonArgs = { ...args, query: "common" };
    page = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, commonArgs);
    const commonIds = page.results.map(row => row.id);
    while (page.cursor) {
      page = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, { ...commonArgs, cursor: page.cursor });
      commonIds.push(...page.results.map(row => row.id));
    }
    expect(new Set(commonIds).size).toBe(1029);
    expect(commonIds).toHaveLength(1029);
  });

  test("prototype binds query/page-size/client/effective grant and rejects injected done/seen state", async () => {
    const t = convexTest(schema, modules);
    const [a, b] = await t.run(async ctx => [await ctx.db.insert("persons", person("Allowed A")), await ctx.db.insert("persons", person("Allowed B"))]);
    const grant = await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, boundary: { kind: "selected_people", personIds: [a, b] } });
    const other = { ...principal, clientId: "other-selected-client" };
    await seedGrant(t, { vaultOwnerId: principal.subject, clientId: other.clientId, boundary: { kind: "selected_people", personIds: [b] } });
    const args = { principal, query: "allowed", pageSize: 1 };
    const page = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, args);
    expect(page.cursor).not.toBeNull();
    for (const change of [{ query: "different" }, { pageSize: 2 }, { principal: other }]) {
      await expect(t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, { ...args, ...change, cursor: page.cursor! })).rejects.toThrow(/cursor/);
    }
    await expect(t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, { ...args, cursor: { ...page.cursor!, position: -1 } })).rejects.toThrow(/position/);
    await expect(t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, { ...args, cursor: { ...page.cursor!, seen: [b], done: true } } as never)).rejects.toThrow();
    await t.run(ctx => ctx.db.patch(grant as Doc<"mcpGrants">["_id"], { boundary: { kind: "selected_people", personIds: [a] }, revision: 1 }));
    await expect(t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, { ...args, cursor: page.cursor! })).rejects.toThrow(/cursor/);
  });
});

test("selected prototype source lifecycle is current and off-boundary corpus leaves the entire traversal invariant", async () => {
  const t = convexTest(schema, modules);
  const [allowed, hidden] = await t.run(async ctx => [await ctx.db.insert("persons", person("Before")), await ctx.db.insert("persons", person("Hidden"))]);
  await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, boundary: { kind: "selected_people", personIds: [allowed] } });
  const args = { principal, query: "before" };
  const before = await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, args);
  await t.run(async ctx => {
    await ctx.db.patch(hidden, { name: { given: "Before", surname: "Forbidden" }, notes: "before" });
    for (let i = 0; i < 251; i++) await ctx.db.insert("persons", person("Before hidden-only"));
  });
  expect(await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, args)).toEqual(before);
  await t.run(ctx => ctx.db.patch(allowed, { name: { given: "After", surname: "Fixture" } }));
  expect((await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, args)).results).toEqual([]);
  const afterArgs = { principal, query: "after" };
  expect((await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, afterArgs)).results.map(row => row.id)).toEqual([allowed]);
  await t.run(ctx => ctx.db.patch(allowed, { archivedAt: 1 }));
  expect((await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, afterArgs)).results).toEqual([]);
  await t.run(ctx => ctx.db.patch(allowed, { archivedAt: undefined }));
  expect((await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, afterArgs)).results).toHaveLength(1);
  await t.run(ctx => ctx.db.patch(allowed, { vaultOwnerId: "synthetic-foreign" }));
  expect((await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, afterArgs)).results).toEqual([]);
  await t.run(ctx => ctx.db.delete(allowed));
  expect((await t.query(internal.mcpFamilyHistory.searchPeoplePagePrototype, afterArgs)).results).toEqual([]);
});
