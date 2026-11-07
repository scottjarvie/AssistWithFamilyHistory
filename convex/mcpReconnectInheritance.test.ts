/// <reference types="vite/client" />
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { assertGrantPermits } from "./mcpGrants";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { prepareLegacyOwner, seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "user_reconnect_audit", issuer: "https://identity.example.test", clientId: "old-client" };
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, observedClientName: "Claude" });
  const row = (await t.run(ctx => ctx.db.query("mcpGrants").collect()))[0];
  const read = (clientId = identity.clientId) => t.query(internal.mcpGrants.describeCallingConnection, { ...identity, clientId });
  const limit = async (action: "limit" | "pause" | "revoke", extra = {}) => t.mutation(internal.mcpGrants.limitCallingConnection, {
    ...identity, action, revision: (await read()).revision, opId: crypto.randomUUID(), ...extra,
  });
  const person = async (action: "restore" | "resume") => t.withIdentity({ subject: identity.subject }).mutation(api.mcpGrants.controlGrant, {
    vaultOwnerId: identity.subject, grantId: row._id, action, carriedRevision: (await read()).carriedRevision, revision: (await read()).revision, opId: crypto.randomUUID(),
  });
  const reconnect = (clientId: string, observedClientName?: string) => t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId, observedClientName });
  return { t, row, read, limit, person, reconnect };
}

