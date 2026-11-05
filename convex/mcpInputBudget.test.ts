// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK envelopes and stubbed ActionCtx are synthetic. */
/** Bound validation before a compact malformed batch reaches schemas or writers. */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { createFamilyHistoryServer } from "./httpRoutes/mcp";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";

async function call(input: Record<string, unknown>) {
  const writes: { name: string; input: any }[] = [];
  const ctx = { runMutation: async (ref: any, input: any) => { writes.push({ name: getFunctionName(ref), input }); return { accepted: true }; } } as any;
  const principal = { issuer: "https://budget.example.test", subject: "synthetic-budget-owner", clientId: "synthetic-budget-ai", scopes: [] };
  const resolution: Parameters<typeof createFamilyHistoryServer>[2] = { state: "active", grant: { grantId: "synthetic-budget-grant", clientId: principal.clientId, issuer: principal.issuer, scopes: ["family_history:research:write"], boundary: { kind: "whole_workspace" } } };
  const name = "family_history_save_records";
  const handler = createMcpHandler(() => createFamilyHistoryServer(ctx, principal, resolution), { legacy: "stateless", responseMode: "json", maxRequestBodySize: FAMILY_HISTORY_MCP_LIMITS.requestBytes });
  const body = JSON.stringify({ jsonrpc: "2.0", id: "synthetic-budget", method: "tools/call", params: { name, arguments: { operationId: "synthetic-budget-call", summary: "Synthetic batch", ...input }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "budget-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } });
  expect(new TextEncoder().encode(body).byteLength).toBeLessThan(FAMILY_HISTORY_MCP_LIMITS.requestBytes);
  try {
    const response = await handler.fetch(new Request("https://budget.example.test/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body }));
    expect(response.status).toBe(200);
    return { body: await response.json() as any, writes };
  } finally { await handler.close(); }
}

test("an array bomb below the byte cap fails the element budget before schemas or writers", async () => {
  const result = await call({ people: Array.from({ length: 80_000 }, () => ({})) });
  expect(result.body.result.isError).toBe(true);
  expect(JSON.stringify(result.body.result)).toContain("maximum of 65536 elements");
  expect(JSON.stringify(result.body.result)).not.toMatch(/invalid_union|invalid_type/);
  expect(result.writes).toEqual([]);
});

test("a full person batch with every alternate-name and tag slot still reaches its writer", async () => {
  const people = Array.from({ length: FAMILY_HISTORY_MCP_LIMITS.batchPeople }, (_, index) => ({ mode: "create", createKey: `synthetic-person-${index}`, name: { given: "Synthetic", surname: "Person", prefix: "", suffix: "", nickname: "Fixture" }, sex: "unknown", living: false, alternateNames: Array.from({ length: 30 }, () => ({ type: "alternate", given: "S", surname: "P", prefix: "", suffix: "" })), tags: Array.from({ length: 30 }, (_, tag) => `tag-${tag}`) }));
  const result = await call({ people });
  expect(result.body.result.isError).not.toBe(true);
  const write = result.writes.find(item => item.name === "mcpFamilyHistory:saveRecords");
  expect(write?.input.input.people).toHaveLength(FAMILY_HISTORY_MCP_LIMITS.batchPeople);
});

test("a near-byte-limit mixed records batch reaches its writer", async () => {
  const evidence = Array.from({ length: 2 }, (_, i) => ({
    source: { mode: "create", createKey: `src${i}`, title: "Census", type: "census" },
    citation: { mode: "create", createKey: `cit${i}`, confidence: "high" },
    personas: Array.from({ length: 60 }, (_, j) => ({ personaKey: `per${i}-${j}`, nameAsWritten: "P", fields: Array.from({ length: 60 }, () => ({ label: "x", value: "y" })) })),
  }));
  for (let i = 0; i < 550; i++) evidence[Math.floor((i % 120) / 60)].personas[i % 60].fields.pop();
  const input = {
    evidence,
    people: Array.from({ length: 50 }, (_, i) => ({ mode: "create", createKey: `pe${String(i).padStart(2, "0")}`, name: { given: "A", surname: "B" }, sex: "unknown", living: false, tags: Array(30).fill("x") })),
    topics: Array.from({ length: 30 }, (_, i) => ({ mode: "create", createKey: `to${String(i).padStart(2, "0")}`, name: "T", kind: "other", alternateNames: Array(30).fill("a"), sourceRefs: Array(30).fill("x"), placeCreateKeys: Array.from({ length: 30 }, (_, j) => `pl${String(j).padStart(2, "0")}`) })),
    stories: Array.from({ length: 10 }, (_, i) => ({ mode: "create", createKey: `st${String(i).padStart(2, "0")}`, type: "biography", title: "S", content: "t", tags: Array(30).fill("x") })),
    places: Array.from({ length: 50 }, (_, i) => ({ mode: "create", createKey: `pl${String(i).padStart(2, "0")}`, name: "P", type: "city", temporalDescription: { formerNames: Array(30).fill("x") }, alternateNames: Array.from({ length: 30 }, () => ({ name: "x" })) })),
    relationships: Array.from({ length: 50 }, (_, i) => ({ mode: "create", createKey: `re${String(i).padStart(2, "0")}`, type: "Other", person1CreateKey: "pe00", person2CreateKey: "pe01", facts: Array.from({ length: 20 }, () => ({ type: "x" })) })),
  };
  const result = await call(input);
  expect(result.body.result.isError).not.toBe(true);
  const write = result.writes.find(item => item.name === "mcpFamilyHistory:saveRecords");
  expect(write?.input.input.evidence).toHaveLength(2);
  expect(write?.input.input.people).toHaveLength(50);
  expect(write?.input.input.places).toHaveLength(50);
  expect(write?.input.input.topics).toHaveLength(30);
  expect(write?.input.input.relationships).toHaveLength(50);
  expect(write?.input.input.stories).toHaveLength(10);
});


test("public MCP person context returns imported notes only for the owning deceased person", async () => {
  const t = convexTest({ schema, modules: import.meta.glob("./**/*.ts"), transactionLimits: true });
  const owner = "synthetic-import-notes-owner";
  const principal = { issuer: "https://notes.example.test", subject: owner, clientId: "synthetic-notes-ai", scopes: [] };
  const grantId = await seedGrant(t, { vaultOwnerId: owner });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal, grantId, operationId: "notes-begin", requestHash: "notes-begin", input: { importKey: "notes-tree", system: "familysearch", label: "Synthetic notes tree" } }) as any;
  const result = await t.action(internal.treeImport.importTreeBatch, { principal, grantId, operationId: "notes-import", requestHash: "notes-import", input: {
    importJobId: job.importJobId, batchIndex: 0,
    persons: [{ key: "D", living: false, names: [{ given: "Deceased" }] }, { key: "L", living: true, names: [{ given: "Living" }] }],
    notes: [{ key: "ND", text: "Imported deceased biography", subject: { kind: "person", key: "D" } }, { key: "NL", text: "Private living biography", subject: { kind: "person", key: "L" } }],
  } }) as any;
  expect(result.results.filter((r: any) => r.status === "failed")).toEqual([]);
  const deceased = result.results.find((r: any) => r.kind === "persons" && r.key === "D").id;
  const living = result.results.find((r: any) => r.kind === "persons" && r.key === "L").id;
  await t.run(async ctx => { await ctx.db.insert("notes", { vaultOwnerId: "synthetic-other-owner", subject: { kind: "person", id: deceased }, noteType: "biography", text: "Other owner's private note", createdAt: 1, updatedAt: 1 }); });
  const callContext = async (subject: string, id: string) => {
    const name = "family_history_get_context";
    const resolution: Parameters<typeof createFamilyHistoryServer>[2] = { state: "active", grant: { grantId, clientId: principal.clientId, issuer: principal.issuer, scopes: ["family_history:context:read"], boundary: { kind: "whole_workspace" } } };
    const actionCtx = { runQuery: (ref: any, args: any) => t.query(ref, args), runMutation: (ref: any, args: any) => t.mutation(ref, args) } as any;
    const handler = createMcpHandler(() => createFamilyHistoryServer(actionCtx, { ...principal, subject }, resolution), { legacy: "stateless", responseMode: "json" });
    try {
      const response = await handler.fetch(new Request("https://notes.example.test/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body: JSON.stringify({ jsonrpc: "2.0", id: "notes", method: "tools/call", params: { name, arguments: { kind: "person", id }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "notes-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }) }));
      expect(response.status).toBe(200);
      return await response.json() as any;
    } finally { await handler.close(); }
  };
  const deceasedContext = await callContext(owner, deceased);
  expect(deceasedContext.result.isError).not.toBe(true);
  expect(deceasedContext.result.structuredContent.notes).toEqual([expect.objectContaining({ text: "Imported deceased biography" })]);
  const livingContext = await callContext(owner, living);
  expect(livingContext.result.isError).not.toBe(true);
  expect(livingContext.result.structuredContent.notes).toEqual([]);
  const foreignContext = await callContext("synthetic-other-owner", deceased);
  for (const payload of [deceasedContext, livingContext, foreignContext]) expect(JSON.stringify(payload)).not.toContain("Other owner's private note");
  for (const payload of [livingContext, foreignContext]) {
    expect(JSON.stringify(payload)).not.toContain("Imported deceased biography");
    expect(JSON.stringify(payload)).not.toContain("Private living biography");
  }
});

