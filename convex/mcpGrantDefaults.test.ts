/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { assertGrantPermits } from "./mcpGrants";
import { api, internal } from "./_generated/api";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { decideToolAccess, permittedTools } from "../lib/mcp/authorize";
import { effectiveScopes, effectiveScopeChoice, effectiveExpiry, LEGACY_FULL_SCOPE_BASELINE } from "../lib/mcp/grantDefaults";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const owner = "user_synthetic_grant_defaults";
const identity = { subject: owner };
const resolveArgs = { subject: owner, issuer: "https://identity.example.test", clientId: "synthetic-mcp-client" };

function autoExpiry(issuedAt: number) {
  const expiresAt = issuedAt + 90 * 86_400_000;
  return { requestedAt: issuedAt, issuedAt, consentedAt: issuedAt, expiresAt, consentSnapshot: JSON.stringify({ approvedBy: "sign_in", shownAt: issuedAt, expiresAt }) };
}

async function fixture() {
  const t = convexTest(schema, modules);
  const grantId = await seedGrant(t, { vaultOwnerId: owner, expiresAt: null });
  return { t, grantId: grantId as never };
}

describe("durable full access", () => {
  test("new sign-ins persist full access and no end date, without renewing on subsequent requests", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(first.state).toBe("active");
    const before = await t.run((ctx) => ctx.db.query("mcpGrants").collect());
    expect(before[0]).toMatchObject({ scopeChoice: "full", expiryChoice: "none", scopes: [...FAMILY_HISTORY_SCOPES] });
    expect(before[0].expiresAt).toBeUndefined();
    await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(await t.run((ctx) => ctx.db.query("mcpGrants").collect())).toEqual(before);
  });

  test("full marker resolves all tools even when stored scopes are incomplete; chosen never widens", () => {
    const grant = { grantId: "synthetic", clientId: "client", issuer: "issuer", scopes: [], scopeChoice: "full" as const, boundary: { kind: "whole_workspace" as const } };
    const full = { state: "active" as const, grant };
    expect(permittedTools(full, Date.now()).length).toBeGreaterThan(0);
    expect(decideToolAccess({ resolution: full, toolName: "family_history_save_records", input: {}, now: Date.now() }).allowed).toBe(true);
    expect(permittedTools({ state: "active", grant: { ...grant, scopeChoice: "chosen" } }, Date.now())).toEqual([]);
    expect(effectiveScopes({ scopes: [...LEGACY_FULL_SCOPE_BASELINE], scopeChoice: "chosen" })).toEqual([...FAMILY_HISTORY_SCOPES]);
  });

  test("legacy inference uses the frozen baseline, not future catalog membership", () => {
    expect(effectiveScopeChoice({ scopes: [...LEGACY_FULL_SCOPE_BASELINE] })).toBe("full");
    expect(effectiveScopeChoice({ scopes: LEGACY_FULL_SCOPE_BASELINE.slice(1) })).toBe("chosen");
    const catalog = FAMILY_HISTORY_SCOPES as unknown as string[];
    catalog.push("family_history:future:synthetic");
    try {
      expect(effectiveScopes({ scopes: [...LEGACY_FULL_SCOPE_BASELINE] })).toContain("family_history:future:synthetic");
      expect(effectiveScopes({ scopes: [...LEGACY_FULL_SCOPE_BASELINE], scopeChoice: "chosen" })).not.toContain("family_history:future:synthetic");
    } finally { catalog.pop(); }
  });

  test("narrowing persists chosen and settings/authorization agree", async () => {
    const { t, grantId } = await fixture();
    await t.withIdentity(identity).mutation(api.mcpGrants.reduceGrantScopes, { vaultOwnerId: owner, grantId, scopes: ["family_history:context:read"] });
    const row = await t.run((ctx) => ctx.db.get(grantId));
    expect(row).toMatchObject({ scopeChoice: "chosen", scopes: ["family_history:context:read"] });
    const resolution = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections[0].scopes).toEqual(["family_history:context:read"]);
    expect(decideToolAccess({ resolution, toolName: "family_history_save_records", now: Date.now() }).allowed).toBe(false);
  });
});