describe("Decision 4: unknown registrations fail closed", () => {
  test.each([undefined, "A new name", "Claude-User/1.0"])("new id named %s cannot escape a revoke, even when its real name arrives later", async name => {
    const { limit, reconnect, read } = await setup();
    await limit("revoke");
    expect((await reconnect("new-client", name)).state).toBe("revoked");
    const inherited = await read("new-client");
    expect(inherited.tools).toEqual(["family_history_connection", "family_history_limit_connection"]);
    expect(inherited.heldBack).toHaveLength(18);
    expect((await reconnect("new-client", "Claude")).state).toBe("revoked");
    expect((await read("new-client")).tools).toEqual(inherited.tools);
  });

  test.each(["active", "pending"] as const)("a pre-existing unaliased %s successor joins the restricted predecessor on its next request", async status => {
    const { t, limit, reconnect, read } = await setup();
    await seedGrant(t, { vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "already-minted", status, expiresAt: null });
    await limit("limit", { removeScopes: ["family_history:research:write"] });
    await reconnect("already-minted");
    const inherited = await read("already-minted");
    expect(inherited.powers).toEqual(FAMILY_HISTORY_SCOPES.filter(s => s !== "family_history:research:write"));
    expect(inherited.tools).not.toContain("family_history_save_person");
    await reconnect("already-minted", "Claude");
    expect((await read("already-minted")).powers).toEqual(inherited.powers);
  });

  test("a late initialize name matches even after an earlier full grant was minted", async () => {
    const { t, reconnect } = await setup();
    // Both installs were full initially: no unresolved predecessor existed.
    expect((await reconnect("early-anonymous")).state).toBe("active");
    expect(await t.run(ctx => ctx.db.query("mcpClientAliases").collect())).toHaveLength(2);
    await reconnect("early-anonymous", "Claude");
    const aliases = await t.run(ctx => ctx.db.query("mcpClientAliases").collect());
    expect(aliases.map(row => row.clientId).sort()).toEqual(["early-anonymous", "old-client"]);
    const connections = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: identity.subject });
    expect(connections.connections).toHaveLength(1);
    expect(connections.connections[0].linkedByName).toBe(true);
  });

  test.each([undefined, "legacy-client"])("pre-change rows with name %s carry their limits to every new identity", async observedClientName => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("mcpGrants", {
      vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "legacy-client",
      label: "Legacy synthetic connection", clientProvenance: "manual", observedClientName,
      scopes: ["family_history:context:read"], boundary: { kind: "whole_workspace" }, status: "active",
      requestedAt: 1, issuedAt: 1, consentedAt: 1, updatedAt: 1, useCount: 0,
      // Intentionally no new fields, receipts, alias, revision or scope marker.
    }));
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId: "preparation-probe" })).state).toBe("pending");
    await prepareLegacyOwner(t, identity.subject);
    for (const [clientId, name] of [["successor-1", undefined], ["successor-2", "Different AI"], ["successor-3", "Yet another name"]]) {
      await t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId: clientId!, observedClientName: name });
      const inherited = await t.query(internal.mcpGrants.describeCallingConnection, { ...identity, clientId: clientId! });
      expect(inherited.powers).toEqual(["family_history:context:read"]);
      expect(inherited.heldBack).toContainEqual(expect.objectContaining({ tool: "family_history_save_person", missingPower: "family_history:research:write" }));
    }
  });

  test("a prior full successor cannot supersede an unresolved older refusal", async () => {
    const { t, limit, reconnect, read } = await setup();
    await limit("revoke");
    await seedGrant(t, { vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "old-full-escape", expiresAt: null });
    for (const client of ["second-escape", "third-escape", "old-full-escape"]) {
      expect((await reconnect(client, "Unmatched name")).state).toBe("revoked");
      expect((await read(client)).tools).toEqual(["family_history_connection", "family_history_limit_connection"]);
    }
  });

  test("pause survives revoke, repeated inheritance and person Restore; Resume is still separate", async () => {
    const { t, limit, reconnect, read, person } = await setup();
    await limit("pause"); const pausedAt = (await read()).pausedAt;
    expect(pausedAt).toEqual(expect.any(Number));
    await limit("revoke");
    await reconnect("unknown-1"); await reconnect("unknown-2", "New name");
    expect(await read("unknown-2")).toMatchObject({ state: "revoked", pausedAt });
    await person("restore");
    expect((await read()).state).toBe("paused");
    expect((await reconnect("unknown-3")).state).toBe("paused");
    expect((await read("unknown-3")).pausedAt).toBe(pausedAt);
    await person("resume");
    expect((await reconnect("unknown-4")).state).toBe("active");
    expect((await read("unknown-4")).powers).toEqual([...FAMILY_HISTORY_SCOPES]);
    // A real narrowing error, rather than an unrelated missing argument failure.
    await t.mutation(internal.mcpGrants.limitCallingConnection, { ...identity, action: "limit", revision: (await read()).revision, opId: "short-date", endsAt: Date.now() + 100_000 });
    await expect(t.mutation(internal.mcpGrants.limitCallingConnection, { ...identity, action: "limit", revision: (await read()).revision, opId: "try-extend", endsAt: Date.now() + 200_000 }))
      .rejects.toThrow(/VALIDATION_ERROR.*may only be shortened/);
  });

  test("person reapproval supersedes legacy revoked history instead of trapping future clients", async () => {
    const { t, row, limit, reconnect, read } = await setup();
    await limit("revoke");
    await t.withIdentity({ subject: identity.subject }).mutation(api.mcpGrants.approveGrant, {
      vaultOwnerId: identity.subject, grantId: row._id, revision: (await read()).revision, opId: "explicit-new-approval",
      carriedRevision: (await read()).carriedRevision, label: "Claude", scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" },
    });
    for (const id of ["restored-successor", "another-restored-successor"]) {
      expect((await reconnect(id, "Claude")).state).toBe("active");
      expect((await read(id)).powers).toEqual([...FAMILY_HISTORY_SCOPES]);
    }
  });

  test("validated server registration name wins over the initialize label", async () => {
    const { t, reconnect, limit } = await setup();
    await limit("revoke");
    await t.mutation(internal.mcpClientTrust.saveRegistration, { clientId: "registered-client", clientName: "Claude", redirectUris: [], provenance: "dcr", status: "valid" });
    expect((await reconnect("registered-client", "Untrusted name")).state).toBe("revoked");
    const connections = await t.query(internal.mcpGrants.listConnectionsInternal, { vaultOwnerId: identity.subject });
    expect(connections.connections[0].linkedByName).toBe(true);
  });

  test("a URL client id and failed metadata registration never establish a different authority", async () => {
    const { t, limit, reconnect, read } = await setup();
    await limit("revoke");
    const clientId = "https://different.example.test/client.json";
    await t.mutation(internal.mcpClientTrust.saveRegistration, { clientId, clientName: "Different app", redirectUris: [], provenance: "cimd", status: "rejected" });
    expect((await reconnect(clientId, "Different app")).state).toBe("revoked");
    expect((await read(clientId)).tools).toEqual(["family_history_connection", "family_history_limit_connection"]);
  });

  test("Restore preserves an elapsed chosen end date; release ordering survives identical and backwards clocks", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    try {
      const { t, row, limit, reconnect, read, person } = await setup();
      await limit("limit", { endsAt: 2_001_000 });
      await limit("revoke");
      clock.mockReturnValue(2_002_000);
      await person("restore");
      expect(await read()).toMatchObject({ state: "expired", endsAt: 2_001_000 });
      await t.withIdentity({ subject: identity.subject }).mutation(api.mcpGrants.controlGrant, {
        vaultOwnerId: identity.subject, grantId: row._id, action: "expiry", revision: (await read()).revision,
        carriedRevision: (await read()).carriedRevision, opId: "clear-chosen-date",
      });
      expect((await read()).state).toBe("active");
      await limit("revoke"); await person("restore");
      const releaseRevision = (await read()).revision;
      clock.mockReturnValue(1_000_000);
      await limit("revoke");
      expect((await read()).revision).toBeGreaterThan(releaseRevision);
      expect((await reconnect("after-clock-rollback", "Different app")).state).toBe("revoked");
    } finally { clock.mockRestore(); }
  });

  test("another owner or issuer does not impose limits on a new connection", async () => {
    const { t, limit } = await setup(); await limit("revoke");
    for (const args of [{ ...identity, subject: "user_unrelated" }, { ...identity, issuer: "https://different.example.test" }]) {
      const next = { ...args, clientId: "unrelated-new" };
      expect((await t.mutation(internal.mcpGrants.resolveForRequest, next)).state).toBe("active");
      expect((await t.query(internal.mcpGrants.describeCallingConnection, next)).powers).toEqual([...FAMILY_HISTORY_SCOPES]);
    }
  });

  test("production audit returns a distinct owner count only and ignores aliased or restored predecessors", async () => {
    const { t, limit, reconnect, person } = await setup();
    await limit("revoke");
    for (const clientId of ["unaliased-1", "unaliased-2"]) await t.run(ctx => ctx.db.insert("mcpGrants", {
      vaultOwnerId: identity.subject, issuer: identity.issuer, clientId, label: "Old full successor", clientProvenance: "manual", status: "active",
      scopes: [...FAMILY_HISTORY_SCOPES], scopeChoice: "full", expiryChoice: "none", boundary: { kind: "whole_workspace" }, requestedAt: Date.now(), issuedAt: Date.now(), updatedAt: Date.now(), useCount: 0,
    }));
    expect(await t.query(internal.mcpGrants.countOwnersWithUnaliasedSuccessors, {})).toBe(1);
    await reconnect("unaliased-1"); await reconnect("unaliased-2");
    expect(await t.query(internal.mcpGrants.countOwnersWithUnaliasedSuccessors, {})).toBe(0);
    await person("restore");
    await seedGrant(t, { vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "unaliased-after-restore", expiresAt: null });
    expect(await t.query(internal.mcpGrants.countOwnersWithUnaliasedSuccessors, {})).toBe(0);
  });
});