test("public tree import preserves date ranges through birth death events and relationship storage", async () => {
  const t = convexTest({ schema, modules: import.meta.glob("./**/*.ts"), transactionLimits: true });
  const owner = "synthetic-range-import-owner";
  const principal = { issuer: "https://range.example.test", subject: owner, clientId: "synthetic-range-ai", scopes: [] };
  const grantId = await seedGrant(t, { vaultOwnerId: owner, issuer: principal.issuer, clientId: principal.clientId });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal, grantId, operationId: "range-begin", requestHash: "range-begin", input: { importKey: "range-tree", system: "familysearch", label: "Synthetic date ranges" } }) as any;
  let actionCalls = 0;
  const actionCtx = {
    runQuery: (ref: any, args: any) => t.query(ref, args), runMutation: (ref: any, args: any) => t.mutation(ref, args),
    runAction: (ref: any, args: any) => { actionCalls++; return t.action(ref, args); },
  } as any;
  const resolution: Parameters<typeof createFamilyHistoryServer>[2] = { state: "active", grant: { grantId, clientId: principal.clientId, issuer: principal.issuer, scopes: ["family_history:research:write"], boundary: { kind: "whole_workspace" } } };
  const callTool = async (name: string, input: any) => {
    const handler = createMcpHandler(() => createFamilyHistoryServer(actionCtx, principal, resolution), { legacy: "stateless", responseMode: "json" });
    try {
      const response = await handler.fetch(new Request("https://range.example.test/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body: JSON.stringify({ jsonrpc: "2.0", id: "range", method: "tools/call", params: { name, arguments: input, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "range-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }) }));
      expect(response.status).toBe(200);
      return await response.json() as any;
    } finally { await handler.close(); }
  };
  const callBatch = (input: any) => callTool("family_history_import_tree_batch", input);
  const ranged = (original: string) => ({ original, range: true });
  const input = {
    operationId: "range-import", importJobId: job.importJobId, batchIndex: 0,
    persons: [{ key: "P", living: false, names: [{ given: "Ranged", preferred: true }, { given: "Alternate", surname: "Synthetic", nickname: "Range nickname" }], facts: [{ key: "birth", type: "birth", date: ranged("between 1900 and 1905") }, { key: "death", type: "death", date: ranged("between 1970 and 1975") }, { key: "occupation", type: "occupation", date: ranged("between 1920 and 1930") }] }, { key: "Q", living: false, names: [{ given: "Partner" }] }],
    relationships: [{ key: "R", type: "Couple", person1Key: "P", person2Key: "Q", facts: [{ type: "Marriage", date: ranged("between 1925 and 1930") }] }],
  };
  const result = await callBatch(input);
  expect(result.result.isError).not.toBe(true);
  expect(result.result.structuredContent.results.filter((row: any) => row.status === "failed")).toEqual([]);
  expect(actionCalls).toBe(1);
  const stored = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), relationships: await ctx.db.query("relationships").collect() }));
  const person = stored.people.find(row => row.fsId === "P")!;
  expect(person.birth?.date).toMatchObject(ranged("between 1900 and 1905"));
  expect(person.death?.date).toMatchObject(ranged("between 1970 and 1975"));
  expect(stored.events).toHaveLength(3);
  for (const event of stored.events) { expect(event.date?.range).toBe(true); expect(event.importedFact?.date?.range).toBe(true); }
  expect(stored.relationships[0].facts?.[0].date).toMatchObject(ranged("between 1925 and 1930"));
  const roundtrip = await callTool("family_history_save_person", { operationId: "range-person-roundtrip", mode: "update", personId: String(person._id), expectedUpdatedAt: person.updatedAt, birth: person.birth, death: person.death, alternateNames: person.alternateNames, researchPriority: 4 });
  expect(roundtrip.result.isError).not.toBe(true);
  const hydrated = await t.run(ctx => ctx.db.get(person._id));
  expect(hydrated?.birth).toEqual(person.birth); expect(hydrated?.death).toEqual(person.death); expect(hydrated?.alternateNames).toEqual(person.alternateNames);
  expect(hydrated?.alternateNames?.[0].nickname).toBe("Range nickname");
  expect(hydrated?.researchPriority).toBe(4);
  // Legacy internal writer shape compatibility, not an authorization/user proof.
  await t.mutation(internal.persons.update, { id: person._id, birth: hydrated!.birth, death: hydrated!.death, alternateNames: hydrated!.alternateNames, researchPriority: 5 });
  const preserved = await t.run(ctx => ctx.db.query("persons").collect());
  expect(preserved.find(row => row._id === person._id)?.birth).toEqual(person.birth);
  expect(preserved.find(row => row._id === person._id)?.alternateNames?.[0].nickname).toBe("Range nickname");
  const invalid = await callBatch({ operationId: "range-invalid", importJobId: job.importJobId, batchIndex: 1, persons: [{ key: "INVALID", living: false, names: [{ given: "Invalid" }], facts: [{ type: "birth", date: { original: "1900", range: "yes" } }] }] });
  expect(invalid.error ?? invalid.result?.isError).toBeTruthy();
  expect(actionCalls).toBe(1);
  expect(await t.run(ctx => ctx.db.query("persons").collect())).toEqual(preserved);
});


