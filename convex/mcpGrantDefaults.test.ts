/// <reference types="vite/client" />
import { describe, expect, test, vi } from "vitest";
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
    expect(effectiveExpiry({ ...automatic, consentSnapshot: JSON.stringify({ approvedBy: "sign_in", shownAt: automatic.issuedAt + 1, expiresAt: automatic.expiresAt }) })).toBe(automatic.expiresAt);
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

describe("durable revocation and owner removal", () => {
  test.each([-1, 0, 1])("projected expiry removal at end date %+i ms retains history and refusal", async (offset) => {
    const { t, grantId } = await fixture();
    const expiresAt = Date.now() + 60_000;
    await t.run((ctx) => ctx.db.patch(grantId, {
      expiryChoice: "chosen", expiresAt,
      scopeChoice: "chosen", scopes: ["family_history:context:read"],
      boundary: { kind: "selected_people", personIds: ["synthetic-person"] },
      consentSnapshot: "Synthetic original consent receipt", useCount: 4,
      lastUsedAt: expiresAt - 1000, lastToolName: "family_history_get_context",
    }));
    const before = (await t.run((ctx) => ctx.db.get(grantId)))!;
    const clock = vi.spyOn(Date, "now").mockReturnValue(expiresAt + offset);
    try {
      const args = { vaultOwnerId: owner, grantId };
      const own = t.withIdentity(identity);
      expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe(offset < 0 ? "active" : "expired");
      expect((await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner })).connections[0].status).toBe(offset < 0 ? "active" : "expired");
      expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(before);
      if (offset < 0) {
        await expect(own.mutation(api.mcpGrants.removeGrant, args)).rejects.toThrow("Revoke the connection before removing it");
        expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(before);
        return;
      }
      await expect(own.mutation(api.mcpGrants.removeGrant, args)).resolves.toEqual({ id: grantId, removed: true });
      const hidden = { ...before, status: "revoked", revokedAt: expiresAt + offset, hiddenAt: expiresAt + offset, updatedAt: expiresAt + offset };
      expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(hidden);
      expect((await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner })).connections).toEqual([]);
      await expect(own.mutation(api.mcpGrants.updateGrantExpiry, args)).rejects.toThrow("Only an approved connection");
      for (let attempt = 0; attempt < 2; attempt++) {
        const refused = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
        expect(refused.state).toBe("revoked");
        expect(permittedTools(refused, Date.now())).toEqual([]);
      }
      await expect(t.run((ctx) => assertGrantPermits(ctx, { owner, grantId, toolName: "family_history_get_context", input: { kind: "person", id: "synthetic-person" } }))).rejects.toThrow();
      const revealed = { ...hidden, hiddenAt: undefined };
      expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(revealed);
      expect(await t.run((ctx) => ctx.db.query("mcpGrants").collect())).toHaveLength(1);
      // Only explicit owner reapproval creates a new grant; the old receipt,
      // person boundary, chosen end date and usage history survive intact.
      const approved = await own.mutation(api.mcpGrants.approveGrant, {
        ...args, label: before.label, scopes: before.scopes,
        boundary: before.boundary, expiresInDays: 7,
      });
      expect(approved.id).not.toBe(grantId);
      expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(hidden);
      expect(await t.run((ctx) => ctx.db.query("mcpGrants").collect())).toHaveLength(2);
    } finally { clock.mockRestore(); }
  });

  test.each(["none", "automatic"] as const)("elapsed raw date with %s effective expiry still requires revocation", async (choice) => {
    const { t, grantId } = await fixture();
    await t.run((ctx) => ctx.db.patch(grantId, {
      ...autoExpiry(Date.now() - 100 * 86_400_000),
      ...(choice === "none" ? { expiryChoice: "none" as const } : {}),
    }));
    const before = await t.run((ctx) => ctx.db.get(grantId));
    await expect(t.withIdentity(identity).mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId })).rejects.toThrow("Revoke");
    expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(before);
  });

  test("real sign-in → narrow → chosen date → revoke → remove → sign-in stays refused, isolated by owner", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(first.state).toBe("active");
    const [initial] = await t.run((ctx) => ctx.db.query("mcpGrants").collect());
    const grantId = initial._id;
    const own = t.withIdentity(identity);
    const args = { vaultOwnerId: owner, grantId };
    await own.mutation(api.mcpGrants.reduceGrantScopes, { ...args, scopes: ["family_history:context:read"] });
    await own.mutation(api.mcpGrants.updateGrantExpiry, { ...args, expiresInDays: 7 });
    await t.run((ctx) => ctx.db.patch(grantId, { boundary: { kind: "selected_people", personIds: ["synthetic-person"] } }));
    await own.mutation(api.mcpGrants.revokeGrant, { ...args, reason: "Synthetic owner refusal" });
    const revoked = await t.run((ctx) => ctx.db.get(grantId));
    const foreign = t.withIdentity({ subject: "user_foreign_synthetic" });
    await expect(t.mutation(api.mcpGrants.removeGrant, args)).rejects.toThrow();
    await expect(foreign.action(api.mcpGrants.listConnections, { vaultOwnerId: owner })).rejects.toThrow();
    await expect(foreign.action(api.mcpGrants.recentConnectionActivity, { vaultOwnerId: owner })).rejects.toThrow();
    await expect(foreign.mutation(api.mcpGrants.removeGrant, args)).rejects.toThrow();
    await expect(foreign.mutation(api.mcpGrants.removeGrant, { ...args, vaultOwnerId: "user_foreign_synthetic" })).rejects.toThrow("Connection not found");
    await own.mutation(api.mcpGrants.removeGrant, args);
    const hidden = await t.run((ctx) => ctx.db.get(grantId));
    expect(hidden).toMatchObject({ ...revoked!, hiddenAt: expect.any(Number) });
    expect((await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner })).connections).toEqual([]);
    await t.run(async (ctx) => {
      await expect(assertGrantPermits(ctx, { owner, grantId, toolName: "family_history_get_context", input: { kind: "person", id: "synthetic-person" } })).rejects.toThrow();
    });
    const other = await t.mutation(internal.mcpGrants.resolveForRequest, { ...resolveArgs, subject: "user_foreign_synthetic" });
    expect(other.state).toBe("active");
    expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(hidden);
    for (let attempt = 0; attempt < 2; attempt++) {
      const denied = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
      expect(denied.state).toBe("revoked");
      expect(permittedTools(denied, Date.now())).toEqual([]);
    }
    expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(revoked);
    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections).toHaveLength(1);
    expect(listing.connections[0]).toMatchObject({ status: "revoked", scopeChoice: "chosen", scopes: ["family_history:context:read"], expiresAt: revoked!.expiresAt, boundary: revoked!.boundary });
    const approval = { ...args, label: "Explicit new approval", scopes: ["family_history:context:read"], boundary: revoked!.boundary, expiresInDays: 7 };
    await expect(foreign.mutation(api.mcpGrants.approveGrant, approval)).rejects.toThrow();
    await expect(foreign.mutation(api.mcpGrants.approveGrant, { ...approval, vaultOwnerId: "user_foreign_synthetic" })).rejects.toThrow("Connection not found");
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
    const approved = await own.mutation(api.mcpGrants.approveGrant, approval);
    await expect(own.mutation(api.mcpGrants.approveGrant, approval)).rejects.toThrow("already approved");
    expect(approved.id).not.toBe(grantId);
    expect(await t.run((ctx) => ctx.db.get(grantId))).toMatchObject({ ...revoked!, hiddenAt: expect.any(Number) });
    const active = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(active.state).toBe("active");
    if (active.state === "active") expect(active.grant).toMatchObject({ scopes: ["family_history:context:read"], scopeChoice: "chosen", boundary: revoked!.boundary, expiresAt: approved.expiresAt });
    expect(decideToolAccess({ resolution: active, toolName: "family_history_save_records", now: Date.now() }).allowed).toBe(false);
    // Stale tabs cannot report success against the old refusal or alter it.
    const oldHistory = await t.run((ctx) => ctx.db.get(grantId));
    await expect(own.mutation(api.mcpGrants.revokeGrant, args)).rejects.toThrow("Only an active connection");
    await expect(foreign.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: approved.id })).rejects.toThrow();
    await expect(foreign.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: "user_foreign_synthetic", grantId: approved.id })).rejects.toThrow("Connection not found");
    expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(oldHistory);
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("active");
    expect(approved.connection).toMatchObject({ id: approved.id, status: "active", revokedAt: null, revokedReason: null, useCount: 0 });
    // Reapproving did not erase the old refusal; revoking/removing the new
    // connection still cannot fall through to an automatic full grant.
    await own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: approved.id });
    await own.mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId: approved.id });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
    expect(await t.run((ctx) => ctx.db.query("mcpGrants").collect())).toHaveLength(3);
  });

  test.each([false, true])("duplicate approvals revoke atomically, reapproval cannot revive old IDs (tied=%s)", async (tied) => {
    const { t, grantId } = await fixture();
    const own = t.withIdentity(identity);
    const now = Date.now();
    await t.run((ctx) => ctx.db.patch(grantId, {
      consentedAt: now - 1000, scopeChoice: "chosen", expiryChoice: "chosen",
      scopes: ["family_history:context:read"], expiresAt: now + 86_400_000,
      hiddenAt: now - 500,
    }));
    const original = (await t.run((ctx) => ctx.db.get(grantId)))!;
    const { _id, _creationTime, ...fields } = original;
    void _id; void _creationTime;
    const nextId = await t.run((ctx) => ctx.db.insert("mcpGrants", {
      ...fields, hiddenAt: undefined, consentedAt: tied ? fields.consentedAt : now,
    }));
    // An old expired automatic approval is also usable by ID until revoked.
    const automaticId = await t.run((ctx) => ctx.db.insert("mcpGrants", {
      ...fields, ...autoExpiry(now - 100 * 86_400_000), status: "expired", expiryChoice: undefined,
    }));
    const isolated = await t.run(async (ctx) => Promise.all([
      ctx.db.insert("mcpGrants", { ...fields, vaultOwnerId: "other-synthetic-owner" }),
      ctx.db.insert("mcpGrants", { ...fields, clientId: "other-synthetic-client" }),
      ctx.db.insert("mcpGrants", { ...fields, issuer: "https://other-issuer.example.test" }),
    ]));
    const snapshots = await t.run(async (ctx) => Promise.all(isolated.map((id) => ctx.db.get(id))));
    const before = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(before.state).toBe("active");
    if (before.state !== "active") throw new Error("Expected active fixture");
    // Resolve and revoke share the deterministic consent/creation/ID ordering.
    expect(before.grant.grantId).toBe(String(nextId));
    const governingId = nextId;
    await own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: governingId });
    for (const id of [grantId, nextId, automaticId]) {
      const closed = (await t.run((ctx) => ctx.db.get(id)))!;
      expect(closed.status).toBe("revoked");
      expect(closed.scopes).toEqual(fields.scopes);
      expect(closed.scopeChoice).toBe("chosen");
      if (id !== automaticId) {
        expect(closed.expiryChoice).toBe("chosen");
        expect(closed.expiresAt).toBe(fields.expiresAt);
      }
      if (id === grantId) expect(closed.hiddenAt).toBe(original.hiddenAt);
      await t.run(async (ctx) => {
        await expect(assertGrantPermits(ctx, { owner, grantId: String(id), toolName: "family_history_get_context", input: {} })).rejects.toThrow("GRANT_REVOKED");
      });
    }
    await own.mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId: governingId });
    const refused = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(refused.state).toBe("revoked");
    expect(permittedTools(refused, Date.now())).toEqual([]);
    const refusal = decideToolAccess({ resolution: refused, toolName: "family_history_get_context", input: {}, now: Date.now() });
    expect(refusal).toMatchObject({ allowed: false, code: "GRANT_REVOKED" });
    if (!refusal.allowed) {
      expect(refusal.recovery).toContain('"Review and approve again"');
      expect(refusal.recovery).toContain("Removing it from the list does not clear the refusal");
    }
    const approved = await own.mutation(api.mcpGrants.approveGrant, {
      vaultOwnerId: owner, grantId: governingId, label: "Explicit reapproval",
      scopes: fields.scopes, boundary: fields.boundary, expiresInDays: 7,
    });
    expect([String(grantId), String(nextId), String(automaticId)]).not.toContain(String(approved.id));
    const after = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
    expect(after).toMatchObject({ state: "active", grant: { grantId: String(approved.id), scopes: fields.scopes, expiresAt: approved.expiresAt } });
    for (const id of [grantId, nextId, automaticId]) {
      await t.run(async (ctx) => {
        await expect(assertGrantPermits(ctx, { owner, grantId: String(id), toolName: "family_history_get_context", input: {} })).rejects.toThrow("GRANT_REVOKED");
      });
    }
    for (let i = 0; i < isolated.length; i++) {
      const row = snapshots[i]!;
      expect(await t.mutation(internal.mcpGrants.resolveForRequest, { subject: row.vaultOwnerId, clientId: row.clientId, issuer: row.issuer })).toMatchObject({ state: "active", grant: { grantId: String(row._id) } });
      expect(await t.run((ctx) => ctx.db.get(row._id))).toEqual(row);
    }
  });

  test("overflow refuses resolution, revoke and approval without partial writes; issuers have separate budgets", async () => {
    const { t, grantId } = await fixture();
    const otherIssuer = "https://separate-budget.example.test";
    const otherId = await t.run(async (ctx) => {
      const row = (await ctx.db.get(grantId))!;
      const { _id, _creationTime, ...fields } = row;
      void _id; void _creationTime;
      for (let i = 0; i < 256; i++) await ctx.db.insert("mcpGrants", { ...fields, status: "revoked" });
      return ctx.db.insert("mcpGrants", { ...fields, issuer: otherIssuer });
    });
    const before = await t.run((ctx) => ctx.db.query("mcpGrants").collect());
    await expect(t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).rejects.toThrow("too much approval history");
    const own = t.withIdentity(identity);
    await expect(own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId })).rejects.toThrow("too much approval history");
    const closed = before.find((row) => row.status === "revoked")!;
    await expect(own.mutation(api.mcpGrants.approveGrant, {
      vaultOwnerId: owner, grantId: closed._id, label: "Overflow", scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" },
    })).rejects.toThrow("too much approval history");
    expect(await t.run((ctx) => ctx.db.query("mcpGrants").collect())).toEqual(before);
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, { ...resolveArgs, issuer: otherIssuer })).toMatchObject({ state: "active", grant: { grantId: String(otherId) } });
  });

  test.each(["pending", "denied", "revoked", "expired"] as const)("stale revoke of %s is refused without rewriting history", async (status) => {
    const { t, grantId } = await fixture();
    await t.run((ctx) => ctx.db.patch(grantId, { status }));
    const before = await t.run((ctx) => ctx.db.get(grantId));
    await expect(t.withIdentity(identity).mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId })).rejects.toThrow("Only an active connection");
    expect(await t.run((ctx) => ctx.db.get(grantId))).toEqual(before);
  });

  test("superseded active and hidden active IDs cannot report a successful revoke", async () => {
    const { t, grantId } = await fixture();
    const original = (await t.run((ctx) => ctx.db.get(grantId)))!;
    const { _id, _creationTime, ...fields } = original;
    void _id; void _creationTime;
    const nextId = await t.run((ctx) => ctx.db.insert("mcpGrants", { ...fields, consentedAt: Date.now() + 1000 }));
    const own = t.withIdentity(identity);
    await expect(own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId })).rejects.toThrow("superseded");
    await t.run((ctx) => ctx.db.patch(grantId, { hiddenAt: Date.now() }));
    await expect(own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId })).rejects.toThrow("Only an active connection");
    expect((await t.run((ctx) => ctx.db.get(nextId)))!.status).toBe("active");
  });

  test("concurrent revocations have exactly one success; a late second approval is refused", async () => {
    const { t, grantId } = await fixture();
    const own = t.withIdentity(identity);
    const args = { vaultOwnerId: owner, grantId };
    const results = await Promise.allSettled([
      own.mutation(api.mcpGrants.revokeGrant, { ...args, reason: "first" }),
      own.mutation(api.mcpGrants.revokeGrant, { ...args, reason: "second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const approval = { ...args, label: "New", scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" as const } };
    const approved = await own.mutation(api.mcpGrants.approveGrant, approval);
    await expect(own.mutation(api.mcpGrants.approveGrant, approval)).rejects.toThrow("already approved");
    await expect(own.mutation(api.mcpGrants.revokeGrant, args)).rejects.toThrow("Only an active connection");
    await own.mutation(api.mcpGrants.revokeGrant, { ...args, grantId: approved.id });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
  });

  test.each(["denied", "pending", "expired"] as const)("removing %s records hides the row without enabling sign-in", async (status) => {
    const { t, grantId } = await fixture();
    await t.run((ctx) => ctx.db.patch(grantId, { status, scopes: ["family_history:context:read"], scopeChoice: "chosen", expiryChoice: "chosen", expiresAt: Date.now() - 1 }));
    await t.withIdentity(identity).mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId });
    const hidden = await t.run((ctx) => ctx.db.get(grantId));
    expect(hidden).toMatchObject({ hiddenAt: expect.any(Number), scopeChoice: "chosen", expiryChoice: "chosen", scopes: ["family_history:context:read"] });
    expect((await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner })).connections).toEqual([]);
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe(status === "denied" ? "denied" : "revoked");
    expect(await t.run((ctx) => ctx.db.query("mcpGrants").collect())).toHaveLength(1);
  });

  test("active removal is refused and hidden refusals do not crowd visible connections out of the 100-row window", async () => {
    const { t, grantId } = await fixture();
    await expect(t.withIdentity(identity).mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId })).rejects.toThrow("Revoke");
    await t.run(async (ctx) => {
      const row = (await ctx.db.get(grantId))!;
      for (let i = 0; i < 101; i++) await ctx.db.insert("mcpGrants", { vaultOwnerId: owner, issuer: row.issuer, label: row.label, clientProvenance: row.clientProvenance, scopes: row.scopes, boundary: row.boundary, requestedAt: row.requestedAt, updatedAt: row.updatedAt, useCount: 0, clientId: `synthetic-hidden-${i}`, status: "revoked", hiddenAt: Date.now() });
    });
    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections.map((row) => row.id)).toEqual([grantId]);
  });
});
