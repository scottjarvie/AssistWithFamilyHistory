/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { fullOwnDataScopes, effectiveApiKeyScopes, SCOPES } from "../lib/auth/scopes";
import { permittedTools } from "../lib/mcp/authorize";

const modules = import.meta.glob("./**/*.ts");
const principal = { subject: "synthetic-fad-owner", issuer: "https://fad.example.test", clientId: "client-a" };
const person = { subject: principal.subject, sid: "session_synthetic" };
async function fixture() {
  const t = convexTest(schema, modules);
  const resolved = await t.mutation(internal.mcpGrants.resolveForRequest, principal);
  if (resolved.state !== "active") throw new Error("Synthetic sign-in failed");
  return { t, grantId: resolved.grant.grantId as never, expectedVersion: 0 };
}

describe("verified own MCP reductions", () => {
  test("scope-free access retains control, audit is durable and sibling is unchanged", async () => {
    const { t, grantId } = await fixture();
    await t.mutation(internal.mcpGrants.resolveForRequest, { ...principal, clientId: "client-b" });
    const sibling = await t.run((ctx) => ctx.db.query("mcpGrants").filter((q) => q.eq(q.field("clientId"), "client-b")).first());
    const result = await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 0, scopes: [] });
    expect(result).toMatchObject({ version: 1, scopes: [], receiptId: expect.any(String) });
    const resolution = await t.mutation(internal.mcpGrants.resolveForRequest, principal);
    expect(permittedTools(resolution, Date.now()).map((tool) => tool.name)).toEqual(["family_history_manage_connection"]);
    expect(await t.run((ctx) => ctx.db.get(result.receiptId!))).toMatchObject({ grantId, principalKind: "mcp", detail: expect.stringContaining('"before"') });
    expect(await t.run((ctx) => ctx.db.get(sibling!._id))).toEqual(sibling);
    await expect(t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 1, scopes: ["family_history:context:read"] })).rejects.toThrow("Settings");
  });
  test("entity removals and shorter date are allowed; additions and extension are refused atomically", async () => {
    const { t, grantId } = await fixture();
    const end = Date.now() + 100000;
    await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 0, boundary: { kind: "selected_people", personIds: ["a", "b"] }, expiresAt: end });
    const before = await t.run((ctx) => ctx.db.get(grantId));
    for (const change of [{ boundary: { kind: "whole_workspace" as const } }, { boundary: { kind: "selected_people" as const, personIds: ["a", "c"] } }, { expiresAt: end + 1 }]) {
      await expect(t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 1, ...change })).rejects.toThrow("Settings");
      expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(before);
    }
    expect(await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 1, boundary: { kind: "selected_people", personIds: ["a"] }, expiresAt: end - 1 })).toMatchObject({ version: 2, boundary: { personIds: ["a"] }, expiresAt: end - 1 });
  });
  test.each(["pause", "revoke"] as const)("%s cannot be undone by sign-in, AI or stale person payload", async (action) => {
    const { t, grantId } = await fixture();
    await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action, expectedGrantId: grantId, expectedVersion: 0 });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, principal)).state).toBe("revoked");
    await expect(t.withIdentity(person).mutation(api.mcpGrants.approveGrant, { vaultOwnerId: principal.subject, grantId, expectedVersion: 0, label: "Stale", boundary: { kind: "whole_workspace" } })).rejects.toThrow("connection changed");
    await expect(t.withIdentity({ ...person, client_id: principal.clientId }).mutation(api.mcpGrants.approveGrant, { vaultOwnerId: principal.subject, grantId, expectedVersion: 1, label: "AI", boundary: { kind: "whole_workspace" } })).rejects.toThrow("Settings");
    const restored = await t.withIdentity(person).mutation(api.mcpGrants.approveGrant, { vaultOwnerId: principal.subject, grantId, expectedVersion: 1, label: "Person choice", boundary: { kind: "whole_workspace" } });
    expect(restored.id).not.toBe(grantId);
    await expect(t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 0, scopes: [] })).rejects.toThrow("changed");
  });
  test("concurrent stale reduction has one commit and one receipt", async () => {
    const { t, grantId } = await fixture();
    const change = { ...principal, action: "reduce" as const, expectedGrantId: grantId, expectedVersion: 0, scopes: [] };
    const results = await Promise.allSettled([t.mutation(internal.mcpGrants.reduceOwnConnection, change), t.mutation(internal.mcpGrants.reduceOwnConnection, change)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("agentActivity").collect())).toHaveLength(1);
  });
});

