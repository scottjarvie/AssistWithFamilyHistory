// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK envelopes and stubbed ActionCtx are synthetic. */
/** Bound validation before a compact malformed batch reaches schemas or writers. */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { createFamilyHistoryServer } from "./httpRoutes/mcp";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";

async function call(people: unknown[]) {
  const writes: { name: string; input: any }[] = [];
  const ctx = { runMutation: async (ref: any, input: any) => { writes.push({ name: getFunctionName(ref), input }); return { accepted: true }; } } as any;
  const principal = { issuer: "https://budget.example.test", subject: "synthetic-budget-owner", clientId: "synthetic-budget-ai", scopes: [] };
  const resolution: Parameters<typeof createFamilyHistoryServer>[2] = { state: "active", grant: { grantId: "synthetic-budget-grant", clientId: principal.clientId, issuer: principal.issuer, scopes: ["family_history:research:write"], boundary: { kind: "whole_workspace" } } };
  const name = "family_history_save_records";
  const handler = createMcpHandler(() => createFamilyHistoryServer(ctx, principal, resolution), { legacy: "stateless", responseMode: "json", maxRequestBodySize: FAMILY_HISTORY_MCP_LIMITS.requestBytes });
  const body = JSON.stringify({ jsonrpc: "2.0", id: "synthetic-budget", method: "tools/call", params: { name, arguments: { operationId: "synthetic-budget-call", summary: "Synthetic batch", people }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "budget-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } });
  expect(new TextEncoder().encode(body).byteLength).toBeLessThan(FAMILY_HISTORY_MCP_LIMITS.requestBytes);
  try {
    const response = await handler.fetch(new Request("https://budget.example.test/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body }));
    expect(response.status).toBe(200);
    return { body: await response.json() as any, writes };
  } finally { await handler.close(); }
}

test("an array bomb below the byte cap fails the element budget before schemas or writers", async () => {
  const result = await call(Array.from({ length: 40_000 }, () => ({})));
  expect(result.body.result.isError).toBe(true);
  expect(JSON.stringify(result.body.result)).toContain("maximum of 32768 elements");
  expect(JSON.stringify(result.body.result)).not.toMatch(/invalid_union|invalid_type/);
  expect(result.writes).toEqual([]);
});

test("a full person batch with every alternate-name and tag slot still reaches its writer", async () => {
  const people = Array.from({ length: FAMILY_HISTORY_MCP_LIMITS.batchPeople }, (_, index) => ({ mode: "create", createKey: `synthetic-person-${index}`, name: { given: "Synthetic", surname: "Person", prefix: "", suffix: "", nickname: "Fixture" }, sex: "unknown", living: false, alternateNames: Array.from({ length: 30 }, () => ({ type: "alternate", given: "S", surname: "P", prefix: "", suffix: "" })), tags: Array.from({ length: 30 }, (_, tag) => `tag-${tag}`) }));
  const result = await call(people);
  expect(result.body.result.isError).not.toBe(true);
  const write = result.writes.find(item => item.name === "mcpFamilyHistory:saveRecords");
  expect(write?.input.input.people).toHaveLength(FAMILY_HISTORY_MCP_LIMITS.batchPeople);
});
