/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { effectiveScopes } from "../lib/mcp/grantDefaults";
import { getVaultSnapshot } from "./vault";
const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "user_connection_controls", issuer: "https://identity.example.test", clientId: "first-registration" };
async function fixture() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, observedClientName: "Synthetic Research AI" });
  const row = (await t.run(ctx => ctx.db.query("mcpGrants").collect()))[0];
  const describe = () => t.query(internal.mcpGrants.describeCallingConnection, identity);
  const limit = (args: { revision: number; opId: string; action: "limit" | "pause" | "revoke"; removeScopes?: string[]; endsAt?: number; reason?: string }) => t.mutation(internal.mcpGrants.limitCallingConnection, { ...identity, ...args });
  const person = (args: { revision: number; opId: string; action: string; expiresInDays?: number }) => t.withIdentity({ subject: identity.subject, azp: "https://website.example.test" }).mutation(api.mcpGrants.controlGrant, { vaultOwnerId: identity.subject, grantId: row._id, ...args });
  return { t, row, describe, limit, person };
}

describe("AWL-0015 revisioned connection authority", () => {
  test("starts full, follows future powers minus removed ones, and never resets on sign-in", async () => {
    const { t, describe, limit } = await fixture();
    expect(await describe()).toMatchObject({ state: "active", powers: [...FAMILY_HISTORY_SCOPES], endsAt: null, revision: 0 });
    await limit({ action: "limit", revision: 0, opId: "only-remove-story", removeScopes: ["family_history:story:draft"] });
    const before = await describe();
    expect(before.heldBack).toContainEqual(expect.objectContaining({ tool: "family_history_save_story_work", missingPower: "family_history:story:draft" }));
    const catalog = FAMILY_HISTORY_SCOPES as unknown as string[];
    catalog.push("family_history:future:synthetic");
    try { expect(effectiveScopes({ scopes: [], withheldScopes: before.withheldScopes })).toContain("family_history:future:synthetic"); }
    finally { catalog.pop(); }
    await t.mutation(internal.mcpGrants.resolveForRequest, identity);
    expect(await describe()).toEqual(before);
  });
  test("rejects stale writes and idempotency conflicts; identical replay appends no receipt", async () => {
    const { t, limit } = await fixture();
    const pause = { action: "pause" as const, revision: 0, opId: "pause-once" };
    await limit(pause);
    await expect(limit(pause)).resolves.toMatchObject({ deduplicated: true });
    await expect(limit({ ...pause, opId: "stale-new-op" })).rejects.toThrow("STALE_VERSION");
    await expect(limit({ ...pause, action: "revoke" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    const history = await t.run(ctx => ctx.db.query("mcpGrantHistory").collect());
    expect(history.map(h => h.actor)).toEqual(["system", "ai"]);
    expect(JSON.parse(history[1].before)).toMatchObject({ revision: 0, pausedAt: null });
    expect(JSON.parse(history[1].after)).toMatchObject({ revision: 1, pausedAt: expect.any(Number) });
  });
  test("paused and revoked controls stay readable; only person can resume and restore exact pre-revoke limits", async () => {
    const { t, describe, limit, person } = await fixture();
    const endsAt = Date.now() + 86_400_000;
    await limit({ action: "limit", revision: 0, opId: "narrow", removeScopes: ["family_history:research:write"], endsAt });
    await expect(limit({ action: "limit", revision: 1, opId: "extend", endsAt: endsAt + 1 })).rejects.toThrow("shortened");
    await limit({ action: "pause", revision: 1, opId: "pause" });
    expect(await describe()).toMatchObject({ state: "paused", tools: ["family_history_connection", "family_history_limit_connection"] });
    await limit({ action: "revoke", revision: 2, opId: "revoke", reason: "Bearer abcdefghijklmnop and sk_test_abcdefghijk" });
    await t.mutation(internal.mcpGrants.resolveForRequest, identity);
    expect((await describe()).state).toBe("revoked");
    // The AI control's validated contract has no restore/resume/held-list path.
    await expect(t.mutation(internal.mcpGrants.limitCallingConnection, { ...identity, action: "restore", revision: 3, opId: "self-restore" } as never)).rejects.toThrow();
    await person({ action: "restore", revision: 3, opId: "person-restore" });
    expect(await describe()).toMatchObject({ state: "paused", endsAt, withheldScopes: ["family_history:research:write"] });
    await person({ action: "resume", revision: 4, opId: "person-resume" });
    expect(await describe()).toMatchObject({ state: "active", endsAt, withheldScopes: ["family_history:research:write"] });
    const history = await t.run(ctx => ctx.db.query("mcpGrantHistory").collect());
    expect(JSON.stringify(history)).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(history)).not.toContain("sk_test_abcdefghijk");
    expect(history.map(h => h.actor)).toEqual(["system", "ai", "ai", "ai", "person", "person"]);
  });
  test("re-registration aliases inherit a revoke and later changes affect both registrations", async () => {
    const { t, limit, person, describe } = await fixture();
    await limit({ action: "revoke", revision: 0, opId: "off" });
    const newer = { ...identity, clientId: "new-registration" };
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, { ...newer, observedClientName: "  SYNTHETIC Research AI  " })).state).toBe("revoked");
    expect(await t.query(internal.mcpGrants.describeCallingConnection, newer)).toEqual(await describe());
    expect(await t.run(ctx => ctx.db.query("mcpGrants").collect())).toHaveLength(1);
    await person({ action: "restore", revision: 2, opId: "website-restore" });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, newer)).state).toBe("active");
    await t.mutation(internal.mcpGrants.limitCallingConnection, { ...newer, action: "pause", revision: 3, opId: "off-new-id" });
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, identity)).state).toBe("paused");
    // A matching name in another owner's vault has no effect.
    expect((await t.mutation(internal.mcpGrants.resolveForRequest, { ...newer, subject: "user_another_owner", observedClientName: "Synthetic Research AI" })).state).toBe("active");
  });
  test("website authority rejects a delegated token, foreign owner and missing revisions", async () => {
    const { t, row } = await fixture();
    const args = { vaultOwnerId: identity.subject, grantId: row._id, action: "restore", revision: 0, opId: "restore" };
    await expect(t.withIdentity({ subject: identity.subject, client_id: "delegated-client" }).mutation(api.mcpGrants.controlGrant, args)).rejects.toThrow("website session");
    await expect(t.withIdentity({ subject: "user_someone_else" }).mutation(api.mcpGrants.controlGrant, args)).rejects.toThrow();
    await expect(t.withIdentity({ subject: identity.subject }).mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: identity.subject, grantId: row._id })).rejects.toThrow("opId");
    await expect(t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId: "" })).rejects.toThrow("client id");
  });
  test("an expired connection stays inspectable and only the person can clear its end date", async () => {
    const { t, row, describe, person } = await fixture();
    await t.run(ctx => ctx.db.patch(row._id, { expiresAt: Date.now() - 1, expiryChoice: "chosen" }));
    expect(await describe()).toMatchObject({ state: "expired", tools: ["family_history_connection", "family_history_limit_connection"] });
    await person({ action: "expiry", revision: 0, opId: "clear-date" });
    expect(await describe()).toMatchObject({ state: "active", endsAt: null });
  });
  test("AI archives and restores without purging; website Archive recovers the same record", async () => {
    const { t, row } = await fixture();
    const personId = await t.run(ctx => ctx.db.insert("persons", { vaultOwnerId: identity.subject, name: { given: "Synthetic", surname: "Ancestor" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 }));
    const principal = { ...identity, scopes: [] };
    const archive = await t.mutation(internal.mcpFamilyHistory.archiveRecord, { principal, grantId: row._id, operationId: "archive-one", requestHash: "synthetic-hash", input: { kind: "person", id: personId, action: "archive", expectedUpdatedAt: 1 } });
    expect(archive).toMatchObject({ archived: true });
    expect((await t.run(ctx => ctx.db.get(personId)))!.archivedBy).toBe(identity.clientId);
    expect((await t.run(ctx => getVaultSnapshot(ctx, identity.subject))).people).toHaveLength(0);
    const archived = await t.withIdentity({ subject: identity.subject }).action(api.yourData.getArchive, { vaultOwnerId: identity.subject });
    expect(archived).toContainEqual(expect.objectContaining({ id: personId, archivedBy: identity.clientId }));
    await t.withIdentity({ subject: identity.subject }).mutation(api.mcpFamilyHistory.restoreArchivedRecord, { vaultOwnerId: identity.subject, table: "persons", id: personId, expectedUpdatedAt: archived[0].updatedAt });
    expect((await t.run(ctx => getVaultSnapshot(ctx, identity.subject))).people).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("persons").collect())).toHaveLength(1);
  });
});


