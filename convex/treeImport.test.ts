/* eslint-disable @typescript-eslint/no-explicit-any -- Regression fixtures exercise malformed input and dynamic MCP responses. */
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
import { api, internal } from "./_generated/api";
import { isContextPackEligibleMedia } from "./vault";
import { importCapturePackageToConvex } from "../lib/familysearch/importer";
import { CapturePackageSchema } from "../lib/familysearch/capture";
import { seedGrant } from "../lib/mcp/testSupport";
import { generateSyntheticTree, packBatches, syntheticPid } from "../lib/treeImport/syntheticTree";
import { chunkBatch, citationKeyFor, externalRecordKey, factKeyFor, factReferenceKeyFor, legacyCitationKeyFor, legacyFactKeyFor, legacyExternalRecordKey, type TreeImportBatch } from "../lib/treeImport/model";

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
      persons: [{ key: "SYN-B", names: [{ given: "Bram", surname: "De Vries" }], living: false }],
    });
    const gedcom = (await t.mutation(internal.treeImport.beginTreeImport, {
      principal: principal(),
      grantId,
      operationId: "begin-gedcom-file",
      requestHash: "hash-begin-gedcom",
      input: { importKey: "gedcom-family-file", system: "gedcom", label: "Old family file" },
    })) as { importJobId: string };
    const result = await send(t, grantId, gedcom.importJobId, 0, {
      persons: [{ key: "@I42@", otherIds: [{ system: "familysearch", id: "SYN-B" }], names: [{ given: "Bram", surname: "De Vries" }], living: false }],
    });
    expect(result.counts.persons.created).toBe(0);
    expect(await countRows(t, "persons")).toBe(1);
  });

  test("unreviewed living people are absent from batch and persisted duplicate suggestions", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grantId);
    const person = (key: string, living: boolean) => ({ key, living, names: [{ given: "Private", surname: "Example" }], facts: [{ type: "birth", date: { original: "1980", year: 1980 } }] });
    await send(t, grantId, job.importJobId, 0, { persons: [person("living", true)] });
    const result = await send(t, grantId, job.importJobId, 1, { persons: [person("deceased", false)] });
    expect(result.results[0].possibleDuplicates ?? []).toEqual([]);
    // A historical suggestion must disappear too when either endpoint is living.
    const ids = await t.run(async (ctx) => {
      const people = await ctx.db.query("persons").collect();
      return people.map(p => p._id);
    });
    await t.run(async (ctx) => { await ctx.db.insert("connections", {
      vaultOwnerId: OWNER, from: { kind: "person", id: ids[0] }, to: { kind: "person", id: ids[1] },
      relation: "possibly_same_as", state: "proposed", reason: "Private name and year", importJobId: job.importJobId as any,
      createdAt: Date.now(), updatedAt: Date.now(),
    }); });
    const progress = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId });
    expect(progress.possibleDuplicates).toEqual([]);
  });

  test("failed person facts roll back the person and keys while a good sibling saves", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grantId);
    const result = await send(t, grantId, job.importJobId, 0, { persons: [
      { key: "bad", living: false, names: [{ given: "Bad" }], facts: [{ type: "residence", date: { original: "1900", month: "invalid" } }] } as any,
      { key: "good", living: false, names: [{ given: "Good" }] },
    ] });
    expect(result.results.map((r: any) => r.status)).toEqual(["failed", "created"]);
    expect(await countRows(t, "persons")).toBe(1);
    expect(await countRows(t, "mcpRecordKeys")).toBe(1);
    expect(await countRows(t, "events")).toBe(0);
  });

  test("reimport preserves a manual correction but refreshes unchanged imported fields", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grantId);
    const original = { key: "edited", living: false, names: [{ given: "Original" }], tags: ["old"] };
    await send(t, grantId, job.importJobId, 0, { persons: [original] });
    const id = await t.run(async ctx => (await ctx.db.query("persons").unique())!._id);
    await t.run(async ctx => { await ctx.db.patch(id, { name: { given: "Corrected", surname: "" } }); });
    await send(t, grantId, job.importJobId, 1, { persons: [{ ...original, tags: ["new"] }] });
    const person = await t.run(async ctx => ctx.db.get(id));
    expect(person?.name.given).toBe("Corrected");
    expect(person?.tags).toEqual(["new"]);
    // Explicitly clearing an imported field is also a manual correction.
    await t.run(async ctx => { await ctx.db.patch(id, { tags: [] }); });
    await send(t, grantId, job.importJobId, 2, { persons: [{ ...original, tags: ["newer"] }] });
    expect((await t.run(async ctx => ctx.db.get(id)))?.tags).toEqual([]);
  });

  test.each(["gedcom", "gedcom7", "GEDCOM", "gedcom-5.5.1"])("%s xrefs are local to a file and stable on resume", async (system) => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    for (const file of ["file-a", "file-b"]) {
      const job = await t.mutation(internal.treeImport.beginTreeImport, {
        principal: principal(), grantId, operationId: `begin-${file}`, requestHash: file,
        input: { importKey: file, system, label: file },
      }) as { importJobId: string };
      const persons = [{ key: "@I1@", living: false, names: [{ given: file }], facts: [{ key: "birth", type: "birth", date: { original: "1900" } }] }];
      const sources = [{ key: "@S1@", title: file }];
      await send(t, grantId, job.importJobId, 0, { persons, sources });
      await send(t, grantId, job.importJobId, 1, { persons, sources });
    }
    expect(await countRows(t, "persons")).toBe(2);
    expect(await countRows(t, "events")).toBe(2);
    expect(await countRows(t, "sources")).toBe(2);
  });

  test.each(["gedcom7", "GEDCOM", "gedcom-5.5.1"])("%s otherIds cannot link people across files or sites", async (system) => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const ids: string[] = [];
    for (const [index, jobSystem] of [system, system, "ancestry", "ancestry"].entries()) {
      const file = `other-id-file-${index}`;
      const job = await t.mutation(internal.treeImport.beginTreeImport, {
        principal: principal(), grantId, operationId: `begin-${file}`, requestHash: file,
        input: { importKey: file, system: jobSystem, label: file },
      }) as { importJobId: string };
      const result = await send(t, grantId, job.importJobId, 0, {
        persons: [{ key: file, living: false, names: [{ given: file }], otherIds: [{ system, id: "@I1@" }] }],
      });
      expect(result.results[0].status).toBe("created");
      ids.push(result.results[0].id);
    }
    expect(new Set(ids).size).toBe(4);
    const people = await t.run(async ctx => ctx.db.query("persons").collect());
    expect(people).toHaveLength(4);
    expect(people.every(p => p.externalIds?.some(id => id.system === system && id.id === "@I1@"))).toBe(true);
    // Site imports retain the supplied xrefs as evidence but cannot register
    // them in an unrelated file's namespace.
    const keys = await t.run(async ctx => ctx.db.query("mcpRecordKeys").collect());
    expect(keys.filter(k => k.recordKey.includes("@I1@"))).toHaveLength(2);
  });

  test("a connection limited to selected people cannot import a tree", { timeout: 300_000 }, async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [] } });
    await expect(begin(t, grantId)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  });
});


describe("composite import identities", () => {
  test("slash-containing person/fact IDs remain separate through citations, notes and resume", async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const grant = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grant);
    const batch: TreeImportBatch = {
      sources: [{ key: "s", title: "Synthetic source" }],
      persons: [
        { key: "A/B", living: false, names: [{ given: "One" }], facts: [{ key: "C", type: "residence", value: "First", date: { original: "1900", year: 1900 } }] },
        { key: "A", living: false, names: [{ given: "Two" }], facts: [{ key: "B/C", type: "residence", value: "Second", date: { original: "1910", year: 1910 } }] },
      ],
      citations: [
        { key: "c1", sourceKey: "s", targets: [{ kind: "fact", personKey: "A/B", key: "C" }] },
        { key: "c2", sourceKey: "s", targets: [{ kind: "fact", personKey: "A", key: "B/C" }] },
      ],
      notes: [
        { key: "n1", text: "One", subject: { kind: "fact", personKey: "A/B", key: "C" } },
        { key: "n2", text: "Two", subject: { kind: "fact", personKey: "A", key: "B/C" } },
      ],
    };
    const first = await send(t, grant, job.importJobId, 0, batch);
    expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
    const snapshot = await t.run(async ctx => ({
      events: await ctx.db.query("events").collect(), links: await ctx.db.query("citationLinks").collect(),
      notes: await ctx.db.query("notes").collect(), people: await ctx.db.query("personEvents").collect(),
    }));
    expect(snapshot.events.map(e => e.description).sort()).toEqual(["First", "Second"]);
    expect(new Set(snapshot.people.map(e => e.eventId)).size).toBe(2);
    const firstEvent = snapshot.events.find(e => e.description === "First")!;
    const secondEvent = snapshot.events.find(e => e.description === "Second")!;
    expect(firstEvent.date?.original).toBe("1900");
    expect(secondEvent.date?.original).toBe("1910");
    expect(snapshot.people).toEqual(expect.arrayContaining([
      expect.objectContaining({ personId: first.results.find((r: any) => r.kind === "persons" && r.key === "A/B").id, eventId: firstEvent._id }),
      expect.objectContaining({ personId: first.results.find((r: any) => r.kind === "persons" && r.key === "A").id, eventId: secondEvent._id }),
    ]));
    expect(new Set(snapshot.links.map(e => e.targetId)).size).toBe(2);
    expect(new Set(snapshot.notes.map(e => e.subject.id)).size).toBe(2);
    const resumed = await begin(t, grant);
    expect(resumed.importJobId).toBe(job.importJobId);
    const again = await send(t, grant, job.importJobId, 1, batch);
    expect(again.results.filter((r: any) => r.status === "failed" || r.status === "created")).toEqual([]);
    expect(await countRows(t, "events")).toBe(2);
    expect(await countRows(t, "citationLinks")).toBe(2);
  });

  test("fallback citations with formerly identical target strings retain separate evidence links", async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const grant = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grant);
    const citations: NonNullable<TreeImportBatch["citations"]> = [
      { sourceKey: "s", page: "1", targets: [{ kind: "fact", personKey: "A:B", key: "C" }] },
      { sourceKey: "s", page: "1", targets: [{ kind: "fact", personKey: "A", key: "B:C" }] },
    ];
    expect(legacyCitationKeyFor(citations[0])).toBe(legacyCitationKeyFor(citations[1]));
    expect(citationKeyFor(citations[0])).not.toBe(citationKeyFor(citations[1]));
    const batch: TreeImportBatch = {
      sources: [{ key: "s", title: "Synthetic" }],
      persons: [
        { key: "A:B", living: false, names: [{ given: "One" }], facts: [{ key: "C", type: "residence" }] },
        { key: "A", living: false, names: [{ given: "Two" }], facts: [{ key: "B:C", type: "residence" }] },
      ], citations,
    };
    const first = await send(t, grant, job.importJobId, 0, batch);
    expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
    const rows = await t.run(async ctx => ctx.db.query("citationLinks").collect());
    expect(new Set(rows.map(r => r.citationId)).size).toBe(2);
    expect(new Set(rows.map(r => r.targetId)).size).toBe(2);
    await send(t, grant, job.importJobId, 1, batch);
    expect(await countRows(t, "citations")).toBe(2);
    expect(await countRows(t, "citationLinks")).toBe(2);
  });

  test("old ambiguous keys refuse refresh without deleting, rekeying or duplicating originals", async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const grant = await seedGrant(t, { vaultOwnerId: OWNER });
    const job = await begin(t, grant);
    const fact = { key: "C", type: "residence", value: "Original" };
    const citation = { sourceKey: "s", page: "1", targets: [{ kind: "person" as const, key: "A/B" }] };
    const batch: TreeImportBatch = { sources: [{ key: "s", title: "Synthetic" }], persons: [
      { key: "A/B", living: false, names: [{ given: "One" }], facts: [fact] },
    ], citations: [citation] };
    await send(t, grant, job.importJobId, 0, batch);
    await t.run(async ctx => {
      const mappings = await ctx.db.query("mcpRecordKeys").collect();
      for (const [kind, current, legacy] of [
        ["fact", factKeyFor("A/B", fact), legacyFactKeyFor("A/B", fact)],
        ["citationGenerated", citationKeyFor(citation), legacyCitationKeyFor(citation)],
      ]) {
        const row = mappings.find(r => r.recordKey === externalRecordKey("familysearch", kind, current))!;
        await ctx.db.patch(row._id, { recordKey: externalRecordKey("familysearch", kind === "citationGenerated" ? "citation" : kind, legacy) });
      }
    });
    const before = await t.run(async ctx => ({ events: await ctx.db.query("events").collect(), citations: await ctx.db.query("citations").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
    batch.persons![0].facts![0].value = "Changed";
    const result = await send(t, grant, job.importJobId, 1, batch);
    expect(result.results.filter((r: any) => r.status === "failed")).toHaveLength(2);
    expect(result.results.filter((r: any) => r.status === "failed").every((r: any) => r.reason.includes("ambiguous"))).toBe(true);
    const after = await t.run(async ctx => ({ events: await ctx.db.query("events").collect(), citations: await ctx.db.query("citations").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
    expect(after).toEqual(before);
  });
});


test("explicit IDs cannot impersonate generated fact or citation identities", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const anonymous = { type: "residence", value: "Anonymous fact" };
  const generatedFactKey = decodeURIComponent(factKeyFor("P", anonymous).slice(2));
  const citation = { sourceKey: "s", targets: [{ kind: "person" as const, key: "P" }], extractedText: "Anonymous citation" };
  const batch: TreeImportBatch = {
    sources: [{ key: "s", title: "Synthetic source" }],
    persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [
      anonymous, { key: generatedFactKey, type: "residence", value: "Explicit fact" },
    ] }],
    citations: [citation, { ...citation, key: citationKeyFor(citation), extractedText: "Explicit citation" }],
  };
  const first = await send(t, grant, job.importJobId, 0, batch);
  expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
  expect(await countRows(t, "events")).toBe(2);
  expect(await countRows(t, "citations")).toBe(2);
  const again = await send(t, grant, job.importJobId, 1, batch);
  expect(again.results.filter((r: any) => r.status === "failed" || r.status === "created")).toEqual([]);
  const data = await t.run(async ctx => ({ events: await ctx.db.query("events").collect(), citations: await ctx.db.query("citations").collect() }));
  expect(data.events.map(r => r.description).sort()).toEqual(["Anonymous fact", "Explicit fact"]);
  expect(data.citations.map(r => r.extractedText).sort()).toEqual(["Anonymous citation", "Explicit citation"]);
});


test("notes and citations distinguish generated keys, reject ambiguous defaults and preserve explicit targets", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const fact = { type: "residence", value: "Generated" };
  const factKey = decodeURIComponent(factKeyFor("P", fact).slice(2));
  const citation = { sourceKey: "s", targets: [{ kind: "person" as const, key: "P" }], extractedText: "Generated" };
  const citationKey = citationKeyFor(citation);
  const result = await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "s", title: "Synthetic" }],
    persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [fact,
      { key: factKey, type: "residence", value: "Explicit" },
    ] }],
    citations: [citation, { ...citation, key: citationKey, extractedText: "Explicit" },
      { key: "fact-generated", sourceKey: "s", targets: [{ kind: "fact", personKey: "P", key: factKey, keyOrigin: "generated" }] },
      { key: "fact-explicit", sourceKey: "s", targets: [{ kind: "fact", personKey: "P", key: factKey, keyOrigin: "explicit" }] },
    ],
    notes: [
      { key: "generated-note", text: "Generated citation", subject: { kind: "citation", key: citationKey, keyOrigin: "generated" } },
      { key: "explicit-note", text: "Explicit citation", subject: { kind: "citation", key: citationKey, keyOrigin: "explicit" } },
      { key: "ambiguous-note", text: "Refuse to guess", subject: { kind: "citation", key: citationKey } },
      { key: "generated-fact-note", text: "Generated fact", subject: { kind: "fact", personKey: "P", key: factKey, keyOrigin: "generated" } },
    ],
  });
  expect(result.results.filter((r: any) => r.status === "failed")).toMatchObject([{ kind: "notes", key: "ambiguous-note", reason: expect.stringContaining("AMBIGUOUS_TARGET") }]);
  const results = result.results.filter((r: any) => r.kind === "citations");
  expect(results[0]).toMatchObject({ key: citationKey, keyOrigin: "generated" });
  expect(results[1]).toMatchObject({ key: citationKey, keyOrigin: "explicit" });
  const data = await t.run(async ctx => ({ notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), events: await ctx.db.query("events").collect(), links: await ctx.db.query("citationLinks").collect() }));
  expect(data.notes.find(n => n.text === "Generated citation")!.subject.id).toBe(results[0].id);
  expect(data.notes.find(n => n.text === "Explicit citation")!.subject.id).toBe(results[1].id);
  const generatedEvent = data.events.find(e => e.description === "Generated")!;
  const explicitEvent = data.events.find(e => e.description === "Explicit")!;
  expect(data.links.find(l => l.citationId === results[2].id)!.targetId).toBe(generatedEvent._id);
  expect(data.links.find(l => l.citationId === results[3].id)!.targetId).toBe(explicitEvent._id);
  expect(data.notes.find(n => n.text === "Generated fact")!.subject.id).toBe(generatedEvent._id);
});

test("generated citations accept maximum source IDs and notes can resume with their returned keys", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  for (const [index, length] of [184, 200].entries()) {
    const sourceKey = "S".repeat(length);
    const batch: TreeImportBatch = {
      sources: [{ key: sourceKey, title: "Long source" }],
      persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }],
      citations: [{ sourceKey, targets: [{ kind: "person", key: "P", field: "birth" }] }],
    };
    const first = await send(t, grant, job.importJobId, index * 2, batch);
    expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
    const citation = first.results.find((r: any) => r.kind === "citations");
    expect(citation.key.length).toBeLessThanOrEqual(200);
    const resumed = await send(t, grant, job.importJobId, index * 2 + 1, {
      ...batch, notes: [{ key: `note-${length}`, text: "Synthetic note", subject: { kind: "citation", key: citation.key, keyOrigin: citation.keyOrigin } }],
    });
    expect(resumed.results.filter((r: any) => r.status === "failed" || (r.kind === "citations" && r.status === "created"))).toEqual([]);
  }
  expect(await countRows(t, "citations")).toBe(2);
  expect(await countRows(t, "notes")).toBe(2);
});

test("fallback citation delimiter collision preserves text and all field links regardless of target order", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const citations: NonNullable<TreeImportBatch["citations"]> = [
    { sourceKey: "s", extractedText: "First original", targets: [{ kind: "person", key: "A:B", field: "birth" }] },
    { sourceKey: "s", extractedText: "Second original", targets: [{ kind: "person", key: "A", field: "B:birth" }] },
    { sourceKey: "s", extractedText: "Two fields", targets: [
      { kind: "person", key: "A", field: "name" }, { kind: "person", key: "A", field: "birth" }, { kind: "person", key: "A" },
    ] },
  ];
  expect(legacyCitationKeyFor(citations[0])).toBe(legacyCitationKeyFor(citations[1]));
  const batch: TreeImportBatch = {
    sources: [{ key: "s", title: "Synthetic source" }],
    persons: [{ key: "A:B", living: false, names: [{ given: "One" }] }, { key: "A", living: false, names: [{ given: "Two" }] }], citations,
  };
  const first = await send(t, grant, job.importJobId, 0, batch);
  expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const citationRows = first.results.filter((r: any) => r.kind === "citations");
  const before = await t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect() }));
  expect(before.citations.map(c => c.extractedText).sort()).toEqual(["First original", "Second original", "Two fields"]);
  expect(before.links.filter(l => l.citationId === citationRows[2].id).map(l => l.field ?? "all").sort()).toEqual(["all", "birth", "name"]);
  citations[2].targets.reverse();
  const again = await send(t, grant, job.importJobId, 1, batch);
  expect(again.results.filter((r: any) => r.status === "failed" || r.status === "created")).toEqual([]);
  const after = await t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect() }));
  expect(after).toEqual(before);
});


test("an explicit outside ID cannot overwrite a legacy generated row with the same spelling", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const fact = { type: "residence", value: "Original generated fact" };
  const citation = { sourceKey: "s", targets: [{ kind: "person" as const, key: "P" }], extractedText: "Original generated citation" };
  await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "s", title: "Synthetic" }],
    persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [fact] }], citations: [citation],
  });
  await t.run(async ctx => {
    const rows = await ctx.db.query("mcpRecordKeys").collect();
    for (const [kind, current, oldKind, oldKey] of [
      ["factGenerated", factKeyFor("P", fact), "fact", legacyFactKeyFor("P", fact)],
      ["citationGenerated", citationKeyFor(citation), "citation", legacyCitationKeyFor(citation)],
    ]) {
      const mapping = rows.find(r => r.recordKey === externalRecordKey("familysearch", kind, current))!;
      await ctx.db.patch(mapping._id, { recordKey: externalRecordKey("familysearch", oldKind, oldKey) });
    }
  });
  const before = await t.run(async ctx => ({ events: await ctx.db.query("events").collect(), citations: await ctx.db.query("citations").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const result = await send(t, grant, job.importJobId, 1, {
    persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [
      { key: legacyFactKeyFor("P", fact).slice(2), type: "residence", value: "Explicit different fact" },
    ] }],
    citations: [{ ...citation, key: legacyCitationKeyFor(citation), extractedText: "Explicit different citation" }],
  });
  expect(result.results).toHaveLength(2);
  expect(result.results.every((r: any) => r.status === "failed" && r.reason.includes("LEGACY_IDENTITY_REVIEW_REQUIRED"))).toBe(true);
  const after = await t.run(async ctx => ({ events: await ctx.db.query("events").collect(), citations: await ctx.db.query("citations").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  expect(after).toEqual(before);
});


test("maximum-length fact types keep generated references within the public key limit", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const fact = { type: "X".repeat(200), value: "Long type" };
  const key = factReferenceKeyFor(fact);
  expect(key.length).toBeLessThanOrEqual(200);
  const result = await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "s", title: "Synthetic" }],
    persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [fact] }],
    citations: [{ key: "c", sourceKey: "s", targets: [{ kind: "fact", personKey: "P", key, keyOrigin: "generated" }] }],
    notes: [{ key: "n", text: "Generated fact", subject: { kind: "fact", personKey: "P", key, keyOrigin: "generated" } }],
  });
  expect(result.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const data = await t.run(async ctx => ({ events: await ctx.db.query("events").collect(), links: await ctx.db.query("citationLinks").collect(), notes: await ctx.db.query("notes").collect() }));
  expect(data.events).toHaveLength(1);
  expect(data.events[0].customType).toBe(fact.type);
  expect(data.links[0].targetId).toBe(data.events[0]._id);
  expect(data.notes[0].subject.id).toBe(data.events[0]._id);
});