describe("API defaults and token-only reductions", () => {
  test("omitted choices are full private-data and no end; unmarked arrays never inherit future scopes", async () => {
    const t = convexTest(schema, modules);
    const minted = await t.withIdentity(person).mutation(api.apiKeys.mintKey, { vaultOwnerId: principal.subject, keyId: "dts_live_fad", hashedSecret: "synthetic-hash", label: "Synthetic" });
    const row = await t.run((ctx) => ctx.db.get(minted._id));
    expect(row).toMatchObject({ scopeChoice: "full", scopes: fullOwnDataScopes(), tier: "standard" });
    expect(row!.expiresAt).toBeUndefined();
    expect(row!.scopes).not.toContain("admin:keys");
    expect(row!.scopes).not.toContain("stories:publish");
    const catalog = SCOPES as unknown as string[];
    catalog.push("future:read");
    try {
      expect(effectiveApiKeyScopes(row!)).toContain("future:read");
      expect(effectiveApiKeyScopes({ scopes: row!.scopes })).not.toContain("future:read");
    } finally { catalog.pop(); }
  });
  test.each([{}, { sid: "session_ai", client_id: "ai" }, { sid: "session_ai", azp: "ai" }])("AI identity cannot mint sibling/replacement or restore a key: %j", async (claims) => {
    const t = convexTest(schema, modules);
    const id = await t.withIdentity(person).mutation(api.apiKeys.mintKey, { vaultOwnerId: principal.subject, keyId: "dts_live_fad", hashedSecret: "synthetic", label: "Synthetic" });
    await t.withIdentity(person).mutation(api.apiKeys.setKeyStatus, { vaultOwnerId: principal.subject, keyId: id.keyId, status: "suspended" });
    const ai = t.withIdentity({ subject: principal.subject, ...claims });
    await expect(ai.mutation(api.apiKeys.mintKey, { vaultOwnerId: principal.subject, keyId: "dts_live_other", hashedSecret: "synthetic", label: "AI" })).rejects.toThrow("Settings");
    await expect(ai.mutation(api.apiKeys.setKeyStatus, { vaultOwnerId: principal.subject, keyId: id.keyId, expectedVersion: 1, status: "active" })).rejects.toThrow("Settings");
  });
  test("real HTTP bearer proof binds its own key, refuses sibling fields and widening, and audits a zero-scope reduction", async () => {
    const t = convexTest(schema, modules);
    const secret = "synthetic-secret";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const hashedSecret = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    await t.withIdentity(person).mutation(api.apiKeys.mintKey, { vaultOwnerId: principal.subject, keyId: "dts_live_fad", hashedSecret, label: "Synthetic" });
    const call = (body: unknown, token = `dts_live_fad.${secret}`) => t.fetch("/api-key/access", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await call({ action: "inspect" }, "dts_live_fad.wrong")).status).toBe(403);
    expect((await call({ action: "reduce", keyId: "sibling", expectedVersion: 0, scopes: [] })).status).toBe(400);
    expect(await (await call({ action: "reduce", expectedVersion: 0, scopes: [], expiresAt: Date.now() + 60000 })).json()).toMatchObject({ version: 1, scopes: [], receiptId: expect.any(String) });
    expect((await call({ action: "reduce", expectedVersion: 1, scopes: ["people:read"] })).status).toBe(403);
    expect((await call({ action: "reduce", expectedVersion: 1, expiresAt: null })).status).toBe(400);
    expect((await call({ action: "reduce", expectedVersion: 0, scopes: [] })).status).toBe(403);
    expect((await call({ action: "pause", expectedVersion: 1 })).status).toBe(200);
    expect((await call({ action: "inspect" })).status).toBe(403);
    const receipts = await t.run((ctx) => ctx.db.query("agentActivity").collect());
    expect(receipts).toHaveLength(2);
    expect(receipts[0].detail).toContain('"before"');
  });
});

test("removing the last selected Queue item removes Queue authority instead of interpreting empty as all", async () => {
  const { t, grantId } = await fixture();
  await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 0, boundary: { kind: "queue_only", queueItemIds: ["synthetic-item"] } });
  const after = await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "reduce", expectedGrantId: grantId, expectedVersion: 1, boundary: { kind: "queue_only", queueItemIds: [] } });
  expect(after.scopes.some((scope) => scope.startsWith("family_history:queue:"))).toBe(false);
  const resolution = await t.mutation(internal.mcpGrants.resolveForRequest, principal);
  expect(permittedTools(resolution, Date.now()).map((tool) => tool.name)).toEqual(["family_history_manage_connection"]);
});

test("person scope snapshots and consent receipts never infer future-full from array equality", async () => {
  const { t, grantId } = await fixture();
  await t.mutation(internal.mcpGrants.reduceOwnConnection, { ...principal, action: "revoke", expectedGrantId: grantId, expectedVersion: 0 });
  const scopes = (await t.run((ctx) => ctx.db.get(grantId)))!.scopes;
  const after = await t.withIdentity(person).mutation(api.mcpGrants.approveGrant, { vaultOwnerId: principal.subject, grantId, expectedVersion: 1, label: "Frozen explicit choice", scopes, boundary: { kind: "whole_workspace" } });
  const row = await t.run((ctx) => ctx.db.get(after.id));
  expect(row!.scopeChoice).toBe("chosen");
  expect(JSON.parse(row!.consentSnapshot!)).toMatchObject({ scopeChoice: "chosen", fullAccessIncludesFutureTools: false });
});

test("a supported site session origin is a browser session label, not an OAuth client identifier", async () => {
  const t = convexTest(schema, modules);
  await expect(t.withIdentity({ ...person, azp: "https://assistwithfamilyhistory.com" }).mutation(api.apiKeys.mintKey, { vaultOwnerId: principal.subject, keyId: "dts_live_session", hashedSecret: "synthetic", label: "Synthetic" })).resolves.toMatchObject({ keyId: "dts_live_session" });
  await expect(t.withIdentity({ ...person, azp: "https://ai-client.example.test" }).mutation(api.apiKeys.mintKey, { vaultOwnerId: principal.subject, keyId: "dts_live_ai", hashedSecret: "synthetic", label: "Synthetic" })).rejects.toThrow("Settings");
});