async function importedNotesFixture(living = false, sourceNotes?: string) {
  const t = convexTest({ schema, modules: import.meta.glob("./**/*.ts"), transactionLimits: true });
  const principal = { issuer: "https://notes-context.example.test", subject: "synthetic-nonperson-note-owner", clientId: "synthetic-nonperson-note-client", scopes: [] };
  const grantId = await seedGrant(t, { vaultOwnerId: principal.subject, issuer: principal.issuer, clientId: principal.clientId });
  const job = await t.mutation(internal.treeImport.beginTreeImport, { principal, grantId, operationId: "nonperson-note-begin", requestHash: "nonperson-note-begin", input: { importKey: "nonperson-note-tree", system: "familysearch", label: "Synthetic nonperson notes" } }) as any;
  const batch = (operationId: string, batchIndex: number, input: any) => t.action(internal.treeImport.importTreeBatch, { principal, grantId, operationId, requestHash: operationId, input: { importJobId: job.importJobId, batchIndex, ...input } });
  const imported = await batch("nonperson-note-import", 0, {
    persons: [{ key: "P", living, names: [{ given: "Synthetic" }], facts: [{ key: "F", type: "birth", date: { original: "1900" } }] }, { key: "Q", living: false, names: [{ given: "Partner" }] }],
    sources: [{ key: "S", title: "Original", notes: sourceNotes }], relationships: [{ key: "R", type: "Couple", person1Key: "P", person2Key: "Q" }], media: [{ key: "M", title: "Original", personKeys: ["P"], sourceKey: "S" }], citations: [{ key: "C", sourceKey: "S", targets: [{ kind: "person", key: "P" }] }],
    notes: [{ key: "NF", text: "Fact note text", subject: { kind: "fact", personKey: "P", key: "F", keyOrigin: "explicit" } }, { key: "NR", text: "Relationship note text", subject: { kind: "relationship", key: "R" } }, { key: "NS", text: "Source note text", subject: { kind: "source", key: "S" } }, { key: "NC", text: "Citation note text", subject: { kind: "citation", key: "C", keyOrigin: "explicit" } }, { key: "NM", text: "Media note text", subject: { kind: "media", key: "M" } }],
  }) as any;
  expect(imported.results.filter((row: any) => row.status === "failed")).toEqual([]);
  const rows = await t.run(async ctx => ({ people: await ctx.db.query("persons").collect(), events: await ctx.db.query("events").collect(), relationships: await ctx.db.query("relationships").collect(), sources: await ctx.db.query("sources").collect(), citations: await ctx.db.query("citations").collect(), media: await ctx.db.query("media").collect(), notes: await ctx.db.query("notes").collect() }));
  const ids: Record<string, string> = { event: String(rows.events[0]._id), relationship: String(rows.relationships[0]._id), source: String(rows.sources[0]._id), citation: String(rows.citations[0]._id), media: String(rows.media[0]._id) };
  let queries = 0;
  const callContext = async (kind: string, id: string, options: { subject?: string; boundary?: any } = {}) => {
    const resolution: Parameters<typeof createFamilyHistoryServer>[2] = { state: "active", grant: { grantId, clientId: principal.clientId, issuer: principal.issuer, scopes: ["family_history:context:read"], boundary: options.boundary ?? { kind: "whole_workspace" } } };
    const actionCtx = { runQuery: (ref: any, args: any) => { queries++; return t.query(ref, args); }, runMutation: (ref: any, args: any) => t.mutation(ref, args) } as any;
    const name = "family_history_get_context"; const handler = createMcpHandler(() => createFamilyHistoryServer(actionCtx, { ...principal, subject: options.subject ?? principal.subject }, resolution), { legacy: "stateless", responseMode: "json" });
    try {
      const response = await handler.fetch(new Request("https://notes-context.example.test/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body: JSON.stringify({ jsonrpc: "2.0", id: "note-context", method: "tools/call", params: { name, arguments: { kind, id }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "notes-context-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }) }));
      expect(response.status).toBe(200); return await response.json() as any;
    } finally { await handler.close(); }
  };
  const reviewMedia = () => t.withIdentity({ subject: principal.subject }).mutation(api.vaultMutations.reviewMedia, { vaultOwnerId: principal.subject, mediaId: rows.media[0]._id, privacyLevel: "family_review", reviewStatus: "reviewed", rightsStatus: "owned", aiUseAllowed: true });
  return { t, principal, rows, ids, batch, callContext, reviewMedia, queryCount: () => queries };
}

