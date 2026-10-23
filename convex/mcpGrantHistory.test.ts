/// <reference types="vite/client" />
/**
 * Grant history ordering: the latest event wins. A refusal (revoked or denied)
 * closes every approval at or before it, even rows a legacy one-row revocation
 * left marked active. Only an explicit approval strictly after it governs again.
 */
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { assertGrantPermits } from "./mcpGrants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { permittedTools } from "../lib/mcp/authorize";

const modules = import.meta.glob("./**/*.ts");
const owner = "user_synthetic_grant_history";
const identity = { subject: owner };
const issuer = "https://identity.example.test";
const clientId = "synthetic-history-client";
const resolveArgs = { subject: owner, issuer, clientId };
const read = { toolName: "family_history_get_context", input: {} };

type GrantFields = Omit<Doc<"mcpGrants">, "_id" | "_creationTime">;

function grant(overrides: Partial<GrantFields>): GrantFields {
  const at = overrides.consentedAt ?? Date.now();
  return {
    vaultOwnerId: owner, clientId, issuer,
    label: "Synthetic history connection", observedClientName: "synthetic-client",
    clientProvenance: "manual", scopes: [...FAMILY_HISTORY_SCOPES], scopeChoice: "full", expiryChoice: "none",
    boundary: { kind: "whole_workspace" }, status: "active",
    requestedAt: at, consentedAt: at, issuedAt: at, updatedAt: at, useCount: 0,
    ...overrides,
  };
}

async function insert(t: ReturnType<typeof convexTest>, fields: GrantFields): Promise<Id<"mcpGrants">> {
  return await t.run((ctx) => ctx.db.insert("mcpGrants", fields));
}

async function permits(t: ReturnType<typeof convexTest>, grantId: Id<"mcpGrants">) {
  return await t.run((ctx) => assertGrantPermits(ctx, { owner, grantId: String(grantId), ...read }));
}

async function refuses(t: ReturnType<typeof convexTest>, grantId: Id<"mcpGrants">, code = "GRANT_REVOKED") {
  await expect(t.run((ctx) => assertGrantPermits(ctx, { owner, grantId: String(grantId), ...read }))).rejects.toThrow(code);
}

describe("revoke after grant (persisted legacy partial revocation)", () => {
  test.each([
    ["newer revoked approval", { consentedAt: -1000, revokedAt: -500 }],
    ["older approval revoked later", { consentedAt: -3000, revokedAt: -500 }],
    ["revocation tied with the active approval", { consentedAt: -3000, revokedAt: -2000 }],
  ] as const)("%s closes the older active row for MCP, by ID, in Settings and for edits", async (_name, refusal) => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    // Recent usage bumps updatedAt; it must never make the old approval newer.
    const oldId = await insert(t, grant({ consentedAt: now - 2000, updatedAt: now, lastUsedAt: now, useCount: 9 }));
    const revokedId = await insert(t, grant({ consentedAt: now + refusal.consentedAt, status: "revoked", revokedAt: now + refusal.revokedAt, updatedAt: now + refusal.revokedAt, hiddenAt: now - 100 }));
    const before = await t.run((ctx) => ctx.db.get(oldId));

    for (let attempt = 0; attempt < 2; attempt++) {
      const resolved = await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs);
      expect(resolved.state).toBe("revoked");
      expect(permittedTools(resolved, Date.now())).toEqual([]);
    }
    await refuses(t, oldId);
    await refuses(t, revokedId);
    // The refusal is revealed for explicit reapproval; the old row is untouched.
    expect((await t.run((ctx) => ctx.db.get(revokedId)))!.hiddenAt).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.get(oldId))).toEqual(before);

    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections.find((row) => row.id === oldId)).toMatchObject({ status: "revoked", revokedAt: now + refusal.revokedAt });

    const own = t.withIdentity(identity);
    await expect(own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: oldId })).rejects.toThrow("Only an active connection");
    await expect(own.mutation(api.mcpGrants.updateGrantExpiry, { vaultOwnerId: owner, grantId: oldId, expiresInDays: 7 })).rejects.toThrow("Only an approved connection");
    await expect(own.mutation(api.mcpGrants.reduceGrantScopes, { vaultOwnerId: owner, grantId: oldId, scopes: ["family_history:context:read"] })).resolves.toBeTruthy();
    // Narrowing never reopens it.
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
  });

  test("a denial after an approval also wins; other owners, clients and issuers are unaffected", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const oldId = await insert(t, grant({ consentedAt: now - 2000 }));
    await insert(t, grant({ consentedAt: undefined, issuedAt: undefined, requestedAt: now - 1500, status: "denied", revokedAt: now - 1000, updatedAt: now - 1000 }));
    const others = await Promise.all([
      insert(t, grant({ consentedAt: now - 2000, vaultOwnerId: "user_other_history_owner" })),
      insert(t, grant({ consentedAt: now - 2000, clientId: "other-history-client" })),
      insert(t, grant({ consentedAt: now - 2000, issuer: "https://other-issuer.example.test" })),
    ]);
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("denied");
    await refuses(t, oldId, "GRANT_");
    for (const id of others) {
      const row = (await t.run((ctx) => ctx.db.get(id)))!;
      expect(await t.mutation(internal.mcpGrants.resolveForRequest, { subject: row.vaultOwnerId, clientId: row.clientId, issuer: row.issuer }))
        .toMatchObject({ state: "active", grant: { grantId: String(id) } });
      await expect(t.run((ctx) => assertGrantPermits(ctx, { owner: row.vaultOwnerId, grantId: String(id), ...read }))).resolves.not.toBeNull();
    }
  });
});