test("failed dry-run items roll back planned identities so dependents match real execution", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "Legacy", living: false, names: [{ given: "Original" }], facts: [{ key: "C", type: "residence" }] }] });
  await t.run(async ctx => {
    const mapping = (await ctx.db.query("mcpRecordKeys").collect()).find(r => r.recordKey === externalRecordKey("familysearch", "fact", "Legacy/C"))!;
    await ctx.db.patch(mapping._id, { recordKey: externalRecordKey("familysearch", "fact", "A/B/C") });
  });
  const batch: TreeImportBatch = {
    sources: [{ key: "s", title: "Synthetic" }],
    persons: [{ key: "A/B", living: false, names: [{ given: "Will fail" }], facts: [{ key: "C", type: "residence" }] }],
    relationships: [{ key: "r", type: "ParentChild", person1Key: "Legacy", person2Key: "A/B" }],
    citations: [{ key: "c", sourceKey: "s", targets: [{ kind: "person", key: "A/B" }] }],
    notes: [{ key: "n", text: "Dependent", subject: { kind: "person", key: "A/B" } }],
  };
  // A later planning chunk receives only identities from successful earlier rows.
  const initialPlan = await t.query(internal.treeImport.planTreeImportChunk, {
    principal: principal(), grantId: grant, importJobId: job.importJobId, operationId: "plan-first", plannedKeys: [],
    items: [{ kind: "sources", index: 0, item: batch.sources![0] }, { kind: "persons", index: 0, item: batch.persons![0] }],
  });
  expect(initialPlan.plannedKeys).toEqual([externalRecordKey("familysearch", "source", "s")]);
  const dependentPlan = await t.query(internal.treeImport.planTreeImportChunk, {
    principal: principal(), grantId: grant, importJobId: job.importJobId, operationId: "plan-next", plannedKeys: initialPlan.plannedKeys, plannedRecords: initialPlan.plannedRecords, plannedState: initialPlan.plannedState,
    items: [{ kind: "relationships", index: 0, item: batch.relationships![0] }, { kind: "citations", index: 0, item: batch.citations![0] }, { kind: "notes", index: 0, item: batch.notes![0] }],
  });
  expect(dependentPlan.results.every(row => row.status === "failed")).toBe(true);
  expect(dependentPlan.plannedKeys).toEqual([]);
  const peopleBefore = await countRows(t, "persons");
  const keysBefore = await countRows(t, "mcpRecordKeys");
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-failed-person");
  expect(await countRows(t, "persons")).toBe(peopleBefore);
  expect(await countRows(t, "mcpRecordKeys")).toBe(keysBefore);
  const real = await send(t, grant, job.importJobId, 1, batch, {}, "real-failed-person");
  const statuses = (r: any) => r.results.map((row: any) => ({ kind: row.kind, status: row.status, code: row.reason?.split(":")[0] }));
  expect(statuses(dry)).toEqual(statuses(real));
  expect(real.results.filter((r: any) => r.status === "failed")).toHaveLength(4);
  expect(await countRows(t, "persons")).toBe(peopleBefore);
  expect(await countRows(t, "relationships")).toBe(0);
  expect(await countRows(t, "citations")).toBe(0);
  expect(await countRows(t, "notes")).toBe(0);
});


test("dry-run chunks retain aliases and keep unrelated new placeholders distinct", { timeout: 300_000 }, async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const people: NonNullable<TreeImportBatch["persons"]> = Array.from({ length: 125 }, (_, i) => ({
    key: i === 0 ? "A" : `P${i}`, living: false, names: [{ given: `Synthetic${i}` }],
    ...(i === 0 ? { otherIds: [{ system: "familysearch", id: "B" }] } : {}),
  }));
  people.push({ key: "X", living: false, names: [{ given: "Later chunk" }] });
  const batch: TreeImportBatch = { persons: people, relationships: [
    { key: "self-alias", type: "Couple", person1Key: "A", person2Key: "B" },
    { key: "distinct", type: "Couple", person1Key: "A", person2Key: "X" },
  ] };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, "dry-aliases");
  expect(await countRows(t, "persons")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch, {}, "real-aliases");
  const status = (r: any) => r.results.filter((row: any) => row.kind === "relationships").map((row: any) => ({ key: row.key, status: row.status }));
  expect(status(dry)).toEqual(status(real));
  expect(status(real)).toEqual([{ key: "self-alias", status: "failed" }, { key: "distinct", status: "created" }]);
  expect(await countRows(t, "persons")).toBe(126);
  expect(await countRows(t, "relationships")).toBe(1);
});

test("older batch resends preserve the forward cursor and exact receipt replays are inert", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const batch: TreeImportBatch = { persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }] };
  await send(t, grant, job.importJobId, 0, batch, { cursor: "position-0" }, "cursor-batch-0");
  await send(t, grant, job.importJobId, 1, batch, { cursor: "position-1" }, "cursor-batch-1");
  const resend = await send(t, grant, job.importJobId, 0, batch, { cursor: "position-0" }, "resend-old-0");
  expect(resend.nextBatchIndex).toBe(2);
  expect(resend.cursor).toBe("position-1");
  const beforeReplay = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId }) as any;
  const replay = await send(t, grant, job.importJobId, 0, batch, { cursor: "position-0" }, "resend-old-0");
  expect(replay.deduplicated).toBe(true);
  const afterReplay = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId }) as any;
  expect(afterReplay).toEqual(beforeReplay);
  expect((await begin(t, grant)).nextBatchIndex).toBe(2);
  const forward = await send(t, grant, job.importJobId, 2, batch, { cursor: "position-2" }, "cursor-batch-2");
  expect(forward.cursor).toBe("position-2");
  expect(forward.nextBatchIndex).toBe(3);
});


test("generated facts preserve descriptions and complete structured dates as distinct assertions", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const facts = [
    { type: "occupation", description: "Farmer" },
    { type: "occupation", description: "Teacher" },
    { type: "residence", date: { original: "about 1900", year: 1900, month: 1, day: 1, approximate: true, formal: "+1900-01-01" } },
    { type: "residence", date: { original: "about 1900", year: 1901, month: 2, day: 2, approximate: false, formal: "+1901-02-02" } },
  ];
  expect(new Set(facts.map(f => factReferenceKeyFor(f))).size).toBe(4);
  const dateFact = facts[2];
  expect(factReferenceKeyFor(dateFact)).toBe(factReferenceKeyFor({ type: "residence", date: { formal: "+1900-01-01", approximate: true, day: 1, month: 1, year: 1900, original: "about 1900" } }));
  const batch: TreeImportBatch = { persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts }] };
  const first = await send(t, grant, job.importJobId, 0, batch);
  expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const before = await t.run(async ctx => ctx.db.query("events").collect());
  expect(before).toHaveLength(4);
  expect(before.filter(e => e.type === "occupation").map(e => e.description).sort()).toEqual(["Farmer", "Teacher"]);
  expect(before.filter(e => e.type === "residence").map(e => e.date?.year).sort()).toEqual([1900, 1901]);
  await send(t, grant, job.importJobId, 1, batch);
  expect(await t.run(async ctx => ctx.db.query("events").collect())).toEqual(before);
});

test("person results expose changed facts and retained manual fact corrections", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const batch: TreeImportBatch = { persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [{ key: "occupation", type: "occupation", description: "Farmer" }] }] };
  await send(t, grant, job.importJobId, 0, batch);
  batch.persons![0].facts![0].description = "Teacher";
  const changed = await send(t, grant, job.importJobId, 1, batch);
  expect(changed.results).toEqual([expect.objectContaining({ kind: "persons", key: "P", status: "updated" })]);
  await t.run(async ctx => { const event = (await ctx.db.query("events").collect())[0]; expect(event.description).toBe("Teacher"); await ctx.db.patch(event._id, { description: "Owner correction" }); });
  batch.persons![0].facts![0].description = "Nurse";
  const kept = await send(t, grant, job.importJobId, 2, batch);
  expect(kept.results).toEqual([expect.objectContaining({ kind: "persons", key: "P", status: "unchanged", kept: expect.arrayContaining(["facts:P/occupation:description"]) })]);
  expect((await t.run(async ctx => ctx.db.query("events").collect()))[0].description).toBe("Owner correction");
  const replay = await send(t, grant, job.importJobId, 2, batch);
  expect(replay.deduplicated).toBe(true);
  expect(replay.results).toEqual(kept.results);
});

test.each([0, 249])("dry planning models repeated new documents across chunks (padding %i)", async padding => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const sources = [{ key: "S", title: "First" }, ...Array.from({ length: padding }, (_, i) => ({ key: `pad-${i}`, title: "Padding" })), { key: "S", title: "Corrected" }];
  const batch: TreeImportBatch = { sources };
  const before = await countRows(t, "sources");
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-docs-${padding}`);
  expect(await countRows(t, "sources")).toBe(before);
  const real = await send(t, grant, job.importJobId, 0, batch, {}, `real-docs-${padding}`);
  const statuses = (r: any) => r.results.filter((row: any) => row.key === "S").map((row: any) => row.status);
  expect(statuses(dry)).toEqual(["created", "updated"]);
  expect(statuses(dry)).toEqual(statuses(real));
  const stored = await t.run(async ctx => ctx.db.query("sources").collect());
  expect(stored.filter(row => row.title === "Corrected")).toHaveLength(1);
  expect(stored.filter(row => row.title === "First")).toHaveLength(0);
});


test("dry planning keeps virtual refresh baselines and manual corrections across repeated existing rows", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "S", title: "Original" }, { key: "Manual", title: "Original manual" }] });
  await t.run(async ctx => { const row = (await ctx.db.query("sources").collect()).find(r => r.title === "Original manual")!; await ctx.db.patch(row._id, { title: "Owner correction" }); });
  const batch: TreeImportBatch = { sources: [
    { key: "S", title: "Second" }, { key: "S", title: "Third" },
    { key: "Manual", title: "Incoming second" }, { key: "Manual", title: "Incoming third" },
  ] };
  const before = await t.run(async ctx => ctx.db.query("sources").collect());
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-existing-versions");
  expect(await t.run(async ctx => ctx.db.query("sources").collect())).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch, {}, "real-existing-versions");
  const outcomes = (r: any) => r.results.map((row: any) => ({ key: row.key, status: row.status, kept: row.kept ?? [] }));
  expect(outcomes(dry)).toEqual(outcomes(real));
  expect(outcomes(real)).toEqual([
    { key: "S", status: "updated", kept: [] }, { key: "S", status: "updated", kept: [] },
    { key: "Manual", status: "unchanged", kept: ["title"] }, { key: "Manual", status: "unchanged", kept: ["title"] },
  ]);
  const after = await t.run(async ctx => ctx.db.query("sources").collect());
  expect(after.map(r => r.title).sort()).toEqual(["Owner correction", "Third"]);
});


test("custom fact namespaces and accepted value/description/name fields survive losslessly", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const facts = [
    { type: "https://a.example/CustomEvent", value: "", description: "Teacher" },
    { type: "https://b.example/CustomEvent", value: "", description: "Teacher" },
    { type: "occupation", value: "Farmer", description: "and miller" },
  ];
  expect(factReferenceKeyFor(facts[0])).not.toBe(factReferenceKeyFor(facts[1]));
  const names = [{ given: "Synthetic", surname: "Person", type: "MarriedName", preferred: true }, { given: "Alternate", surname: "Person", type: "Nickname", nickname: "Nicky" }];
  const first = await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names, facts }] });
  expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const data = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect() }));
  expect(data.people[0].importedNames).toEqual(names);
  expect(data.people[0].alternateNames?.[0].nickname).toBe("Nicky");
  expect(data.events).toHaveLength(3);
  for (const fact of facts) expect(data.events.find(e => e.importedFact?.type === fact.type)?.importedFact).toEqual(fact);
  expect(data.events.filter(e => e.type === "custom").map(e => e.customType).sort()).toEqual(["https://a.example/CustomEvent", "https://b.example/CustomEvent"]);
  expect(data.events.filter(e => e.type === "custom").every(e => e.description === "Teacher")).toBe(true);
});

test.each([0, 249])("dry relationship equivalence includes virtual aliases across chunks (padding %i)", async padding => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const relationships: NonNullable<TreeImportBatch["relationships"]> = [
    { key: "R1", type: "ParentChild", person1Key: "P1", person2Key: "P2", lineage: "biological", facts: [{ type: "note", description: "First" }] },
    ...Array.from({ length: padding }, (_, i) => ({ key: `pad-${i}`, type: "Couple" as const, person1Key: "P1", person2Key: "P3" })),
    { key: "R2", type: "ParentChild", person1Key: "P1", person2Key: "P2", lineage: "adopted", facts: [{ type: "note", description: "Second" }] },
  ];
  const batch: TreeImportBatch = { persons: ["P1", "P2", "P3"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-rel-alias-${padding}`);
  expect(await countRows(t, "relationships")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch, {}, `real-rel-alias-${padding}`);
  const outcomes = (r: any) => r.results.filter((row: any) => row.key === "R1" || row.key === "R2").map((row: any) => ({ key: row.key, status: row.status, kept: row.kept ?? [] }));
  expect(outcomes(dry)).toEqual(outcomes(real));
  expect(outcomes(real)[1]).toMatchObject({ key: "R2", status: "linked", kept: expect.arrayContaining(["childRelationType", "facts"]) });
});

test("oversized receipts keep every conflict retrievable and replay preserves the page pointer", { timeout: 300_000 }, async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const operationId = "large-conflict-receipt";
  const results = Array.from({ length: 500 }, (_, index) => ({ kind: "persons" as const, index, key: `${index}-` + "K".repeat(180), status: "unchanged" as const, kept: ["name", "importedNames"] }));
  await t.run(async ctx => {
    for (let index = 0; index < 4; index++) await ctx.db.insert("mcpOperations", {
      vaultOwnerId: OWNER, operationId: `${operationId}#${index}`, toolName: "family_history_import_tree_batch#chunk", requestHash: `large-hash#${index}`,
      resultJson: JSON.stringify({ importJobId: job.importJobId, results: results.slice(index * 125, (index + 1) * 125), plannedKeys: [], duplicatesSuggested: 0 }), clientId: principal().clientId, createdAt: Date.now(),
    });
  });
  const args = { principal: principal(), grantId: grant, importJobId: job.importJobId, operationId, requestHash: "large-hash", batchIndex: 0, records: 500, results, duplicatesSuggested: 0, chunkCount: 4, final: false };
  await t.mutation(internal.treeImport.prepareTreeImportBatch, { principal: principal(), grantId: grant, importJobId: job.importJobId, operationId, requestHash: args.requestHash, batchIndex: 0, dryRun: false });
  const receipt = await t.mutation(internal.treeImport.recordTreeImportBatch, args) as any;
  expect(receipt.results).toEqual([]);
  expect(receipt.resultDetails).toEqual({ operationId, chunkCount: 4 });
  expect(receipt.resultsTrimmed).toContain("retained conflicts");
  const found: string[] = [];
  let cursor: { resultsChunkIndex: number; resultsOffset: number } | null = { resultsChunkIndex: 0, resultsOffset: 0 };
  while (cursor) {
    const page = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId, resultsOperationId: operationId, ...cursor }) as any;
    expect(page.results.length).toBeLessThanOrEqual(10);
    found.push(...page.results.map((row: any) => `${row.index}:${row.kept}`));
    cursor = page.next;
  }
  expect(found).toEqual(results.flatMap(row => row.kept.map(field => `${row.index}:${field}`)));
  const replay = await t.mutation(internal.treeImport.recordTreeImportBatch, args) as any;
  expect(replay.deduplicated).toBe(true);
  expect(replay.resultDetails).toEqual(receipt.resultDetails);
  const other = await begin(t, grant, "other-import");
  await expect(t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: other.importJobId, resultsOperationId: operationId })).rejects.toThrow(/NOT_FOUND/);
});


test("actual large-conflict imports store bounded chunk pages and retain citation key origins", { timeout: 900_000 }, async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const publicOperation = "abcdefgh#0:detail:0";
  const publicBatch = { sources: [{ key: "public-receipt-source", title: "Public operation" }] };
  await send(t, grant, job.importJobId, 0, publicBatch, {}, publicOperation);
  const personKeys = ["?".repeat(199) + "A", "?".repeat(199) + "B"];
  const facts = Array.from({ length: 60 }, (_, i) => ({ key: "?".repeat(198) + String(i).padStart(2, "0"), type: "occupation", value: "Initial", description: "Original", date: { original: "1800", year: 1800 }, place: { original: "Initial place" } }));
  const generatedCitation = { sourceKey: "S", targets: [{ kind: "person" as const, key: personKeys[0] }] };
  const sharedKey = citationKeyFor(generatedCitation);
  const batch: TreeImportBatch = {
    sources: [{ key: "S", title: "Synthetic source" }],
    persons: personKeys.map((key, i) => ({ key, living: false, names: [{ given: `Synthetic${i}` }], facts: facts.map(f => ({ ...f })) })),
    citations: [generatedCitation, { key: sharedKey, sourceKey: "S", targets: [{ kind: "person", key: personKeys[1] }] }],
  };
  const first = await send(t, grant, job.importJobId, 1, batch);
  expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
  await t.run(async ctx => {
    for (const event of await ctx.db.query("events").collect()) await ctx.db.patch(event._id, {
      description: "Owner correction", date: { original: "1700", year: 1700 }, place: { original: "Owner place" },
      importedFact: { ...event.importedFact!, value: "Owner original correction" },
    });
  });
  for (const person of batch.persons!) for (const fact of person.facts!) {
    fact.value = "Updated"; fact.description = "Changed"; fact.date = { original: "1900", year: 1900 }; fact.place = { original: "Incoming place" };
  }
  const result = await send(t, grant, job.importJobId, 2, batch, {}, "abcdefgh");
  expect(result.results).toEqual([]);
  expect(result.resultsTrimmed).toContain("retained conflicts");
  const receipts = await t.run(async ctx => ctx.db.query("mcpOperations").collect());
  const privateReceipts = await t.run(async ctx => ctx.db.query("treeImportReceipts").collect());
  expect(privateReceipts.some(row => row.detailIndex >= 0)).toBe(true);
  expect(privateReceipts.every(row => new TextEncoder().encode(JSON.stringify(row)).byteLength < 1024 * 1024)).toBe(true);
  expect(receipts.filter(row => row.operationId === publicOperation)).toHaveLength(1);
  expect(receipts.every(row => new TextEncoder().encode(JSON.stringify(row)).byteLength < 1024 * 1024)).toBe(true);
  const entries: any[] = [];
  let cursor: { resultsChunkIndex: number; resultsOffset: number } | null = { resultsChunkIndex: 0, resultsOffset: 0 };
  while (cursor) {
    const page = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId, resultsOperationId: "abcdefgh", ...cursor }) as any;
    entries.push(...page.results); cursor = page.next;
  }
  expect(entries.filter(row => row.kept)).toHaveLength(480);
  const citationEntries = entries.filter(row => row.kind === "citations");
  expect(citationEntries.map(row => row.keyOrigin).sort()).toEqual(["explicit", "generated"]);
  const notes = citationEntries.map((row, i) => ({ key: `result-note-${i}`, text: `Synthetic note ${i}`, subject: { kind: "citation" as const, key: row.key, keyOrigin: row.keyOrigin } }));
  const noted = await send(t, grant, job.importJobId, 3, { notes });
  expect(noted.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const storedNotes = await t.run(async ctx => ctx.db.query("notes").collect());
  expect(storedNotes.map(row => row.subject.id).sort()).toEqual(citationEntries.map(row => row.id).sort());
  const replay = await send(t, grant, job.importJobId, 2, batch, {}, "abcdefgh");
  expect(replay.deduplicated).toBe(true);
  expect(replay.resultDetails).toEqual(result.resultDetails);
  expect((await send(t, grant, job.importJobId, 0, publicBatch, {}, publicOperation)).deduplicated).toBe(true);
});

test.each([0, 122])("dry media and citation updates preserve virtual person/source references (padding %i)", { timeout: 300_000 }, async padding => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const batch: TreeImportBatch = {
    sources: [{ key: "S1", title: "One" }, { key: "S2", title: "Two" }],
    persons: ["P1", "P2", ...Array.from({ length: padding }, (_, i) => `pad-${i}`)].map(key => ({ key, living: false, names: [{ given: key }] })),
    media: [{ key: "M", title: "Image", personKeys: ["P1"], sourceKey: "S1" }, { key: "M", title: "Image", personKeys: ["P2"], sourceKey: "S2" }],
    citations: [{ key: "C", sourceKey: "S1", targets: [{ kind: "person", key: "P1" }] }, { key: "C", sourceKey: "S2", targets: [{ kind: "person", key: "P1" }] }],
  };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-references-${padding}`);
  expect(await countRows(t, "media")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch, {}, `real-references-${padding}`);
  const statuses = (r: any) => r.results.filter((row: any) => row.kind === "media" || row.kind === "citations").map((row: any) => ({ kind: row.kind, key: row.key, status: row.status }));
  expect(statuses(dry)).toEqual(statuses(real));
  expect(statuses(real).map((row: any) => row.status)).toEqual(["created", "updated", "created", "updated"]);
});

test.each([1700, 1800])("dry duplicate suggestions include planned people and changed index values (initial year %i)", async initialYear => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  if (initialYear === 1700) await send(t, grant, job.importJobId, 0, { persons: [{ key: "P1", living: false, names: [{ given: "Old", surname: "Same" }], facts: [{ key: "birth", type: "birth", date: { original: "1700", year: 1700 } }] }] });
  const batch: TreeImportBatch = { persons: ["P1", "P2"].map(key => ({ key, living: false, names: [{ given: "John", surname: "Same" }], facts: [{ key: "birth", type: "birth", date: { original: "1800", year: 1800 } }] })) };
  const index = initialYear === 1700 ? 1 : 0;
  const dry = await send(t, grant, job.importJobId, index, batch, { dryRun: true }, `dry-duplicates-${initialYear}`);
  const real = await send(t, grant, job.importJobId, index, batch, {}, `real-duplicates-${initialYear}`);
  expect(dry.possibleDuplicates).toBe(1);
  expect(dry.possibleDuplicates).toBe(real.duplicatesSuggested);
});

test("dry duplicate scans exclude stored index values moved out by planned changes", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P1", living: false, names: [{ given: "John", surname: "Same" }], facts: [{ key: "birth", type: "birth", date: { original: "1800", year: 1800 } }] }] });
  const batch: TreeImportBatch = { persons: [
    { key: "P1", living: false, names: [{ given: "John", surname: "Same" }], facts: [{ key: "birth", type: "birth", date: { original: "1900", year: 1900 } }] },
    { key: "P2", living: false, names: [{ given: "John", surname: "Same" }], facts: [{ key: "birth", type: "birth", date: { original: "1800", year: 1800 } }] },
  ] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-index-move");
  const real = await send(t, grant, job.importJobId, 1, batch, {}, "real-index-move");
  expect(dry.possibleDuplicates).toBe(0);
  expect(real.duplicatesSuggested).toBe(0);
});


test.each([false, true])("external-system delimiters never alias distinct people (safe-first %s)", async safeFirst => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const aliases = [{ system: "ancestry:person:a", id: "b" }, { system: "ancestry", id: "a:person:b" }];
  expect(legacyExternalRecordKey(aliases[0].system, "person", aliases[0].id)).toBe(legacyExternalRecordKey(aliases[1].system, "person", aliases[1].id));
  expect(externalRecordKey(aliases[0].system, "person", aliases[0].id)).not.toBe(externalRecordKey(aliases[1].system, "person", aliases[1].id));
  if (safeFirst) aliases.reverse();
  const first = await send(t, grant, job.importJobId, 0, { persons: aliases.map((alias, i) => ({ key: `P${i}`, living: false, names: [{ given: `Synthetic${i}` }], otherIds: [alias] })) });
  expect(first.results.filter((r: any) => r.status === "failed")).toEqual([]);
  expect(new Set(first.results.map((r: any) => r.id)).size).toBe(2);
  expect(await countRows(t, "persons")).toBe(2);
  const second = await send(t, grant, job.importJobId, 1, { persons: aliases.map((alias, i) => ({ key: `P${i}`, living: false, names: [{ given: `Synthetic${i}` }], otherIds: [alias] })) });
  expect(second.results.filter((r: any) => r.status === "failed" || r.status === "created")).toEqual([]);
});

test("ambiguous legacy system mappings refuse both aliases without rekeying originals", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const alias = { system: "ancestry:person:a", id: "b" };
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "Original", living: false, names: [{ given: "Original" }], otherIds: [alias] }] });
  await t.run(async ctx => {
    const row = (await ctx.db.query("mcpRecordKeys").collect()).find(r => r.recordKey === externalRecordKey(alias.system, "person", alias.id))!;
    await ctx.db.patch(row._id, { recordKey: legacyExternalRecordKey(alias.system, "person", alias.id), externalKeyVersion: undefined });
  });
  const before = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const result = await send(t, grant, job.importJobId, 1, { persons: [
    { key: "Unsafe", living: false, names: [{ given: "New one" }], otherIds: [alias] },
    { key: "Safe", living: false, names: [{ given: "New two" }], otherIds: [{ system: "ancestry", id: "a:person:b" }] },
  ] });
  expect(result.results).toHaveLength(2);
  expect(result.results.every((r: any) => r.status === "failed" && r.reason.includes("LEGACY_IDENTITY_REVIEW_REQUIRED"))).toBe(true);
  expect(await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }))).toEqual(before);
});

test.each([{ padding: 0, moveFirst: false }, { padding: 124, moveFirst: false }, { padding: 0, moveFirst: true }, { padding: 124, moveFirst: true }])("dry relationship matching ignores persisted endpoints moved in virtual state ($padding/$moveFirst)", { timeout: 300_000 }, async ({ padding, moveFirst }) => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    persons: ["A", "B", "C", "D", "E"].map(key => ({ key, living: false, names: [{ given: key }] })),
    relationships: [{ key: "R1", type: "Couple", person1Key: "A", person2Key: "B" }],
  });
  const batch: TreeImportBatch = { relationships: [
    { key: "R1", type: "Couple", person1Key: moveFirst ? "C" : "A", person2Key: moveFirst ? "B" : "C" },
    ...Array.from({ length: padding }, (_, i) => ({ key: `pad-${i}`, type: "Couple" as const, person1Key: "D", person2Key: "E" })),
    { key: "R2", type: "Couple", person1Key: "A", person2Key: "B" },
  ] };
  const before = await t.run(async ctx => ctx.db.query("relationships").collect());
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-rel-move-${padding}`);
  expect(await t.run(async ctx => ctx.db.query("relationships").collect())).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch, {}, `real-rel-move-${padding}`);
  const outcomes = (r: any) => r.results.filter((row: any) => row.key === "R1" || row.key === "R2").map((row: any) => ({ key: row.key, status: row.status, kept: row.kept ?? [] }));
  expect(outcomes(dry)).toEqual(outcomes(real));
  expect(outcomes(real)).toEqual([{ key: "R1", status: "updated", kept: [] }, { key: "R2", status: "created", kept: [] }]);
});

