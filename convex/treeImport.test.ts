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
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { generateSyntheticTree, packBatches, syntheticPid } from "../lib/treeImport/syntheticTree";
import { citationKeyFor, externalRecordKey, factKeyFor, factReferenceKeyFor, legacyCitationKeyFor, legacyFactKeyFor, type TreeImportBatch } from "../lib/treeImport/model";

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
      vaultOwnerId: OWNER, operationId: `${operationId}#${index}`, toolName: "family_history_import_tree_batch#chunk", requestHash: `hash-${index}`,
      resultJson: JSON.stringify({ importJobId: job.importJobId, results: results.slice(index * 125, (index + 1) * 125), plannedKeys: [], duplicatesSuggested: 0 }), clientId: principal().clientId, createdAt: Date.now(),
    });
  });
  const args = { principal: principal(), grantId: grant, importJobId: job.importJobId, operationId, requestHash: "large-hash", batchIndex: 0, records: 500, results, duplicatesSuggested: 0, chunkCount: 4, final: false };
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
  const personKeys = ["?".repeat(199) + "A", "?".repeat(199) + "B"];
  const facts = Array.from({ length: 60 }, (_, i) => ({ key: "?".repeat(198) + String(i).padStart(2, "0"), type: "occupation", value: "Initial", description: "Original", date: { original: "1800", year: 1800 }, place: { original: "Initial place" } }));
  const generatedCitation = { sourceKey: "S", targets: [{ kind: "person" as const, key: personKeys[0] }] };
  const sharedKey = citationKeyFor(generatedCitation);
  const batch: TreeImportBatch = {
    sources: [{ key: "S", title: "Synthetic source" }],
    persons: personKeys.map((key, i) => ({ key, living: false, names: [{ given: `Synthetic${i}` }], facts: facts.map(f => ({ ...f })) })),
    citations: [generatedCitation, { key: sharedKey, sourceKey: "S", targets: [{ kind: "person", key: personKeys[1] }] }],
  };
  const first = await send(t, grant, job.importJobId, 0, batch);
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
  const result = await send(t, grant, job.importJobId, 1, batch, {}, "actual-large-conflicts");
  expect(result.results).toEqual([]);
  expect(result.resultsTrimmed).toContain("retained conflicts");
  const receipts = await t.run(async ctx => ctx.db.query("mcpOperations").collect());
  expect(receipts.some(row => row.toolName === "family_history_import_tree_batch#detail")).toBe(true);
  expect(receipts.every(row => new TextEncoder().encode(JSON.stringify(row)).byteLength < 1024 * 1024)).toBe(true);
  const entries: any[] = [];
  let cursor: { resultsChunkIndex: number; resultsOffset: number } | null = { resultsChunkIndex: 0, resultsOffset: 0 };
  while (cursor) {
    const page = await t.query(internal.treeImport.getTreeImport, { principal: principal(), importJobId: job.importJobId, resultsOperationId: "actual-large-conflicts", ...cursor }) as any;
    entries.push(...page.results); cursor = page.next;
  }
  expect(entries.filter(row => row.kept)).toHaveLength(480);
  const citationEntries = entries.filter(row => row.kind === "citations");
  expect(citationEntries.map(row => row.keyOrigin).sort()).toEqual(["explicit", "generated"]);
  const notes = citationEntries.map((row, i) => ({ key: `result-note-${i}`, text: `Synthetic note ${i}`, subject: { kind: "citation" as const, key: row.key, keyOrigin: row.keyOrigin } }));
  const noted = await send(t, grant, job.importJobId, 2, { notes });
  expect(noted.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const storedNotes = await t.run(async ctx => ctx.db.query("notes").collect());
  expect(storedNotes.map(row => row.subject.id).sort()).toEqual(citationEntries.map(row => row.id).sort());
  const replay = await send(t, grant, job.importJobId, 1, batch, {}, "actual-large-conflicts");
  expect(replay.deduplicated).toBe(true);
  expect(replay.resultDetails).toEqual(result.resultDetails);
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
