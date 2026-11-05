// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK envelopes and stubbed ActionCtx are synthetic. */
/** Bound validation before a compact malformed batch reaches schemas or writers. */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
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