test.each(["event", "relationship", "source", "citation", "media"].flatMap(kind => [false, true].map(living => ({ kind, living }))))("public $kind context and direct notes preserve living boundary ($living)", async ({ kind, living }) => {
  const f = await importedNotesFixture(living); await f.reviewMedia();
  const note = f.rows.notes.find(row => row.subject.id === f.ids[kind])!;
  await f.t.run(ctx => ctx.db.insert("notes", { vaultOwnerId: "synthetic-foreign-note-owner", subject: note.subject, noteType: "general", text: "Foreign note must stay private", createdAt: 1, updatedAt: 1 }));
  const response = await f.callContext(kind, f.ids[kind]); expect(response.result.isError).not.toBe(true);
  const direct = await f.callContext("note", String(note._id)); expect(direct.result.isError).not.toBe(true);
  if (living) { expect(response.result.structuredContent.notes).toEqual([]); expect(direct.result.structuredContent.note).toBeNull(); expect(JSON.stringify([response, direct])).not.toContain(note.text); }
  else { expect(response.result.structuredContent.notes).toEqual([expect.objectContaining({ id: String(note._id), text: note.text })]); expect(direct.result.structuredContent.note.text).toBe(note.text); }
  const foreign = await f.callContext(kind, f.ids[kind], { subject: "synthetic-foreign-note-owner" });
  expect(foreign.result.isError).toBe(true); expect(JSON.stringify(foreign)).not.toContain(note.text);
  for (const payload of [response, direct, foreign]) expect(JSON.stringify(payload)).not.toContain("Foreign note must stay private");
});