describe("expired grant removal", () => {
  test("removing the governing expired approval cannot expose an older active duplicate", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const olderId = await insert(t, grant({ consentedAt: now - 5000 }));
    const expiredId = await insert(t, grant({ consentedAt: now - 3000, expiryChoice: "chosen", expiresAt: now - 1 }));
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("expired");

    const own = t.withIdentity(identity);
    await own.mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId: expiredId });
    expect(await t.run((ctx) => ctx.db.get(expiredId))).toMatchObject({ status: "revoked", hiddenAt: expect.any(Number), expiryChoice: "chosen", expiresAt: now - 1 });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
    }
    await refuses(t, olderId);
    expect((await t.run((ctx) => ctx.db.get(olderId)))!.status).toBe("active");
    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections.map((row) => [row.id, row.status])).toEqual(expect.arrayContaining([[olderId, "revoked"], [expiredId, "revoked"]]));
    // The older row reads as turned off, so it can be tidied away without a revoke.
    await own.mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId: olderId });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
  });

  test.each(["expired", "pending"] as const)("tidying an older %s row only hides it and never turns off a newer approval", async (status) => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const olderId = await insert(t, grant(status === "expired"
      ? { consentedAt: now - 5000, status: "expired", expiryChoice: "chosen", expiresAt: now - 4000 }
      : { consentedAt: undefined, issuedAt: undefined, requestedAt: now - 5000, status: "pending" }));
    const newerId = await insert(t, grant({ consentedAt: now - 1000 }));
    const before = (await t.run((ctx) => ctx.db.get(olderId)))!;
    await t.withIdentity(identity).mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId: olderId });
    expect(await t.run((ctx) => ctx.db.get(olderId))).toEqual({ ...before, hiddenAt: expect.any(Number) });
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(newerId) } });
    await expect(permits(t, newerId)).resolves.not.toBeNull();
  });
});

describe("re-grant after revoke", () => {
  test("explicit reapproval in the same millisecond as the refusal still lands after it", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const oldId = await insert(t, grant({ consentedAt: now - 2000 }));
    const revokedId = await insert(t, grant({ consentedAt: now - 1000, status: "revoked", revokedAt: now, updatedAt: now }));
    const own = t.withIdentity(identity);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const approved = await own.mutation(api.mcpGrants.approveGrant, {
        vaultOwnerId: owner, grantId: revokedId, label: "Explicit reapproval",
        scopes: ["family_history:context:read"], boundary: { kind: "whole_workspace" },
      });
      expect([String(oldId), String(revokedId)]).not.toContain(String(approved.id));
      const fresh = (await t.run((ctx) => ctx.db.get(approved.id)))!;
      expect(fresh.consentedAt).toBe(now + 1);
      expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(approved.id), scopes: ["family_history:context:read"] } });
      await expect(permits(t, approved.id)).resolves.not.toBeNull();
      // Old approvals stay closed by the refusal that preceded the new approval.
      await refuses(t, oldId);
      await refuses(t, revokedId);
      await expect(own.mutation(api.mcpGrants.approveGrant, {
        vaultOwnerId: owner, grantId: revokedId, label: "Again", scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" },
      })).rejects.toThrow("already approved");
      const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
      expect(listing.connections.find((row) => row.id === approved.id)).toMatchObject({ status: "active" });
      expect(listing.connections.find((row) => row.id === oldId)).toMatchObject({ status: "revoked" });

      // Turning the new approval off closes every remaining active row too.
      await own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: approved.id });
      expect((await t.run((ctx) => ctx.db.get(oldId)))!.status).toBe("revoked");
      expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
      await refuses(t, approved.id);

      // A second explicit approval after that newer refusal governs again.
      const again = await own.mutation(api.mcpGrants.approveGrant, {
        vaultOwnerId: owner, grantId: approved.id, label: "Second reapproval",
        scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" },
      });
      expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(again.id) } });
      await refuses(t, approved.id);
      await refuses(t, oldId);
    } finally { clock.mockRestore(); }
  });

  test("an active row closed by history can be reapproved from its own Settings entry", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const oldId = await insert(t, grant({ consentedAt: now - 2000 }));
    await insert(t, grant({ consentedAt: now - 1000, status: "revoked", revokedAt: now - 500, updatedAt: now - 500, hiddenAt: now - 400 }));
    const own = t.withIdentity(identity);
    const approved = await own.mutation(api.mcpGrants.approveGrant, {
      vaultOwnerId: owner, grantId: oldId, label: "Reapproved from old entry",
      scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" },
    });
    expect(approved.id).not.toBe(oldId);
    expect(await t.run((ctx) => ctx.db.get(oldId))).toMatchObject({ status: "active", hiddenAt: expect.any(Number) });
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(approved.id) } });
    await refuses(t, oldId);
  });

  test("an approval that predates the refusal never wins, whatever its row says", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await insert(t, grant({ consentedAt: now - 1000, status: "revoked", revokedAt: now - 100, updatedAt: now - 100 }));
    // Legacy usable-expired and active rows consented before the refusal.
    const expiredId = await insert(t, grant({ consentedAt: now - 200, status: "expired", expiryChoice: "none" }));
    const activeId = await insert(t, grant({ consentedAt: now - 100 }));
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
    await refuses(t, expiredId);
    await refuses(t, activeId);
    // A later explicit approval (strictly newer) does govern.
    const laterId = await insert(t, grant({ consentedAt: now - 99 }));
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(laterId) } });
    await refuses(t, activeId);
  });
});

