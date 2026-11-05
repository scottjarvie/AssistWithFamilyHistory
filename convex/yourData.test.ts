/**
 * Your stats, Library shelves and export read only the owner's records,
 * stay bounded, and page through everything.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { EXPORT_TABLES } from "../lib/vault/exportTables";
import { availableLibraryPrompts, LIBRARY_PROMPTS } from "../lib/library/prompts";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_your_data_owner_AAAAAAAAAA";
const OTHER = "user_your_data_owner_BBBBBBBBBB";

async function seed(t: ReturnType<typeof convexTest>, owner: string, people: number) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let i = 0; i < people; i += 1) {
      await ctx.db.insert("persons", {
        vaultOwnerId: owner,
        name: { given: `Person${i}`, surname: "Synthetic" },
        sex: "unknown",
        living: i === 0,
        researchStatus: "basic",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("researchTasks", {
      vaultOwnerId: owner,
      type: "record_search",
      title: `Find the ${owner.slice(-1)} marriage record`,
      status: "todo",
      priority: "medium",
      aiSuggested: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("your data", () => {
  test("stats stop reading large documents and report a capped sample", async () => {
    const t = convexTest(schema, modules);
    await seed(t, OWNER, 10);
    await t.run(async (ctx) => {
      for (const person of await ctx.db.query("persons").collect()) {
        await ctx.db.patch(person._id, { notes: "x".repeat(100_000) });
      }
    });
    const stats = await t.query(internal.yourData.getYourStatsInternal, { vaultOwnerId: OWNER });
    expect(stats.people.more).toBe(true);
    expect(stats.people.count).toBeLessThan(10);
    expect(stats.people.count).toBeGreaterThan(0);
  });
  test("stats share the connection centre's expiry and refusal rules", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: "live", expiresAt: null });
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: "expired", expiresAt: Date.now() - 1 });
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: "refused", expiresAt: null });
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: "refused", status: "revoked" });
    const legacy = await seedGrant(t, { vaultOwnerId: OWNER, clientId: "legacy", status: "expired" });
    await t.run(async (ctx) => {
      const issuedAt = Date.now() - 100 * 86_400_000;
      const expiresAt = issuedAt + 90 * 86_400_000;
      await ctx.db.patch(legacy as import("./_generated/dataModel").Id<"mcpGrants">, {
        issuedAt, requestedAt: issuedAt, consentedAt: issuedAt, expiresAt,
        consentSnapshot: JSON.stringify({ approvedBy: "sign_in", shownAt: issuedAt, expiresAt }),
      });
    });
    const stats = await t.query(internal.yourData.getYourStatsInternal, { vaultOwnerId: OWNER });
    expect(stats.ai.activeConnections).toBe(2);
  });
  test("stats count only the owner's records", async () => {
    const t = convexTest(schema, modules);
    await seed(t, OWNER, 3);
    await seed(t, OTHER, 7);
    const stats = await t.query(internal.yourData.getYourStatsInternal, { vaultOwnerId: OWNER });
    expect(stats.people).toMatchObject({ count: 3, more: false, living: 1 });
    expect(stats.ai.activeConnections).toBe(0);
    expect(stats.ai.connectionsCapped).toBe(false);
  });

  test("stats mark the connection count as partial when the recent list is full", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 101; i++) {
      await seedGrant(t, { vaultOwnerId: OWNER, clientId: `connection-${i}`, expiresAt: null });
    }
    const stats = await t.query(internal.yourData.getYourStatsInternal, { vaultOwnerId: OWNER });
    expect(stats.ai).toMatchObject({ activeConnections: 100, connectionsCapped: true });
  });

  test("the Library research shelf shows the owner's tasks only", async () => {
    const t = convexTest(schema, modules);
    await seed(t, OWNER, 1);
    await seed(t, OTHER, 1);
    const shelves = await t.query(internal.yourData.getLibraryShelvesInternal, { vaultOwnerId: OWNER });
    expect(shelves.research.map((row) => row.title)).toEqual(["Find the A marriage record"]);
    expect(shelves.resources).toEqual([]);
    expect(shelves).toMatchObject({ researchMore: false, resourcesMore: false });
  });

  test.each(["researchLog", "researchTasks", "historicalContext", "topics"] as const)(
    "the Library stops reading large %s documents before projecting the shelf",
    async (table) => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const content = "漢".repeat(40_000);
        for (let i = 0; i < 10; i++) {
          const common = { vaultOwnerId: OWNER, createdAt: i, updatedAt: i };
          switch (table) {
            case "researchLog":
              await ctx.db.insert(table, { ...common, entityType: "other", activityType: "other", status: "done", summary: `Finding ${i}`, details: content });
              break;
            case "researchTasks":
              await ctx.db.insert(table, { ...common, type: "record_search", title: `Task ${i}`, status: "todo", priority: "medium", aiSuggested: false, description: content });
              break;
            case "historicalContext":
              await ctx.db.insert(table, { ...common, title: `Pack ${i}`, topic: "daily_life", timePeriod: { startYear: 1800, endYear: 1900 }, sources: [], content });
              break;
            case "topics":
              await ctx.db.insert(table, { ...common, name: `Topic ${i}`, kind: "other", description: content });
              break;
          }
        }
      });
      const shelves = await t.query(internal.yourData.getLibraryShelvesInternal, { vaultOwnerId: OWNER });
      const rows = table === "researchLog" || table === "researchTasks" ? shelves.research : shelves.resources;
      expect(table === "researchLog" || table === "researchTasks" ? shelves.researchMore : shelves.resourcesMore).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(10);
      // Whole documents were bounded before they became these small summaries.
      expect(JSON.stringify(shelves).length).toBeLessThan(5_000);
    },
  );

  test("the export pages through every row of a table and refuses unknown tables", async () => {
    const t = convexTest(schema, modules);
    await seed(t, OWNER, 450);
    await seed(t, OTHER, 5);
    let cursor: string | null = null;
    let rows = 0;
    do {
      const page: { rows: unknown[]; cursor: string | null } = await t.query(internal.yourData.exportPageInternal, { vaultOwnerId: OWNER, table: "persons", cursor });
      rows += page.rows.length;
      cursor = page.cursor;
    } while (cursor);
    expect(rows).toBe(450);
    await expect(t.query(internal.yourData.exportPageInternal, { vaultOwnerId: OWNER, table: "apiKeys", cursor: null })).rejects.toThrow(/Unknown export table/);
    expect(EXPORT_TABLES).not.toContain("apiKeys");
  });

  test("Library prompts only name tools that exist", () => {
    const shown = availableLibraryPrompts();
    expect(shown.length).toBeGreaterThanOrEqual(4);
    expect(shown.length).toBeLessThanOrEqual(LIBRARY_PROMPTS.length);
  });
});