test("public media and direct media notes respect review before revealing private content", async () => {
  const f = await importedNotesFixture(); const note = f.rows.notes.find(row => row.subject.kind === "media")!;
  for (const [kind, id] of [["media", f.ids.media], ["note", String(note._id)]]) { const response = await f.callContext(kind, id); expect(response.result.structuredContent.notesWithheld).toBe(true); expect(JSON.stringify(response)).not.toContain(note.text); }
  await f.reviewMedia(); const response = await f.callContext("media", f.ids.media); expect(response.result.structuredContent.notes[0].text).toBe(note.text);
  expect(response.result.structuredContent.media.replacedB2Files).toBeUndefined(); expect(response.result.structuredContent.media.storageId).toBeUndefined(); expect(response.result.structuredContent.media.b2Original).toBeUndefined();
});

test.each(["selected_people", "queue_only"])("new public note context cannot widen a %s grant", async boundary => {
  const f = await importedNotesFixture(); const before = f.queryCount(); const note = f.rows.notes[0];
  const response = await f.callContext("note", String(note._id), { boundary: boundary === "selected_people" ? { kind: "selected_people", personIds: [String(f.rows.people[0]._id)] } : { kind: "queue_only", queueItemIds: [] } });
  expect(response.error ?? response.result?.isError).toBeTruthy(); expect(f.queryCount()).toBe(before); expect(JSON.stringify(response)).not.toContain(note.text);
});