test.each(["abcdefgh#0", "abcdefgh#0:detail:0"])("public operation IDs cannot alias internal chunk receipts (%s)", async publicOperation => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const first = { sources: [{ key: "S1", title: "One" }] };
  const second = { sources: [{ key: "S2", title: "Two" }] };
  await send(t, grant, job.importJobId, 0, first, {}, publicOperation);
  const result = await send(t, grant, job.importJobId, 1, second, {}, "abcdefgh");
  expect(result.results).toEqual([expect.objectContaining({ key: "S2", status: "created" })]);
  expect((await send(t, grant, job.importJobId, 0, first, {}, publicOperation)).deduplicated).toBe(true);
  expect((await send(t, grant, job.importJobId, 1, second, {}, "abcdefgh")).deduplicated).toBe(true);
  expect(await countRows(t, "sources")).toBe(2);
});

test("legacy completed chunks resume without rewriting their records", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "S", title: "Initial" }] });
  const source = await t.run(async ctx => (await ctx.db.query("sources").collect())[0]);
  const operationId = "legacy-resume";
  await t.run(async ctx => {
    await ctx.db.insert("mcpOperations", {
      vaultOwnerId: OWNER, operationId: `${operationId}#0`, toolName: "family_history_import_tree_batch#chunk", requestHash: `hash-${operationId}#0`,
      resultJson: JSON.stringify({ results: [{ kind: "sources", index: 0, key: "S", id: source._id, status: "unchanged" }], plannedKeys: [], duplicatesSuggested: 0 }),
      clientId: "synthetic-mcp-client", createdAt: 1,
    });
  });
  const result = await send(t, grant, job.importJobId, 1, { sources: [{ key: "S", title: "Initial" }] }, {}, operationId);
  expect(result.counts.sources.unchanged).toBe(1);
  expect(await t.run(ctx => ctx.db.get(source._id))).toEqual(source);
  expect((await send(t, grant, job.importJobId, 1, { sources: [{ key: "S", title: "Initial" }] }, {}, operationId)).deduplicated).toBe(true);
});

test.each([false, true])("unversioned fact tuples verify the owning person (encoded collision %s)", async collision => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const originalKey = collision ? "A%2FB" : "P";
  const incomingKey = collision ? "A/B" : "P";
  const original = { key: originalKey, living: false, names: [{ given: "Original" }], facts: [{ key: "C", type: "occupation", value: "Farmer" }] };
  await send(t, grant, job.importJobId, 0, { persons: [original], sources: [{ key: "S", title: "Synthetic" }] });
  if (collision) await send(t, grant, job.importJobId, 1, { persons: [{ key: incomingKey, living: false, names: [{ given: "Different person" }] }] });
  await t.run(async ctx => {
    const mapping = (await ctx.db.query("mcpRecordKeys").collect()).find(row => row.recordKey === externalRecordKey("familysearch", "fact", factKeyFor(originalKey, original.facts[0])))!;
    await ctx.db.patch(mapping._id, { recordKey: externalRecordKey("familysearch", "fact", `${originalKey}/C`), externalKeyVersion: undefined });
  });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), keys: await ctx.db.query("mcpRecordKeys").collect(), links: await ctx.db.query("personEvents").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = {
    persons: [{ ...original, key: incomingKey, facts: [{ ...original.facts[0], value: "Teacher" }] }],
    citations: [{ key: "CITE", sourceKey: "S", targets: [{ kind: "fact", personKey: incomingKey, key: "C", keyOrigin: "explicit" }] }],
  };
  const index = collision ? 2 : 1;
  const dry = await send(t, grant, job.importJobId, index, batch, { dryRun: true }, `dry-tuple-${collision}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, index, batch);
  if (collision) {
    for (const result of [dry, real]) {
      expect(result.results).toHaveLength(2);
      expect(result.results.every((row: any) => row.status === "failed" && row.reason.includes("LEGACY_IDENTITY_REVIEW_REQUIRED"))).toBe(true);
    }
    expect(await snapshot()).toEqual(before);
    expect(await countRows(t, "citations")).toBe(0);
  } else {
    expect(real.results.filter((row: any) => row.status === "failed")).toEqual([]);
    expect(dry.counts).toEqual(real.counts);
    const after = await snapshot();
    expect(after.events).toHaveLength(1);
    expect(after.events[0]._id).toBe(before.events[0]._id);
    expect(after.events[0].description).toBe("Teacher");
    expect(after.links).toEqual(before.links);
  }
});

test.each(["forward", "reverse", "primary"])("conflicting person aliases refuse identity assignment before writing (%s)", async order => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const aliases = [{ system: "ancestry", id: "A" }, { system: "myheritage", id: "B" }];
  await send(t, grant, job.importJobId, 0, { persons: aliases.map((alias, i) => ({ key: `P${i}`, living: false, names: [{ given: `Original${i}` }], otherIds: [alias] })) });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect(), events: await ctx.db.query("events").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { persons: [{ key: order === "primary" ? "P0" : "New", living: false, names: [{ given: "Incoming" }], otherIds: order === "primary" ? [aliases[1]] : order === "reverse" ? [...aliases].reverse() : aliases, facts: [{ key: "new-fact", type: "occupation", value: "Teacher" }] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `aliases-${order}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("AMBIGUOUS_PERSON_IDENTITY") })]);
    expect(await snapshot()).toEqual(before);
  }
});

test("FamilySearch legacy linking uses the owner index beyond foreign records", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const personId = await t.run(async ctx => {
    const doc = { fsId: "SYN-OWNED", name: { given: "Owner correction", surname: "Synthetic" }, living: false, sex: "unknown" as const, researchStatus: "basic" as const, createdAt: 1, updatedAt: 1 };
    for (let i = 0; i < 12; i++) await ctx.db.insert("persons", { ...doc, vaultOwnerId: `user_foreign_${i}` });
    return ctx.db.insert("persons", { ...doc, vaultOwnerId: OWNER });
  });
  const job = await begin(t, grant);
  const result = await send(t, grant, job.importJobId, 0, { persons: [{ key: "SYN-OWNED", living: false, names: [{ given: "Incoming" }] }] });
  expect(result.results).toEqual([expect.objectContaining({ id: personId, status: "linked", kept: expect.arrayContaining(["name"]) })]);
  expect(await countRows(t, "persons")).toBe(13);
  expect((await t.run(ctx => ctx.db.get(personId)))?.name.given).toBe("Owner correction");
});

test.each([false, true])("FamilySearch aliases include captured identities before assigning a person (existing primary %s)", async existingPrimary => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const captured = await t.run(ctx => ctx.db.insert("persons", {
    vaultOwnerId: OWNER, fsId: "PID-B", name: { given: "Captured B", surname: "Synthetic" }, living: false,
    sex: "unknown", researchStatus: "basic", createdAt: 1, updatedAt: 1,
  }));
  const job = await begin(t, grant);
  if (existingPrimary) await send(t, grant, job.importJobId, 0, { persons: [{ key: "PID-A", living: false, names: [{ given: "Original A" }] }] });
  const before = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const batch: TreeImportBatch = { persons: [{ key: "PID-A", living: false, names: [{ given: "Incoming A" }], otherIds: [{ system: " FamilySearch ", id: " PID-B " }] }] };
  const index = existingPrimary ? 1 : 0;
  const dry = await send(t, grant, job.importJobId, index, batch, { dryRun: true }, `dry-captured-alias-${existingPrimary}`);
  expect(await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }))).toEqual(before);
  const real = await send(t, grant, job.importJobId, index, batch);
  expect(dry.counts).toEqual(real.counts);
  if (existingPrimary) {
    expect(real.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("AMBIGUOUS_PERSON_IDENTITY") })]);
    expect(await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }))).toEqual(before);
  } else {
    expect(real.results).toEqual([expect.objectContaining({ id: captured, status: "linked", kept: expect.arrayContaining(["name", "fsId"]) })]);
    expect(await countRows(t, "persons")).toBe(1);
  }
  const facts = await send(t, grant, job.importJobId, index + 1, { persons: [{ key: "PID-B", living: false, names: [{ given: "Captured B", surname: "Synthetic" }], facts: [{ key: "F-B", type: "occupation", value: "Teacher" }] }] });
  expect(facts.results.filter((row: any) => row.status === "failed")).toEqual([]);
  const links = await t.run(ctx => ctx.db.query("personEvents").collect());
  expect(links).toHaveLength(1);
  expect(links[0].personId).toBe(captured);
  expect((await t.run(ctx => ctx.db.get(captured)))?.fsId).toBe("PID-B");
});

test.each(["primary", "alias", "relationship", "citation", "note", "media"])("FamilySearch mapping disagreement cannot redirect writes (%s)", async route => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    persons: [{ key: "PID-A", living: false, names: [{ given: "Original A" }] }],
    sources: [{ key: "S", title: "Synthetic" }],
  });
  await t.run(async ctx => {
    const a = (await ctx.db.query("persons").collect())[0];
    await ctx.db.insert("persons", { vaultOwnerId: OWNER, fsId: "PID-B", name: { given: "Captured B", surname: "Synthetic" }, living: false, sex: "unknown", researchStatus: "basic", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "person", externalKeyVersion: 2, recordKey: externalRecordKey("familysearch", "person", "PID-B"), recordId: String(a._id), createdAt: 1, updatedAt: 1 });
  });
  const snapshot = () => t.run(async ctx => ({
    people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect(), events: await ctx.db.query("events").collect(),
    links: await ctx.db.query("personEvents").collect(), relationships: await ctx.db.query("relationships").collect(), citations: await ctx.db.query("citations").collect(),
    citationLinks: await ctx.db.query("citationLinks").collect(), notes: await ctx.db.query("notes").collect(), media: await ctx.db.query("media").collect(),
  }));
  const before = await snapshot();
  const batch: TreeImportBatch = route === "primary" || route === "alias"
    ? { persons: [{ key: route === "primary" ? "PID-B" : "PID-A", living: false, names: [{ given: "Incoming" }], ...(route === "alias" ? { otherIds: [{ system: "familysearch", id: "PID-B" }] } : {}), facts: [{ key: "F", type: "occupation", value: "Teacher" }] }] }
    : route === "relationship" ? { relationships: [{ key: "R", type: "Couple", person1Key: "PID-A", person2Key: "PID-B" }] }
    : route === "citation" ? { citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "PID-B" }] }] }
    : route === "note" ? { notes: [{ key: "N", text: "Synthetic note", subject: { kind: "person", key: "PID-B" } }] }
    : { media: [{ key: "M", title: "Synthetic image", personKeys: ["PID-B"] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `mapping-disagreement-${route}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("AMBIGUOUS_PERSON_IDENTITY") })]);
    expect(await snapshot()).toEqual(before);
  }
});

test("duplicate owned captured FamilySearch aliases refuse without choosing a row", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  await t.run(async ctx => {
    for (let i = 0; i < 2; i++) await ctx.db.insert("persons", { vaultOwnerId: OWNER, fsId: "PID-B", name: { given: `Captured${i}`, surname: "Synthetic" }, living: false, sex: "unknown", researchStatus: "basic", createdAt: 1, updatedAt: 1 });
  });
  const job = await begin(t, grant);
  const result = await send(t, grant, job.importJobId, 0, { persons: [{ key: "PID-A", living: false, names: [{ given: "Incoming" }], otherIds: [{ system: "familysearch", id: "PID-B" }] }] });
  expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("AMBIGUOUS_PERSON_IDENTITY") })]);
  expect(await countRows(t, "persons")).toBe(2);
  expect(await countRows(t, "mcpRecordKeys")).toBe(0);
});

test.each(["extractedText", "url", "notes", "quality", "accessDate"])("generated citation evidence retains distinct %s and stable replay", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const first: NonNullable<TreeImportBatch["citations"]>[number] = {
    sourceKey: "S", page: "12", extractedText: "Original excerpt", url: "https://example.test/original", notes: "Original note", quality: 1, accessDate: "2026-01-01",
    targets: [{ kind: "person", key: "P", field: "name" }, { kind: "person", key: "P", field: "birth" }],
  };
  const changed: Record<string, unknown> = { extractedText: "Another excerpt", url: "https://example.test/another", notes: "Another note", quality: 3, accessDate: "2026-02-01" };
  const second = { ...first, [field]: changed[field] };
  expect(citationKeyFor(first)).not.toBe(citationKeyFor(second));
  expect(citationKeyFor(first)).toBe(citationKeyFor({ ...first, targets: [...first.targets].reverse() }));
  const citations = [first, second];
  const batch: TreeImportBatch = {
    sources: [{ key: "S", title: "Synthetic source" }], persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }], citations,
    notes: citations.map((citation, i) => ({ key: `N${i}`, text: `Synthetic evidence ${i}`, subject: { kind: "citation", key: citationKeyFor(citation), keyOrigin: "generated" } })),
  };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-citation-evidence-${field}`);
  expect(await countRows(t, "citations")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.counts.citations.created).toBe(2);
  expect(real.results.filter((row: any) => row.status === "failed")).toEqual([]);
  const stored = await t.run(ctx => ctx.db.query("citations").collect());
  expect(stored).toHaveLength(2);
  for (const [i, input] of citations.entries()) {
    const result = real.results.find((row: any) => row.kind === "citations" && row.key === citationKeyFor(input));
    const citation = stored.find(row => String(row._id) === result.id)!;
    expect(citation).toMatchObject({ extractedText: input.extractedText, url: input.url, notes: input.notes, accessDate: input.accessDate, confidence: input.quality === 1 ? "low" : "very_high" });
    const note = await t.run(async ctx => (await ctx.db.query("notes").collect()).find(row => row.text === `Synthetic evidence ${i}`));
    expect(note?.subject.id).toBe(String(citation._id));
  }
  expect(await countRows(t, "citationLinks")).toBe(4);
  expect((await send(t, grant, job.importJobId, 0, batch)).deduplicated).toBe(true);
  const repeat = await send(t, grant, job.importJobId, 1, { citations: citations.map(citation => ({ ...citation, targets: [...citation.targets].reverse() })) });
  expect(repeat.counts.citations.unchanged).toBe(2);
  expect(await t.run(ctx => ctx.db.query("citations").collect())).toEqual(stored);
  expect(await countRows(t, "citationLinks")).toBe(4);
});

test.each(["gedcom7", "gedcom-5.5.1"])("GEDCOM canonical primary aliases stay unique across files and resume (%s)", async system => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  for (const file of ["file-a", "file-b"]) {
    const beginArgs = { principal: principal(), grantId: grant, operationId: `begin-canonical-${file}`, requestHash: file, input: { importKey: file, system, label: file } };
    const job = await t.mutation(internal.treeImport.beginTreeImport, beginArgs) as { importJobId: string };
    const batch: TreeImportBatch = {
      persons: ["@I1@", "@I2@"].map(key => ({ key, living: false, names: [{ given: `${file}-${key}` }], otherIds: ["gedcom", "GEDCOM7", "gedcom-5.5.1"].map(alias => ({ system: alias, id: key })) })),
      relationships: [{ key: "R", type: "Couple", person1Key: "@I1@", person2Key: "@I2@" }],
    };
    const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-canonical-${file}`);
    const real = await send(t, grant, job.importJobId, 0, batch);
    expect(real.results.filter((row: any) => row.status === "failed")).toEqual([]);
    expect(dry.counts).toEqual(real.counts);
    expect((await send(t, grant, job.importJobId, 0, batch)).deduplicated).toBe(true);
    const resumed = await t.mutation(internal.treeImport.beginTreeImport, { ...beginArgs, operationId: `resume-canonical-${file}` }) as { importJobId: string };
    expect(resumed.importJobId).toBe(job.importJobId);
    const repeat = await send(t, grant, job.importJobId, 1, batch);
    expect(repeat.counts.persons.unchanged).toBe(2);
    expect(repeat.counts.relationships.unchanged).toBe(1);
  }
  const mappings = await t.run(ctx => ctx.db.query("mcpRecordKeys").collect());
  expect(new Set(mappings.map(row => row.recordKey)).size).toBe(mappings.length);
  expect(mappings.filter(row => row.recordType === "person")).toHaveLength(4);
  expect(await countRows(t, "persons")).toBe(4);
  expect(await countRows(t, "relationships")).toBe(2);
});

test.each(["sourceId", "page", "extractedText", "confidence", "url", "accessDate", "notes"])("citation evidence conflicts roll back the assertion and new links (%s)", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const original: NonNullable<TreeImportBatch["citations"]>[number] = {
    key: "C", sourceKey: "S1", page: "12", extractedText: "Original excerpt", quality: 1,
    url: "https://example.test/original", accessDate: "2026-01-01", notes: "Original note", targets: [{ kind: "person", key: "P1" }],
  };
  await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "S1", title: "Submitted source" }, { key: "S2", title: "Corrected source" }],
    persons: ["P1", "P2"].map(key => ({ key, living: false, names: [{ given: key }] })), citations: [original],
  });
  await t.run(async ctx => {
    const citation = (await ctx.db.query("citations").collect())[0];
    const correctedSource = (await ctx.db.query("sources").collect()).find(row => row.title === "Corrected source")!;
    const corrections: Record<string, unknown> = { sourceId: correctedSource._id, page: "Owner corrected page", extractedText: "Owner corrected excerpt", confidence: "very_high", url: "https://example.test/corrected", accessDate: "2026-02-01", notes: "Owner corrected note" };
    await ctx.db.patch(citation._id, { [field]: corrections[field] });
  });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { citations: [{ ...original, page: "13", notes: "Incoming new note", targets: [{ kind: "person", key: "P2" }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-evidence-conflict-${field}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  for (const result of [dry, real]) {
    expect(result.results).toEqual([expect.objectContaining({ key: "C", status: "failed", reason: expect.stringContaining("CITATION_EVIDENCE_CONFLICT"), whatToDo: expect.stringContaining("saved nothing") })]);
    expect(result.results[0].reason).toContain(field);
  }
  expect(dry.counts).toEqual(real.counts);
  expect(await snapshot()).toEqual(before);
  const replay = await send(t, grant, job.importJobId, 1, batch);
  expect(replay.deduplicated).toBe(true);
  expect(replay.results).toEqual(real.results);
  expect(await snapshot()).toEqual(before);
  const corrected = {
    ...original, ...(field === "sourceId" ? { sourceKey: "S2" } : {}), ...(field === "page" ? { page: "Owner corrected page" } : {}),
    ...(field === "extractedText" ? { extractedText: "Owner corrected excerpt" } : {}), ...(field === "confidence" ? { quality: 3 as const } : {}),
    ...(field === "url" ? { url: "https://example.test/corrected" } : {}), ...(field === "accessDate" ? { accessDate: "2026-02-01" } : {}),
    ...(field === "notes" ? { notes: "Owner corrected note" } : {}), targets: [{ kind: "person" as const, key: "P2" }],
  };
  const accepted = await send(t, grant, job.importJobId, 2, { citations: [corrected] });
  expect(accepted.results).toEqual([expect.objectContaining({ key: "C", status: "updated" })]);
  const after = await snapshot();
  expect(after.citations).toEqual(before.citations);
  expect(after.keys).toEqual(before.keys);
  expect(after.links).toHaveLength(2);
  expect(after.links).toEqual(expect.arrayContaining(before.links));
});

test.each(["subject", "text"])("note conflicts cannot move living-person content to another subject (%s)", async correction => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const original: NonNullable<TreeImportBatch["notes"]>[number] = { key: "N", text: "Original neutral note", noteType: "biography", subject: { kind: "person", key: "A" } };
  await send(t, grant, job.importJobId, 0, {
    persons: [{ key: "A", living: true, names: [{ given: "Living A" }] }, { key: "B", living: false, names: [{ given: "Deceased B" }] }], notes: [original],
  });
  const b = await t.run(async ctx => {
    const deceased = (await ctx.db.query("persons").collect()).find(row => !row.living)!;
    const note = (await ctx.db.query("notes").collect())[0];
    await ctx.db.patch(note._id, correction === "subject" ? { subject: { kind: "person", id: String(deceased._id) } } : { text: "Owner private living correction" });
    return deceased._id;
  });
  const snapshot = () => t.run(async ctx => ({ notes: await ctx.db.query("notes").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { notes: [{ ...original, text: "Incoming private living text", subject: { kind: "person", key: correction === "subject" ? "A" : "B" } }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `note-association-${correction}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("NOTE_SUBJECT_CONFLICT") })]);
    expect(await snapshot()).toEqual(before);
  }
  const context = await t.query(internal.mcpFamilyHistory.getPersonNotes, { principal: principal(), personId: String(b) });
  expect(JSON.stringify(context)).not.toContain("Incoming private living text");
  expect(JSON.stringify(context)).not.toContain("Owner private living correction");
});

