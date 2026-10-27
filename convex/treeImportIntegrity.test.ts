/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic internal-handler boundary fixtures. */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { externalRecordKey } from "../lib/treeImport/model";
import { DEFAULT_LOCAL_VAULT_OWNER } from "../lib/vault/constants";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_import_integrity_AAAAAAAA";
const OTHER = "user_import_integrity_BBBBBBBB";
const principal = (subject = OWNER) => ({ issuer: "https://identity.example.test", subject, clientId: "synthetic-mcp-client", scopes: [] });
type T = ReturnType<typeof convexTest>;
const person = (key: string, given = "Synthetic") => ({ key, names: [{ given, surname: "Fixture" }], living: false });
const tables = ["persons", "relationships", "events", "personEvents", "sources", "citations", "citationLinks", "notes", "media", "connections", "mcpRecordKeys"] as const;

async function setup(owner = OWNER) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grantId = await seedGrant(t, { vaultOwnerId: owner });
  const job: any = await t.mutation(internal.treeImport.beginTreeImport, {
    principal: principal(owner), grantId, operationId: "begin-integrity", requestHash: "begin-integrity-hash",
    input: { importKey: "synthetic-integrity", system: "familysearch", label: "Synthetic integrity fixture" },
  });
  return { t, grantId, job: job.importJobId as string };
}
async function send(t: T, grantId: string, job: string, input: any, op = "batch-integrity", owner = OWNER) {
  return await t.action(internal.treeImport.importTreeBatch, {
    principal: principal(owner), grantId, operationId: op, requestHash: JSON.stringify(input),
    input: { importJobId: job, batchIndex: 0, ...input },
  }) as any;
}
async function data(t: T) {
  return await t.run(async ctx => Object.fromEntries(await Promise.all(tables.map(async table => [table, await ctx.db.query(table).collect()])))) as any;
}
async function staleFact(t: T, personKey: string, factKey: string) {
  await t.run(async ctx => {
    const event = await ctx.db.insert("events", { vaultOwnerId: OWNER, type: "residence", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "event", recordKey: externalRecordKey("familysearch", "fact", `${personKey}/${factKey}`), recordId: String(event), createdAt: 1, updatedAt: 1 });
    await ctx.db.delete(event);
  });
}

