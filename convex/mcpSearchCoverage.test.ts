import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
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
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "missing" });
    expect(result).toMatchObject({ query: "missing", results: [], limit: 25, truncated: false,
      coverage: { status: "complete", requestedKinds: allKinds, visitedKinds: allKinds, unvisitedKinds: [], candidateWindowLimitedKinds: [], resultLimited: false, continuation: "unavailable" } });
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("nextCursor");
  });

  test("exactly limit hits in an exhausted single family is complete", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => { for (let i = 0; i < 3; i++) await ctx.db.insert("persons", person("match")); });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "match", kinds: ["person", "person"], limit: 3 });
    expect(result.results).toHaveLength(3);
    expect(result).toMatchObject({ truncated: false, coverage: { status: "complete", requestedKinds: ["person"], resultLimited: false } });
  });

  test("discarded matches set resultLimited, independently of candidate saturation", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => { for (let i = 0; i < 4; i++) await ctx.db.insert("persons", person("match")); });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "match", kinds: ["person"], limit: 3 });
    expect(result.results).toHaveLength(3);
    expect(result).toMatchObject({ truncated: true, coverage: { status: "resultLimited", resultLimited: true, candidateWindowLimitedKinds: [] } });
  });

  test("only a hit beyond the old window cannot make an empty response look exhaustive", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("persons", person("beyond-window-only"));
      for (let i = 0; i <= FAMILY_HISTORY_MCP_LIMITS.searchScanPerType; i++) await ctx.db.insert("persons", person("unrelated"));
    });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "beyond-window-only", kinds: ["person"] });
    expect(result).toMatchObject({ results: [], truncated: true, coverage: { status: "budgetLimited", candidateWindowLimitedKinds: ["person"], resultLimited: false } });
  });

  test("preserves the existing sentinel-row match and still reports a saturated window", async () => {
    const t = convexTest(schema, modules);
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
    await t.run(async ctx => { await ctx.db.insert("persons", person("match")); });
    const result = await t.query(internal.mcpFamilyHistory.search, { principal, query: "match", kinds: ["topic", "person", "source"], limit: 1 });
    expect(result).toMatchObject({ truncated: true, coverage: { status: "resultLimited", requestedKinds: ["person", "source", "topic"], visitedKinds: ["person"], unvisitedKinds: ["source", "topic"], resultLimited: true } });
  });

  test("foreign owners, archived rows, and private person-note edits do not change observable search coverage", async () => {
    const t = convexTest(schema, modules);
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