test.each(["missing", "foreign", "bounds"])("public indirect notes fail closed on %s person associations", async mode => {
  const f = await importedNotesFixture(); const person = f.rows.people.find(row => row.fsId === "P")!; const note = f.rows.notes.find(row => row.subject.kind === "event")!;
  await f.t.run(async ctx => { if (mode === "missing") await ctx.db.delete(person._id); else if (mode === "foreign") await ctx.db.patch(person._id, { vaultOwnerId: "synthetic-other-person-owner" }); else for (let i = 0; i < 50; i++) await ctx.db.insert("personEvents", { vaultOwnerId: f.principal.subject, personId: person._id, eventId: f.rows.events[0]._id, role: "primary", createdAt: i }); });
  for (const [kind, id] of [["event", f.ids.event], ["note", String(note._id)]]) { const response = await f.callContext(kind, id); expect(response.result.structuredContent.notesWithheld).toBe(true); expect(JSON.stringify(response)).not.toContain(note.text); }
});

test("public notes tolerate checked citation cycles and retain full long text", async () => {
  const f = await importedNotesFixture();
  await f.batch("note-context-cycle", 1, { citations: [{ key: "CYCLE", sourceKey: "S", targets: [{ kind: "note", key: "NS" }] }] });
  const source = await f.callContext("source", f.ids.source); expect(source.result.structuredContent.notes[0].text).toBe("Source note text");
  const longText = "L".repeat(FAMILY_HISTORY_MCP_LIMITS.contentPreviewChars + 100);
  const result = await f.batch("note-context-long", 2, { notes: [{ key: "LONG", text: longText, subject: { kind: "fact", personKey: "P", key: "F", keyOrigin: "explicit" } }] }) as any;
  const id = result.results.find((row: any) => row.kind === "notes").id; const event = await f.callContext("event", f.ids.event);
  expect(event.result.structuredContent.notes.find((row: any) => row.id === id)).toMatchObject({ textTruncated: true, nextContextKind: "note", text: longText.slice(0, FAMILY_HISTORY_MCP_LIMITS.contentPreviewChars) });
  expect((await f.callContext("note", id)).result.structuredContent.note.text).toBe(longText);
});


test.each(["rights", "aiUse", "privacy"])("new note/media context respects a renewed %s restriction", async restriction => {
  const f = await importedNotesFixture(); await f.reviewMedia(); const note = f.rows.notes.find(row => row.subject.kind === "media")!;
  await f.t.withIdentity({ subject: f.principal.subject }).mutation(api.vaultMutations.reviewMedia, { vaultOwnerId: f.principal.subject, mediaId: f.rows.media[0]._id, reviewStatus: "reviewed", privacyLevel: restriction === "privacy" ? "private" : "family_review", rightsStatus: restriction === "rights" ? "restricted" : "owned", aiUseAllowed: restriction !== "aiUse" });
  for (const [kind, id] of [["media", f.ids.media], ["note", String(note._id)]]) { const response = await f.callContext(kind, id); expect(response.result.structuredContent.notesWithheld).toBe(true); expect(JSON.stringify(response)).not.toContain(note.text); }
});

test.each(["event", "relationship", "note", "media"])("source/citation notes cannot bypass living boundaries through %s targets", async edge => {
  const f = await importedNotesFixture(true); await f.reviewMedia();
  const target = edge === "event" ? { kind: "fact", personKey: "P", key: "F", keyOrigin: "explicit" } : { kind: edge, key: edge === "relationship" ? "R" : edge === "note" ? "NF" : "M" };
  const result = await f.batch(`indirect-note-${edge}`, 1, { citations: [{ key: "INDIRECT", sourceKey: "S", extractedText: "Private indirect evidence", targets: [target] }] }) as any;
  expect(result.results[0].status).toBe("created");
  const note = f.rows.notes.find(row => row.subject.kind === "source")!;
  for (const [kind, id] of [["source", f.ids.source], ["citation", result.results[0].id], ["note", String(note._id)]]) { const response = await f.callContext(kind, id); expect(response.result.structuredContent.notesWithheld).toBe(true); expect(JSON.stringify(response)).not.toContain(note.text); }
});