test("untouched earlier automatic defaults lift lazily; deliberate choices never lift", async () => {
  const t = convexTest(schema, modules);
  const issuedAt = Date.now() - 100 * 86_400_000;
  const expiresAt = issuedAt + 90 * 86_400_000;
  const scopes = ["family_history:context:read"];
  const row = { vaultOwnerId: identity.subject, issuer: identity.issuer, clientId: identity.clientId, label: "Synthetic legacy", clientProvenance: "manual" as const,
    scopes, boundary: { kind: "whole_workspace" as const }, status: "expired" as const,
    requestedAt: issuedAt, issuedAt, consentedAt: issuedAt, expiresAt, updatedAt: issuedAt, useCount: 0,
    consentSnapshot: JSON.stringify({ approvedBy: "sign_in", shownAt: issuedAt, scopes: scopes.map(scope => ({ scope })), boundary: { kind: "whole_workspace", personCount: null, queueItemCount: null }, expiresAt }) };
  const id = await t.run(ctx => ctx.db.insert("mcpGrants", row));
  expect((await t.mutation(internal.mcpGrants.resolveForRequest, identity)).state).toBe("active");
  expect(await t.query(internal.mcpGrants.describeCallingConnection, identity)).toMatchObject({ powers: [...FAMILY_HISTORY_SCOPES], endsAt: null, revision: 1 });
  expect(await t.run(ctx => ctx.db.query("mcpGrantHistory").collect())).toHaveLength(1);
  await t.run(ctx => ctx.db.patch(id, { ...row, expiryChoice: "chosen", scopeChoice: "chosen", withheldScopes: undefined, revision: 2 }));
  expect((await t.mutation(internal.mcpGrants.resolveForRequest, identity)).state).toBe("expired");
  expect((await t.query(internal.mcpGrants.describeCallingConnection, identity)).revision).toBe(2);
});

test("all powers may be removed, and only a current website revision restores them", async () => {
  const { t, describe, limit, person } = await fixture();
  await limit({ action: "limit", revision: 0, opId: "remove-every-power", removeScopes: [...FAMILY_HISTORY_SCOPES] });
  expect(await describe()).toMatchObject({ state: "active", powers: [], tools: ["family_history_connection", "family_history_limit_connection"] });
  await expect(person({ action: "restore", revision: 0, opId: "stale-browser" })).rejects.toThrow("STALE_VERSION");
  await person({ action: "restore", revision: 1, opId: "person-gives-back-powers" });
  expect(await describe()).toMatchObject({ state: "active", powers: [...FAMILY_HISTORY_SCOPES], revision: 2 });
  const history = await t.run(ctx => ctx.db.query("mcpGrantHistory").collect());
  expect(history.map(row => row.actor)).toEqual(["system", "ai", "person"]);
});