test.each([false, true])("note reassignment refuses omitted living-person titles (manual title %s)", async manual => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    persons: [{ key: "A", living: true, names: [{ given: "Living" }] }, { key: "B", living: false, names: [{ given: "Deceased" }] }],
    notes: [{ key: "N", title: "Sensitive living title", text: "Original living note", subject: { kind: "person", key: "A" } }],
  });
  if (manual) await t.run(async ctx => { const note = (await ctx.db.query("notes").collect())[0]; await ctx.db.patch(note._id, { title: "Owner sensitive living title" }); });
  const snapshot = () => t.run(async ctx => ({ notes: await ctx.db.query("notes").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { notes: [{ key: "N", text: "New deceased text", subject: { kind: "person", key: "B" } }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `omitted-note-title-${manual}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("NOTE_SUBJECT_CONFLICT") })]);
    expect(await snapshot()).toEqual(before);
  }
  const b = await t.run(async ctx => (await ctx.db.query("persons").collect()).find(row => !row.living)!);
  const context = await t.query(internal.mcpFamilyHistory.getPersonNotes, { principal: principal(), personId: String(b._id) });
  expect(context.notes).toEqual([]);
  const sameSubject = await send(t, grant, job.importJobId, 2, { notes: [{ key: "N", text: "Refreshed living note", subject: { kind: "person", key: "A" } }] });
  expect(sameSubject.results).toEqual([expect.objectContaining({ status: "updated" })]);
  expect((await snapshot()).notes[0].title).toBe(before.notes[0].title);
});

test.each([false, true])("citation evidence refresh must explicitly support all imported and manual targets (%s)", async includeAll => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "S1", title: "Evidence A" }, { key: "S2", title: "Evidence B" }],
    persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })),
    citations: [{ key: "C", sourceKey: "S1", extractedText: "Excerpt about A", targets: [{ kind: "person", key: "A" }] }],
  });
  await t.run(async ctx => {
    const citation = (await ctx.db.query("citations").collect())[0];
    const a = (await ctx.db.query("persons").collect()).find(row => row.fsId === "A")!;
    await ctx.db.insert("citationLinks", { vaultOwnerId: OWNER, citationId: citation._id, targetType: "person", targetId: String(a._id), field: "notes", createdAt: 1 });
  });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { citations: [{ key: "C", sourceKey: "S2", extractedText: "Excerpt about B", targets: [...(includeAll ? [{ kind: "person" as const, key: "A" }, { kind: "person" as const, key: "A", field: "notes" }] : []), { kind: "person", key: "B" }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-target-reassertion-${includeAll}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts);
  if (includeAll) {
    expect(real.results).toEqual([expect.objectContaining({ status: "updated" })]);
    const after = await snapshot();
    expect(after.citations[0].extractedText).toBe("Excerpt about B");
    expect(after.citations[0].sourceId).not.toBe(before.citations[0].sourceId);
    expect(after.links).toHaveLength(3);
    expect(after.links).toEqual(expect.arrayContaining(before.links));
  } else {
    expect(real.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_TARGET_REVIEW_REQUIRED") })]);
    expect(await snapshot()).toEqual(before);
  }
});

test.each([0, 121])("citation attribution guards include planned links across chunks (padding %i)", { timeout: 300_000 }, async padding => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const batch: TreeImportBatch = {
    sources: [{ key: "S1", title: "Evidence A" }, { key: "S2", title: "Evidence B" }],
    persons: ["A", "B", ...Array.from({ length: padding }, (_, i) => `padding-${i}`)].map(key => ({ key, living: false, names: [{ given: key }] })),
    citations: [{ key: "C", sourceKey: "S1", extractedText: "About A", targets: [{ kind: "person", key: "A" }] }, { key: "C", sourceKey: "S2", extractedText: "About B", targets: [{ kind: "person", key: "B" }] }],
  };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-planned-attribution-${padding}`);
  expect(await countRows(t, "citations")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.counts.citations.created).toBe(1);
  expect(real.counts.citations.failed).toBe(1);
  expect(real.results.filter((row: any) => row.status === "failed")).toEqual([expect.objectContaining({ reason: expect.stringContaining("CITATION_TARGET_REVIEW_REQUIRED") })]);
  const citations = await t.run(ctx => ctx.db.query("citations").collect());
  expect(citations).toHaveLength(1);
  expect(citations[0].extractedText).toBe("About A");
  const links = await t.run(ctx => ctx.db.query("citationLinks").collect());
  expect(links).toHaveLength(1);
  const a = await t.run(async ctx => (await ctx.db.query("persons").collect()).find(row => row.fsId === "A")!);
  expect(links[0].targetId).toBe(String(a._id));
});

test("legacy FamilySearch sources use owner indexing beyond foreign records", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const sourceId = await t.run(async ctx => {
    const doc = { fsId: "S", title: "Original owned source", type: "other" as const, createdAt: 1, updatedAt: 1 };
    for (let i = 0; i < 12; i++) await ctx.db.insert("sources", { ...doc, vaultOwnerId: `user_foreign_${i}` });
    return ctx.db.insert("sources", { ...doc, vaultOwnerId: OWNER });
  });
  const foreign = await t.run(async ctx => (await ctx.db.query("sources").collect()).filter(row => row.vaultOwnerId !== OWNER));
  const job = await begin(t, grant);
  const batch: TreeImportBatch = { sources: [{ key: "S", title: "Incoming source" }], persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P" }] }] };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, "dry-owned-legacy-source");
  const real = await send(t, grant, job.importJobId, 0, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.results.filter((row: any) => row.status === "failed")).toEqual([]);
  expect(real.results.find((row: any) => row.kind === "sources")).toMatchObject({ id: String(sourceId), status: "linked", kept: expect.arrayContaining(["title"]) });
  expect(await countRows(t, "sources")).toBe(13);
  expect((await t.run(ctx => ctx.db.get(sourceId)))?.title).toBe("Original owned source");
  expect((await t.run(ctx => ctx.db.query("citations").collect()))[0].sourceId).toBe(sourceId);
  expect(await t.run(async ctx => (await ctx.db.query("sources").collect()).filter(row => row.vaultOwnerId !== OWNER))).toEqual(foreign);
});

test.each([false, true])("ambiguous legacy sources and conflicting mappings refuse without selecting an original (%s)", async mismapped => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "OTHER", title: "Other source" }], persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }] });
  await t.run(async ctx => {
    const other = (await ctx.db.query("sources").collect())[0];
    for (let i = 0; i < (mismapped ? 1 : 2); i++) await ctx.db.insert("sources", { vaultOwnerId: OWNER, fsId: "S", title: `Original S ${i}`, type: "other", createdAt: 1, updatedAt: 1 });
    if (mismapped) await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "source", externalKeyVersion: 2, recordKey: externalRecordKey("familysearch", "source", "S"), recordId: String(other._id), createdAt: 1, updatedAt: 1 });
  });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), keys: await ctx.db.query("mcpRecordKeys").collect(), citations: await ctx.db.query("citations").collect() }));
  const before = await snapshot();
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, { sources: [{ key: "S", title: "Incoming" }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P" }] }] }, { dryRun }, `ambiguous-source-${mismapped}-${dryRun}`);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((row: any) => row.status === "failed" && row.reason.includes(mismapped ? "LEGACY_IDENTITY_REVIEW_REQUIRED" : "AMBIGUOUS_SOURCE_IDENTITY"))).toBe(true);
    expect(await snapshot()).toEqual(before);
  }
});

test.each(["page", "extractedText", "confidence", "url", "accessDate", "notes"].flatMap(field => ["addTarget", "source"].map(mode => ({ field, mode }))))("citation attribution requires omitted evidence confirmation ($field/$mode)", async ({ field, mode }) => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const initial: NonNullable<TreeImportBatch["citations"]>[number] = {
    key: "C", sourceKey: "S1", page: "12", extractedText: "About A", quality: 1, url: "https://example.test/original", accessDate: "2026-01-01", notes: "Original A notes", targets: [{ kind: "person", key: "A" }],
  };
  await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "S1", title: "Source A" }, { key: "S2", title: "Source B" }], persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), citations: [initial],
  });
  const corrections: Record<string, unknown> = { page: "Corrected page A", extractedText: "Corrected evidence about A", confidence: "very_high", url: "https://example.test/corrected", accessDate: "2026-02-01", notes: "Corrected notes about A" };
  if (mode === "addTarget") await t.run(async ctx => { const citation = (await ctx.db.query("citations").collect())[0]; await ctx.db.patch(citation._id, { [field]: corrections[field] }); });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const inputKey = field === "confidence" ? "quality" : field;
  const partial: any = { ...initial, sourceKey: mode === "source" ? "S2" : "S1", targets: [{ kind: "person", key: mode === "addTarget" ? "B" : "A" }] };
  delete partial[inputKey];
  const dry = await send(t, grant, job.importJobId, 1, { citations: [partial] }, { dryRun: true }, `dry-omitted-evidence-${field}-${mode}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, { citations: [partial] });
  for (const result of [dry, real]) {
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_EVIDENCE_CONFIRMATION_REQUIRED") })]);
    expect(result.results[0].reason).toContain(field);
  }
  expect(dry.counts).toEqual(real.counts);
  expect(await snapshot()).toEqual(before);
  expect((await send(t, grant, job.importJobId, 1, { citations: [partial] })).deduplicated).toBe(true);
  expect(await snapshot()).toEqual(before);
  // The same partial record is still a valid replay of existing attribution.
  const repeat = await send(t, grant, job.importJobId, 2, { citations: [{ ...partial, sourceKey: "S1", targets: [{ kind: "person", key: "A" }] }] });
  expect(repeat.counts.citations.unchanged).toBe(1);
  expect(await snapshot()).toEqual(before);
  const confirmed: any = { ...initial, sourceKey: mode === "source" ? "S2" : "S1", targets: [{ kind: "person", key: "A" }, { kind: "person", key: "B" }, { kind: "person", key: "B" }] };
  if (mode === "addTarget") confirmed[inputKey] = field === "confidence" ? 3 : corrections[field];
  const accepted = await send(t, grant, job.importJobId, 3, { citations: [confirmed] });
  expect(accepted.results).toEqual([expect.objectContaining({ status: "updated" })]);
  const after = await snapshot();
  expect((after.citations[0] as any)[field]).toBe((before.citations[0] as any)[field]);
  expect(after.links).toHaveLength(2);
  expect(after.links).toEqual(expect.arrayContaining(before.links));
});

test.each([false, true])("partial source media and note refreshes preserve omitted fields (manual %s)", async manual => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "S", title: "Original source", type: "census" }], persons: ["P1", "P2"].map(key => ({ key, living: false, names: [{ given: key }] })),
    media: [{ key: "M", title: "Portrait", type: "photo", personKeys: ["P1"], sourceKey: "S" }],
    notes: [{ key: "N", text: "Original biography", noteType: "biography", subject: { kind: "person", key: "P1" } }],
  });
  if (manual) await t.run(async ctx => {
    const person = (await ctx.db.query("persons").collect()).find(row => row.fsId === "P2")!;
    const source = (await ctx.db.query("sources").collect())[0];
    const media = (await ctx.db.query("media").collect())[0];
    const note = (await ctx.db.query("notes").collect())[0];
    await ctx.db.patch(source._id, { type: "book" });
    await ctx.db.patch(media._id, { type: "scan", personIds: [person._id] });
    await ctx.db.patch(note._id, { noteType: "research" });
  });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), media: await ctx.db.query("media").collect(), notes: await ctx.db.query("notes").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { sources: [{ key: "S", title: "Corrected source title" }], media: [{ key: "M", title: "Corrected portrait title" }], notes: [{ key: "N", text: "Corrected biography text", subject: { kind: "person", key: "P1" } }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-omitted-defaults-${manual}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.results.every((row: any) => row.status === "updated" && !row.kept)).toBe(true);
  const after = await snapshot();
  expect(after.sources[0].type).toBe(before.sources[0].type);
  expect(after.media[0].type).toBe(before.media[0].type);
  expect(after.media[0].personIds).toEqual(before.media[0].personIds);
  expect(after.media[0].sourceId).toBe(before.media[0].sourceId);
  expect(after.media[0].privacyLevel).toBe("private");
  expect(after.notes[0].noteType).toBe(before.notes[0].noteType);
  if (!manual) {
    await send(t, grant, job.importJobId, 2, { media: [{ key: "M", title: "Corrected portrait title", type: "other", personKeys: [] }] });
    const cleared = (await snapshot()).media[0];
    expect(cleared.personIds).toEqual([]);
    expect(cleared.type).toBe("other");
    expect(cleared.sourceId).toBe(before.media[0].sourceId);
  }
});

test("creation defaults remain refreshable when later supplied explicitly", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "S", title: "Source" }], persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }], media: [{ key: "M", title: "Media" }], notes: [{ key: "N", text: "Note", subject: { kind: "person", key: "P" } }] });
  const initial = await t.run(async ctx => ({ source: (await ctx.db.query("sources").collect())[0], media: (await ctx.db.query("media").collect())[0], note: (await ctx.db.query("notes").collect())[0] }));
  expect(initial.source.type).toBe("other"); expect(initial.media.type).toBe("other"); expect(initial.media.personIds).toEqual([]); expect(initial.note.noteType).toBe("general");
  const result = await send(t, grant, job.importJobId, 1, { sources: [{ key: "S", title: "Source", type: "book" }], media: [{ key: "M", title: "Media", type: "photo", personKeys: ["P"] }], notes: [{ key: "N", text: "Note", noteType: "biography", subject: { kind: "person", key: "P" } }] });
  expect(result.results.every((row: any) => row.status === "updated" && !row.kept)).toBe(true);
  const after = await t.run(async ctx => ({ source: (await ctx.db.query("sources").collect())[0], media: (await ctx.db.query("media").collect())[0], note: (await ctx.db.query("notes").collect())[0] }));
  expect(after.source.type).toBe("book"); expect(after.media.type).toBe("photo"); expect(after.media.personIds).toHaveLength(1); expect(after.note.noteType).toBe("biography");
});

test.each([0, 245])("dry partial refreshes retain planned associations and types across chunks (padding %i)", { timeout: 300_000 }, async padding => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const batch: TreeImportBatch = {
    sources: [{ key: "S", title: "Source", type: "census" }, { key: "S", title: "Corrected source" }], persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }],
    media: [...Array.from({ length: padding }, (_, i) => ({ key: `padding-${i}`, title: `Padding ${i}` })), { key: "M", title: "Portrait", type: "photo", personKeys: ["P"], sourceKey: "S" }, { key: "M", title: "Corrected portrait" }],
    notes: [{ key: "N", text: "Original", noteType: "biography", subject: { kind: "person", key: "P" } }, { key: "N", text: "Corrected", subject: { kind: "person", key: "P" } }],
  };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-planned-defaults-${padding}`);
  expect(await countRows(t, "media")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.results.filter((row: any) => row.status === "failed")).toEqual([]);
  const stored = await t.run(async ctx => ({ source: (await ctx.db.query("sources").collect())[0], media: (await ctx.db.query("media").collect()).find(row => row.title === "Corrected portrait")!, note: (await ctx.db.query("notes").collect())[0] }));
  expect(stored.source.type).toBe("census"); expect(stored.media.type).toBe("photo"); expect(stored.media.personIds).toHaveLength(1); expect(stored.media.sourceId).toBe(stored.source._id); expect(stored.note.noteType).toBe("biography");
});

test.each([false, true])("imported default sex refreshes while actual manual edits remain protected (%s)", async manual => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Pat" }] };
  await send(t, grant, job.importJobId, 0, { persons: [person] });
  const id = await t.run(async ctx => {
    const row = (await ctx.db.query("persons").collect())[0];
    const mapping = (await ctx.db.query("mcpRecordKeys").collect()).find(key => key.recordType === "person")!;
    expect(row.sex).toBe("unknown");
    expect(JSON.parse(mapping.lastImportedJson!).sex).toBe("unknown");
    if (manual) await ctx.db.patch(row._id, { sex: "male" });
    return row._id;
  });
  const before = await t.run(ctx => ctx.db.get(id));
  const batch: TreeImportBatch = { persons: [{ ...person, sex: "female" }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-default-sex-${manual}`);
  expect(await t.run(ctx => ctx.db.get(id))).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts);
  expect((await t.run(ctx => ctx.db.get(id)))?.sex).toBe(manual ? "male" : "female");
  expect(real.results).toEqual([expect.objectContaining(manual ? { status: "unchanged", kept: ["sex"] } : { status: "updated" })]);
  if (!manual) {
    await t.run(ctx => ctx.db.patch(id, { sex: "unknown" }));
    const corrected = await send(t, grant, job.importJobId, 2, { persons: [{ ...person, sex: "male" }] });
    expect(corrected.results).toEqual([expect.objectContaining({ status: "unchanged", kept: ["sex"] })]);
    expect((await t.run(ctx => ctx.db.get(id)))?.sex).toBe("unknown");
  }
});

test.each([0, 124])("dry default sex baselines survive repeated new people across chunks (padding %i)", { timeout: 300_000 }, async padding => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Pat" }] };
  const batch: TreeImportBatch = { persons: [person, ...Array.from({ length: padding }, (_, i) => ({ key: `padding-${i}`, living: false, names: [{ given: `Padding${i}` }] })), { ...person, sex: "female" }] };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-planned-sex-${padding}`);
  expect(await countRows(t, "persons")).toBe(0);
  const real = await send(t, grant, job.importJobId, 0, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.counts.persons.created).toBe(padding + 1);
  expect(real.counts.persons.updated).toBe(1);
  expect(real.results.filter((row: any) => row.kept || row.status === "failed")).toEqual([]);
  const saved = await t.run(async ctx => (await ctx.db.query("persons").collect()).find(row => row.fsId === "P")!);
  expect(saved.sex).toBe("female");
});

test.each(["source", "target"])("retained human citation interpretation refuses new attribution (%s)", async mode => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "S1", title: "Source A" }, { key: "S2", title: "Source B" }], persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), citations: [{ key: "C", sourceKey: "S1", targets: [{ kind: "person", key: "A" }] }] });
  await t.run(async ctx => { const citation = (await ctx.db.query("citations").collect())[0]; await ctx.db.patch(citation._id, { editedText: "Interpretation about A from S1" }); });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { citations: [{ key: "C", sourceKey: mode === "source" ? "S2" : "S1", targets: [{ kind: "person", key: "A" }, ...(mode === "target" ? [{ kind: "person" as const, key: "B" }] : [])] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `interpretation-${mode}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_INTERPRETATION_REVIEW_REQUIRED") })]);
    expect(await snapshot()).toEqual(before);
  }
  const unchanged = await send(t, grant, job.importJobId, 2, { citations: [{ key: "C", sourceKey: "S1", targets: [{ kind: "person", key: "A" }] }] });
  expect(unchanged.counts.citations.unchanged).toBe(1);
  expect(await snapshot()).toEqual(before);
});

test("an interrupted import reserves its operation across jobs tools chunks and finalization", { timeout: 300_000 }, async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const a = await begin(t, grant, "reservation-A");
  const b = await begin(t, grant, "reservation-B");
  const operationId = "reserved-operation";
  const requestHash = `hash-${operationId}`;
  const batch: TreeImportBatch = { persons: Array.from({ length: 126 }, (_, i) => ({ key: `P${i}`, living: false, names: [{ given: `Synthetic${i}` }] })) };
  const preparation = { principal: principal(), grantId: grant, importJobId: a.importJobId, operationId, requestHash, batchIndex: 0, dryRun: false };
  const chunk = { principal: principal(), grantId: grant, importJobId: a.importJobId, operationId: `${operationId}#0`, batchOperationId: operationId, batchRequestHash: requestHash, batchIndex: 0, chunkIndex: 0, requestHash: `${requestHash}#0`, items: chunkBatch(batch)[0] };
  await expect(t.mutation(internal.treeImport.applyTreeImportChunk, chunk)).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await t.mutation(internal.treeImport.prepareTreeImportBatch, preparation);
  await t.mutation(internal.treeImport.applyTreeImportChunk, chunk);
  // Model an interruption after chunk commit, before recording the batch.
  expect(await countRows(t, "persons")).toBe(125);
  const reservation = await t.run(async ctx => (await ctx.db.query("mcpOperations").collect()).find(row => row.operationId === operationId)!);
  expect(reservation.pendingImport).toEqual({ importJobId: a.importJobId, batchIndex: 0 });
  await expect(send(t, grant, b.importJobId, 0, { persons: [{ key: "FOREIGN-JOB", living: false, names: [{ given: "Different job" }] }] }, {}, operationId)).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await expect(t.mutation(internal.treeImport.prepareTreeImportBatch, { ...preparation, requestHash: "different-hash" })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await expect(t.mutation(internal.treeImport.prepareTreeImportBatch, { ...preparation, batchIndex: 1 })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await expect(t.mutation(internal.treeImport.applyTreeImportChunk, { ...chunk, importJobId: b.importJobId })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await expect(t.mutation(internal.treeImport.recordTreeImportBatch, { principal: principal(), grantId: grant, importJobId: b.importJobId, operationId, requestHash, batchIndex: 0, records: 1, results: [], duplicatesSuggested: 0, final: false })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await expect(t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId, requestHash, input: { importKey: "other-tool", system: "familysearch", label: "Different work" } })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  expect(await countRows(t, "persons")).toBe(125);
  const resumed = await send(t, grant, a.importJobId, 0, batch, {}, operationId);
  expect(resumed.counts.persons.created).toBe(126);
  expect(await countRows(t, "persons")).toBe(126);
  const progress = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: a.importJobId }) as any;
  expect(progress.import.nextBatchIndex).toBe(1);
  expect(progress.import.recordsReceived).toBe(126);
  const receipts = await t.run(async ctx => (await ctx.db.query("mcpOperations").collect()).filter(row => row.operationId === operationId));
  expect(receipts).toHaveLength(1); expect(receipts[0].pendingImport).toBeUndefined();
  expect((await send(t, grant, a.importJobId, 0, batch, {}, operationId)).deduplicated).toBe(true);
  await expect(send(t, grant, b.importJobId, 0, batch, {}, operationId)).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  expect((await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: a.importJobId }) as any).import.recordsReceived).toBe(126);
});

test.each([false, true])("older unreserved chunk receipts retain their original operation identity (legacy %s)", async legacy => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const a = await begin(t, grant, "orphan-A"); const b = await begin(t, grant, "orphan-B");
  await send(t, grant, a.importJobId, 0, { sources: [{ key: "S", title: "Committed source" }] });
  const source = await t.run(async ctx => (await ctx.db.query("sources").collect())[0]);
  const operationId = `older-orphan-${legacy}`; const requestHash = `hash-${operationId}`;
  const resultJson = JSON.stringify({ importJobId: a.importJobId, results: [{ kind: "sources", index: 0, key: "S", id: source._id, status: "unchanged" }], plannedKeys: [], duplicatesSuggested: 0 });
  await t.run(async ctx => {
    if (legacy) await ctx.db.insert("mcpOperations", { vaultOwnerId: OWNER, operationId: `${operationId}#0`, toolName: "family_history_import_tree_batch#chunk", requestHash: `${requestHash}#0`, resultJson, clientId: principal().clientId, createdAt: 1 });
    else await ctx.db.insert("treeImportReceipts", { vaultOwnerId: OWNER, importJobId: a.importJobId as any, operationId, chunkIndex: 0, detailIndex: -1, requestHash: `${requestHash}#0`, resultJson, createdAt: 1 });
  });
  await expect(send(t, grant, b.importJobId, 0, { sources: [{ key: "B", title: "Different source" }] }, {}, operationId)).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  const resumed = await send(t, grant, a.importJobId, 1, { sources: [{ key: "S", title: "Committed source" }] }, {}, operationId);
  expect(resumed.counts.sources.unchanged).toBe(1);
  expect(await countRows(t, "sources")).toBe(1);
  expect(await t.run(ctx => ctx.db.get(source._id))).toEqual(source);
});

test("dry imports leave the operation namespace unreserved", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const before = await t.run(ctx => ctx.db.query("mcpOperations").collect());
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }] }, { dryRun: true }, "dry-reservation");
  expect(await t.run(ctx => ctx.db.query("mcpOperations").collect())).toEqual(before);
  expect(await countRows(t, "persons")).toBe(0);
  expect(await countRows(t, "treeImportReceipts")).toBe(0);
});

test.each(["birth", "death"].flatMap(type => [false, true].map(manual => ({ type, manual }))))("nested fact refresh preserves omitted fields and manual siblings ($type/$manual)", async ({ type, manual }) => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Synthetic" }] };
  await send(t, grant, job.importJobId, 0, { persons: [{ ...person, facts: [{ key: "F", type, date: { original: "1900" }, place: { original: "London" }, value: "Original value", description: "Original detail" }] }] });
  if (manual) await t.run(async ctx => {
    const p = (await ctx.db.query("persons").collect())[0]; const event = (await ctx.db.query("events").collect())[0];
    await ctx.db.patch(p._id, { [type]: { ...(p as any)[type], place: { original: "Owner corrected place" } } });
    await ctx.db.patch(event._id, { place: { original: "Owner corrected place" }, importedFact: { ...event.importedFact!, place: { original: "Owner corrected place" } } });
  });
  const snapshot = () => t.run(async ctx => ({ person: (await ctx.db.query("persons").collect())[0], event: (await ctx.db.query("events").collect())[0] }));
  const before = await snapshot();
  const batch: TreeImportBatch = { persons: [{ ...person, facts: [{ key: "F", type, date: { original: "1901" } }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-partial-${type}-${manual}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts);
  expect(real.results).toEqual([expect.objectContaining({ status: "updated" })]);
  let after = await snapshot(); const place = manual ? "Owner corrected place" : "London";
  expect((after.person as any)[type]).toMatchObject({ date: { original: "1901", year: 1901 }, place: { original: place }, description: "Original value. Original detail" });
  expect(after.event).toMatchObject({ date: { original: "1901", year: 1901 }, place: { original: place }, description: "Original value. Original detail", importedFact: { key: "F", type, date: { original: "1901" }, place: { original: place }, value: "Original value", description: "Original detail" } });
  await send(t, grant, job.importJobId, 2, { persons: [{ ...person, facts: [{ key: "F", type, value: "Updated value" }] }] });
  after = await snapshot();
  expect((after.person as any)[type]).toMatchObject({ date: { original: "1901" }, place: { original: place }, description: "Updated value. Original detail" });
  expect(after.event.description).toBe("Updated value. Original detail");
  expect(after.event.importedFact).toMatchObject({ date: { original: "1901" }, place: { original: place }, value: "Updated value", description: "Original detail" });
  const replacement = await send(t, grant, job.importJobId, 3, { persons: [{ ...person, facts: [{ key: "F", type, place: { original: "New York" } }] }] });
  after = await snapshot();
  expect((after.person as any)[type].place.original).toBe(manual ? place : "New York");
  expect(after.event.place?.original).toBe(manual ? place : "New York");
  expect(after.event.importedFact?.place?.original).toBe(manual ? place : "New York");
  if (manual) expect(replacement.results[0].kept).toEqual(expect.arrayContaining([type, "facts:P/F:place", "facts:P/F:importedFact"]));
});

test("nested refresh does not combine a changed place label with a retained linked identity", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Synthetic" }] };
  await send(t, grant, job.importJobId, 0, { persons: [{ ...person, facts: [{ key: "B", type: "birth", place: { original: "London" } }] }] });
  const placeId = await t.run(async ctx => {
    const id = await ctx.db.insert("places", { vaultOwnerId: OWNER, name: "London", fullName: "London, England", type: "city", createdAt: 1, updatedAt: 1 });
    const p = (await ctx.db.query("persons").collect())[0]; const e = (await ctx.db.query("events").collect())[0];
    await ctx.db.patch(p._id, { birth: { ...p.birth, place: { original: "London", placeId: id } } }); await ctx.db.patch(e._id, { place: { original: "London", placeId: id } }); return id;
  });
  const result = await send(t, grant, job.importJobId, 1, { persons: [{ ...person, facts: [{ key: "B", type: "birth", place: { original: "Paris" } }] }] });
  expect(result.results[0].kept).toEqual(expect.arrayContaining(["birth", "facts:P/B:place"]));
  const stored = await t.run(async ctx => ({ person: (await ctx.db.query("persons").collect())[0], event: (await ctx.db.query("events").collect())[0] }));
  expect(stored.person.birth?.place).toEqual({ original: "London", placeId }); expect(stored.event.place).toEqual({ original: "London", placeId });
});

test.each([false, true])("one person refuses conflicting duplicate fact identities and deduplicates identical assertions (%s)", async identical => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const fact = { key: "B", type: "birth", value: "First", description: "Original" };
  const result = await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }], facts: [fact, { ...fact, value: identical ? "First" : "Second" }] }] });
  if (identical) { expect(result.results[0].status).toBe("created"); expect(await countRows(t, "events")).toBe(1); }
  else { expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("AMBIGUOUS_FACT_IDENTITY") })]); expect(await countRows(t, "persons")).toBe(0); expect(await countRows(t, "events")).toBe(0); }
});

