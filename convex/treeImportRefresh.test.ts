/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic refresh and preview boundary fixtures. */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_refresh_fixture_AAAAAAAA";
const principal = { issuer: "https://identity.example.test", subject: OWNER, clientId: "synthetic-mcp-client", scopes: [] };
const person = (key: string, given = "Synthetic") => ({ key, names: [{ given, surname: "Fixture" }], sex: "unknown", living: false });
const tableNames = ["persons", "events", "personEvents", "sources", "citations", "citationLinks", "relationships", "notes", "media", "connections", "mcpRecordKeys", "mcpOperations", "treeImports", "treeImportBatches", "agentActivity"] as const;
type T = ReturnType<typeof convexTest>;
async function snapshot(t: T) { return await t.run(async ctx => Object.fromEntries(await Promise.all(tableNames.map(async table => [table, await ctx.db.query(table).collect()])))) as any; }
async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
  const begin = async (system = "familysearch", importKey = system) => await t.mutation(internal.treeImport.beginTreeImport, { principal, grantId, operationId: `begin-${importKey}`, requestHash: `begin-${importKey}`, input: { importKey: `fixture-${importKey}`, system, label: "Synthetic refresh fixture" } }) as any;
  const job = await begin();
  const send = async (input: any, op: string, importJobId = job.importJobId) => await t.action(internal.treeImport.importTreeBatch, { principal, grantId, operationId: op, requestHash: JSON.stringify(input), input: { importJobId, batchIndex: 0, ...input } }) as any;
  const owner = t.withIdentity({ subject: OWNER, issuer: principal.issuer, tokenIdentifier: `${principal.issuer}|${OWNER}` });
  return { t, grantId, job: job.importJobId as string, begin, send, owner };
}

