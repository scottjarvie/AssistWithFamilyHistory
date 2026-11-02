/**
 * Your stats, Library shelves and export read only the owner's records,
 * stay bounded, and page through everything.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { EXPORT_TABLES } from "../lib/vault/exportTables";
import { seedGrant } from "../lib/mcp/testSupport";
import { availableLibraryPrompts, LIBRARY_PROMPTS } from "../lib/library/prompts";

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
  test("stats count only the owner's records", async () => {
    const t = convexTest(schema, modules);
    await seed(t, OWNER, 3);
    await seed(t, OTHER, 7);
    const stats = await t.query(internal.yourData.getYourStatsInternal, { vaultOwnerId: OWNER });
    expect(stats.people).toMatchObject({ count: 3, more: false, living: 1 });
    expect(stats.ai.activeConnections).toBe(0);
  });

  test("the Library research shelf shows the owner's tasks only", async () => {
    const t = convexTest(schema, modules);
    await seed(t, OWNER, 1);
    await seed(t, OTHER, 1);
    const shelves = await t.query(internal.yourData.getLibraryShelvesInternal, { vaultOwnerId: OWNER });
    expect(shelves.research.map((row) => row.title)).toEqual(["Find the A marriage record"]);
    expect(shelves.resources).toEqual([]);
  });

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


test("export retains imported notes and resumable import records with owner isolation", async () => {
  const t = convexTest(schema, modules);
  for (const owner of [OWNER, OTHER]) {
    const grantId = await seedGrant(t, { vaultOwnerId: owner });
    const principal = { issuer: "https://identity.example.test", subject: owner, clientId: "synthetic-mcp-client", scopes: [] };
    const job = await t.mutation(internal.treeImport.beginTreeImport, {
      principal, grantId, operationId: `export-begin-${owner}`, requestHash: `export-begin-${owner}`,
      input: { importKey: "synthetic-export", system: "familysearch", label: "Synthetic export import" },
    });
    await t.action(internal.treeImport.importTreeBatch, {
      principal, grantId, operationId: `export-batch-${owner}`, requestHash: `export-batch-${owner}`,
      input: { importJobId: job.importJobId, batchIndex: 0,
        persons: [{ key: "synthetic-person", living: false, names: [{ given: "Synthetic" }] }],
        notes: [{ key: "synthetic-note", text: "Synthetic imported note.", subject: { kind: "person", key: "synthetic-person" } }],
      },
    });
  }
  for (const table of ["notes", "treeImports", "treeImportBatches"] as const) {
    expect(EXPORT_TABLES).toContain(table);
    const exported = await t.query(internal.yourData.exportPageInternal, { vaultOwnerId: OWNER, table, cursor: null });
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows).toEqual([expect.objectContaining({ vaultOwnerId: OWNER })]);
    expect(exported.cursor).toBeNull();
  }
});