test("changed date text requires compatible retained structured metadata", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Synthetic" }] };
  await send(t, grant, job.importJobId, 0, { persons: [{ ...person, facts: [{ key: "B", type: "birth", date: { original: "between 1900 and 1905", year: 1900, formal: "+1900/+1905", range: true } }] }] });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const partial: TreeImportBatch = { persons: [{ ...person, facts: [{ key: "B", type: "birth", date: { original: "1901" } }] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, partial, { dryRun }, `structured-date-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_DATE_CONFIRMATION_REQUIRED") })]);
    expect(await snapshot()).toEqual(before);
  }
  const complete = { original: "1901", year: 1901, formal: "+1901", range: false };
  const accepted = await send(t, grant, job.importJobId, 2, { persons: [{ ...person, facts: [{ key: "B", type: "birth", date: complete }] }] });
  expect(accepted.results[0].status).toBe("updated");
  const after = await snapshot();
  expect(after.people[0].birth?.date).toEqual(complete); expect(after.events[0].date).toEqual(complete); expect(after.events[0].importedFact?.date).toEqual(complete);
});

test("unparseable date corrections cannot retain an old inferred birth year", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Synthetic" }] };
  await send(t, grant, job.importJobId, 0, { persons: [{ ...person, facts: [{ key: "B", type: "birth", date: { original: "1900" } }] }] });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, { persons: [{ ...person, facts: [{ key: "B", type: "birth", date: { original: "unknown" } }] }] }, { dryRun }, `unknown-date-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_DATE_CONFIRMATION_REQUIRED") })]);
    expect(await snapshot()).toEqual(before);
  }
  const corrected = await send(t, grant, job.importJobId, 2, { persons: [{ ...person, facts: [{ key: "B", type: "birth", date: { original: "1901" } }] }] });
  expect(corrected.results[0].status).toBe("updated");
  const after = await snapshot();
  expect(after.people[0].birth?.date).toEqual({ original: "1901", year: 1901 }); expect(after.events[0].date).toEqual({ original: "1901", year: 1901 }); expect(after.events[0].importedFact?.date).toEqual({ original: "1901" });
});

test.each([false, true])("partial relationship facts retain omitted fields and unmentioned facts (%s)", async manual => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts: [{ type: "marriage", date: { original: "1900" }, place: { original: "London" }, description: "Original detail" }, { type: "divorce", date: { original: "1950" }, description: "Original divorce" }] }] });
  if (manual) await t.run(async ctx => { const row = (await ctx.db.query("relationships").collect())[0]; await ctx.db.patch(row._id, { facts: row.facts!.map(fact => fact.type === "marriage" ? { ...fact, place: { original: "Owner place" } } : fact) }); });
  const snapshot = () => t.run(async ctx => ({ rows: await ctx.db.query("relationships").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { relationships: [{ ...relation, facts: [{ type: "marriage", description: "Corrected detail" }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-partial-relation-${manual}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts); expect(real.results).toEqual([expect.objectContaining({ status: "updated" })]);
  let stored = (await snapshot()).rows[0];
  expect(stored.facts).toHaveLength(2);
  expect(stored.facts![0]).toMatchObject({ type: "marriage", date: { original: "1900", year: 1900 }, place: { original: manual ? "Owner place" : "London" }, description: "Corrected detail" });
  expect(stored.facts![1]).toEqual(before.rows[0].facts![1]);
  const next = await send(t, grant, job.importJobId, 2, { relationships: [{ ...relation, facts: [{ type: "marriage", place: { original: "Paris" } }] }] });
  stored = (await snapshot()).rows[0];
  expect(stored.facts![0].place?.original).toBe(manual ? "Owner place" : "Paris");
  expect(stored.facts![0].date?.original).toBe("1900");
  if (manual) expect(next.results[0].kept).toContain("facts");
});

test("ambiguous relationship fact types refuse partial replacement and allow exact replay", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  const facts = ["1900", "1910"].map(original => ({ type: "marriage", date: { original }, place: { original: "London" }, description: original }));
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts }] });
  const before = await t.run(ctx => ctx.db.query("relationships").collect());
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, { relationships: [{ ...relation, facts: [{ type: "marriage", description: "Which marriage?" }] }] }, { dryRun }, `ambiguous-relation-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("RELATIONSHIP_FACT_REVIEW_REQUIRED") })]);
    expect(await t.run(ctx => ctx.db.query("relationships").collect())).toEqual(before);
  }
  const repeat = await send(t, grant, job.importJobId, 2, { relationships: [{ ...relation, facts }] });
  expect(repeat.counts.relationships.unchanged).toBe(1);
});

test("partial relationship refresh does not restore a manually deleted fact", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B", facts: [{ type: "marriage", date: { original: "1900" }, description: "Original" }] };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [relation] });
  await t.run(async ctx => { const row = (await ctx.db.query("relationships").collect())[0]; await ctx.db.patch(row._id, { facts: [] }); });
  const result = await send(t, grant, job.importJobId, 1, { relationships: [relation] });
  expect(result.results).toEqual([expect.objectContaining({ status: "unchanged", kept: ["facts"] })]);
  expect((await t.run(ctx => ctx.db.query("relationships").collect()))[0].facts).toEqual([]);
});

test.each([false, true])("retained relationship facts cannot acquire changed or conflicting endpoints (%s)", async manual => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  const facts = [{ type: "marriage", date: { original: "1900" }, place: { original: "London" }, description: "Original A-B" }];
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B", "C"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts }] });
  if (manual) await t.run(async ctx => { const row = (await ctx.db.query("relationships").collect())[0]; const c = (await ctx.db.query("persons").collect()).find(p => p.fsId === "C")!; await ctx.db.patch(row._id, { person2: c._id }); });
  const snapshot = () => t.run(async ctx => ({ rows: await ctx.db.query("relationships").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const partial = { ...relation, person2Key: manual ? "B" : "C", facts: [{ type: "marriage", description: "Changed relationship" }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, { relationships: [partial] }, { dryRun }, `relation-attribution-${manual}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("RELATIONSHIP_FACT_REVIEW_REQUIRED") })]);
    expect(await snapshot()).toEqual(before);
  }
  const confirmed = await send(t, grant, job.importJobId, 2, { relationships: [{ ...relation, person2Key: "C", facts: [{ ...facts[0], description: "Confirmed A-C" }] }] });
  expect(confirmed.results[0].status).toBe("updated");
  expect((await snapshot()).rows[0].facts![0].description).toBe("Confirmed A-C");
});

test.each(["birth", "death"])("partial %s dates retain an explicit effective year instead of reinferring", async type => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Synthetic", surname: "Range" }] };
  const original = "Winter 1899-1900";
  await send(t, grant, job.importJobId, 0, { persons: [{ ...person, facts: [{ key: "F", type, date: { original, year: 1900 } }] }] });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  const before = await snapshot();
  const batch: TreeImportBatch = { persons: [{ ...person, facts: [{ key: "F", type, date: { original } }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-effective-year-${type}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts); expect(real.counts.persons.unchanged).toBe(1);
  expect(await snapshot()).toEqual(before);
  expect((before.people[0] as any)[type].date.year).toBe(1900); expect(before.events[0].date?.year).toBe(1900); expect(before.events[0].importedFact?.date?.year).toBe(1900);
  if (type === "birth") {
    expect(await t.run(ctx => ctx.db.query("persons").withIndex("by_owner_surname_birth_year", q => q.eq("vaultOwnerId", OWNER).eq("name.surname", "Range").eq("birth.date.year", 1900)).collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("persons").withIndex("by_owner_surname_birth_year", q => q.eq("vaultOwnerId", OWNER).eq("name.surname", "Range").eq("birth.date.year", 1899)).collect())).toHaveLength(0);
  }
  const corrected = await send(t, grant, job.importJobId, 2, { persons: [{ ...person, facts: [{ key: "F", type, date: { original, year: 1899 } }] }] });
  expect(corrected.results[0].status).toBe("updated");
  const after = await snapshot(); expect((after.people[0] as any)[type].date.year).toBe(1899); expect(after.events[0].date?.year).toBe(1899); expect(after.events[0].importedFact?.date?.year).toBe(1899);
});

test.each([false, true])("relationship partial dates preserve effective and manual years (%s)", async manual => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" }; const original = "Winter 1899-1900";
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts: [{ type: "marriage", date: { original, year: 1900 }, description: "Original" }] }] });
  if (manual) await t.run(async ctx => { const r = (await ctx.db.query("relationships").collect())[0]; await ctx.db.patch(r._id, { facts: [{ ...r.facts![0], date: { original, year: 1901 } }] }); });
  const snapshot = () => t.run(ctx => ctx.db.query("relationships").collect()); const before = await snapshot();
  const batch: TreeImportBatch = { relationships: [{ ...relation, facts: [{ type: "marriage", date: { original }, description: "Corrected detail" }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-relation-effective-year-${manual}`);
  expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts);
  expect(real.results).toEqual([expect.objectContaining({ status: "updated" })]); expect(real.results[0].kept).toBeUndefined();
  expect((await snapshot())[0].facts![0]).toMatchObject({ date: { original, year: manual ? 1901 : 1900 }, description: "Corrected detail" });
  const explicit = await send(t, grant, job.importJobId, 2, { relationships: [{ ...relation, facts: [{ type: "marriage", date: { original, year: 1899 } }] }] });
  expect((await snapshot())[0].facts![0].date?.year).toBe(manual ? 1901 : 1899);
  if (manual) expect(explicit.results[0].kept).toContain("facts");
});

test.each(["year", "month", "day", "formal", "range", "approximate"])("relationship date text changes require retained %s before inference", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  const oldDate = { original: "1 January 1900", year: 1900, month: 1, day: 1, formal: "+1900-01-01", range: false, approximate: false };
  const newDate = { original: "2 February 1901", year: 1901, month: 2, day: 2, formal: "+1901-02-02", range: false, approximate: false };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts: [{ type: "marriage", date: oldDate, description: "Detail" }] }] });
  const snapshot = () => t.run(async ctx => ({ relationships: await ctx.db.query("relationships").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const partial: any = { ...newDate }; delete partial[field];
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, { relationships: [{ ...relation, facts: [{ type: "marriage", date: partial }] }] }, { dryRun }, `relation-date-confirm-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_DATE_CONFIRMATION_REQUIRED") })]);
    expect(await snapshot()).toEqual(before);
  }
  const accepted = await send(t, grant, job.importJobId, 2, { relationships: [{ ...relation, facts: [{ type: "marriage", date: newDate }] }] });
  expect(accepted.results[0].status).toBe("updated"); expect((await snapshot()).relationships[0].facts![0].date).toEqual(newDate);
});

test("citation link additions report updated, dry planning agrees, repeated targets stay idempotent", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    sources: [{ key: "S", title: "Synthetic" }], persons: ["P1", "P2"].map(key => ({ key, living: false, names: [{ given: key }] })),
    citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P1" }] }],
  });
  const citation: NonNullable<TreeImportBatch["citations"]>[number] = { key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P1" }, { kind: "person", key: "P2" }] };
  const batch: TreeImportBatch = { citations: [citation, citation] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-citation-links");
  expect(await countRows(t, "citationLinks")).toBe(1);
  const real = await send(t, grant, job.importJobId, 1, batch, {}, "real-citation-links");
  expect(dry.counts.citations).toEqual(real.counts.citations);
  expect(real.counts.citations.updated).toBe(1);
  expect(real.counts.citations.unchanged).toBe(1);
  expect(real.results).toEqual([expect.objectContaining({ kind: "citations", key: "C", status: "updated", keyOrigin: "explicit" })]);
  expect(await countRows(t, "citationLinks")).toBe(2);
  const again = await send(t, grant, job.importJobId, 2, batch);
  expect(again.results).toEqual([]);
  expect(await countRows(t, "citationLinks")).toBe(2);
});


test("relationship inferred years follow ordinary text-only corrections and resume", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts: [{ type: "marriage", date: { original: "1900" } }] }] });
  const snapshot = () => t.run(async ctx => ({ rows: await ctx.db.query("relationships").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() }));
  for (const [index, original] of ["1901", "1902"].entries()) {
    const before = await snapshot(); const batch: TreeImportBatch = { relationships: [{ ...relation, facts: [{ type: "marriage", date: { original } }] }] };
    const dry = await send(t, grant, job.importJobId, index + 1, batch, { dryRun: true }, `dry-inferred-relation-${original}`);
    expect(await snapshot()).toEqual(before);
    const result = await send(t, grant, job.importJobId, index + 1, batch);
    expect(dry.counts).toEqual(result.counts); expect(result.results).toEqual([expect.objectContaining({ status: "updated" })]); expect(result.results[0].kept).toBeUndefined();
    const after = await snapshot(); expect(after.rows[0].facts![0].date).toEqual({ original, year: Number(original) });
    const mapping = after.keys.find(row => row.recordType === "relationship")!;
    expect(JSON.parse(mapping.lastImportedJson!)._relationshipInferredYears).toEqual([{ type: "marriage", original, year: Number(original) }]);
    expect(await send(t, grant, job.importJobId, index + 1, batch)).toEqual({ ...result, deduplicated: true }); expect(await snapshot()).toEqual(after);
  }
  const before = await snapshot();
  for (const dryRun of [true, false]) {
    const refused = await send(t, grant, job.importJobId, 3, { relationships: [{ ...relation, facts: [{ type: "marriage", date: { original: "unknown" } }] }] }, { dryRun }, `unparseable-relation-${dryRun}`);
    expect(refused.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_DATE_CONFIRMATION_REQUIRED") })]); expect(await snapshot()).toEqual(before);
  }
});

test("relationship inferred-year provenance survives planning chunks", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })) });
  const batch: TreeImportBatch = { relationships: Array.from({ length: 126 }, (_, i) => ({ key: "R", type: "Couple", person1Key: "A", person2Key: "B", facts: [{ type: "marriage", date: { original: String(1900 + i) } }] })) };
  expect(chunkBatch(batch)).toHaveLength(2);
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-inferred-relation-chunks");
  expect(await countRows(t, "relationships")).toBe(0);
  const result = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(result.counts); expect(result.counts.relationships).toMatchObject({ created: 1, updated: 125, failed: 0 });
  expect((await t.run(ctx => ctx.db.query("relationships").collect()))[0].facts![0].date).toEqual({ original: "2025", year: 2025 });
});