describe("newest approval governs, whatever its status", () => {
  test("a newer legacy usable-expired approval governs over an older active one", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const olderId = await insert(t, grant({ consentedAt: now - 5000, scopes: ["family_history:context:read"], scopeChoice: "chosen" }));
    const newerId = await insert(t, grant({ consentedAt: now - 1000, status: "expired", expiryChoice: "none" }));
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(newerId) } });
    await expect(permits(t, newerId)).resolves.not.toBeNull();
    // A stale older ID is not authority while a newer approval governs.
    await refuses(t, olderId, "GRANT_REQUIRED");
    const own = t.withIdentity(identity);
    await expect(own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: olderId })).rejects.toThrow("superseded");
    await own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: owner, grantId: newerId });
    for (const id of [olderId, newerId]) expect((await t.run((ctx) => ctx.db.get(id)))!.status).toBe("revoked");
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("revoked");
  });

  test("a newer ended approval means expired, never a fall back to an older active approval", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const olderId = await insert(t, grant({ consentedAt: now - 5000 }));
    const endedId = await insert(t, grant({ consentedAt: now - 3000, status: "expired", expiryChoice: "chosen", expiresAt: now - 10 }));
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("expired");
    await refuses(t, olderId, "GRANT_EXPIRED");
    await refuses(t, endedId, "GRANT_EXPIRED");
    const listing = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: owner });
    expect(listing.connections.find((row) => row.id === olderId)).toMatchObject({ status: "expired" });

    const own = t.withIdentity(identity);
    // The superseded older row cannot be extended or used to dodge the end date.
    await expect(own.mutation(api.mcpGrants.updateGrantExpiry, { vaultOwnerId: owner, grantId: olderId, expiresInDays: 7 })).rejects.toThrow("Only an approved connection");
    // Tidying it only hides it; the result stays expired.
    await own.mutation(api.mcpGrants.removeGrant, { vaultOwnerId: owner, grantId: olderId });
    expect(await t.run((ctx) => ctx.db.get(olderId))).toMatchObject({ status: "active", hiddenAt: expect.any(Number) });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("expired");
    // Explicitly choosing a new date on the governing approval restores it.
    await own.mutation(api.mcpGrants.updateGrantExpiry, { vaultOwnerId: owner, grantId: endedId, expiresInDays: 7 });
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(endedId) } });
    await refuses(t, olderId, "GRANT_REQUIRED");
  });

  test("an ended governing approval can be approved again explicitly", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const olderId = await insert(t, grant({ consentedAt: now - 5000 }));
    const endedId = await insert(t, grant({ consentedAt: now - 3000, status: "expired", expiryChoice: "chosen", expiresAt: now - 10 }));
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).state).toBe("expired");
    const approved = await t.withIdentity(identity).mutation(api.mcpGrants.approveGrant, {
      vaultOwnerId: owner, grantId: endedId, label: "Renewed", scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" },
    });
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(approved.id) } });
    await refuses(t, olderId, "GRANT_REQUIRED");
  });

  test("with legacy active duplicates and no refusal, only the governing ID is authority", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const olderId = await insert(t, grant({ consentedAt: now - 5000, updatedAt: now, lastUsedAt: now }));
    const newerId = await insert(t, grant({ consentedAt: now - 1000 }));
    expect(await t.mutation(internal.mcpGrants.resolveForRequest, resolveArgs)).toMatchObject({ state: "active", grant: { grantId: String(newerId) } });
    await expect(permits(t, newerId)).resolves.not.toBeNull();
    await refuses(t, olderId, "GRANT_REQUIRED");
  });
});