describe("tree import safe refresh and truthful preview", () => {
  test("same-system external refresh is safe before manual edits and exact replay changes nothing", async () => {
    const { t, send } = await setup();
    const initial = await send({ persons: [person("P", "First")] }, "initial");
    expect(initial.counts.persons.created).toBe(1);
    const first = (await snapshot(t)).persons[0];
    expect(first.importState).toMatchObject({ version: 1, system: "familysearch", hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const repeat = await send({ persons: [person("P", "First")] }, "repeat");
    expect(repeat.counts.persons.unchanged).toBe(1);
    const changedInput = { persons: [person("P", "Changed outside")] };
    const changed = await send(changedInput, "changed");
    expect(changed.counts.persons.updated).toBe(1);
    const after = await snapshot(t);
    expect(after.persons[0].name.given).toBe("Changed outside");
    expect(after.persons[0].importState.hash).not.toBe(first.importState.hash);
    expect((await send(changedInput, "changed")).deduplicated).toBe(true);
    expect(await snapshot(t)).toEqual(after);
  });

  test.each([false, true])("manual person correction survives identical and changed outside content (dryRun=%s)", async dryRun => {
    const { t, send, owner } = await setup();
    const original = { persons: [person("P", "From site")] };
    await send(original, "original");
    const imported = (await snapshot(t)).persons[0];
    await owner.mutation(api.vaultMutations.upsertPerson, { vaultOwnerId: OWNER, fsId: "P", name: { given: "Human correction", surname: "Fixture" }, sex: "unknown", living: false });
    const edited = await snapshot(t);
    expect(edited.persons[0].creationProvenance.method).toBe("import");
    // Even a stale operation receipt may not write its former value again.
    expect((await send(original, "original")).deduplicated).toBe(true);
    expect(await snapshot(t)).toEqual(edited);
    for (const [index, given] of ["From site", "New outside content"].entries()) {
      const result = await send({ dryRun, persons: [person("P", given)] }, `refresh-${index}`);
      expect(result.counts.persons.failed).toBe(1);
      expect(result.results[0].reason).toContain("CONFLICT");
      const now = await snapshot(t);
      expect(now.persons[0]).toEqual(edited.persons[0]);
      expect(now.events).toEqual(edited.events);
      if (dryRun) expect(now).toEqual(edited);
    }
    expect((await snapshot(t)).persons[0]._id).toBe(imported._id);
  });

  test("manual source correction is protected and a failed refresh replay has no writes", async () => {
    const { t, send, owner } = await setup();
    await send({ sources: [{ key: "S", title: "From site" }] }, "source-original");
    await owner.mutation(api.vaultMutations.upsertSource, { vaultOwnerId: OWNER, fsId: "S", title: "Human source correction", type: "other" });
    const edited = await snapshot(t);
    const input = { sources: [{ key: "S", title: "New outside title" }] };
    const result = await send(input, "source-conflict");
    expect(result.counts.sources.failed).toBe(1);
    expect(result.results[0].reason).toContain("CONFLICT");
    expect((await snapshot(t)).sources).toEqual(edited.sources);
    const after = await snapshot(t);
    expect((await send(input, "source-conflict")).deduplicated).toBe(true);
    expect(await snapshot(t)).toEqual(after);
  });

  test("missing baseline and cross-system ownership fail closed without adopting human values", async () => {
    const { t, send, begin } = await setup();
    await send({ persons: [{ ...person("P", "Original"), otherIds: [{ system: "gedcom", id: "@P@" }] }] }, "original");
    const gedcom = await begin("gedcom");
    const same = await send({ persons: [person("@P@", "Original")] }, "gedcom-same", gedcom.importJobId);
    expect(same.counts.persons.created).toBe(0);
    const different = await send({ persons: [person("@P@", "Other system changed")] }, "gedcom-change", gedcom.importJobId);
    expect(different.counts.persons.failed).toBe(1);
    await t.run(async ctx => { const row = (await ctx.db.query("persons").collect())[0]; await ctx.db.patch(row._id, { importState: undefined } as any); });
    const before = (await snapshot(t)).persons[0];
    expect((await send({ persons: [person("P", "Original")] }, "legacy-same")).counts.persons.unchanged).toBe(1);
    expect((await snapshot(t)).persons[0].importState).toBeUndefined();
    const legacy = await send({ persons: [person("P", "Legacy changed")] }, "legacy-change");
    expect(legacy.results[0]).toMatchObject({ status: "failed", reason: expect.stringContaining("CONFLICT") });
    expect((await snapshot(t)).persons[0]).toEqual(before);
  });

  test("a late manually edited fact rolls back earlier person changes and aliases while a sibling saves", async () => {
    const { t, send, owner } = await setup();
    const original = { ...person("P", "From site"), facts: [{ key: "birth", type: "BIRT", date: { original: "1900", year: 1900 } }] };
    await send({ persons: [original] }, "initial");
    const event = (await snapshot(t)).events[0];
    await owner.mutation(api.vaultMutations.upsertEvent, { vaultOwnerId: OWNER, importKey: event.importKey, type: "birth", date: { original: "1901", year: 1901 } });
    const before = await snapshot(t);
    const changed = { ...original, names: [{ given: "External changed", surname: "Fixture" }], otherIds: [{ system: "gedcom", id: "@DO-NOT-LEAK@" }] };
    const result = await send({ sources: [{ key: "good", title: "Unrelated success" }], persons: [changed] }, "late-conflict");
    expect(result.counts.sources.created).toBe(1);
    expect(result.counts.persons.failed).toBe(1);
    const after = await snapshot(t);
    expect(after.persons).toEqual(before.persons);
    expect(after.events).toEqual(before.events);
    expect(after.personEvents).toEqual(before.personEvents);
    expect(after.mcpRecordKeys.some((r: any) => r.recordKey.includes("DO-NOT-LEAK"))).toBe(false);
  });

  test.each(["relationships", "citations", "media", "notes"])("managed %s edits are protected without changing owner review metadata", async table => {
    const { t, send } = await setup();
    const fixture: any = {
      persons: [person("A"), person("B", "Other")], sources: [{ key: "S", title: "Source" }],
      relationships: [{ key: "R", type: "Couple", person1Key: "A", person2Key: "B", facts: [{ type: "Marriage", description: "Outside" }] }],
      citations: [{ key: "C", sourceKey: "S", page: "Outside", targets: [{ kind: "person", key: "A" }] }],
      media: [{ key: "M", title: "Photo", description: "Outside", personKeys: ["A"] }],
      notes: [{ key: "N", text: "Outside", subject: { kind: "person", key: "A" } }],
    };
    await send(fixture, "initial");
    const field = { relationships: "facts", citations: "page", media: "description", notes: "text" }[table]!;
    await t.run(async ctx => { const row: any = (await (ctx.db as any).query(table).collect())[0]; await ctx.db.patch(row._id, { [field]: table === "relationships" ? [{ type: "Marriage", description: "Human" }] : "Human" }); });
    const before = await snapshot(t);
    const result = await send({ [table]: fixture[table] }, "refresh");
    expect(result.counts[table].failed).toBe(1);
    expect(result.results[0].reason).toContain("CONFLICT");
    expect((await snapshot(t))[table]).toEqual(before[table]);
  });

  test("dry-run matches repeated new keys and existing-source field overlays without persisting", async () => {
    const { t, send } = await setup();
    await send({ sources: [{ key: "S", title: "Original" }] }, "initial");
    const input = { batchIndex: 1, persons: [person("repeat", "First"), person("repeat", "Second")], sources: [{ key: "S", title: "Changed" }, { key: "S", title: "Original" }] };
    const before = await snapshot(t);
    const dry = await send({ ...input, dryRun: true }, "dry");
    expect(await snapshot(t)).toEqual(before);
    const real = await send(input, "real");
    expect(dry.counts).toEqual(real.counts);
    expect(real.counts.persons).toMatchObject({ created: 1, updated: 1, unchanged: 0 });
    expect(real.counts.sources).toMatchObject({ updated: 2, unchanged: 0 });
  });

  test("dry-run sees earlier planned duplicate candidates and real applies only a proposed link", async () => {
    const { t, send } = await setup();
    const input = { persons: ["one", "two"].map(key => ({ ...person(key), facts: [{ key: "birth", type: "BIRT", date: { original: "1900", year: 1900 } }] })) };
    const before = await snapshot(t);
    const dry = await send({ ...input, dryRun: true }, "dry");
    expect(await snapshot(t)).toEqual(before);
    const real = await send(input, "real");
    expect(dry.possibleDuplicates).toBe(real.duplicatesSuggested);
    expect(real.duplicatesSuggested).toBe(1);
    const after = await snapshot(t);
    expect(after.persons).toHaveLength(2);
    expect(after.connections).toHaveLength(1);
    expect(after.connections[0].state).toBe("proposed");
  });

  test.each([false, true])("a human-removed citation target is not recreated on refresh (dryRun=%s)", async dryRun => {
    const { t, send, owner } = await setup();
    const input = { persons: [person("P")], sources: [{ key: "S", title: "Source" }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P" }] }] };
    await send(input, "initial");
    const initial = await snapshot(t);
    expect(initial.citations[0].importState?.linksHash).toMatch(/^[a-f0-9]{64}$/);
    await owner.mutation(api.citations.unlinkFromTarget, { vaultOwnerId: OWNER, citationId: initial.citations[0]._id, targetType: "person", targetId: initial.persons[0]._id });
    const before = await snapshot(t);
    const result = await send({ dryRun, citations: input.citations }, "reimport");
    expect(result.counts.citations.failed).toBe(1);
    expect(result.results[0].reason).toContain("CONFLICT");
    const after = await snapshot(t);
    expect(after.citationLinks).toEqual([]);
    expect(after.citations).toEqual(before.citations);
    if (dryRun) expect(after).toEqual(before);
  });

  test("an unchanged request never adopts human values or a malformed baseline", async () => {
    const { t, send, owner } = await setup();
    await send({ persons: [person("P", "From site")] }, "initial");
    const initial = (await snapshot(t)).persons[0];
    await owner.mutation(api.vaultMutations.upsertPerson, { vaultOwnerId: OWNER, fsId: "P", name: { given: "Human", surname: "Fixture" }, sex: "unknown", living: false });
    expect((await send({ persons: [person("P", "Human")] }, "equal-human")).counts.persons.unchanged).toBe(1);
    expect((await snapshot(t)).persons[0].importState).toEqual(initial.importState);
    expect((await send({ persons: [person("P", "Outside changed")] }, "later-change")).counts.persons.failed).toBe(1);
    await t.run(async ctx => { const p = (await ctx.db.query("persons").collect())[0]; await ctx.db.patch(p._id, { importState: { ...p.importState!, hash: "malformed" } }); });
    const malformed = (await snapshot(t)).persons[0];
    expect((await send({ persons: [person("P", "Human")] }, "equal-malformed")).counts.persons.unchanged).toBe(1);
    expect((await snapshot(t)).persons[0]).toEqual(malformed);
    expect((await send({ persons: [person("P", "Changed again")] }, "malformed-change")).counts.persons.failed).toBe(1);
    expect((await snapshot(t)).persons[0]).toEqual(malformed);
  });

  test.each(["out", "in", "out-across-chunks"])("preview refills and orders its duplicate window when a prior person moves %s", async mode => {
    const { t, send } = await setup();
    const birth = (year: number) => ({ key: "birth", type: "BIRT", date: { original: String(year), year } });
    await send({ persons: Array.from({ length: 13 }, (_, i) => ({ ...person(`old-${i}`, i === 12 ? "Synthetic" : `Different ${i}`), facts: [birth(mode === "in" && i === 0 ? 2000 : 1900)] })) }, "initial");
    const rich = (year: number) => [birth(year), ...Array.from({ length: 59 }, (_, i) => ({ key: `extra-${i}`, type: "RESI", description: `Synthetic ${i}` }))];
    const persons = mode === "out-across-chunks"
      ? [{ ...person("padding", "Padding"), facts: rich(1800) }, { ...person("old-0", "Different 0"), facts: rich(2000) }, { ...person("new"), facts: [birth(1900), ...rich(1900).slice(1, 10)] }]
      : [{ ...person("old-0", mode === "in" ? "Synthetic" : "Different 0"), facts: [birth(mode === "in" ? 1900 : 2000)] }, { ...person("new"), facts: [birth(1900)] }];
    const before = await snapshot(t);
    const dry = await send({ batchIndex: 1, persons, dryRun: true }, "dry");
    expect(await snapshot(t)).toEqual(before);
    const real = await send({ batchIndex: 1, persons }, "real");
    expect(dry.counts).toEqual(real.counts);
    expect(dry.possibleDuplicates).toBe(real.duplicatesSuggested);
    expect(real.duplicatesSuggested).toBe(1);
    const expected = before.persons.find((p: any) => p.fsId === (mode === "in" ? "old-0" : "old-12"))._id;
    expect(dry.results.find((r: any) => r.key === "new").possibleDuplicates).toEqual([expected]);
    expect(real.results.find((r: any) => r.key === "new").possibleDuplicates).toEqual([expected]);
  });

  test("preview overflow refuses in UTF-8 bytes with no saved records or partial proof", async () => {
    const { t, send } = await setup();
    await send({ persons: [person("P")] }, "initial");
    await t.run(async ctx => {
      const p = (await ctx.db.query("persons").collect())[0];
      for (let i = 0; i < 36; i++) {
        const id = await ctx.db.insert("notes", { vaultOwnerId: OWNER, subject: { kind: "person", id: String(p._id) }, noteType: "general", text: "字".repeat(20_000), createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "note", recordKey: `ext:familysearch:note:large-${i}`, recordId: String(id), createdAt: 1, updatedAt: 1 });
      }
    });
    const before = await snapshot(t);
    const notes = Array.from({ length: 36 }, (_, i) => ({ key: `large-${i}`, text: "External", subject: { kind: "person", key: "P" } }));
    await expect(send({ dryRun: true, notes }, "dry-overflow")).rejects.toThrow(/preview needs too much temporary state/);
    expect(await snapshot(t)).toEqual(before);
  });

  test("review metadata stays owner-controlled while unedited imported media can refresh", async () => {
    const { t, send } = await setup();
    await send({ media: [{ key: "M", title: "Photo", description: "Original" }] }, "initial");
    await t.run(async ctx => { const row = (await ctx.db.query("media").collect())[0]; await ctx.db.patch(row._id, { reviewStatus: "reviewed", rightsStatus: "permitted", aiUseAllowed: true }); });
    const result = await send({ media: [{ key: "M", title: "Photo", description: "Outside changed" }] }, "refresh");
    expect(result.counts.media.updated).toBe(1);
    expect((await snapshot(t)).media[0]).toMatchObject({ description: "Outside changed", reviewStatus: "reviewed", rightsStatus: "permitted", aiUseAllowed: true, privacyLevel: "private" });
  });


  test("fingerprints include persisted defaults and retain omitted fields on safe refresh", async () => {
    const { t, send } = await setup();
    const input = { key: "P", names: [{ given: "First", surname: "Fixture" }], living: false, tags: ["Original tag"], facts: [{ key: "birth", type: "BIRT", date: { original: "1900", year: 1900 } }] };
    await send({ persons: [input] }, "initial");
    const first = (await snapshot(t)).persons[0];
    expect(first.sex).toBe("unknown");
    const repeated = await send({ persons: [{ key: "P", names: input.names, living: false }] }, "omitted-fields");
    expect(repeated.counts.persons.unchanged).toBe(1);
    expect((await snapshot(t)).persons[0]).toEqual(first);
    const changed = await send({ persons: [{ key: "P", names: [{ given: "Changed", surname: "Fixture" }], living: false }] }, "changed-name");
    expect(changed.counts.persons.updated).toBe(1);
    expect((await snapshot(t)).persons[0]).toMatchObject({ sex: "unknown", tags: ["Original tag"], birth: first.birth, name: { given: "Changed" } });
  });

  test("manual-created records keep fill-blanks/kept behavior without acquiring import ownership", async () => {
    const { t, send, owner } = await setup();
    await owner.mutation(api.vaultMutations.upsertSource, { vaultOwnerId: OWNER, fsId: "S", title: "Human title", type: "other" });
    const first = await send({ sources: [{ key: "S", title: "Outside title", repository: "New repository" }] }, "first");
    expect(first.results[0]).toMatchObject({ status: "linked", kept: expect.arrayContaining(["title"]) });
    const after = (await snapshot(t)).sources[0];
    expect(after).toMatchObject({ title: "Human title", repository: "New repository" });
    expect(after.importState).toBeUndefined();
    const repeat = await send({ sources: [{ key: "S", title: "Another outside title" }] }, "repeat");
    expect(repeat.results[0]).toMatchObject({ status: "unchanged", kept: expect.arrayContaining(["title"]) });
    expect((await snapshot(t)).sources[0]).toEqual(after);
  });


  test("an intact citation can refresh content and add targets; preview repeats match the live row statuses", async () => {
    const { t, send } = await setup();
    await send({ persons: [person("A"), person("B", "Other")], sources: [{ key: "S", title: "Source" }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "A" }] }] }, "initial");
    const citation = { key: "C", sourceKey: "S", page: "New outside page", targets: [{ kind: "person", key: "A" }, { kind: "person", key: "B" }] };
    const before = await snapshot(t);
    const dry = await send({ dryRun: true, citations: [citation, citation] }, "dry");
    expect(await snapshot(t)).toEqual(before);
    const real = await send({ citations: [citation, citation] }, "real");
    expect(dry.counts).toEqual(real.counts);
    expect(real.counts.citations).toMatchObject({ updated: 1, unchanged: 1, failed: 0 });
    const after = await snapshot(t);
    expect(after.citationLinks).toHaveLength(2);
    expect(after.citations[0].page).toBe("New outside page");
    expect(after.citations[0].importState.linksHash).not.toBe(before.citations[0].importState.linksHash);
  });


  test.each([false, true])("preview links distinct relationship keys for the same pair (personsAlreadySaved=%s)", async personsAlreadySaved => {
    const { t, send } = await setup();
    const persons = [person("A"), person("B", "Other")];
    if (personsAlreadySaved) await send({ persons }, "initial");
    const input = { ...(personsAlreadySaved ? {} : { persons }), relationships: ["R1", "R2"].map(key => ({ key, type: "Couple", person1Key: "A", person2Key: "B" })) };
    const before = await snapshot(t);
    const dry = await send({ ...input, dryRun: true }, "dry");
    expect(await snapshot(t)).toEqual(before);
    const real = await send(input, "real");
    expect(dry.counts).toEqual(real.counts);
    expect(real.counts.relationships).toMatchObject({ created: 1, linked: 1 });
    expect((await snapshot(t)).relationships).toHaveLength(1);
  });

  test.each(["out", "in"])("preview relationship matching sees prior moved-%s endpoints", async direction => {
    const { t, send } = await setup();
    const rel = (key: string, a: string, b: string) => ({ key, type: "Couple", person1Key: a, person2Key: b });
    await send({ persons: [person("A"), person("B", "B"), person("C", "C"), person("D", "D")], relationships: [rel("old", direction === "out" ? "A" : "C", direction === "out" ? "B" : "D")] }, "initial");
    const input = { relationships: [rel("old", direction === "out" ? "C" : "A", direction === "out" ? "D" : "B"), rel("new", "A", "B")] };
    const before = await snapshot(t);
    const dry = await send({ ...input, dryRun: true }, "dry");
    expect(await snapshot(t)).toEqual(before);
    const real = await send(input, "real");
    expect(dry.counts).toEqual(real.counts);
    expect(real.counts.relationships).toMatchObject({ updated: 1, ...(direction === "out" ? { created: 1 } : { linked: 1 }) });
  });

});