test.each(["explicit", "manual", "legacy", "confirmed"])("relationship text-only corrections protect %s years", async mode => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ ...relation, facts: [{ type: "marriage", date: { original: "1900", ...(mode === "explicit" ? { year: 1900 } : {}) } }] }] });
  if (mode === "manual") await t.run(async ctx => { const row = (await ctx.db.query("relationships").collect())[0]; await ctx.db.patch(row._id, { facts: [{ ...row.facts![0], date: { original: "1900", year: 1899 } }] }); });
  if (mode === "legacy") await t.run(async ctx => { const mapping = (await ctx.db.query("mcpRecordKeys").collect()).find(row => row.recordType === "relationship")!; const baseline = JSON.parse(mapping.lastImportedJson!); delete baseline._relationshipInferredYears; await ctx.db.patch(mapping._id, { lastImportedJson: JSON.stringify(baseline) }); });
  if (mode === "confirmed") {
    const confirmed = await send(t, grant, job.importJobId, 1, { relationships: [{ ...relation, facts: [{ type: "marriage", date: { original: "1900", year: 1900 } }] }] });
    expect(confirmed.counts.relationships.unchanged).toBe(1);
    const mapping = (await t.run(ctx => ctx.db.query("mcpRecordKeys").collect())).find(row => row.recordType === "relationship")!;
    expect(JSON.parse(mapping.lastImportedJson!)._relationshipInferredYears).toEqual([]);
  }
  const snapshot = () => t.run(async ctx => ({ rows: await ctx.db.query("relationships").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, { relationships: [{ ...relation, facts: [{ type: "marriage", date: { original: "1901" } }] }] }, { dryRun }, `protected-relation-year-${mode}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_DATE_CONFIRMATION_REQUIRED") })]); expect(await snapshot()).toEqual(before);
  }
});

test.each([false, true])("legacy relationship writers round-trip imported date range %s", async range => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ key: "R", type: "Couple", person1Key: "A", person2Key: "B", facts: [{ type: "marriage", date: { original: "between 1900 and 1905", range }, description: "Original" }] }] });
  const row = (await t.run(ctx => ctx.db.query("relationships").collect()))[0];
  await t.mutation(internal.relationships.updateFacts, { id: row._id, facts: row.facts!.map(fact => ({ ...fact, description: "Corrected detail" })) });
  const updated = await t.run(ctx => ctx.db.get(row._id)); expect(updated!.facts![0]).toEqual({ ...row.facts![0], description: "Corrected detail" });
  const copy = await t.mutation(internal.relationships.createCouple, { person1Id: row.person1, person2Id: row.person2, facts: updated!.facts });
  expect((await t.run(ctx => ctx.db.get(copy)))!.facts).toEqual(updated!.facts);
  // Internal synthetic writer compatibility only, never end-user authorization proof.
});


test.each(["type", "title", "description", "url", "mimeType", "date", "personKeys", "sourceKey"])("reviewed media refuses changed %s without transferring approval", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const media = { key: "M", title: "Original", type: "photo" as const, description: "Original description", url: "https://example.test/a", mimeType: "image/jpeg", date: "1900", personKeys: ["A"], sourceKey: "S1" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: ["S1", "S2"].map(key => ({ key, title: key })), media: [media] });
  const id = (await t.run(ctx => ctx.db.query("media").collect()))[0]._id;
  // Synthetic owner identity through the real review writer, never admin/user runtime proof.
  await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.reviewMedia, { vaultOwnerId: OWNER, mediaId: id, reviewStatus: "reviewed", privacyLevel: "family_review", rightsStatus: "owned", aiUseAllowed: true, privacyReviewNote: "Synthetic owner decision for original content only" });
  const snapshot = () => t.run(async ctx => ({ media: await ctx.db.query("media").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  expect(isContextPackEligibleMedia(before.media[0])).toBe(true);
  const noop = await send(t, grant, job.importJobId, 1, { media: [media] }); expect(noop.counts.media.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const replacements: Record<string, any> = { type: "document", title: "Replacement", description: "Replacement description", url: "https://example.test/b", mimeType: "application/pdf", date: "1901", personKeys: ["B"], sourceKey: "S2" };
  const batch: TreeImportBatch = { media: [{ ...media, [field]: replacements[field] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, batch, { dryRun }, `reviewed-media-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("MEDIA_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, batch, { dryRun }, `reviewed-media-${field}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true });
    expect(isContextPackEligibleMedia((await snapshot()).media[0])).toBe(true); // Original approved assertion, unchanged.
  }
});

test("unreviewed private media refresh remains ineligible and matches dry planning", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { media: [{ key: "M", title: "Original", url: "https://example.test/a" }] });
  const before = await t.run(ctx => ctx.db.query("media").collect());
  const batch: TreeImportBatch = { media: [{ key: "M", title: "Replacement", url: "https://example.test/b", description: "Unreviewed replacement" }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-private-media-refresh"); expect(await t.run(ctx => ctx.db.query("media").collect())).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts); expect(real.counts.media.updated).toBe(1);
  const row = (await t.run(ctx => ctx.db.query("media").collect()))[0]; expect(row).toMatchObject({ title: "Replacement", url: "https://example.test/b", privacyLevel: "private", reviewStatus: "unreviewed", rightsStatus: "unknown", aiUseAllowed: false }); expect(isContextPackEligibleMedia(row)).toBe(false);
});

test.each(["person", "relationship", "fact", "media", "source", "citation", "note"].flatMap(kind => ["deleted", "foreign"].map(mode => ({ kind, mode }))))("stale $kind mappings cannot authorize $mode targets", async ({ kind, mode }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, {
    persons: [{ key: "A", living: false, names: [{ given: "A" }], facts: [{ key: "F", type: "birth", date: { original: "1900" } }] }, { key: "B", living: false, names: [{ given: "B" }] }],
    sources: ["S", "T"].map(key => ({ key, title: key })), relationships: [{ key: "R", type: "Couple", person1Key: "A", person2Key: "B" }],
    media: [{ key: "M", title: "Original", personKeys: ["B"] }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "B" }] }], notes: [{ key: "N", subject: { kind: "person", key: "B" }, text: "Original" }],
  });
  const table: Record<string, string> = { person: "persons", relationship: "relationships", fact: "events", media: "media", source: "sources", citation: "citations", note: "notes" };
  const targetId: any = await t.run(async ctx => { const rows = await (ctx.db as any).query(table[kind]).collect(); return (kind === "person" ? rows.find((row: any) => row.fsId === "A") : kind === "source" ? rows.find((row: any) => row.fsId === "T") : rows[0])._id; });
  if (mode === "deleted" && kind === "person") await t.mutation(internal.persons.remove, { id: targetId });
  else await t.run(async ctx => { if (mode === "deleted") await ctx.db.delete(targetId); else await ctx.db.patch(targetId, { vaultOwnerId: "user_other_synthetic_owner" }); });
  const snapshot = () => t.run(async ctx => { const saved: Record<string, any> = {}; for (const name of [...Object.values(table), "mcpRecordKeys", "citationLinks", "personEvents"]) saved[name] = await (ctx.db as any).query(name).collect(); return saved; }); const before = await snapshot();
  const keys: Record<string, string> = { person: "A", relationship: "R", fact: "F", media: "M", source: "T", citation: "C", note: "N" };
  const target: any = { kind, key: keys[kind], ...(kind === "fact" ? { personKey: "A", keyOrigin: "explicit" } : kind === "citation" ? { keyOrigin: "explicit" } : {}) };
  const batch: TreeImportBatch = {};
  if (kind !== "note") batch.notes = [{ key: "N2", subject: target, text: "Must not attach" }];
  if (kind !== "source" && kind !== "citation") batch.citations = [{ key: "C2", sourceKey: "S", targets: [target] }];
  if (kind === "person") { batch.relationships = [{ key: "R2", type: "Couple", person1Key: "A", person2Key: "B" }]; batch.media = [{ key: "M2", title: "Must not attach", personKeys: ["A"] }]; }
  if (kind === "source") { batch.media = [{ key: "M2", title: "Must not attach", sourceKey: "T" }]; batch.citations = [{ key: "C2", sourceKey: "T", targets: [{ kind: "person", key: "B" }] }]; }
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `stale-target-${kind}-${mode}-${dryRun}`);
    expect(result.results.length).toBeGreaterThan(0); expect(result.results.every((row: any) => row.status === "failed" && /MISSING_PERSON|MISSING_TARGET|MISSING_SOURCE|LEGACY_IDENTITY_REVIEW_REQUIRED/.test(row.reason))).toBe(true);
    expect(await snapshot()).toEqual(before); expect(await send(t, grant, job.importJobId, 1, batch, { dryRun }, `stale-target-${kind}-${mode}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});


test.each(["primary", "alias", "relationship", "media", "citation", "note", "factCitation", "factNote"])("corrected FamilySearch PID cannot receive old-PID material through %s", async route => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "A", living: false, names: [{ given: "Original A" }], facts: [{ key: "F", type: "occupation", description: "Original assertion" }] }, { key: "OTHER", living: false, names: [{ given: "Other" }] }], sources: [{ key: "S", title: "Original source" }] });
  const person = (await t.run(ctx => ctx.db.query("persons").collect())).find(row => row.fsId === "A")!;
  await t.mutation(internal.persons.update, { id: person._id, fsId: "B" }); // Synthetic existing writer, not live user proof.
  const snapshot = () => t.run(async ctx => { const saved: Record<string, any> = {}; for (const table of ["persons", "events", "personEvents", "mcpRecordKeys", "relationships", "media", "citations", "citationLinks", "notes"]) saved[table] = await (ctx.db as any).query(table).collect(); return saved; }); const before = await snapshot();
  const target: any = route.startsWith("fact") ? { kind: "fact", personKey: "A", key: "F", keyOrigin: "explicit" } : { kind: "person", key: "A" };
  const batch: TreeImportBatch = route === "primary" || route === "alias" ? { persons: [{ key: route === "primary" ? "A" : "NEW", living: false, names: [{ given: "Incoming" }], ...(route === "alias" ? { otherIds: [{ system: "familysearch", id: "A" }] } : {}), facts: [{ key: "NEW-F", type: "occupation", description: "Must not attach" }] }] }
    : route === "relationship" ? { relationships: [{ key: "R", type: "Couple", person1Key: "A", person2Key: "OTHER" }] }
    : route === "media" ? { media: [{ key: "M", title: "Must not attach", personKeys: ["A"] }] }
    : route === "citation" || route === "factCitation" ? { citations: [{ key: "C", sourceKey: "S", targets: [target] }] }
    : { notes: [{ key: "N", text: "Must not attach", subject: target }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `corrected-pid-${route}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("LEGACY_IDENTITY_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 1, batch, { dryRun }, `corrected-pid-${route}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
  const correct = await send(t, grant, job.importJobId, 2, { persons: [{ key: "B", living: false, names: [{ given: "Original A" }], facts: [{ key: "B-F", type: "occupation", description: "Confirmed assertion for B" }] }] });
  expect(correct.results[0]).toMatchObject({ id: String(person._id), status: "linked" });
  expect((await t.run(ctx => ctx.db.query("persons").collect())).find(row => row._id === person._id)!.fsId).toBe("B");
});

test.each(["person", "source"])("first-linked %s baselines preserve later manual clearing and retained originals", async kind => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const id: any = await t.run(ctx => kind === "person"
    ? ctx.db.insert("persons", { vaultOwnerId: OWNER, fsId: "A", name: { given: "", surname: "Original surname" }, living: false, sex: "unknown", researchStatus: "basic", createdAt: 1, updatedAt: 1 })
    : ctx.db.insert("sources", { vaultOwnerId: OWNER, fsId: "A", title: "Original source title", type: "other", repository: "", createdAt: 1, updatedAt: 1 }));
  const batch: TreeImportBatch = kind === "person" ? { persons: [{ key: "A", living: false, names: [{ given: "John", surname: "Incoming surname" }] }] } : { sources: [{ key: "A", title: "Incoming source title", repository: "Incoming repository" }] };
  const snapshot = () => t.run(async ctx => ({ row: await ctx.db.get(id), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-first-linked-${kind}`); expect(await snapshot()).toEqual(before);
  const linked = await send(t, grant, job.importJobId, 0, batch); expect(dry.counts).toEqual(linked.counts); expect(linked.results[0]).toMatchObject({ status: "linked", id: String(id) });
  const imported: any = (await snapshot()).row;
  if (kind === "person") { expect(imported.name).toEqual({ given: "John", surname: "Original surname" }); await t.mutation(internal.persons.update, { id, name: { given: "", surname: "Original surname" } }); }
  else { expect(imported.title).toBe("Original source title"); expect(imported.repository).toBe("Incoming repository"); await t.mutation(internal.sources.update, { id, repository: "" }); }
  const cleared = await snapshot(); const baseline = JSON.parse(cleared.keys[0].lastImportedJson!);
  if (kind === "person") { expect(baseline.name).toEqual({ given: "John" }); expect(baseline.name.surname).toBeUndefined(); }
  else { expect(baseline.repository).toBe("Incoming repository"); expect(baseline.title).toBeUndefined(); }
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `manual-cleared-link-${kind}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "unchanged", kept: expect.arrayContaining([kind === "person" ? "name" : "repository"]) })]); expect(await snapshot()).toEqual(cleared);
    expect(await send(t, grant, job.importJobId, 1, batch, { dryRun }, `manual-cleared-link-${kind}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true });
  }
});


test.each([false, true])("new person aliases retain only safe import baselines across providers (legacy=%s)", async legacy => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  if (legacy) await t.run(ctx => ctx.db.insert("persons", { vaultOwnerId: OWNER, fsId: "A", name: { given: "", surname: "Original surname" }, living: false, sex: "unknown", researchStatus: "basic", createdAt: 1, updatedAt: 1 }));
  const initial: any = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: `begin-alias-baseline-${legacy}`, requestHash: `hash-alias-baseline-${legacy}`, input: { system: "ancestry", importKey: `alias-baseline-${legacy}`, label: "Synthetic cross-provider tree" } });
  const batch: TreeImportBatch = { persons: [{ key: "X", living: false, names: [{ given: "John", surname: "Incoming surname" }], otherIds: [{ system: "familysearch", id: "A" }] }] };
  const dry = await send(t, grant, initial.importJobId, 0, batch, { dryRun: true }, `dry-alias-baseline-${legacy}`);
  const real = await send(t, grant, initial.importJobId, 0, batch); expect(dry.counts).toEqual(real.counts);
  const row = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  const alias = (await t.run(ctx => ctx.db.query("mcpRecordKeys").collect())).find(key => key.recordKey === externalRecordKey("familysearch", "person", "A"))!;
  const baseline = JSON.parse(alias.lastImportedJson!); expect(baseline.name.given).toBe("John"); if (legacy) expect(baseline.name.surname).toBeUndefined();
  await t.mutation(internal.persons.update, { id: row._id, name: { ...row.name, given: "" } });
  const next = await begin(t, grant, `alias-familysearch-${legacy}`);
  const refresh: TreeImportBatch = { persons: [{ key: "A", living: false, names: [{ given: "John", surname: "Incoming surname" }] }] };
  const before = await t.run(ctx => ctx.db.query("persons").collect());
  const preview = await send(t, grant, next.importJobId, 0, refresh, { dryRun: true }, `dry-alias-clearing-${legacy}`); expect(await t.run(ctx => ctx.db.query("persons").collect())).toEqual(before);
  const result = await send(t, grant, next.importJobId, 0, refresh); expect(preview.counts).toEqual(result.counts); expect(result.results[0].kept).toContain("name");
  const retained = await t.run(ctx => ctx.db.get(row._id)); expect(retained!.name).toEqual({ given: "", surname: legacy ? "Original surname" : "Incoming surname" }); expect(await countRows(t, "persons")).toBe(1);
});


test.each(["person1", "person2", "type", "lineage"].flatMap(change => ["note", "citation", "both"].map(attachment => ({ change, attachment }))))("relationship $change changes cannot reattribute retained $attachment attachments", async ({ change, attachment }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation: NonNullable<TreeImportBatch["relationships"]>[number] = { key: "R", type: change === "lineage" ? "ParentChild" : "Couple", person1Key: "A", person2Key: "B", ...(change === "lineage" ? { lineage: "biological" } : {}) };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B", "C"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: [{ key: "S", title: "Original A-B source" }], relationships: [relation],
    ...(attachment !== "note" ? { citations: [{ key: "CITE", sourceKey: "S", extractedText: "Evidence about original A-B", targets: [{ kind: "relationship" as const, key: "R" }] }] } : {}),
    ...(attachment !== "citation" ? { notes: [{ key: "NOTE", text: "Private note about original A-B", subject: { kind: "relationship" as const, key: "R" } }] } : {}),
  });
  const snapshot = () => t.run(async ctx => ({ relationships: await ctx.db.query("relationships").collect(), notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  expect(before.relationships[0].facts).toBeUndefined();
  const noop = await send(t, grant, job.importJobId, 1, { relationships: [relation] }); expect(noop.counts.relationships.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const changed: NonNullable<TreeImportBatch["relationships"]>[number] = { ...relation, ...(change === "person1" ? { person1Key: "C" } : change === "person2" ? { person2Key: "C" } : change === "type" ? { type: "ParentChild" as const } : { lineage: "adopted" }) };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, { relationships: [changed] }, { dryRun }, `relation-attachments-${change}-${attachment}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("RELATIONSHIP_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, { relationships: [changed] }, { dryRun }, `relation-attachments-${change}-${attachment}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test("unattached relationship identity refresh remains available", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B", "C"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [relation] });
  const batch: TreeImportBatch = { relationships: [{ ...relation, person2Key: "C" }] };
  const before = await t.run(ctx => ctx.db.query("relationships").collect()); const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-unattached-relationship"); expect(await t.run(ctx => ctx.db.query("relationships").collect())).toEqual(before);
  const result = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(result.counts); expect(result.counts.relationships.updated).toBe(1);
  const c = (await t.run(ctx => ctx.db.query("persons").collect())).find(row => row.fsId === "C")!; expect((await t.run(ctx => ctx.db.query("relationships").collect()))[0].person2).toBe(c._id);
});


test.each(["type", "customType", "date", "place", "value", "description"].flatMap(field => ["note", "citation", "both"].map(attachment => ({ field, attachment }))))("attached fact $field refresh requires attribution review ($attachment)", async ({ field, attachment }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const fact = { key: "F", type: field === "customType" ? "https://a.example/CustomEvent" : "birth", date: { original: "1900", year: 1900 }, place: { original: "London" }, value: "Original value", description: "Original detail" };
  const person = { key: "P", living: false, names: [{ given: "Original", surname: "Person" }], facts: [fact] };
  const target = { kind: "fact" as const, personKey: "P", key: "F", keyOrigin: "explicit" as const };
  await send(t, grant, job.importJobId, 0, { persons: [person], sources: [{ key: "S", title: "Original fact source" }],
    ...(attachment !== "note" ? { citations: [{ key: "C", sourceKey: "S", extractedText: "Evidence for original fact", targets: [target] }] } : {}),
    ...(attachment !== "citation" ? { notes: [{ key: "N", text: "Note about original fact", subject: target }] } : {}),
  });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), personEvents: await ctx.db.query("personEvents").collect(), notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { persons: [person] }); expect(noop.counts.persons.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const replacement = { ...fact, ...(field === "type" ? { type: "death" } : field === "customType" ? { type: "https://b.example/CustomEvent" } : field === "date" ? { date: { original: "1901", year: 1901 } } : field === "place" ? { place: { original: "Paris" } } : field === "value" ? { value: "Replacement value" } : { description: "Replacement detail" }) };
  const batch: TreeImportBatch = { persons: [{ ...person, names: [{ given: "Must roll back", surname: "Person" }], facts: [replacement] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, batch, { dryRun }, `fact-attribution-${field}-${attachment}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, batch, { dryRun }, `fact-attribution-${field}-${attachment}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test.each(["type", "title", "description", "url", "mimeType", "date", "personKeys", "sourceKey"].flatMap(field => ["note", "citation", "both"].map(attachment => ({ field, attachment }))))("unreviewed media $field changes retain original $attachment attribution", async ({ field, attachment }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const media = { key: "M", type: "photo" as const, title: "Original", description: "Original detail", url: "https://example.test/original", mimeType: "image/jpeg", date: "1900", personKeys: ["A"], sourceKey: "S1" };
  const target = { kind: "media" as const, key: "M" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: ["S1", "S2"].map(key => ({ key, title: key })), media: [media],
    ...(attachment !== "note" ? { citations: [{ key: "C", sourceKey: "S1", extractedText: "Evidence for original media", targets: [target] }] } : {}),
    ...(attachment !== "citation" ? { notes: [{ key: "N", text: "Note about original media", subject: target }] } : {}),
  });
  const snapshot = () => t.run(async ctx => ({ media: await ctx.db.query("media").collect(), notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  expect(before.media[0]).toMatchObject({ privacyLevel: "private", reviewStatus: "unreviewed", rightsStatus: "unknown", aiUseAllowed: false }); expect(isContextPackEligibleMedia(before.media[0])).toBe(false);
  const noop = await send(t, grant, job.importJobId, 1, { media: [media] }); expect(noop.counts.media.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const replacements: Record<string, any> = { type: "document", title: "Replacement", description: "Replacement detail", url: "https://example.test/replacement", mimeType: "application/pdf", date: "1901", personKeys: ["B"], sourceKey: "S2" };
  const batch: TreeImportBatch = { media: [{ ...media, [field]: replacements[field] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, batch, { dryRun }, `media-attribution-${field}-${attachment}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("MEDIA_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, batch, { dryRun }, `media-attribution-${field}-${attachment}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test("unattached explicit fact refresh remains available", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Synthetic" }], facts: [{ key: "F", type: "occupation", description: "Farmer" }] };
  await send(t, grant, job.importJobId, 0, { persons: [person] }); const before = await t.run(ctx => ctx.db.query("events").collect());
  const batch: TreeImportBatch = { persons: [{ ...person, facts: [{ key: "F", type: "residence", description: "London" }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-unattached-fact"); expect(await t.run(ctx => ctx.db.query("events").collect())).toEqual(before);
  const result = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(result.counts); expect(result.counts.persons.updated).toBe(1);
  expect((await t.run(ctx => ctx.db.query("events").collect()))[0]).toMatchObject({ _id: before[0]._id, type: "residence", description: "London", importedFact: { key: "F", type: "residence", description: "London" } });
});


test.each(["note", "citation", "both"])("relationship fact refresh protects retained %s attribution", async attachment => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const relation = { key: "R", type: "Couple" as const, person1Key: "A", person2Key: "B", facts: [{ type: "marriage", description: "Ohio" }] };
  const target = { kind: "relationship" as const, key: "R", field: "marriage" };
  await send(t, grant, job.importJobId, 0, { persons: ["A", "B"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: [{ key: "S", title: "Ohio source" }], relationships: [relation],
    ...(attachment !== "note" ? { citations: [{ key: "C", sourceKey: "S", extractedText: "Ohio marriage", targets: [target] }] } : {}),
    ...(attachment !== "citation" ? { notes: [{ key: "N", text: "Ohio marriage note", subject: { kind: "relationship" as const, key: "R" } }] } : {}),
  });
  const snapshot = () => t.run(async ctx => ({ relationships: await ctx.db.query("relationships").collect(), citations: await ctx.db.query("citations").collect(), notes: await ctx.db.query("notes").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { relationships: [relation] }); expect(noop.counts.relationships.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  for (const dryRun of [true, false]) {
    const batch: TreeImportBatch = { relationships: [{ ...relation, facts: [{ type: "marriage", description: "Arizona" }] }] };
    const result = await send(t, grant, job.importJobId, 2, batch, { dryRun }, `relationship-fact-attachments-${attachment}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("RELATIONSHIP_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, batch, { dryRun }, `relationship-fact-attachments-${attachment}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test.each(["text", "title", "noteType"])("citation-backed note %s refresh preserves original evidence meaning", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const note = { key: "N", text: "Ohio", title: "Ohio note", noteType: "research" as const, subject: { kind: "person" as const, key: "P" } };
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }], sources: [{ key: "S", title: "Ohio" }], notes: [note] });
  await send(t, grant, job.importJobId, 1, { citations: [{ key: "C", sourceKey: "S", extractedText: "Evidence supports Ohio", targets: [{ kind: "note", key: "N" }] }] });
  const snapshot = () => t.run(async ctx => ({ notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 2, { notes: [note] }); expect(noop.counts.notes.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const batch: TreeImportBatch = { notes: [{ ...note, ...(field === "text" ? { text: "Arizona" } : field === "title" ? { title: "Arizona note" } : { noteType: "biography" as const }) }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 3, batch, { dryRun }, `note-citation-attribution-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("NOTE_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 3, batch, { dryRun }, `note-citation-attribution-${field}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test.each(["source", "excerpt", "target"])("explanatory citation notes prevent unreviewed %s attribution changes", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const citation = { key: "C", sourceKey: "S1", page: "1", extractedText: "Ohio", quality: 2, url: "https://example.test/original", accessDate: "2026-01-01", notes: "Original citation metadata", targets: [{ kind: "person" as const, key: "P" }] };
  await send(t, grant, job.importJobId, 0, { persons: ["P", "Q"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: ["S1", "S2"].map(key => ({ key, title: key })), citations: [citation], notes: [{ key: "N", text: "Explanation of Ohio evidence", subject: { kind: "citation", key: "C", keyOrigin: "explicit" } }] });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), notes: await ctx.db.query("notes").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { citations: [citation] }); expect(noop.counts.citations.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const changed = { ...citation, ...(field === "source" ? { sourceKey: "S2" } : field === "excerpt" ? { extractedText: "Arizona" } : { targets: [...citation.targets, { kind: "person" as const, key: "Q" }] }) };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, { citations: [changed] }, { dryRun }, `citation-note-attribution-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_NOTE_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, { citations: [changed] }, { dryRun }, `citation-note-attribution-${field}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});


test.each(["birth", "death"].flatMap(type => ["exact", "nested", "unscoped", "unknown"].map(scope => ({ type, scope }))))("person $type refresh preserves $scope field citation attribution", async ({ type, scope }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "Original", surname: "Synthetic" }], facts: [{ key: "F", type, date: { original: "1900", year: 1900 } }] };
  const field = scope === "exact" ? type : scope === "nested" ? `person.${type}.date.year` : scope === "unknown" ? "unclassified assertion" : undefined;
  await send(t, grant, job.importJobId, 0, { persons: [person], sources: [{ key: "S", title: "1900 source" }], citations: [{ key: "C", sourceKey: "S", extractedText: "Evidence for 1900", targets: [{ kind: "person", key: "P", field }] }] });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { persons: [person] }); expect(noop.counts.persons.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const batch: TreeImportBatch = { persons: [{ ...person, names: [{ given: "Must roll back", surname: "Synthetic" }], facts: [{ key: "F", type, date: { original: "1901", year: 1901 } }] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, batch, { dryRun }, `person-citation-${type}-${scope}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("PERSON_CITATION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, batch, { dryRun }, `person-citation-${type}-${scope}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test.each(["name", "sex", "living", "alternateNames"])("person-field evidence also protects imported %s assertions", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, sex: "unknown" as const, names: [{ given: "Original", surname: "Synthetic", preferred: true }, { given: "Alternate", surname: "Synthetic" }] };
  await send(t, grant, job.importJobId, 0, { persons: [person], sources: [{ key: "S", title: "Original assertion" }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P", field }] }] });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const changed: NonNullable<TreeImportBatch["persons"]>[number] = { ...person, ...(field === "sex" ? { sex: "female" as const } : field === "living" ? { living: true } : { names: person.names.map((name, i) => i === (field === "name" ? 0 : 1) ? { ...name, given: "Replacement" } : name) }) };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 1, { persons: [changed] }, { dryRun }, `person-other-evidence-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("PERSON_CITATION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
  }
});

test("unrelated person fields can refresh while birth citations retain their assertion", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, sex: "unknown" as const, names: [{ given: "Original" }], facts: [{ key: "B", type: "birth", date: { original: "1900", year: 1900 } }] };
  await send(t, grant, job.importJobId, 0, { persons: [person], sources: [{ key: "S", title: "Birth evidence" }], citations: [{ key: "C", sourceKey: "S", extractedText: "Birth in 1900", targets: [{ kind: "person", key: "P", field: "birth" }] }] });
  const before = await t.run(ctx => ctx.db.query("citationLinks").collect());
  const batch: TreeImportBatch = { persons: [{ ...person, sex: "female" }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-unrelated-person-field"); const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts); expect(real.counts.persons.updated).toBe(1);
  const row = (await t.run(ctx => ctx.db.query("persons").collect()))[0]; expect(row.sex).toBe("female"); expect(row.birth?.date?.year).toBe(1900); expect(await t.run(ctx => ctx.db.query("citationLinks").collect())).toEqual(before);
});


test.each(["citation", "note", "content"].flatMap(material => ["url", "citationText", "notes"].map(field => ({ material, field }))))("source $field refresh preserves retained $material attribution", async ({ material, field }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const source = { key: "S", title: "Record A", url: "https://example.test/record-a", citationText: "Citation for record A", notes: "Original inline notes about A" };
  await send(t, grant, job.importJobId, 0, { sources: [source], persons: [{ key: "P", living: false, names: [{ given: "Synthetic" }] }],
    ...(material === "citation" ? { citations: [{ key: "C", sourceKey: "S", extractedText: "Original record A evidence", targets: [{ kind: "person" as const, key: "P" }] }] } : {}),
    ...(material === "note" ? { notes: [{ key: "N", text: "Annotation about record A", subject: { kind: "source" as const, key: "S" } }] } : {}),
  });
  if (material === "content") await t.run(async ctx => { const row = (await ctx.db.query("sources").collect())[0]; await ctx.db.insert("sourceContents", { vaultOwnerId: OWNER, sourceId: row._id, kind: "transcription", text: "Verbatim original record A", madeBy: { kind: "record_creator" }, createdAt: 1 }); });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), contents: await ctx.db.query("sourceContents").collect(), notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { sources: [source] }); expect(noop.counts.sources.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const changed = { ...source, ...(field === "url" ? { url: "https://example.test/record-b" } : field === "citationText" ? { citationText: "Citation for different record B" } : { notes: "Replacement notes about B" }) };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, { sources: [changed] }, { dryRun }, `source-attribution-${material}-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("SOURCE_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, { sources: [changed] }, { dryRun }, `source-attribution-${material}-${field}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test("unattached source refresh remains available", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "S", title: "Original", url: "https://example.test/a" }] }); const before = await t.run(ctx => ctx.db.query("sources").collect());
  const batch: TreeImportBatch = { sources: [{ key: "S", title: "Corrected", url: "https://example.test/b" }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-unattached-source"); expect(await t.run(ctx => ctx.db.query("sources").collect())).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts); expect(real.counts.sources.updated).toBe(1);
  expect((await t.run(ctx => ctx.db.query("sources").collect()))[0]).toMatchObject({ _id: before[0]._id, title: "Corrected", url: "https://example.test/b" });
});


test.each((["candidate", "accepted", "conflict", "rejected"] as const).flatMap(status => ["source", "excerpt"].map(field => ({ status, field }))))("citation refresh protects $status human source facts from changed $field", async ({ status, field }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const citation = { key: "C", sourceKey: "A", page: "12", extractedText: "Original A evidence", quality: 2, url: "https://example.test/a", accessDate: "2026-01-01", notes: "Original A citation", targets: [{ kind: "person" as const, key: "P" }] };
  await send(t, grant, job.importJobId, 0, { persons: ["P", "Q"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: ["A", "B"].map(key => ({ key, title: key })), citations: [citation] });
  const rows = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), sources: await ctx.db.query("sources").collect(), citations: await ctx.db.query("citations").collect() }));
  const person = rows.people.find(row => row.fsId === "P")!; const source = rows.sources.find(row => row.fsId === "A")!;
  // Existing human writer + synthetic owner identity, never actual user/Tier2 proof.
  await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertSourceFact, { vaultOwnerId: OWNER, personId: person._id, sourceId: source._id, citationId: rows.citations[0]._id, importKey: `human-source-fact-${status}-${field}`, factType: "birth", label: "Retained decision about A", value: "1900", confidence: "high", status });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), facts: await ctx.db.query("sourceFacts").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { citations: [citation] }); expect(noop.counts.citations.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const changed = { ...citation, ...(field === "source" ? { sourceKey: "B" } : { extractedText: "Different assertion from A" }) };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 2, { citations: [changed] }, { dryRun }, `citation-source-fact-${status}-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_SOURCE_FACT_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, { citations: [changed] }, { dryRun }, `citation-source-fact-${status}-${field}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
  // Same evidence can support another target while the retained fact keeps A/C.
  const additive = { ...citation, targets: [...citation.targets, { kind: "person" as const, key: "Q" }] };
  const dry = await send(t, grant, job.importJobId, 3, { citations: [additive] }, { dryRun: true }, `dry-source-fact-additive-${status}-${field}`);
  const real = await send(t, grant, job.importJobId, 3, { citations: [additive] }); expect(dry.counts).toEqual(real.counts); expect(real.counts.citations.updated).toBe(1);
  const after = await snapshot(); expect(after.facts).toEqual(before.facts); expect(after.citations).toEqual(before.citations); expect(after.links).toHaveLength(before.links.length + 1); expect(after.links).toEqual(expect.arrayContaining(before.links)); expect(after.facts[0].sourceId).toBe(after.citations[0].sourceId); expect(after.facts[0].status).toBe(status);
});


test.each(["nickname", "given", "alternateNames", "birth"])("new provider identity cannot refill manually cleared %s from another mapping", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const original = await begin(t, grant);
  const names = [{ given: "William", surname: "Synthetic", nickname: "Bill", preferred: true }, { given: "Alternate", surname: "Synthetic" }];
  const person = { key: "P", living: false, names, facts: [{ key: "B", type: "birth", date: { original: "1900", year: 1900 } }] };
  await send(t, grant, original.importJobId, 0, { persons: [person] }); const row = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  if (field === "birth") await t.mutation(internal.persons.updateBirth, { id: row._id, birth: {} });
  else if (field === "alternateNames") await t.mutation(internal.persons.update, { id: row._id, alternateNames: [] });
  else await t.mutation(internal.persons.update, { id: row._id, name: { given: field === "given" ? "" : "William", surname: "Synthetic", ...(field === "given" ? { nickname: "Bill" } : {}) } });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: `begin-new-alias-${field}`, requestHash: `begin-new-alias-${field}`, input: { importKey: `new-alias-${field}`, system: "ancestry", label: "Synthetic new provider" } }) as any;
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), keys: await ctx.db.query("mcpRecordKeys").collect(), roles: await ctx.db.query("personEvents").collect() })); const before = await snapshot();
  const batch: TreeImportBatch = { persons: [{ ...person, key: "A", otherIds: [{ system: "familysearch", id: "P" }] }] };
  for (const dryRun of [true, false]) {
    const result = await send(t, grant, job.importJobId, 0, batch, { dryRun }, `new-alias-clearing-${field}-${dryRun}`);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("PERSON_ALIAS_CLEARING_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 0, batch, { dryRun }, `new-alias-clearing-${field}-${dryRun}`)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test("alias clearing protection survives an earlier safe registration and planning chunks", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const original = await begin(t, grant);
  await send(t, grant, original.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "William", surname: "Synthetic", nickname: "Bill" }] }] });
  const person = (await t.run(ctx => ctx.db.query("persons").collect()))[0]; await t.mutation(internal.persons.update, { id: person._id, name: { given: "William", surname: "Synthetic" } });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: "begin-safe-then-unsafe-alias", requestHash: "begin-safe-then-unsafe-alias", input: { importKey: "safe-then-unsafe-alias", system: "ancestry", label: "Synthetic planning chunks" } }) as any;
  const safe = { key: "A", living: false, names: [{ given: "William", surname: "Synthetic" }], otherIds: [{ system: "familysearch", id: "P" }] };
  const batch: TreeImportBatch = { persons: [...Array.from({ length: 125 }, () => safe), { ...safe, names: [{ given: "William", surname: "Synthetic", nickname: "Bill" }] }] };
  expect(chunkBatch(batch)).toHaveLength(2);
  const before = await t.run(ctx => ctx.db.query("persons").collect()); const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, "dry-safe-then-unsafe-alias"); expect(await t.run(ctx => ctx.db.query("persons").collect())).toEqual(before);
  const result = await send(t, grant, job.importJobId, 0, batch); expect(dry.counts).toEqual(result.counts); expect(result.counts.persons).toMatchObject({ linked: 1, unchanged: 124, failed: 1 });
  expect(result.results.find((row: any) => row.index === 125)).toMatchObject({ status: "failed", reason: expect.stringContaining("PERSON_ALIAS_CLEARING_REVIEW_REQUIRED") });
  expect((await t.run(ctx => ctx.db.get(person._id)))!.name.nickname).toBeUndefined(); expect(await countRows(t, "persons")).toBe(1);
});

test("new provider identity can fill a field no prior import populated", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const original = await begin(t, grant);
  await send(t, grant, original.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "William", surname: "Synthetic" }] }] });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: "begin-new-alias-blank", requestHash: "begin-new-alias-blank", input: { importKey: "new-alias-blank", system: "ancestry", label: "Synthetic blank field" } }) as any;
  const batch: TreeImportBatch = { persons: [{ key: "A", living: false, names: [{ given: "William", surname: "Synthetic", nickname: "Bill" }], otherIds: [{ system: "familysearch", id: "P" }] }] };
  const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, "dry-new-alias-blank"); const real = await send(t, grant, job.importJobId, 0, batch); expect(dry.counts).toEqual(real.counts); expect(real.counts.persons.linked).toBe(1);
  expect((await t.run(ctx => ctx.db.query("persons").collect()))[0].name.nickname).toBe("Bill"); expect(await countRows(t, "persons")).toBe(1);
});

