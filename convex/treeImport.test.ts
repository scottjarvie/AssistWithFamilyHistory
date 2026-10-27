/**
 * Whole-tree import: a person's AI bringing their whole FamilySearch-shaped
 * tree in through MCP, in batches, keyed by outside ids.
 *
 * The behaviour that matters:
 *   - a 5,000-person tree lands completely, with names, facts, relationships,
 *     sources, citations, notes and media references, and zero failed rows;
 *   - resending is idempotent; replaying an operationId changes nothing;
 *   - a dry run saves nothing and says what would happen;
 *   - what the person entered by hand is never overwritten;
 *   - possible duplicates are suggested, never merged;
 *   - progress and the AI's own cursor survive for a resume.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { generateSyntheticTree, packBatches, syntheticPid } from "../lib/treeImport/syntheticTree";
import type { TreeImportBatch } from "../lib/treeImport/model";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_tree_import_owner_AAAAAAAA";

function principal(subject = OWNER) {
  return { issuer: "https://identity.example.test", subject, clientId: "synthetic-mcp-client", scopes: [] };
}

type T = ReturnType<typeof convexTest>;

async function begin(t: T, grantId: string, importKey = "familysearch-tree-of-synthetic-root") {
  return (await t.mutation(internal.treeImport.beginTreeImport, {
    principal: principal(),
    grantId,
    operationId: `begin-${importKey}-${Math.random()}`,
    requestHash: `hash-begin-${importKey}`,
    input: { importKey, system: "familysearch", label: "Synthetic tree", rootExternalId: syntheticPid(1) },
  })) as { importJobId: string; nextBatchIndex: number; resumed: boolean };
}

async function send(
  t: T,
  grantId: string,
  importJobId: string,
  batchIndex: number,
  batch: TreeImportBatch,
  extra: Record<string, unknown> = {},
  operationId = `tree-batch-${importJobId}-${batchIndex}`,
) {
  return (await t.action(internal.treeImport.importTreeBatch, {
    principal: principal(),
    grantId,
    operationId,
    requestHash: `hash-${operationId}`,
    input: { importJobId, batchIndex, cursor: `after-batch-${batchIndex}`, ...batch, ...extra },
  })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function countRows(t: T, table: string) {
  return await t.run(async (ctx) => (await (ctx.db as any).query(table).collect()).length); // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Set by vitest.treeimport.config.ts (pnpm test:tree-import-5k). */
const FULL = (typeof process !== "undefined" && process.env?.TREE_IMPORT_FULL === "1");

