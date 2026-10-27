// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK envelopes and stubbed ActionCtx are synthetic. */
/** Bound validation before a compact malformed batch reaches schemas or writers. */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
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