test.each([false, true])("record baseline lookup is bounded and owner-scoped (foreign=%s)", async foreign => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const original = await begin(t, grant);
  await send(t, grant, original.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "William", surname: "Synthetic" }] }] });
  const person = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  await t.run(async ctx => { for (let i = 0; i < 51; i++) await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: foreign ? "synthetic-other-mapping-owner" : OWNER, recordType: "person", recordKey: `synthetic-prior-${i}`, recordId: String(person._id), lastImportedJson: "{}", externalKeyVersion: 2, createdAt: i, updatedAt: i }); });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: `begin-alias-bound-${foreign}`, requestHash: `begin-alias-bound-${foreign}`, input: { importKey: `alias-bound-${foreign}`, system: "ancestry", label: "Synthetic baseline bounds" } }) as any;
  const batch: TreeImportBatch = { persons: [{ key: "A", living: false, names: [{ given: "William", surname: "Synthetic", prefix: "Dr" }], otherIds: [{ system: "familysearch", id: "P" }] }] };
  const before = await t.run(ctx => ctx.db.get(person._id)); const dry = await send(t, grant, job.importJobId, 0, batch, { dryRun: true }, `dry-alias-bound-${foreign}`); expect(await t.run(ctx => ctx.db.get(person._id))).toEqual(before);
  const result = await send(t, grant, job.importJobId, 0, batch); expect(dry.counts).toEqual(result.counts);
  if (foreign) { expect(result.counts.persons.linked).toBe(1); expect((await t.run(ctx => ctx.db.get(person._id)))!.name.prefix).toBe("Dr"); }
  else { expect(result.results[0]).toMatchObject({ status: "failed", reason: expect.stringContaining("PERSON_ALIAS_CLEARING_REVIEW_REQUIRED") }); expect(await t.run(ctx => ctx.db.get(person._id))).toEqual(before); }
});


test.each((["draft", "review", "published"] as const).flatMap(status => ["source", "excerpt"].map(field => ({ status, field }))))("citation refresh preserves $status story evidence and history ($field)", async ({ status, field }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const citation = { key: "C", sourceKey: "A", extractedText: "Original evidence about P", targets: [{ kind: "person" as const, key: "P" }] };
  await send(t, grant, job.importJobId, 0, { persons: ["P", "Q"].map(key => ({ key, living: false, names: [{ given: key }] })), sources: ["A", "B"].map(key => ({ key, title: key })), citations: [citation] });
  const rows = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), citations: await ctx.db.query("citations").collect() }));
  const person = rows.people.find(row => row.fsId === "P")!;
  const owner = t.withIdentity({ subject: OWNER });
  const draft = await owner.mutation(api.vaultMutations.upsertStoryDraft, { vaultOwnerId: OWNER, personId: person._id, type: "biography", title: "Retained story", content: "Original assertion about P", status: "draft", generatedBy: "human" });
  // In-memory legacy story state, not a publication bypass or actual human review.
  await t.run(ctx => ctx.db.patch(draft.storyId, { citationIds: [rows.citations[0]._id], status, ...(status !== "draft" ? { reviewedAt: 1 } : {}), ...(status === "published" ? { lastPublishedAt: 2 } : {}) }));
  await owner.mutation(api.vaultMutations.recordStoryReviewEvent, { vaultOwnerId: OWNER, storyId: draft.storyId, eventType: "status_change", fromStatus: "draft", toStatus: status, actorRole: "first_party_owner", humanReviewNote: "Synthetic retained history" });
  const snapshot = () => t.run(async ctx => ({ citations: await ctx.db.query("citations").collect(), stories: await ctx.db.query("stories").collect(), history: await ctx.db.query("storyReviewEvents").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { citations: [citation] }); expect(noop.counts.citations.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const changed = { ...citation, ...(field === "source" ? { sourceKey: "B" } : { extractedText: "Replacement assertion" }) };
  for (const dryRun of [true, false]) {
    const operation = `story-evidence-${status}-${field}-${dryRun}`;
    const result = await send(t, grant, job.importJobId, 2, { citations: [changed] }, { dryRun }, operation);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_STORY_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, { citations: [changed] }, { dryRun }, operation)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
  const additive = { ...citation, targets: [...citation.targets, { kind: "person" as const, key: "Q" }] };
  const dry = await send(t, grant, job.importJobId, 3, { citations: [additive] }, { dryRun: true }, `dry-story-additive-${status}-${field}`);
  const real = await send(t, grant, job.importJobId, 3, { citations: [additive] }); expect(dry.counts).toEqual(real.counts); expect(real.counts.citations.updated).toBe(1);
  const after = await snapshot(); expect(after.citations).toEqual(before.citations); expect(after.stories).toEqual(before.stories); expect(after.history).toEqual(before.history); expect(after.links).toHaveLength(before.links.length + 1);
});

test.each([50, 51])("citation story absence check is bounded at %s owned stories", async count => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const citation = { key: "C", sourceKey: "S", extractedText: "Original", targets: [{ kind: "person" as const, key: "P" }] };
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "P" }] }], sources: [{ key: "S", title: "S" }], citations: [citation] });
  await t.run(async ctx => { for (let i = 0; i < count; i++) await ctx.db.insert("stories", { vaultOwnerId: OWNER, type: "biography", title: `Unrelated ${i}`, content: "Unrelated story", citationIds: [], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 }); });
  const before = await t.run(ctx => ctx.db.query("citations").collect()); const batch = { citations: [{ ...citation, extractedText: "Corrected" }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-story-bound-${count}`); expect(await t.run(ctx => ctx.db.query("citations").collect())).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts);
  if (count === 51) {
    expect(real.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("CITATION_STORY_REVIEW_REQUIRED") })]); expect(await t.run(ctx => ctx.db.query("citations").collect())).toEqual(before);
  } else { expect(real.counts.citations.updated).toBe(1); expect((await t.run(ctx => ctx.db.query("citations").collect()))[0].extractedText).toBe("Corrected"); }
});

test("foreign stories do not crowd out the owner citation-reference check", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const citation = { key: "C", sourceKey: "S", extractedText: "Original", targets: [{ kind: "person" as const, key: "P" }] };
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "P" }] }], sources: [{ key: "S", title: "S" }], citations: [citation] });
  await t.run(async ctx => { for (let i = 0; i < 51; i++) await ctx.db.insert("stories", { vaultOwnerId: "another-owner", type: "biography", title: `Foreign ${i}`, content: "Foreign story", citationIds: [], status: "published", generatedBy: "human", createdAt: 1, updatedAt: 1 }); });
  const before = await t.run(ctx => ctx.db.query("stories").collect()); const batch = { citations: [{ ...citation, extractedText: "Corrected" }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-foreign-stories"); const real = await send(t, grant, job.importJobId, 1, batch);
  expect(dry.counts).toEqual(real.counts); expect(real.counts.citations.updated).toBe(1); expect(await t.run(ctx => ctx.db.query("stories").collect())).toEqual(before);
});

test.each(["value", "type"])("legacy inline event notes protect fact %s refresh atomically", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const fact = { key: "F", type: "occupation", value: "Farmer" }; const person = { key: "P", living: false, names: [{ given: "Original" }], facts: [fact] };
  await send(t, grant, job.importJobId, 0, { persons: [person] }); const event = (await t.run(ctx => ctx.db.query("events").collect()))[0];
  // Existing owner writer under a synthetic test principal, not actual user proof.
  await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertEvent, { vaultOwnerId: OWNER, importKey: event.importKey, type: event.type, description: event.description, notes: "Explanation of the Farmer assertion" });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), roles: await ctx.db.query("personEvents").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const noop = await send(t, grant, job.importJobId, 1, { persons: [person] }); expect(noop.counts.persons.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const changed = { ...person, names: [{ given: "Must roll back" }], facts: [{ ...fact, ...(field === "value" ? { value: "Teacher" } : { type: "residence" }) }] };
  for (const dryRun of [true, false]) {
    const operation = `legacy-event-note-${field}-${dryRun}`; const result = await send(t, grant, job.importJobId, 2, { persons: [changed] }, { dryRun }, operation);
    expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("FACT_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before);
    expect(await send(t, grant, job.importJobId, 2, { persons: [changed] }, { dryRun }, operation)).toEqual(dryRun ? result : { ...result, deduplicated: true }); expect(await snapshot()).toEqual(before);
  }
});

test("empty legacy inline event notes do not prevent unattached fact refresh", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const person = { key: "P", living: false, names: [{ given: "P" }], facts: [{ key: "F", type: "occupation", value: "Farmer" }] };
  await send(t, grant, job.importJobId, 0, { persons: [person] }); const event = (await t.run(ctx => ctx.db.query("events").collect()))[0];
  await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertEvent, { vaultOwnerId: OWNER, importKey: event.importKey, type: event.type, description: event.description, notes: "" });
  const changed = { ...person, facts: [{ ...person.facts[0], value: "Teacher" }] }; const before = await t.run(ctx => ctx.db.query("events").collect());
  const dry = await send(t, grant, job.importJobId, 1, { persons: [changed] }, { dryRun: true }, "dry-empty-event-note"); expect(await t.run(ctx => ctx.db.query("events").collect())).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, { persons: [changed] }); expect(dry.counts).toEqual(real.counts); expect(real.counts.persons.updated).toBe(1);
  expect((await t.run(ctx => ctx.db.query("events").collect()))[0]).toMatchObject({ _id: event._id, description: "Teacher", notes: "", importedFact: { type: "occupation", value: "Teacher" } });
});


test("actual capture caller resolves an alias without replacing differing original assertions", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const gedcom = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: "begin-capture-alias", requestHash: "begin-capture-alias", input: { importKey: "capture-alias-file", system: "gedcom7", label: "Synthetic GEDCOM" } }) as any;
  await send(t, grant, gedcom.importJobId, 0, { persons: [{ key: "@I1@", living: true, names: [{ given: "Liz", surname: "Smith" }], otherIds: [{ system: "familysearch", id: "PID-A" }] }] });
  const firstPerson = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  await t.mutation(internal.persons.update, { id: firstPerson._id, notes: "Imported from FamilySearch person capture." });
  const original = (await t.run(ctx => ctx.db.query("persons").collect()))[0]; const mappings = await t.run(ctx => ctx.db.query("mcpRecordKeys").collect());
  await t.run(async ctx => { const foreign = await ctx.db.insert("persons", { vaultOwnerId: "foreign-capture-owner", fsId: "PID-A", name: { given: "Foreign", surname: "Person" }, sex: "unknown", living: false, createdAt: 1, updatedAt: 1 }); await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: "foreign-capture-owner", recordType: "person", recordKey: externalRecordKey("familysearch", "person", "PID-A"), recordId: String(foreign), externalKeyVersion: 2, createdAt: 1, updatedAt: 1 }); });
  const capture = CapturePackageSchema.parse({ schemaVersion: "2.0", captureId: "synthetic-capture-alias", capturedAt: "2026-01-01T00:00:00Z", extractorVersion: "synthetic-test", extractionDurationMs: 0, pageType: "person", pageUrl: "https://example.test/capture/PID-A", pageTitle: "Synthetic person", uiLocale: "en", person: { familySearchId: "PID-A", name: "Elizabeth Jones" }, sources: [], memories: [], diagnostics: { mode: "standard", warnings: [], errors: [] } });
  // Execute the actual caller through in-memory owner-authorized mutations.
  // This adapter never contacts FamilySearch, a network backend or a real user.
  const owner = t.withIdentity({ subject: OWNER });
  const client = { mutation: (ref: any, args: any) => owner.mutation(ref, args) } as unknown as Parameters<typeof importCapturePackageToConvex>[0]["client"];
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), mappings: await ctx.db.query("mcpRecordKeys").collect(), logs: await ctx.db.query("researchLog").collect(), runs: await ctx.db.query("importRuns").collect() })); const before = await snapshot();
  await expect(importCapturePackageToConvex({ client, vaultOwnerId: OWNER, capture, compatibilityMode: false, artifactPaths: {} })).rejects.toThrow("CAPTURE_PERSON_REVIEW_REQUIRED"); expect(await snapshot()).toEqual(before);
  const matching = { ...capture, person: { ...capture.person, name: "Liz Smith" } };
  const captured = await importCapturePackageToConvex({ client, vaultOwnerId: OWNER, capture: matching, compatibilityMode: false, artifactPaths: {} });
  expect(captured.personId).toBe(String(original._id));
  const afterCapture = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), mappings: await ctx.db.query("mcpRecordKeys").collect() }));
  expect(afterCapture.people.filter(row => row.vaultOwnerId === OWNER)).toHaveLength(1);
  expect(afterCapture.people.find(row => row._id === original._id)).toMatchObject({ fsId: "PID-A", name: { given: "Liz", surname: "Smith" }, importedNames: original.importedNames });
  expect(afterCapture.mappings.filter(row => row.vaultOwnerId === OWNER)).toEqual(mappings);
  const job = await begin(t, grant);
  const result = await send(t, grant, job.importJobId, 0, { persons: [{ key: "PID-A", living: true, names: [{ given: "Liz", surname: "Smith" }], facts: [{ key: "F", type: "occupation", value: "Teacher" }] }] });
  expect(result.results.filter((row: any) => row.status === "failed")).toEqual([]);
  expect((await t.run(ctx => ctx.db.query("personEvents").collect()))[0].personId).toBe(original._id);
  expect((await t.run(ctx => ctx.db.query("persons").collect())).filter(row => row.vaultOwnerId === OWNER)).toHaveLength(1);
});

test.each(["splitPID", "duplicatePID", "deleted", "foreign", "correctedPID", "duplicateMapping", "ambiguousLegacy"])("capture refuses conflicting or stale FamilySearch identities (%s)", async mode => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const pid = mode === "ambiguousLegacy" ? "person:PID-A" : "PID-A";
  await send(t, grant, job.importJobId, 0, { persons: [{ key: pid, living: false, names: [{ given: "Original", surname: "Person" }] }] });
  const original = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  await t.run(async ctx => {
    const mapping = (await ctx.db.query("mcpRecordKeys").collect())[0];
    if (mode === "splitPID" || mode === "duplicatePID") await ctx.db.insert("persons", { vaultOwnerId: OWNER, fsId: pid, name: { given: "Other", surname: "Person" }, sex: "unknown", living: false, createdAt: 1, updatedAt: 1 });
    if (mode === "duplicatePID") await ctx.db.delete(mapping._id);
    if (mode === "splitPID") await ctx.db.patch(original._id, { fsId: undefined });
    if (mode === "foreign") await ctx.db.patch(original._id, { vaultOwnerId: "different-owner" });
    if (mode === "correctedPID") await ctx.db.patch(original._id, { fsId: "PID-B" });
    if (mode === "duplicateMapping") await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "person", recordKey: mapping.recordKey, recordId: mapping.recordId, externalKeyVersion: 2, createdAt: 1, updatedAt: 1 });
    if (mode === "ambiguousLegacy") await ctx.db.patch(mapping._id, { externalKeyVersion: undefined });
  });
  if (mode === "deleted") await t.mutation(internal.persons.remove, { id: original._id });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), mappings: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const code = ["splitPID", "duplicatePID", "duplicateMapping"].includes(mode) ? "AMBIGUOUS_PERSON_IDENTITY" : ["deleted", "foreign"].includes(mode) ? "MISSING_TARGET" : "LEGACY_IDENTITY_REVIEW_REQUIRED";
  await expect(t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertPerson, { vaultOwnerId: OWNER, fsId: pid, name: { given: "Replacement", surname: "Capture" }, sex: "unknown", living: false })).rejects.toThrow(code);
  expect(await snapshot()).toEqual(before);
});

test.each(["legacyPID", "safeLegacyMapping", "noPIDName", "differentPIDName"])("capture preserves explicit identity and no-PID compatibility (%s)", async mode => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const original = await t.run(ctx => ctx.db.insert("persons", { vaultOwnerId: OWNER, ...(mode !== "noPIDName" ? { fsId: "PID-A" } : {}), name: { given: "Same", surname: "Name" }, sex: "unknown", living: false, createdAt: 1, updatedAt: 1 }));
  if (mode === "safeLegacyMapping") await t.run(ctx => ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "person", recordKey: externalRecordKey("familysearch", "person", "PID-A"), recordId: String(original), createdAt: 1, updatedAt: 1 }));
  const result = await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertPerson, { vaultOwnerId: OWNER, ...(mode !== "noPIDName" ? { fsId: mode === "differentPIDName" ? "PID-B" : "PID-A" } : {}), name: { given: "Same", surname: "Name" }, sex: "unknown", living: false });
  expect(result.created).toBe(mode === "differentPIDName");
  if (mode === "differentPIDName") { expect(result.personId).not.toBe(original); expect((await t.run(ctx => ctx.db.get(original)))?.fsId).toBe("PID-A"); }
  else expect(result.personId).toBe(original);
  expect(await countRows(t, "persons")).toBe(mode === "differentPIDName" ? 2 : 1);
});

test.each([{ raw: "parish_register", display: "other" }, { raw: "Census", display: "census" }, { raw: "https://a.example/ParishRegister", display: "other" }, { raw: "", display: "other" }])("source classification $raw survives normalization, omission and context retrieval", async ({ raw, display }) => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const first = await send(t, grant, job.importJobId, 0, { sources: [{ key: "S", title: "Register", type: raw }] }); expect(first.counts.sources.created).toBe(1);
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), mappings: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  expect(before.sources[0]).toMatchObject({ type: display, importedType: raw }); expect(JSON.parse(before.mappings[0].lastImportedJson!).importedType).toBe(raw);
  const noop = await send(t, grant, job.importJobId, 1, { sources: [{ key: "S", title: "Register" }] }); expect(noop.counts.sources.unchanged).toBe(1); expect(await snapshot()).toEqual(before);
  const context = await t.query(internal.mcpFamilyHistory.getRecordContext, { principal: principal(), kind: "source", id: String(before.sources[0]._id) }) as any;
  expect(context.source.importedType).toBe(raw);
  const batch = { sources: [{ key: "S", title: "Corrected register" }] }; const dry = await send(t, grant, job.importJobId, 2, batch, { dryRun: true }, `dry-original-source-type-${display}-${raw.length}`); expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 2, batch); expect(dry.counts).toEqual(real.counts); expect(real.counts.sources.updated).toBe(1); expect((await snapshot()).sources[0]).toMatchObject({ type: display, importedType: raw });
});

test.each(["unattached", "citation", "note"])("custom source classification refresh respects %s attribution", async material => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "P" }] }], sources: [{ key: "S", title: "Register", type: "parish_register" }], ...(material === "citation" ? { citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person" as const, key: "P" }] }] } : {}), ...(material === "note" ? { notes: [{ key: "N", text: "Explanation of parish records", subject: { kind: "source" as const, key: "S" } }] } : {}) });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), mappings: await ctx.db.query("mcpRecordKeys").collect(), notes: await ctx.db.query("notes").collect(), citations: await ctx.db.query("citations").collect() })); const before = await snapshot();
  const batch = { sources: [{ key: "S", title: "Register", type: "court_register" }] }; const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-custom-classification-${material}`); expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts);
  if (material === "unattached") { expect(real.counts.sources.updated).toBe(1); expect((await snapshot()).sources[0]).toMatchObject({ type: "other", importedType: "court_register" }); }
  else { expect(real.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("SOURCE_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before); }
  expect(await send(t, grant, job.importJobId, 1, batch)).toEqual({ ...real, deduplicated: true });
});


test.each(["census", "parish_register"])("legacy source classification provenance refresh is conservative (%s)", async type => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "P" }] }], sources: [{ key: "S", title: "Legacy", type }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P" }] }] });
  await t.run(async ctx => { const source = (await ctx.db.query("sources").collect())[0]; await ctx.db.patch(source._id, { importedType: undefined }); const key = (await ctx.db.query("mcpRecordKeys").collect()).find(row => row.recordType === "source")!; const baseline = JSON.parse(key.lastImportedJson!); delete baseline.importedType; await ctx.db.patch(key._id, { lastImportedJson: JSON.stringify(baseline) }); });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), mappings: await ctx.db.query("mcpRecordKeys").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect() })); const before = await snapshot();
  const batch = { sources: [{ key: "S", title: "Legacy", type }] }; const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, `dry-legacy-classification-${type}`); expect(await snapshot()).toEqual(before);
  const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts);
  if (type === "census") { expect(real.counts.sources.updated).toBe(1); expect((await snapshot()).sources[0].importedType).toBe(type); const noop = await send(t, grant, job.importJobId, 2, batch); expect(noop.counts.sources.unchanged).toBe(1); }
  else { expect(real.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("SOURCE_ATTRIBUTION_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before); }
});


test.each(["name", "sex", "living", "birth", "death", "notes", "clearedNickname", "clearedNotes"])("capture alias reuse preserves manual %s corrections", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: grant, operationId: `begin-capture-correction-${field}`, requestHash: `begin-capture-correction-${field}`, input: { importKey: `capture-correction-${field}`, system: "gedcom7", label: "Synthetic correction fixture" } }) as { importJobId: string };
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "@I1@", living: false, sex: "unknown", names: [{ given: "Liz", surname: "Smith", nickname: "Bill" }], facts: [{ key: "B", type: "birth", date: { original: "1900", year: 1900 } }, { key: "D", type: "death", date: { original: "2000", year: 2000 } }], otherIds: [{ system: "familysearch", id: "PID-A" }] }] });
  const first = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  await t.mutation(internal.persons.update, { id: first._id, notes: "Original person note" });
  const original = (await t.run(ctx => ctx.db.query("persons").collect()))[0];
  const incoming = { vaultOwnerId: OWNER, fsId: "PID-A", name: original.name, sex: original.sex, living: original.living, birth: original.birth, death: original.death, notes: original.notes };
  // Exercise the existing person writer under a synthetic owner fixture only.
  const update: any = field === "name" ? { name: { ...original.name, given: "Corrected name" } } : field === "sex" ? { sex: "female" } : field === "living" ? { living: true } : field === "birth" ? { birth: { date: { original: "1901", year: 1901 } } } : field === "death" ? { death: { date: { original: "2001", year: 2001 } } } : field === "notes" ? { notes: "Manually corrected private note" } : field === "clearedNickname" ? { name: { given: original.name.given, surname: original.name.surname } } : { notes: "" };
  await t.mutation(internal.persons.update, { id: original._id, ...update });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), keys: await ctx.db.query("mcpRecordKeys").collect(), events: await ctx.db.query("events").collect(), roles: await ctx.db.query("personEvents").collect() })); const before = await snapshot();
  const owner = t.withIdentity({ subject: OWNER });
  await expect(owner.mutation(api.vaultMutations.upsertPerson, incoming)).rejects.toThrow("CAPTURE_PERSON_REVIEW_REQUIRED"); expect(await snapshot()).toEqual(before);
  const corrected = before.people[0];
  const matching = { ...incoming, name: corrected.name, sex: corrected.sex, living: corrected.living, birth: corrected.birth, death: corrected.death, notes: corrected.notes };
  const reused = await owner.mutation(api.vaultMutations.upsertPerson, matching); expect(reused).toEqual({ personId: original._id, created: false });
  const after = await snapshot(); expect(after.people).toHaveLength(1); expect(after.keys).toEqual(before.keys); expect(after.events).toEqual(before.events); expect(after.roles).toEqual(before.roles);
  expect(after.people[0]).toMatchObject({ ...corrected, fsId: "PID-A", updatedAt: expect.any(Number) });
  // A previous safe capture does not grant authority for a later overwrite.
  await expect(owner.mutation(api.vaultMutations.upsertPerson, incoming)).rejects.toThrow("CAPTURE_PERSON_REVIEW_REQUIRED"); expect(await snapshot()).toEqual(after);
});