describe("explicit and legacy expiry", () => {
  test("only matching automatic sign-in receipts ignore old dates", () => {
    const automatic = autoExpiry(Date.now() - 100 * 86_400_000);
    expect(effectiveExpiry(automatic)).toBeUndefined();
    expect(effectiveExpiry({ ...automatic, requestedAt: automatic.issuedAt - 1 })).toBe(automatic.expiresAt);
    expect(effectiveExpiry({ ...automatic, expiryChoice: "chosen" })).toBe(automatic.expiresAt);
    expect(effectiveExpiry({ ...automatic, consentSnapshot: undefined })).toBe(automatic.expiresAt);
    expect(effectiveExpiry({ ...automatic, expiresAt: automatic.expiresAt + 1 })).toBe(automatic.expiresAt + 1);
    expect(effectiveExpiry({ ...automatic, consentSnapshot: "not json" })).toBe(automatic.expiresAt);
    expect(effectiveExpiry({ ...automatic, consentSnapshot: JSON.stringify({ approvedBy: "settings", shownAt: automatic.issuedAt, expiresAt: automatic.expiresAt }) })).toBe(automatic.expiresAt);
  });

  test.each(["active", "expired"] as const)("legacy automatic %s dates are ignored at read time without modifying rows or scopes", async (status) => {
    const { t, grantId } = await fixture();
    await t.run((ctx) => ctx.db.patch(grantId, { ...autoExpiry(Date.now() - 100 * 86_400_000), status, scopes: ["family_history:context:read"], boundary: { kind: "selected_people", personIds: ["synthetic-person"] } }));
    const before = await t.run((ctx) => ctx.db.get(grantId));
    const resolved = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(resolved.state).toBe("active");
    if (resolved.state === "active") {
      expect(resolved.grant.expiresAt).toBeUndefined();
      expect(resolved.grant.scopes).toEqual(["family_history:context:read"]);
      expect(resolved.grant.boundary.kind).toBe("selected_people");
    }
    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections[0]).toMatchObject({ status: "active", expiresAt: null });
    expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(before);
    expect(await t.run((ctx) => assertGrantPermits(ctx, { owner, grantId, toolName: "family_history_get_context", input: { kind: "person", id: "synthetic-person" } }))).not.toBeNull();
  });

  test("settings add/change/remove a chosen date independently of scopes; sign-in never renews it", async () => {
    const { t, grantId } = await fixture();
    const args = { vaultOwnerId: owner, grantId };
    await t.withIdentity(identity).mutation(api.mcpGrants.updateGrantExpiry, { ...args, expiresInDays: 7 });
    expect(await t.run((ctx) => ctx.db.get(grantId))).toMatchObject({ expiryChoice: "chosen" });
    const later = await t.withIdentity(identity).mutation(api.mcpGrants.updateGrantExpiry, { ...args, expiresInDays: 30 });
    expect(later.expiresAt!).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await t.run((ctx) => ctx.db.patch(grantId, { expiresAt: Date.now() - 1 }));
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("expired");
    await t.withIdentity(identity).mutation(api.mcpGrants.updateGrantExpiry, args);
    const row = await t.run((ctx) => ctx.db.get(grantId));
    expect(row).toMatchObject({ expiryChoice: "none", scopes: [...FAMILY_HISTORY_SCOPES] });
    expect(row!.expiresAt).toBeUndefined();
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("active");
  });

  test("approval defaults unlimited; explicit dates and partial scopes are marked chosen", async () => {
    for (const limited of [false, true]) {
      const { t, grantId } = await fixture();
      await t.run((ctx) => ctx.db.patch(grantId, { status: "pending" }));
      await t.withIdentity(identity).mutation(api.mcpGrants.approveGrant, { vaultOwnerId: owner, grantId, label: "Synthetic", scopes: limited ? ["family_history:context:read"] : [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" }, ...(limited ? { expiresInDays: 7 } : {}) });
      const row = await t.run((ctx) => ctx.db.get(grantId));
      expect(row).toMatchObject({ expiryChoice: limited ? "chosen" : "none", scopeChoice: limited ? "chosen" : "full" });
      if (!limited) expect(row!.expiresAt).toBeUndefined();
    }
  });

  test("foreign owners, invalid days and revoked/denied grants cannot be changed", async () => {
    const { t, grantId } = await fixture();
    const args = { vaultOwnerId: owner, grantId };
    await expect(t.mutation(api.mcpGrants.updateGrantExpiry, args)).rejects.toThrow();
    await expect(t.withIdentity({ subject: "user_other_synthetic" }).mutation(api.mcpGrants.updateGrantExpiry, args)).rejects.toThrow();
    for (const expiresInDays of [0, -1, 1.5, 366]) await expect(t.withIdentity(identity).mutation(api.mcpGrants.updateGrantExpiry, { ...args, expiresInDays })).rejects.toThrow();
    for (const status of ["revoked", "denied"] as const) {
      await t.run((ctx) => ctx.db.patch(grantId, { status, ...autoExpiry(Date.now() - 100 * 86_400_000) }));
      expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe(status);
      await expect(t.withIdentity(identity).mutation(api.mcpGrants.updateGrantExpiry, args)).rejects.toThrow();
    }
  });
});