describe("Decision 4 durable carry: rules 8–12", () => {
  test.each(["limit", "pause", "revoke", "date"] as const)("Restore does not exempt a predecessor from a later %s", async kind => {
    const { t, limit, reconnect, person, read } = await setup();
    await limit("revoke"); await reconnect("first-successor", "Another self-reported name");
    await person("restore");
    const restoredRevision = (await read()).revision;
    const released = await t.run(ctx => ctx.db.query("mcpCarriedRestrictions").withIndex("by_owner", q => q.eq("vaultOwnerId", identity.subject)).unique());
    expect(released!.entries).toEqual([]);
    const endsAt = Date.now() + 100_000;
    await limit(kind === "date" ? "limit" : kind, kind === "limit" ? { removeScopes: ["family_history:research:write"] } : kind === "date" ? { endsAt } : {});
    const carried = await t.run(ctx => ctx.db.query("mcpCarriedRestrictions").withIndex("by_owner", q => q.eq("vaultOwnerId", identity.subject)).unique());
    expect(carried!.entries).toHaveLength(1);
    expect(carried!.entries[0].sourceRevision).toBeGreaterThan(restoredRevision);
    await reconnect("second-successor", "Completely different name");
    const result = await read("second-successor");
    expect(result.state).toBe(kind === "revoke" ? "revoked" : kind === "pause" ? "paused" : "active");
    if (kind === "limit") expect(result.powers).not.toContain("family_history:research:write");
    if (kind === "date") expect(result.endsAt).toBe(endsAt);
  });

  test("restoring an old full successor joins its lineage; later stale-member restrictions still apply", async () => {
    const { t, row, limit, reconnect, read } = await setup(); await limit("revoke");
    const successorId = await seedGrant(t, { vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "old-full-successor", expiresAt: null });
    const before = (await t.run(ctx => ctx.db.get(successorId as typeof row._id)))!;
    const args = { vaultOwnerId: identity.subject, grantId: before._id, action: "restore", revision: before.revision ?? 0, carriedRevision: (await read()).carriedRevision, opId: "restore-successor" };
    const owner = t.withIdentity({ subject: identity.subject });
    await owner.mutation(api.mcpGrants.controlGrant, args);
    expect((await read("old-full-successor")).state).toBe("active");
    await t.mutation(internal.mcpGrants.limitCallingConnection, { ...identity, clientId: "old-full-successor", action: "revoke", revision: (await read("old-full-successor")).revision, opId: "revoke-after-restore" });
    // Replaying the prior person operation cannot override a later restriction.
    expect(await owner.mutation(api.mcpGrants.controlGrant, args)).toMatchObject({ deduplicated: true, state: "revoked" });
    await expect(t.run(ctx => assertGrantPermits(ctx, { owner: identity.subject, grantId: before._id, toolName: "family_history_get_brief", input: {} }))).rejects.toThrow("GRANT_REVOKED");
    const oldUses = (await t.run(ctx => ctx.db.get(before._id)))!.useCount;
    await t.mutation(internal.mcpGrants.touchGrantUse, { vaultOwnerId: identity.subject, grantId: before._id, toolName: "family_history_connection" });
    expect((await t.run(ctx => ctx.db.get(before._id)))!.useCount).toBe(oldUses);
    expect((await t.run(ctx => ctx.db.get(row._id)))!.useCount).toBeGreaterThan(0);
    expect((await reconnect("third-successor", "new name")).state).toBe("revoked");
    expect((await read()).state).toBe("revoked");
  });

  test("legacy preparation processes more than 1000 rows and keeps the oldest revoke; Settings includes every current connection", async () => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("mcpGrants", {
      vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "oldest-revoked", label: "Oldest legacy", clientProvenance: "manual",
      scopes: [...FAMILY_HISTORY_SCOPES], boundary: { kind: "whole_workspace" }, status: "revoked", requestedAt: 1, revokedAt: 2, updatedAt: 2, useCount: 0,
    }));
    for (let start = 0; start < 1005; start += 100) await t.run(async ctx => {
      for (let i = start; i < Math.min(start + 100, 1005); i++) await ctx.db.insert("mcpGrants", {
        vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: `old-full-${i}`, label: `Legacy ${i}`, clientProvenance: "manual",
        scopes: [...FAMILY_HISTORY_SCOPES], scopeChoice: "full", expiryChoice: "none", boundary: { kind: "whole_workspace" }, status: "active", requestedAt: 10 + i, issuedAt: 10 + i, updatedAt: 10 + i, useCount: 0,
      });
    });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId: "new-after-1000" })).state).toBe("pending");
    await prepareLegacyOwner(t, identity.subject);
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId: "new-after-1000", observedClientName: "Different AI" })).state).toBe("revoked");
    const listed = await t.withIdentity({ subject: identity.subject }).action(api.mcpGrants.listConnections, { vaultOwnerId: identity.subject });
    expect(listed.connections).toHaveLength(1006);
    expect(listed.connections.every(row => row.status === "revoked")).toBe(true);
    const final = await t.run(ctx => ctx.db.query("mcpCarriedRestrictions").withIndex("by_owner", q => q.eq("vaultOwnerId", identity.subject)).unique());
    expect(final!.ready).toBe(true); expect(final!.entries[0].revoked).toBe(true);
  });
});