test("capture without a PID cannot overwrite an imported person's corrected fields via name fallback", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", names: [{ given: "Same", surname: "Name" }], living: false, sex: "unknown" }] });
  const person = (await t.run(ctx => ctx.db.query("persons").collect()))[0]; await t.mutation(internal.persons.update, { id: person._id, sex: "female", notes: "Retained correction" });
  const before = await t.run(ctx => ctx.db.query("persons").collect());
  await expect(t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertPerson, { vaultOwnerId: OWNER, name: { given: "Same", surname: "Name" }, sex: "unknown", living: false, notes: "Incoming boilerplate" })).rejects.toThrow("CAPTURE_PERSON_REVIEW_REQUIRED");
  expect(await t.run(ctx => ctx.db.query("persons").collect())).toEqual(before);
});


test.each(["importCreated", "proposalThenImported"])("imported identities retain proposal-only MCP authority boundaries (%s)", async origin => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
  if (origin === "proposalThenImported") {
    const ids = [];
    for (const key of ["P", "Q", "T"]) {
      const saved = await t.mutation(internal.mcpFamilyHistory.savePerson, { principal: principal(), grantId, operationId: `proposal-create-${key}`, requestHash: `proposal-create-${key}`, input: { mode: "create", createKey: `proposal-${key}`, fsId: key, name: { given: key, surname: "Person" }, sex: "unknown", living: false } }); ids.push(saved.person.id);
    }
    await t.mutation(internal.mcpFamilyHistory.saveRelationship, { principal: principal(), grantId, operationId: "proposal-create-rel", requestHash: "proposal-create-rel", input: { mode: "create", createKey: "proposal-rel", type: "Couple", person1: ids[0], person2: ids[1], facts: [{ type: "marriage", description: "Ohio" }] } });
  }
  const job = await begin(t, grantId);
  await send(t, grantId, job.importJobId, 0, { persons: ["P", "Q", "T"].map(key => ({ key, living: false, names: [{ given: key, surname: "Person" }] })), relationships: [{ key: "R", type: "Couple", person1Key: "P", person2Key: "Q", facts: [{ type: "marriage", description: "Ohio" }] }], sources: [{ key: "S", title: "Original relationship source" }], citations: [{ key: "C", sourceKey: "S", extractedText: "Ohio evidence", targets: [{ kind: "relationship", key: "R" }] }] });
  const people = await t.run(ctx => ctx.db.query("persons").collect()); const p = people.find(row => row.fsId === "P")!; const third = people.find(row => row.fsId === "T")!;
  await t.mutation(internal.persons.update, { id: p._id, name: { given: "Owner correction", surname: "Person" } });
  const snapshot = () => t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), relationships: await ctx.db.query("relationships").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot(); const person = before.people.find(row => row._id === p._id)!; const rel = before.relationships[0];
  expect(person.creationProvenance?.method).toBe(origin === "proposalThenImported" ? "mcp" : "import");
  const changes = [{ name: { given: "Rewritten", surname: "Person" } }, { alternateNames: [{ given: "Replacement", surname: "Person" }] }, { sex: "female" }, { living: true }, { birth: { date: { original: "1901" } } }, { death: { date: { original: "2001" } } }];
  for (const [index, change] of changes.entries()) {
    await expect(t.mutation(internal.mcpFamilyHistory.savePerson, { principal: principal(), grantId, operationId: `forbid-import-person-${index}`, requestHash: `forbid-import-person-${index}`, input: { mode: "update", personId: String(person._id), expectedUpdatedAt: person.updatedAt, ...change } })).rejects.toThrow("FORBIDDEN"); expect(await snapshot()).toEqual(before);
  }
  for (const [index, change] of [{ person2: String(third._id) }, { type: "ParentChild" }, { facts: [{ type: "marriage", description: "Arizona" }] }].entries()) {
    await expect(t.mutation(internal.mcpFamilyHistory.saveRelationship, { principal: principal(), grantId, operationId: `forbid-import-rel-${index}`, requestHash: `forbid-import-rel-${index}`, input: { mode: "update", relationshipId: String(rel._id), expectedUpdatedAt: rel.updatedAt, ...change } })).rejects.toThrow("FORBIDDEN"); expect(await snapshot()).toEqual(before);
  }
  await expect(t.mutation(internal.mcpFamilyHistory.saveRecords, { principal: principal(), grantId, operationId: "forbid-import-batch", requestHash: "forbid-import-batch", input: { summary: "Refused synthetic overwrite", people: [{ mode: "update", personId: String(person._id), expectedUpdatedAt: person.updatedAt, name: { given: "Rewritten", surname: "Person" } }], relationships: [{ mode: "update", relationshipId: String(rel._id), expectedUpdatedAt: rel.updatedAt, facts: [{ type: "marriage", description: "Arizona" }] }] } })).rejects.toThrow("FORBIDDEN"); expect(await snapshot()).toEqual(before);
  await expect(t.mutation(internal.mcpFamilyHistory.saveRecords, { principal: principal(), grantId, operationId: "forbid-import-rel-batch", requestHash: "forbid-import-rel-batch", input: { summary: "Refused relationship overwrite", relationships: [{ mode: "update", relationshipId: String(rel._id), expectedUpdatedAt: rel.updatedAt, facts: [{ type: "marriage", description: "Arizona" }] }] } })).rejects.toThrow("FORBIDDEN"); expect(await snapshot()).toEqual(before);
  await t.mutation(internal.mcpFamilyHistory.savePerson, { principal: principal(), grantId, operationId: "allowed-import-research", requestHash: "allowed-import-research", input: { mode: "update", personId: String(person._id), expectedUpdatedAt: person.updatedAt, researchStatus: "in_progress" } });
  expect(await t.run(ctx => ctx.db.get(person._id))).toMatchObject({ name: person.name, researchStatus: "in_progress" });
});

test("genuine MCP proposals remain editable within the bounded import-history check", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grantId = await seedGrant(t, { vaultOwnerId: OWNER }); const ids = [];
  for (const key of ["A", "B"]) { const saved = await t.mutation(internal.mcpFamilyHistory.savePerson, { principal: principal(), grantId, operationId: `pure-proposal-${key}`, requestHash: `pure-proposal-${key}`, input: { mode: "create", createKey: `pure-${key}`, name: { given: key, surname: "Proposal" }, sex: "unknown", living: false } }); ids.push(saved.person.id); }
  const first = await t.run(ctx => ctx.db.get(ctx.db.normalizeId("persons", ids[0])!));
  await t.mutation(internal.mcpFamilyHistory.savePerson, { principal: principal(), grantId, operationId: "pure-person-update", requestHash: "pure-person-update", input: { mode: "update", personId: ids[0], expectedUpdatedAt: first!.updatedAt, name: { given: "Aileen", surname: "Proposal" } } });
  const rel = await t.mutation(internal.mcpFamilyHistory.saveRelationship, { principal: principal(), grantId, operationId: "pure-rel-create", requestHash: "pure-rel-create", input: { mode: "create", createKey: "pure-rel", type: "Couple", person1: ids[0], person2: ids[1] } });
  await t.mutation(internal.mcpFamilyHistory.saveRelationship, { principal: principal(), grantId, operationId: "pure-rel-update", requestHash: "pure-rel-update", input: { mode: "update", relationshipId: rel.relationship.id, expectedUpdatedAt: rel.relationship.updatedAt, facts: [{ type: "marriage", description: "Proposed detail" }] } });
  const person = await t.run(ctx => ctx.db.get(ctx.db.normalizeId("persons", ids[0])!)); expect(person?.name.given).toBe("Aileen");
  expect((await t.run(ctx => ctx.db.query("relationships").collect()))[0].facts).toEqual([{ type: "marriage", description: "Proposed detail" }]);
  await t.run(async ctx => { for (let i = 0; i < 50; i++) await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "person", recordKey: `pure-extra-${i}`, recordId: String(person!._id), createdAt: 1, updatedAt: 1 }); });
  await expect(t.mutation(internal.mcpFamilyHistory.savePerson, { principal: principal(), grantId, operationId: "bounded-proposal-refusal", requestHash: "bounded-proposal-refusal", input: { mode: "update", personId: ids[0], expectedUpdatedAt: person!.updatedAt, living: true } })).rejects.toThrow("FORBIDDEN"); expect(await t.run(ctx => ctx.db.get(person!._id))).toEqual(person);
});

test.each(["all", "one", "nested", "existingAlias"])("relationship alias cannot restore a manual fact clearing (%s)", async mode => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const facts = [{ type: "marriage", date: { original: "1900", year: 1900 }, description: "Original marriage" }, { type: "divorce", description: "Original divorce" }];
  const relationship = { key: "R1", type: "Couple" as const, person1Key: "P", person2Key: "Q", facts };
  await send(t, grant, job.importJobId, 0, { persons: ["P", "Q"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [relationship] });
  if (mode === "existingAlias") await send(t, grant, job.importJobId, 1, { relationships: [{ ...relationship, key: "R2", facts: undefined }] });
  const rel = (await t.run(ctx => ctx.db.query("relationships").collect()))[0];
  const cleared = mode === "one" ? [facts[1]] : mode === "nested" ? [{ ...facts[0], description: "" }, facts[1]] : [];
  await t.mutation(internal.relationships.updateFacts, { id: rel._id, facts: cleared });
  const snapshot = () => t.run(async ctx => ({ relationships: await ctx.db.query("relationships").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const batch = { relationships: [{ ...relationship, key: "R2" }] }; const index = mode === "existingAlias" ? 2 : 1;
  for (const dryRun of [true, false]) { const operation = `relationship-clearing-${mode}-${dryRun}`; const result = await send(t, grant, job.importJobId, index, batch, { dryRun }, operation); expect(result.results).toEqual([expect.objectContaining({ status: "failed", reason: expect.stringContaining("RELATIONSHIP_ALIAS_CLEARING_REVIEW_REQUIRED") })]); expect(await snapshot()).toEqual(before); expect(await send(t, grant, job.importJobId, index, batch, { dryRun }, operation)).toEqual(dryRun ? result : { ...result, deduplicated: true }); }
});

test("a genuinely blank legacy relationship can still gain an imported fact", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: ["P", "Q"].map(key => ({ key, living: false, names: [{ given: key }] })) });
  const ids = await t.run(async ctx => { const people = await ctx.db.query("persons").collect(); return ctx.db.insert("relationships", { vaultOwnerId: OWNER, type: "Couple", person1: people.find(row => row.fsId === "P")!._id, person2: people.find(row => row.fsId === "Q")!._id, facts: [], createdAt: 1, updatedAt: 1 }); });
  const batch = { relationships: [{ key: "R", type: "Couple" as const, person1Key: "P", person2Key: "Q", facts: [{ type: "marriage", description: "New supplied detail" }] }] };
  const dry = await send(t, grant, job.importJobId, 1, batch, { dryRun: true }, "dry-blank-relationship"); const real = await send(t, grant, job.importJobId, 1, batch); expect(dry.counts).toEqual(real.counts); expect(real.counts.relationships.linked).toBe(1); expect((await t.run(ctx => ctx.db.get(ids)))?.facts).toEqual(batch.relationships[0].facts);
});

test("relationship clearing history remains bounded before a new alias fill", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: ["P", "Q"].map(key => ({ key, living: false, names: [{ given: key }] })), relationships: [{ key: "R1", type: "Couple", person1Key: "P", person2Key: "Q" }] });
  await t.run(async ctx => { const rel = (await ctx.db.query("relationships").collect())[0]; for (let i = 0; i < 50; i++) await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "relationship", recordKey: `extra-rel-${i}`, recordId: String(rel._id), lastImportedJson: "{}", externalKeyVersion: 2, createdAt: 1, updatedAt: 1 }); });
  const before = await t.run(ctx => ctx.db.query("relationships").collect()); const batch = { relationships: [{ key: "R2", type: "Couple" as const, person1Key: "P", person2Key: "Q", facts: [{ type: "marriage", description: "Unproven new detail" }] }] };
  for (const dryRun of [true, false]) { const result = await send(t, grant, job.importJobId, 1, batch, { dryRun }, `rel-history-bound-${dryRun}`); expect(result.results[0].reason).toContain("RELATIONSHIP_ALIAS_CLEARING_REVIEW_REQUIRED"); expect(await t.run(ctx => ctx.db.query("relationships").collect())).toEqual(before); }
});


test.each(["title", "type", "url", "notes"])("capture cannot replace imported source %s beneath retained evidence", async field => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  const source = { key: "S", title: "Original census", type: "census", repository: "FamilySearch", url: "https://example.test/original", notes: "Original private source note" };
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "Original" }] }], sources: [source], citations: [{ key: "C", sourceKey: "S", extractedText: "Evidence about original material", targets: [{ kind: "person", key: "P" }] }], notes: [{ key: "N", text: "Explanation of the original record", subject: { kind: "source", key: "S" } }] });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), citations: await ctx.db.query("citations").collect(), notes: await ctx.db.query("notes").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const args = { vaultOwnerId: OWNER, fsId: "S", importKey: "fs-source:DIFFERENT-PERSON:CAPTURE", title: source.title, type: "census" as const, repository: source.repository, url: source.url, notes: source.notes };
  const changed = { ...args, ...(field === "title" ? { title: "Replacement title" } : field === "type" ? { type: "website" as const } : field === "url" ? { url: "https://example.test/replacement" } : { notes: "Replacement note" }) };
  const owner = t.withIdentity({ subject: OWNER }); await expect(owner.mutation(api.vaultMutations.upsertSource, changed)).rejects.toThrow("CAPTURE_SOURCE_REVIEW_REQUIRED"); expect(await snapshot()).toEqual(before);
  const same = await owner.mutation(api.vaultMutations.upsertSource, { vaultOwnerId: OWNER, fsId: "S", importKey: args.importKey, title: args.title, type: args.type });
  expect(same).toEqual({ sourceId: before.sources[0]._id, created: false }); const after = await snapshot(); expect(after.sources[0]).toMatchObject({ ...before.sources[0], updatedAt: expect.any(Number) }); expect(after.keys).toEqual(before.keys); expect(after.citations).toEqual(before.citations); expect(after.links).toEqual(before.links); expect(after.notes).toEqual(before.notes);
  await expect(owner.mutation(api.vaultMutations.upsertSource, changed)).rejects.toThrow("CAPTURE_SOURCE_REVIEW_REQUIRED"); expect(await snapshot()).toEqual(after);
});

test.each(["splitPID", "correctedPID", "deleted", "foreign"])("capture source identity cannot select a conflicting or stale original (%s)", async mode => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { sources: [{ key: "S", title: "Original", type: "census" }] });
  await t.run(async ctx => { const source = (await ctx.db.query("sources").collect())[0]; if (mode === "splitPID") { await ctx.db.patch(source._id, { fsId: undefined }); await ctx.db.insert("sources", { vaultOwnerId: OWNER, fsId: "S", title: "Other", type: "census", createdAt: 1, updatedAt: 1 }); } else if (mode === "correctedPID") await ctx.db.patch(source._id, { fsId: "T" }); else if (mode === "deleted") await ctx.db.delete(source._id); else await ctx.db.patch(source._id, { vaultOwnerId: "foreign-source-owner" }); });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const code = mode === "splitPID" ? "AMBIGUOUS_SOURCE_IDENTITY" : mode === "correctedPID" ? "LEGACY_IDENTITY_REVIEW_REQUIRED" : "MISSING_TARGET";
  await expect(t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertSource, { vaultOwnerId: OWNER, fsId: "S", title: "Captured", type: "census" })).rejects.toThrow(code); expect(await snapshot()).toEqual(before);
});

test("actual capture of another person cannot replace an imported source's retained material", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const grant = await seedGrant(t, { vaultOwnerId: OWNER }); const job = await begin(t, grant);
  await send(t, grant, job.importJobId, 0, { persons: [{ key: "P", living: false, names: [{ given: "Original", surname: "Person" }] }], sources: [{ key: "S", title: "Original census", type: "census", repository: "FamilySearch", url: "https://example.test/original", notes: "Original private source note" }], citations: [{ key: "C", sourceKey: "S", extractedText: "Original record assertion", targets: [{ kind: "person", key: "P" }] }] });
  const snapshot = () => t.run(async ctx => ({ sources: await ctx.db.query("sources").collect(), citations: await ctx.db.query("citations").collect(), links: await ctx.db.query("citationLinks").collect(), keys: await ctx.db.query("mcpRecordKeys").collect() })); const before = await snapshot();
  const capture = CapturePackageSchema.parse({ schemaVersion: "2.0", captureId: "synthetic-other-person-source", capturedAt: "2026-01-01T00:00:00Z", extractorVersion: "synthetic-test", extractionDurationMs: 0, pageType: "sources", pageUrl: "https://example.test/capture/Q", pageTitle: "Other person's sources", uiLocale: "en", person: { familySearchId: "Q", name: "Unmapped Person", deathDate: "2000" }, sources: [{ id: "S", orderIndex: 0, sourceKey: "captured-S", sourceType: "record", title: "Replacement census", webPageUrl: "https://example.test/replacement", citation: "Replacement assertion", tags: [], indexed: { fields: [], textBlocks: [] }, rawText: "Replacement source text", expanded: true, expansionAttempts: 1, expansionSucceeded: true }], memories: [], diagnostics: { mode: "standard", warnings: [], errors: [] } });
  const owner = t.withIdentity({ subject: OWNER }); const client = { mutation: (ref: any, args: any) => owner.mutation(ref, args) } as unknown as Parameters<typeof importCapturePackageToConvex>[0]["client"];
  await expect(importCapturePackageToConvex({ client, vaultOwnerId: OWNER, capture, compatibilityMode: false, artifactPaths: {} })).rejects.toThrow("CAPTURE_SOURCE_REVIEW_REQUIRED"); expect(await snapshot()).toEqual(before);
  // Capture is an existing multi-mutation flow: the new Q may precede refusal.
  // Claim only source-item preservation, not rollback of the entire capture.
  const people = await t.run(ctx => ctx.db.query("persons").collect()); expect(people).toHaveLength(2); expect(people.find(row => row.fsId === "P")?.name).toEqual({ given: "Original", surname: "Person" }); expect(people.some(row => row.fsId === "Q")).toBe(true);
});

test.each([true, false])("capture respects retained legacy source material without import mappings (%s)", async attached => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const id = await t.run(async ctx => { const sourceId = await ctx.db.insert("sources", { vaultOwnerId: OWNER, fsId: "S", title: "Original", type: "census", importKey: "legacy-original", notes: "Legacy original note", createdAt: 1, updatedAt: 1 }); if (attached) await ctx.db.insert("notes", { vaultOwnerId: OWNER, subject: { kind: "source", id: String(sourceId) }, noteType: "research", text: "Retained explanation", createdAt: 1, updatedAt: 1 }); return sourceId; });
  const before = await t.run(ctx => ctx.db.get(id)); const call = t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertSource, { vaultOwnerId: OWNER, fsId: "S", importKey: "new-capture-key", title: "Changed", type: "census", notes: "New captured text" });
  if (attached) { await expect(call).rejects.toThrow("CAPTURE_SOURCE_REVIEW_REQUIRED"); expect(await t.run(ctx => ctx.db.get(id))).toEqual(before); }
  else { expect(await call).toEqual({ sourceId: id, created: false }); expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ title: "Changed", notes: "New captured text", importKey: "legacy-original" }); }
});