test("owner-scoped note reads cannot be crowded out by another vault's subject rows", async () => {
  const f = await importedNotesFixture();
  await f.t.run(async ctx => { for (let i = 0; i < 60; i++) await ctx.db.insert("notes", { vaultOwnerId: "synthetic-foreign-note-owner", subject: { kind: "event", id: f.ids.event }, noteType: "general", text: `Foreign private ${i}`, createdAt: i, updatedAt: i }); });
  await f.batch("after-foreign-note-rows", 1, { notes: [{ key: "LATE", text: "Owned note after foreign rows", subject: { kind: "fact", personKey: "P", key: "F", keyOrigin: "explicit" } }] });
  const response = await f.callContext("event", f.ids.event); expect(response.result.structuredContent.notes).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Owned note after foreign rows" })]));
  expect(response.result.structuredContent.truncated).toBe(false); expect(JSON.stringify(response)).not.toContain("Foreign private");
});


test.each(["privateMedia", "living", "foreign", "missing", "bounds", "sourceFactLiving"])("citation privacy cannot be bypassed by aggregated source/person/story context (%s)", async mode => {
  const f = await importedNotesFixture(); const person = f.rows.people.find(row => row.fsId === "P")!;
  const secret = `WITHHELD-CITATION-${mode}`; const secretUrl = `https://example.test/withheld-${mode}`;
  const badTargets = mode === "privateMedia" ? [{ kind: "person", key: "P" }, { kind: "media", key: "M" }] : mode === "bounds" ? [{ kind: "person", key: "P" }, { kind: "fact", personKey: "P", key: "F", keyOrigin: "explicit" }] : mode === "sourceFactLiving" ? [{ kind: "person", key: "P" }] : [{ kind: "person", key: "P" }, { kind: "person", key: "L" }];
  const imported = await f.batch(`context-privacy-${mode}`, 1, {
    ...(mode === "privateMedia" || mode === "bounds" ? {} : { persons: [{ key: "L", living: true, names: [{ given: "Sensitive" }] }] }),
    citations: [{ key: "BAD", sourceKey: "S", extractedText: secret, notes: `${secret}-notes`, url: secretUrl, targets: badTargets }, { key: "SAFE", sourceKey: "S", extractedText: "Visible safe citation", targets: [{ kind: "person", key: "P" }] }],
  }) as any;
  expect(imported.results.filter((row: any) => row.status === "failed")).toEqual([]);
  const bad = imported.results.find((row: any) => row.kind === "citations" && row.key === "BAD");
  const created = await f.t.run(async ctx => {
    const badId = ctx.db.normalizeId("citations", bad.id)!;
    const claimPerson = mode === "sourceFactLiving" ? (await ctx.db.query("persons").collect()).find(row => row.fsId === "L")! : person;
    const sourceFactId = await ctx.db.insert("sourceFacts", { vaultOwnerId: f.principal.subject, personId: claimPerson._id, sourceId: f.rows.sources[0]._id, citationId: badId, importKey: `privacy-claim-${mode}`, factType: "birth", label: "Citation-backed claim", value: `${secret}-claim`, confidence: "high", status: "candidate", createdAt: 1, updatedAt: 1 });
    const storyId = await ctx.db.insert("stories", { vaultOwnerId: f.principal.subject, personId: person._id, type: "biography", title: "Synthetic story", content: "No sensitive quotation in this story body.", citationIds: [badId], sourceFactIds: [String(sourceFactId)], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 });
    if (mode === "foreign" || mode === "missing") { const l = (await ctx.db.query("persons").collect()).find(row => row.fsId === "L")!; if (mode === "foreign") await ctx.db.patch(l._id, { vaultOwnerId: "synthetic-other-citation-owner" }); else await ctx.db.delete(l._id); }
    if (mode === "bounds") for (let i = 0; i < 50; i++) await ctx.db.insert("personEvents", { vaultOwnerId: f.principal.subject, personId: person._id, eventId: f.rows.events[0]._id, role: "primary", createdAt: i });
    return { storyId, badId, sourceFactId };
  });
  const original = await f.t.run(ctx => ctx.db.get(created.badId));
  const direct = await f.callContext("citation", bad.id); expect(direct.result.structuredContent.citation).toBeNull();
  for (const [kind, id] of [["source", f.ids.source], ["person", String(person._id)], ["story", String(created.storyId)]]) {
    const response = await f.callContext(kind, id); expect(response.result.isError).not.toBe(true); expect(response.result.structuredContent.citationsWithheld).toBe(true);
    expect(JSON.stringify(response)).not.toContain(secret); expect(JSON.stringify(response)).not.toContain(secretUrl); expect(JSON.stringify(response)).toContain("Visible safe citation");
    const internalContext = await f.t.query(internal.mcpFamilyHistory.getRecordContext, { principal: f.principal, kind, id }); expect(JSON.stringify(internalContext)).not.toContain(secret); expect(JSON.stringify(internalContext)).not.toContain(secretUrl);
  }
  // Ordinary owner review is still allowed to see originals. These are synthetic fixtures, not user/runtime proof.
  const ownerView = await f.t.query(internal.vault.getPersonWorkspace, { vaultOwnerId: f.principal.subject, personIdentifier: String(person._id) }); expect(JSON.stringify(ownerView)).toContain(secret);
  expect(await f.t.run(ctx => ctx.db.get(created.badId))).toEqual(original); expect(await f.t.run(ctx => ctx.db.get(created.sourceFactId))).not.toBeNull();
  if (mode === "privateMedia") {
    await f.reviewMedia();
    for (const [kind, id] of [["citation", bad.id], ["source", f.ids.source], ["person", String(person._id)], ["story", String(created.storyId)]]) expect(JSON.stringify(await f.callContext(kind, id))).toContain(secret);
  }
});