test("a stale Settings view cannot release a newer restriction on another predecessor", async () => {
  const { t, row, read, limit } = await setup();
  await limit("revoke");
  const successorId = await seedGrant(t, { vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: "stale-view-successor", expiresAt: null });
  const successor = (await t.run(ctx => ctx.db.get(successorId as typeof row._id)))!;
  const args = { vaultOwnerId: identity.subject, grantId: successor._id, action: "restore", revision: successor.revision ?? 0, carriedRevision: (await read()).carriedRevision, opId: "stale-carried-release" };
  await limit("limit", { removeScopes: ["family_history:research:write"] });
  await expect(t.withIdentity({ subject: identity.subject }).mutation(api.mcpGrants.controlGrant, args)).rejects.toThrow("STALE_VERSION: earlier connection limits changed");
  expect((await read("stale-view-successor")).state).toBe("revoked");
});

test.each(["pause", "revoke", "limit", "expiry"] as const)("person %s writes the durable source revision before any reconnect", async action => {
  const { t, row, read } = await setup();
  const owner = t.withIdentity({ subject: identity.subject });
  const prior = await read();
  const extra = action === "limit" ? { removeScopes: ["family_history:research:write"] } : action === "expiry" ? { expiresInDays: 7 } : {};
  await owner.mutation(api.mcpGrants.controlGrant, { vaultOwnerId: identity.subject, grantId: row._id, action, revision: prior.revision, carriedRevision: prior.carriedRevision, opId: `person-${action}`, ...extra });
  const carried = (await t.run(ctx => ctx.db.query("mcpCarriedRestrictions").withIndex("by_owner", q => q.eq("vaultOwnerId", identity.subject)).unique()))!;
  expect(carried.entries).toHaveLength(1); expect(carried.entries[0].sourceGrantId).toBe(row._id);
  expect(carried.entries[0].sourceRevision).toBe((await read()).revision);
  if (action === "limit") expect(carried.entries[0].withheld).toEqual(["family_history:research:write"]);
  if (action === "pause") expect(carried.entries[0].pausedAt).toEqual(expect.any(Number));
  if (action === "revoke") expect(carried.entries[0].revoked).toBe(true);
  if (action === "expiry") expect(carried.entries[0].endsAt).toEqual(expect.any(Number));
});