describe("tree import integrity boundaries", () => {
  test.each([false, true])("late failed person leaves no records, aliases, duplicate suggestions or planned references (dryRun=%s)", async dryRun => {
    const { t, grantId, job } = await setup();
    await t.run(async ctx => { await ctx.db.insert("persons", { vaultOwnerId: OWNER, name: { given: "Synthetic", surname: "Fixture" }, birth: { date: { original: "1900", year: 1900 } }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 }); });
    await staleFact(t, "$José/failed", "gone");
    const before = await data(t);
    const bad = { ...person("$José/failed"), otherIds: [{ system: "gedcom", id: "@FAILED@" }], facts: [{ key: "birth", type: "BIRT", date: { original: "1900", year: 1900 } }, { key: "gone", type: "RESI" }] };
    const input = { dryRun, persons: [bad, person("good", "Unrelated")], relationships: [{ key: "dependent", type: "Couple", person1Key: "$José/failed", person2Key: "good" }] };
    const result = await send(t, grantId, job, input);
    expect(result.results.find((r: any) => r.key === "$José/failed")).toMatchObject({ status: "failed" });
    expect(result.results.find((r: any) => r.key === "dependent")).toMatchObject({ status: "failed", reason: expect.stringContaining("MISSING_PERSON") });
    expect(result.counts.persons.created).toBe(1);
    expect(result.duplicatesSuggested ?? result.possibleDuplicates).toBe(0);
    const after = await data(t);
    if (dryRun) { expect(after).toEqual(before); return; }
    expect(after.persons.map((r: any) => r.fsId).filter(Boolean)).toEqual(["good"]);
    expect(after.events).toEqual(before.events);
    expect(after.personEvents).toEqual(before.personEvents);
    expect(after.connections).toEqual(before.connections);
    expect(after.relationships).toHaveLength(0);
    expect(after.mcpRecordKeys.filter((r: any) => /FAILED|failed|birth/.test(r.recordKey))).toEqual(before.mcpRecordKeys);
    const replay = await send(t, grantId, job, input);
    expect(replay.deduplicated).toBe(true);
    expect(await data(t)).toEqual(after);
    const corrected = await send(t, grantId, job, { persons: [{ ...bad, facts: [bad.facts[0]] }], relationships: input.relationships }, "corrected");
    expect(corrected.results.every((r: any) => r.status !== "failed")).toBe(true);
    expect((await data(t)).personEvents).toHaveLength(1);
  });

  test("late failed refresh restores person, fact versions and newly remembered aliases", async () => {
    const { t, grantId, job } = await setup();
    await send(t, grantId, job, { persons: [{ ...person("refresh"), facts: [{ key: "birth", type: "BIRT", date: { original: "1900", year: 1900 } }] }] }, "initial");
    await staleFact(t, "refresh", "gone");
    const before = await data(t);
    const changed = { ...person("refresh", "Changed"), otherIds: [{ system: "gedcom", id: "@REFRESH@" }], facts: [{ key: "birth", type: "BIRT", date: { original: "1901", year: 1901 } }, { key: "gone", type: "RESI" }] };
    const result = await send(t, grantId, job, { persons: [changed] }, "bad-refresh");
    expect(result.counts.persons.failed).toBe(1);
    expect(await data(t)).toEqual(before);
    const corrected = await send(t, grantId, job, { persons: [{ ...changed, facts: [changed.facts[0]] }] }, "good-refresh");
    expect(corrected.counts.persons.updated).toBe(1);
    const after = await data(t);
    expect(after.persons[0].name.given).toBe("Changed");
    expect(after.events[0].date.year).toBe(1901);
    expect(after.mcpRecordKeys.filter((r: any) => r.recordKey.includes("@REFRESH@"))).toHaveLength(1);
  });

  test.each([false, true])("explicit citation key refuses another source in one batch (dryRun=%s)", async dryRun => {
    const { t, grantId, job } = await setup();
    const before = await data(t);
    const input = { dryRun, persons: [person("a"), person("b")], sources: [{ key: "source-a", title: "Source A" }, { key: "source-b", title: "Source B" }], citations: [
      { key: "$citation:José", sourceKey: "source-a", targets: [{ kind: "person", key: "a" }] },
      { key: "$citation:José", sourceKey: "source-b", targets: [{ kind: "person", key: "b" }] },
    ] };
    const result = await send(t, grantId, job, input);
    expect(result.results.filter((r: any) => r.kind === "citations").map((r: any) => r.status)).toEqual(["created", "failed"]);
    expect(result.results.find((r: any) => r.kind === "citations" && r.status === "failed").reason).toContain("IDEMPOTENCY_CONFLICT");
    if (dryRun) { expect(await data(t)).toEqual(before); return; }
    const after = await data(t);
    expect(after.citations).toHaveLength(1);
    expect(after.citationLinks).toHaveLength(1);
    const citation = after.citations[0];
    expect(after.sources.find((s: any) => s._id === citation.sourceId).title).toBe("Source A");
    const again = await send(t, grantId, job, { citations: [input.citations[0]] }, "same-source-reuse");
    expect(again.results.every((r: any) => r.status !== "failed")).toBe(true);
    const rejected = await send(t, grantId, job, { citations: [input.citations[1]] }, "other-source-reuse");
    expect(rejected.counts.citations.failed).toBe(1);
    expect(await data(t)).toEqual(after);
  });

  test("dry-run citation affinity survives a query chunk boundary", async () => {
    const { t, grantId, job } = await setup();
    const base = { principal: principal(), grantId, importJobId: job, operationId: "dry-chunk" };
    const first: any = await t.query(internal.treeImport.planTreeImportChunk, { ...base, plannedKeys: [], items: [
      { kind: "sources", index: 0, item: { key: "sa", title: "Source A" } },
      { kind: "sources", index: 1, item: { key: "sb", title: "Source B" } },
      { kind: "persons", index: 0, item: person("p") },
      { kind: "citations", index: 0, item: { key: "citation", sourceKey: "sa", targets: [{ kind: "person", key: "p" }] } },
    ] });
    const second: any = await t.query(internal.treeImport.planTreeImportChunk, { ...base, plannedKeys: first.plannedKeys, ...(first.plannedBindings ? { plannedBindings: first.plannedBindings } : {}), items: [
      { kind: "citations", index: 1, item: { key: "citation", sourceKey: "sb", targets: [{ kind: "person", key: "p" }] } },
    ] });
    expect(second.results[0]).toMatchObject({ status: "failed", reason: expect.stringContaining("IDEMPOTENCY_CONFLICT") });
    expect((await data(t)).citations).toHaveLength(0);
  });

  test("ambiguous slash-delimited fact keys never update another person's event", async () => {
    const { t, grantId, job } = await setup();
    const result = await send(t, grantId, job, { persons: [
      { ...person("A/B"), facts: [{ key: "C", type: "RESI", description: "First person's event" }] },
      { ...person("A"), facts: [{ key: "B/C", type: "RESI", description: "Second person's event" }] },
    ] });
    expect(result.counts.persons.created).toBe(1);
    expect(result.counts.persons.failed).toBe(1);
    const after = await data(t);
    expect(after.persons).toHaveLength(1);
    expect(after.events).toHaveLength(1);
    expect(after.events[0].description).toBe("First person's event");
    expect(after.personEvents).toHaveLength(1);
  });

  test("a foreign-owner durable source mapping cannot create cross-owner citations or links", async () => {
    const { t, grantId, job } = await setup();
    await send(t, grantId, job, { persons: [person("mine")] }, "own-person");
    await t.run(async ctx => {
      const id = await ctx.db.insert("sources", { vaultOwnerId: OTHER, title: "Other owner's source", type: "other", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "source", recordKey: externalRecordKey("familysearch", "source", "foreign"), recordId: String(id), createdAt: 1, updatedAt: 1 });
    });
    const before = await data(t);
    const result = await send(t, grantId, job, { citations: [{ key: "foreign-citation", sourceKey: "foreign", targets: [{ kind: "person", key: "mine" }] }] }, "foreign-ref");
    expect(result.counts.citations.failed).toBe(1);
    expect(result.results[0].reason).toContain("NOT_FOUND");
    expect(await data(t)).toEqual(before);
  });

  test("progress independently refuses missing, revoked, narrowed and wrong-owner grants", async () => {
    const { t, grantId, job } = await setup();
    const get = (id?: string, owner = OWNER) => t.query(internal.treeImport.getTreeImport, { principal: principal(owner), ...(id ? { grantId: id } : {}), importJobId: job } as any);
    await expect(get()).rejects.toThrow(/GRANT_REQUIRED/);
    expect((await get(grantId) as any).import.importJobId).toBe(job);
    const foreignGrant = await seedGrant(t, { vaultOwnerId: OTHER });
    await expect(get(foreignGrant)).rejects.toThrow(/GRANT_REQUIRED/);
    await expect(get(foreignGrant, OTHER)).rejects.toThrow(/NOT_FOUND/);
    await t.run(async ctx => { await ctx.db.patch(grantId as any, { boundary: { kind: "selected_people", personIds: [] } }); });
    await expect(get(grantId)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await t.run(async ctx => { await ctx.db.patch(grantId as any, { status: "revoked" }); });
    await expect(get(grantId)).rejects.toThrow(/GRANT_REVOKED/);
  });

  test("dry-run aliases preserve their canonical person and fact bindings across chunks", async () => {
    const { t, grantId, job } = await setup();
    const base = { principal: principal(), grantId, importJobId: job, operationId: "dry-alias-chunk" };
    const first: any = await t.query(internal.treeImport.planTreeImportChunk, { ...base, plannedKeys: [], items: [
      { kind: "persons", index: 0, item: { ...person("original"), otherIds: [{ system: "gedcom", id: "@P@" }], facts: [{ key: "birth", type: "BIRT" }] } },
    ] });
    const second: any = await t.query(internal.treeImport.planTreeImportChunk, {
      ...base, plannedKeys: first.plannedKeys, ...(first.plannedBindings ? { plannedBindings: first.plannedBindings } : {}), ...(first.plannedRecords ? { plannedRecords: first.plannedRecords } : {}), items: [
        { kind: "persons", index: 1, item: { ...person("alias"), otherIds: [{ system: "gedcom", id: "@P@" }], facts: [{ key: "other", type: "RESI" }] } },
        { kind: "relationships", index: 0, item: { key: "self", type: "Couple", person1Key: "original", person2Key: "alias" } },
      ],
    });
    expect(second.results[0]).toMatchObject({ status: "linked", id: first.results[0].id });
    expect(second.results[1]).toMatchObject({ status: "failed", reason: expect.stringContaining("cannot be related to themself") });
    expect((await data(t)).persons).toHaveLength(0);
  });

  test("progress never hydrates another owner's person through a stale suggestion", async () => {
    const { t, grantId, job } = await setup();
    await send(t, grantId, job, { persons: [person("own")] });
    await t.run(async ctx => {
      const mine = (await ctx.db.query("persons").collect())[0];
      const foreign = await ctx.db.insert("persons", { vaultOwnerId: OTHER, name: { given: "Private foreign", surname: "Fixture" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("connections", { vaultOwnerId: OWNER, from: { kind: "person", id: String(mine._id) }, to: { kind: "person", id: String(foreign) }, relation: "possibly_same_as", state: "proposed", importJobId: job as any, createdAt: 1, updatedAt: 1 });
    });
    const progress: any = await t.query(internal.treeImport.getTreeImport, { principal: principal(), grantId, importJobId: job });
    expect(progress.possibleDuplicates).toEqual([]);
    expect(JSON.stringify(progress)).not.toContain("Private foreign");
  });

  test.each(["chunk", "batch"])("%s replay refuses mismatched tool or hash before returning another receipt", async kind => {
    const { t, grantId, job } = await setup();
    await t.run(async ctx => { await ctx.db.insert("mcpOperations", { vaultOwnerId: OWNER, operationId: "collision", toolName: "family_history_save_records", requestHash: "same-hash", resultJson: JSON.stringify({ privateWrongTool: true }), clientId: "synthetic-mcp-client", createdAt: 1 }); });
    const base = { principal: principal(), grantId, importJobId: job, operationId: "collision", requestHash: "same-hash" };
    const call = kind === "chunk"
      ? () => t.mutation(internal.treeImport.applyTreeImportChunk, { ...base, items: [] })
      : () => t.mutation(internal.treeImport.recordTreeImportBatch, { ...base, batchIndex: 0, final: false, records: 0, results: [], duplicatesSuggested: 0 });
    await expect(call()).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    await t.run(async ctx => { const row = (await ctx.db.query("mcpOperations").collect()).find(row => row.operationId === "collision")!; await ctx.db.patch(row._id, { toolName: kind === "chunk" ? "family_history_import_tree_batch#chunk" : "family_history_import_tree_batch", requestHash: "other-hash" }); });
    await expect(call()).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  test("revoked or narrowed grants block both batch receipt replay and fresh child writes", async () => {
    const { t, grantId, job } = await setup();
    const input = { persons: [person("first")] };
    await send(t, grantId, job, input);
    const before = await data(t);
    const row = { principal: principal(), grantId, importJobId: job, operationId: "direct-row", item: { kind: "persons", index: 0, item: person("second") } };
    await t.run(async ctx => { await ctx.db.patch(grantId as any, { boundary: { kind: "selected_people", personIds: [] } }); });
    await expect(send(t, grantId, job, input)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await expect(t.mutation(internal.treeImport.applyTreeImportItem, row)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await t.run(async ctx => { await ctx.db.patch(grantId as any, { status: "revoked" }); });
    await expect(send(t, grantId, job, input)).rejects.toThrow(/GRANT_REVOKED/);
    await expect(t.mutation(internal.treeImport.applyTreeImportItem, row)).rejects.toThrow(/GRANT_REVOKED/);
    expect(await data(t)).toEqual(before);
  });

  test("equal outside keys in different owners remain independent; expired grants refuse progress", async () => {
    const { t, grantId, job } = await setup();
    const input = { persons: [person("same")], sources: [{ key: "same", title: "Synthetic source" }], citations: [{ key: "same", sourceKey: "same", targets: [{ kind: "person", key: "same" }] }] };
    await send(t, grantId, job, input);
    const otherGrant = await seedGrant(t, { vaultOwnerId: OTHER });
    const otherJob: any = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(OTHER), grantId: otherGrant, operationId: "begin-integrity", requestHash: "begin-integrity-hash", input: { importKey: "synthetic-integrity", system: "familysearch", label: "Other synthetic fixture" } });
    const other = await send(t, otherGrant, otherJob.importJobId, input, "batch-integrity", OTHER);
    expect(other.counts.persons.created).toBe(1);
    const after = await data(t);
    expect(after.persons).toHaveLength(2);
    expect(after.citations).toHaveLength(2);
    for (const citation of after.citations) expect(after.sources.find((s: any) => s._id === citation.sourceId).vaultOwnerId).toBe(citation.vaultOwnerId);
    const expired = await seedGrant(t, { vaultOwnerId: OWNER, clientId: "expired-synthetic-client", expiresAt: Date.now() - 60_000 });
    await expect(t.query(internal.treeImport.getTreeImport, { principal: principal(), grantId: expired, importJobId: job })).rejects.toThrow(/GRANT_EXPIRED/);
  });


  test.each([[false, false], [true, false], [false, true], [true, true]])("fact citation and note targets verify the named person (personExists=%s,dryRun=%s)", async (personExists, dryRun) => {
    const { t, grantId, job } = await setup();
    await send(t, grantId, job, {
      sources: [{ key: "source", title: "Synthetic source" }],
      persons: [{ ...person("A/B"), facts: [{ key: "C", type: "RESI" }] }, ...(personExists ? [person("A")] : [])],
    }, "fact-target-initial");
    const before = await data(t);
    const wrongTarget = { kind: "fact", personKey: "A", key: "B/C" };
    const result = await send(t, grantId, job, { dryRun, citations: [{ key: "target-citation", sourceKey: "source", targets: [wrongTarget] }], notes: [{ key: "target-note", text: "Synthetic note", subject: wrongTarget }] }, "wrong-fact-target");
    expect(result.counts.citations.failed).toBe(1);
    expect(result.counts.notes.failed).toBe(1);
    expect(result.results.every((r: any) => r.reason.includes(personExists ? "IDEMPOTENCY_CONFLICT" : "MISSING_PERSON"))).toBe(true);
    expect(await data(t)).toEqual(before);
    const target = { kind: "fact", personKey: "A/B", key: "C" };
    const valid = await send(t, grantId, job, { dryRun, citations: [{ key: "target-citation", sourceKey: "source", targets: [target] }], notes: [{ key: "target-note", text: "Synthetic note", subject: target }] }, "valid-fact-target");
    expect(valid.counts.citations.created).toBe(1);
    expect(valid.counts.notes.created).toBe(1);
    const after = await data(t);
    if (dryRun) expect(after).toEqual(before);
    else {
      expect(after.citationLinks[0].targetId).toBe(before.events[0]._id);
      expect(after.notes[0].subject.id).toBe(before.events[0]._id);
    }
  });

  test("an older corrected batch cannot rewind the cursor or complete a later frontier", async () => {
    const { t, grantId, job } = await setup();
    await send(t, grantId, job, { batchIndex: 0, cursor: "after-0", persons: [person("zero")] }, "zero");
    await send(t, grantId, job, { batchIndex: 1, cursor: "after-1", persons: [person("one")] }, "one");
    const corrected = await send(t, grantId, job, { batchIndex: 0, cursor: "after-0", final: true, persons: [person("zero", "Corrected")] }, "correct-old-zero");
    expect(corrected).toMatchObject({ nextBatchIndex: 2, cursor: "after-1", status: "open" });
    expect((await data(t)).persons.find((p: any) => p.fsId === "zero").name.given).toBe("Corrected");
    const next = await send(t, grantId, job, { batchIndex: 2, cursor: "after-2", persons: [person("two")] }, "two");
    expect(next).toMatchObject({ nextBatchIndex: 3, cursor: "after-2", status: "open" });
    const final = await send(t, grantId, job, { batchIndex: 2, cursor: "after-2", final: true, persons: [person("two")] }, "finish-latest");
    expect(final).toMatchObject({ nextBatchIndex: 3, cursor: "after-2", status: "completed" });
  });


  test("owner PID linking is not hidden by ten other vaults with the same outside ids", async () => {
    const { t, grantId, job } = await setup();
    const ids = await t.run(async ctx => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("persons", { vaultOwnerId: `${OTHER}-${i}`, fsId: "COMMON-PID", name: { given: "Foreign", surname: "Fixture" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("sources", { vaultOwnerId: `${OTHER}-${i}`, fsId: "COMMON-SOURCE", title: "Foreign source", type: "other", createdAt: 1, updatedAt: 1 });
      }
      const p = await ctx.db.insert("persons", { vaultOwnerId: OWNER, fsId: "COMMON-PID", name: { given: "Hand entered", surname: "Fixture" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 });
      const source = await ctx.db.insert("sources", { vaultOwnerId: OWNER, fsId: "COMMON-SOURCE", title: "Hand entered source", type: "other", createdAt: 1, updatedAt: 1 });
      return { person: String(p), source: String(source) };
    });
    const before = await data(t);
    const result = await send(t, grantId, job, { persons: [person("COMMON-PID", "Imported")], sources: [{ key: "COMMON-SOURCE", title: "Imported title" }] });
    expect(result.results.find((r: any) => r.kind === "persons")).toMatchObject({ status: "linked", id: ids.person });
    expect(result.results.find((r: any) => r.kind === "sources")).toMatchObject({ status: "linked", id: ids.source });
    const after = await data(t);
    expect(after.persons).toHaveLength(before.persons.length);
    expect(after.sources).toHaveLength(before.sources.length);
    expect(after.persons.find((p: any) => p._id === ids.person).name.given).toBe("Hand entered");
    expect(after.sources.find((p: any) => p._id === ids.source).title).toBe("Hand entered source");
    expect(after.persons.filter((p: any) => p.vaultOwnerId !== OWNER)).toEqual(before.persons.filter((p: any) => p.vaultOwnerId !== OWNER));
    expect(after.sources.filter((p: any) => p.vaultOwnerId !== OWNER)).toEqual(before.sources.filter((p: any) => p.vaultOwnerId !== OWNER));
  });

  test("legacy unowned PID rows remain linkable only by the existing local vault owner", async () => {
    const { t, grantId, job } = await setup(DEFAULT_LOCAL_VAULT_OWNER);
    const ids = await t.run(async ctx => {
      const p = await ctx.db.insert("persons", { fsId: "LEGACY-PID", name: { given: "Legacy", surname: "Fixture" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 });
      const source = await ctx.db.insert("sources", { fsId: "LEGACY-SOURCE", title: "Legacy source", type: "other", createdAt: 1, updatedAt: 1 });
      return { person: String(p), source: String(source) };
    });
    const result = await send(t, grantId, job, { persons: [person("LEGACY-PID")], sources: [{ key: "LEGACY-SOURCE", title: "Imported" }] }, "legacy", DEFAULT_LOCAL_VAULT_OWNER);
    expect(result.results.find((r: any) => r.kind === "persons")).toMatchObject({ status: "linked", id: ids.person });
    expect(result.results.find((r: any) => r.kind === "sources")).toMatchObject({ status: "linked", id: ids.source });
    const otherGrant = await seedGrant(t, { vaultOwnerId: OWNER });
    const otherJob: any = await t.mutation(internal.treeImport.beginTreeImport, { principal: principal(), grantId: otherGrant, operationId: "ordinary-begin", requestHash: "ordinary-begin", input: { importKey: "ordinary", system: "familysearch", label: "Ordinary synthetic owner" } });
    const ordinary = await send(t, otherGrant, otherJob.importJobId, { persons: [person("LEGACY-PID")], sources: [{ key: "LEGACY-SOURCE", title: "My own source" }] }, "ordinary");
    expect(ordinary.results.every((r: any) => r.status === "created")).toBe(true);
    expect(ordinary.results.every((r: any) => r.id !== ids.person && r.id !== ids.source)).toBe(true);
  });

});