test.each(["living", "privateMedia", "bounds"])("inline source notes follow source privacy across MCP aggregates (%s)", async mode => {
  const secret = `PRIVATE-INLINE-SOURCE-NOTES-${mode}`;
  const f = await importedNotesFixture(mode === "living", secret); const person = f.rows.people.find(row => row.fsId === "P")!;
  if (mode === "privateMedia") await f.batch("inline-source-private-citation", 1, { citations: [{ key: "PRIVATE", sourceKey: "S", targets: [{ kind: "person", key: "P" }, { kind: "media", key: "M" }] }] });
  const storyId = await f.t.run(async ctx => {
    if (mode === "bounds") for (let i = 0; i < 50; i++) { const id = await ctx.db.insert("citations", { vaultOwnerId: f.principal.subject, sourceId: f.rows.sources[0]._id, isEvidence: true, confidence: "medium", createdAt: i, updatedAt: i }); await ctx.db.insert("citationLinks", { vaultOwnerId: f.principal.subject, citationId: id, targetType: "person", targetId: String(person._id), createdAt: i }); }
    return ctx.db.insert("stories", { vaultOwnerId: f.principal.subject, personId: person._id, type: "biography", title: "Synthetic story", content: "No inline source quotation in body.", citationIds: [f.rows.citations[0]._id], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 });
  });
  const source = await f.callContext("source", f.ids.source); expect(source.result.structuredContent.notesWithheld).toBe(true); expect(source.result.structuredContent.source.notes).toBeUndefined(); expect(JSON.stringify(source)).not.toContain(secret);
  for (const [kind, id] of [["source", f.ids.source], ["person", String(person._id)], ["story", String(storyId)]]) {
    expect(JSON.stringify(await f.callContext(kind, id))).not.toContain(secret);
    expect(JSON.stringify(await f.t.query(internal.mcpFamilyHistory.getRecordContext, { principal: f.principal, kind, id }))).not.toContain(secret);
  }
  expect((await f.t.run(ctx => ctx.db.get(f.rows.sources[0]._id)))!.notes).toBe(secret);
  expect(JSON.stringify(await f.t.query(internal.vault.getPersonWorkspace, { vaultOwnerId: f.principal.subject, personIdentifier: String(person._id) }))).toContain(secret);
  if (mode === "privateMedia") { await f.reviewMedia(); for (const [kind, id] of [["source", f.ids.source], ["person", String(person._id)], ["story", String(storyId)]]) expect(JSON.stringify(await f.callContext(kind, id))).toContain(secret); }
});