async function importsWholeTree(people: number) {
    // transactionLimits: every chunk must fit Convex's real per-transaction ceilings.
    const t = convexTest({ schema, modules, transactionLimits: true });
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const tree = generateSyntheticTree({ people });
    expect(tree.persons).toHaveLength(people);
    const batches = packBatches(tree, 500);
    const job = await begin(t, grantId);

    let failed = 0;
    for (const [index, batch] of batches.entries()) {
      const result = await send(t, grantId, job.importJobId, index, batch, { final: index === batches.length - 1 });
      failed += result.results.filter((row: { status: string }) => row.status === "failed").length;
      if (failed) throw new Error(`batch ${index} failed rows: ${JSON.stringify(result.results.filter((row: { status: string }) => row.status === "failed").slice(0, 3))}`);
    }
    expect(failed).toBe(0);

    const progress = (await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(progress.import.status).toBe("completed");
    expect(progress.import.peopleSaved).toBe(people);
    expect(progress.import.nextBatchIndex).toBe(batches.length);
    expect(progress.import.cursor).toBe(`after-batch-${batches.length - 1}`);
    expect(progress.import.counts.persons.created).toBe(people);
    expect(progress.import.counts.relationships.created).toBe(tree.relationships.length);
    expect(progress.import.counts.sources.created).toBe(tree.sources.length);
    expect(progress.import.counts.citations.created).toBe(tree.citations.length);
    expect(progress.import.counts.notes.created).toBe(tree.notes.length);
    expect(progress.import.counts.media.created).toBe(tree.media.length);

    expect(await countRows(t, "persons")).toBe(people);
    expect(await countRows(t, "relationships")).toBe(tree.relationships.length);
    const facts = tree.persons.reduce((sum, person) => sum + (person.facts?.length ?? 0), 0);
    expect(await countRows(t, "events")).toBe(facts);
    expect(await countRows(t, "personEvents")).toBe(facts);
    expect(await countRows(t, "citationLinks")).toBe(tree.citations.length * 2);
    expect(await countRows(t, "treeImportBatches")).toBe(batches.length);

    // One activity entry per batch, plus the begin call.
    const activity = await t.run(async (ctx) => ctx.db.query("agentActivity").collect());
    expect(activity.filter((row) => row.scope === "family_history_import_tree_batch")).toHaveLength(batches.length);

    // Every fact, name and link came through, keyed by its outside id.
    const detail = await t.run(async (ctx) => {
      const person = await ctx.db.query("persons").withIndex("by_fsId", (q) => q.eq("fsId", syntheticPid(5))).unique();
      const links = await ctx.db.query("personEvents").withIndex("by_person", (q) => q.eq("personId", person!._id)).collect();
      const events = await Promise.all(links.map((link) => ctx.db.get(link.eventId)));
      const cited = await ctx.db.query("citationLinks").withIndex("by_target", (q) => q.eq("targetType", "person").eq("targetId", String(person!._id))).collect();
      return { person, events, cited };
    });
    expect(detail.person?.externalIds?.[0]).toMatchObject({ system: "familysearch", id: syntheticPid(5) });
    expect(detail.person?.creationProvenance?.method).toBe("import");
    expect(detail.person?.importJobId).toBe(job.importJobId);
    expect(detail.person?.birth?.date?.year).toBeTypeOf("number");
    expect(detail.events.map((event) => event?.type)).toContain("birth");
    expect(detail.cited).toHaveLength(1);

    const parentLinks = await t.run(async (ctx) => ctx.db.query("relationships").withIndex("by_type", (q) => q.eq("type", "ParentChild")).collect());
    expect(parentLinks.some((row) => row.childRelationType === "Adopted")).toBe(true);
    expect(parentLinks.every((row) => row.childRelationType !== undefined)).toBe(true);
}


describe("whole-tree import", () => {
  test("imports a 300-person tree in 500-record batches inside Convex transaction limits", { timeout: 900_000 }, () => importsWholeTree(300));

  // convex-test walks every document on every query, so 5,000 people (about
  // 100,000 rows) only runs under vitest.treeimport.config.ts, which gives the
  // in-memory store a per-table index. Real Convex is not affected.
  test.runIf(FULL)("imports a 5,000-person tree in 500-record batches with nothing lost", { timeout: 7_200_000 }, () => importsWholeTree(5_000));

  describe("on a smaller tree", () => {
    const tree = generateSyntheticTree({ people: 120, generations: 4 });
    const batches = packBatches(tree, 100);

    test("resending the same tree changes nothing and makes no duplicates", { timeout: 300_000 }, async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
      const job = await begin(t, grantId);
      for (const [index, batch] of batches.entries()) await send(t, grantId, job.importJobId, index, batch);
      const before = { persons: await countRows(t, "persons"), events: await countRows(t, "events"), links: await countRows(t, "citationLinks"), rels: await countRows(t, "relationships") };

      // A second pass of the whole tree, as a refresh would send it.
      const statuses = new Set<string>();
      for (const [index, batch] of batches.entries()) {
        const result = await send(t, grantId, job.importJobId, batches.length + index, batch, {}, `refresh-${index}`);
        for (const row of result.results) statuses.add(row.status);
        expect(Object.values(result.counts as Record<string, { created: number }>).reduce((sum, kind) => sum + kind.created, 0)).toBe(0);
      }
      expect(statuses.has("created")).toBe(false);
      expect(await countRows(t, "persons")).toBe(before.persons);
      expect(await countRows(t, "events")).toBe(before.events);
      expect(await countRows(t, "citationLinks")).toBe(before.links);
      expect(await countRows(t, "relationships")).toBe(before.rels);
    });

    test("replaying an operationId returns the first answer and counts nothing twice", { timeout: 300_000 }, async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
      const job = await begin(t, grantId);
      const first = await send(t, grantId, job.importJobId, 0, batches[0]);
      const again = await send(t, grantId, job.importJobId, 0, batches[0]);
      expect(again.deduplicated).toBe(true);
      expect(again.counts).toEqual(first.counts);
      const progress = (await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(progress.import.recordsReceived).toBe(100);
      expect(progress.recentBatches).toHaveLength(1);
    });

    test("a dry run saves nothing and resolves references inside the batch", { timeout: 300_000 }, async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
      const job = await begin(t, grantId);
      const everything = packBatches(tree, 500)[0];
      const dry = await send(t, grantId, job.importJobId, 0, everything, { dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.counts.persons.created).toBe(tree.persons.length);
      expect(dry.counts.relationships.created).toBe(tree.relationships.length);
      expect(dry.counts.citations.created).toBe(tree.citations.length);
      expect(dry.results.filter((row: { status: string }) => row.status === "failed")).toEqual([]);
      expect(await countRows(t, "persons")).toBe(0);
      expect(await countRows(t, "mcpRecordKeys")).toBe(0);
      const progress = (await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(progress.import.nextBatchIndex).toBe(0);
    });

    test("a resumed import picks up at nextBatchIndex with the saved cursor", { timeout: 300_000 }, async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
      const job = await begin(t, grantId);
      await send(t, grantId, job.importJobId, 0, batches[0]);
      const resumed = await begin(t, grantId);
      expect(resumed.resumed).toBe(true);
      expect(resumed.importJobId).toBe(job.importJobId);
      expect(resumed.nextBatchIndex).toBe(1);
      expect((resumed as unknown as { cursor: string }).cursor).toBe("after-batch-0");
      await expect(send(t, grantId, job.importJobId, 5, batches[1])).rejects.toThrow(/expects batch 1/);
    });
  });

  test("rows that point at people not yet sent fail on their own; the rest saves", { timeout: 300_000 }, async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grantId);
    const result = await send(t, grantId, job.importJobId, 0, {
      persons: [{ key: "SYN-A", names: [{ given: "Ada", surname: "Novak" }], living: false }],
      relationships: [{ key: "REL-X", type: "ParentChild", person1Key: "SYN-A", person2Key: "SYN-NOT-YET", lineage: "biological" }],
    });
    const failed = result.results.find((row: { kind: string }) => row.kind === "relationships");
    expect(failed.status).toBe("failed");
    expect(failed.reason).toMatch(/MISSING_PERSON/);
    expect(failed.whatToDo).toMatch(/Send that person first/);
    expect(result.counts.persons.created).toBe(1);
  });

  test("a person entered by hand is linked by PID and never overwritten", { timeout: 300_000 }, async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const now = Date.now();
    const mine = await t.run(async (ctx) => ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      fsId: "SYN-HAND",
      name: { given: "Grandma", surname: "Varga" },
      sex: "female",
      living: false,
      birth: { date: { original: "1901", year: 1901 } },
      researchStatus: "thorough",
      creationProvenance: { actorKind: "user", actorId: OWNER, method: "manual_first_start", evidenceStatus: "unsourced", operationId: "first-start", recordedAt: now },
      createdAt: now,
      updatedAt: now,
    }));
    const job = await begin(t, grantId);
    const result = await send(t, grantId, job.importJobId, 0, {
      persons: [{
        key: "SYN-HAND",
        names: [{ given: "Erzsebet", surname: "Varga", preferred: true }, { type: "nickname", given: "Grandma", surname: "Varga" }],
        sex: "female",
        living: false,
        facts: [{ key: "birth", type: "Birth", date: { original: "3 Mar 1902" } }, { key: "death", type: "Death", date: { original: "1980" } }],
      }],
    });
    const row = result.results[0];
    expect(row.status).toBe("linked");
    expect(row.id).toBe(String(mine));
    expect(row.kept).toEqual(expect.arrayContaining(["name", "birth"]));
    const after = await t.run(async (ctx) => ctx.db.get(mine));
    expect(after?.name.given).toBe("Grandma");
    expect(after?.birth?.date?.year).toBe(1901);
    // Blanks were filled: the death date and the other name came in.
    expect(after?.death?.date?.year).toBe(1980);
    expect(after?.alternateNames?.[0]).toMatchObject({ type: "Nickname", given: "Grandma" });
  });

  test("a likely duplicate becomes a suggestion for the person, not a merge", { timeout: 300_000 }, async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const now = Date.now();
    const existing = await t.run(async (ctx) => ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Jan", surname: "Kowalczyk" },
      sex: "male",
      living: false,
      birth: { date: { original: "1880", year: 1880 } },
      researchStatus: "basic",
      createdAt: now,
      updatedAt: now,
    }));
    const job = await begin(t, grantId);
    const result = await send(t, grantId, job.importJobId, 0, {
      persons: [{ key: "SYN-JAN", names: [{ given: "Jan Piotr", surname: "Kowalczyk" }], sex: "male", living: false, facts: [{ type: "BIRT", date: { original: "abt 1881" } }] }],
    });
    expect(result.results[0].status).toBe("created");
    expect(result.results[0].possibleDuplicates).toEqual([String(existing)]);
    expect(result.duplicatesSuggested).toBe(1);
    expect(await countRows(t, "persons")).toBe(2);
    const progress = (await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(progress.possibleDuplicates).toHaveLength(1);
    expect(progress.possibleDuplicates[0]).toMatchObject({ possiblySameAsId: String(existing), possiblySameAsName: "Jan Kowalczyk" });
    const connection = await t.run(async (ctx) => ctx.db.query("connections").collect());
    expect(connection[0]).toMatchObject({ relation: "possibly_same_as", state: "proposed" });
  });

  test("a person's id on another site finds the same person on a second import", { timeout: 300_000 }, async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const fs = await begin(t, grantId);
    await send(t, grantId, fs.importJobId, 0, {
      persons: [{ key: "SYN-B", otherIds: [{ system: "gedcom", id: "@I42@" }], names: [{ given: "Bram", surname: "De Vries" }], living: false }],
    });
    const gedcom = (await t.mutation(internal.treeImport.beginTreeImport, {
      principal: principal(),
      grantId,
      operationId: "begin-gedcom-file",
      requestHash: "hash-begin-gedcom",
      input: { importKey: "gedcom-family-file", system: "gedcom", label: "Old family file" },
    })) as { importJobId: string };
    const result = await send(t, grantId, gedcom.importJobId, 0, {
      persons: [{ key: "@I42@", names: [{ given: "Bram", surname: "De Vries" }], living: false }],
    });
    expect(result.counts.persons.created).toBe(0);
    expect(await countRows(t, "persons")).toBe(1);
  });

  test("a connection limited to selected people cannot import a tree", { timeout: 300_000 }, async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [] } });
    await expect(begin(t, grantId)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  });
});
