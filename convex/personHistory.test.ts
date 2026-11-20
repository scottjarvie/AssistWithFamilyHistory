import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import type { ConvexHttpClient } from "convex/browser";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedGrant } from "../lib/mcp/testSupport";
import { importCapturePackageToConvex } from "../lib/familysearch/importer";
import { parseCapturePackage } from "../lib/familysearch/capture";
import captureFixture from "../tests/fixtures/capture/valid-source-v2.json";

const modules = import.meta.glob("./**/*.ts");
const owner = "user_history_owner";
const other = "user_other_tree";
const issuer = "https://identity.example.test";

function setup() {
  const t = convexTest(schema, modules, { transactionLimits: true });
  const site = t.withIdentity({ subject: owner, issuer });
  return { t, site };
}

const firstStart = {
  vaultOwnerId: owner,
  operationId: "synthetic-first-start",
  startingPerson: { given: "Eleanor", surname: "Example", living: false },
  relatedPerson: { given: "Jo", surname: "Example", living: false },
  relationship: "parent" as const,
};

const capturePerson = {
  vaultOwnerId: owner, fsId: "SYNTH-CAPTURE", name: { given: "Drew", surname: "Example" },
  sex: "unknown" as const, living: true,
};

beforeEach(() => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
});
afterEach(() => vi.unstubAllEnvs());

test("First Start adapts the native creation stamp once and denies other viewers in shadow", async () => {
  const { t, site } = setup();
  const start = await site.mutation(api.vaultMutations.startPrivateWorkspace, firstStart);
  expect(await site.mutation(api.vaultMutations.startPrivateWorkspace, firstStart))
    .toMatchObject({ startingPersonId: start.startingPersonId, deduplicated: true });
  const request = { vaultOwnerId: owner, personId: start.startingPersonId, before: null };
  const first = await site.action(api.personHistory.page, request);
  expect(first).toMatchObject({ rows: [{ action: "Created", actor: "Vault owner", source: "Website · First Start" }], before: null });
  await expect(t.action(api.personHistory.page, request)).rejects.toThrow(/website person session/);
  await expect(t.withIdentity({ subject: owner, issuer, scope: "openid" }).action(api.personHistory.page, request))
    .rejects.toThrow(/website person session/);
  await expect(t.withIdentity({ subject: other, issuer }).action(api.personHistory.page, request)).rejects.toThrow(/unavailable/);
  expect(await t.run(ctx => ctx.db.query("personHistory").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("trustBoundaryShadowLog").collect())).toEqual([]);
});

test("the legacy First Start identity fallback does not produce a verified byline", async () => {
  const { t, site } = setup();
  const { startingPersonId } = await t.mutation(api.vaultMutations.startPrivateWorkspace, firstStart);
  expect((await site.action(api.personHistory.page, { vaultOwnerId: owner, personId: startingPersonId, before: null })).rows[0])
    .toMatchObject({ action: "Created", actor: "Writer unrecorded", source: "Website · First Start" });
});

test("native capture retries keep import artifacts and genealogy links without duplicating Person history", async () => {
  const { t, site } = setup();
  const { capture, compatibilityMode } = parseCapturePackage(captureFixture);
  const args = { client: site as unknown as ConvexHttpClient, vaultOwnerId: owner, capture, compatibilityMode, artifactPaths: {} };
  const first = await importCapturePackageToConvex(args);
  const replay = await importCapturePackageToConvex(args);
  expect(first.personId).toBe(replay.personId);
  expect(replay.importRunId).not.toBe(first.importRunId);
  const personId = first.personId as Id<"persons">;
  const before = await site.action(api.personHistory.page, { vaultOwnerId: owner, personId, before: null });
  expect(before.rows).toMatchObject([{ action: "Created", source: "Website · Vault save" }]);
  const changed = { ...capture, person: { ...capture.person, name: "Changed Synthetic" } };
  await importCapturePackageToConvex({ ...args, capture: changed });
  const after = await site.action(api.personHistory.page, { vaultOwnerId: owner, personId, before: null });
  expect(after.rows).toMatchObject([{ action: "Edited", fields: ["name"] }, { action: "Created" }]);
  expect(JSON.stringify(after)).not.toMatch(/Changed Synthetic|https?:|importRunId|sourceId|citationId/);
  expect((await t.run(ctx => ctx.db.query("citationLinks").collect())).length).toBeGreaterThan(0);
});

test("shadow writes cannot forge an owner byline", async () => {
  const { t, site } = setup();
  const { personId } = await t.withIdentity({ subject: other, issuer }).mutation(api.vaultMutations.upsertPerson, capturePerson);
  const request = { vaultOwnerId: owner, personId, before: null };
  expect((await site.action(api.personHistory.page, request)).rows[0]).toMatchObject({ actor: "Writer unrecorded", source: "Source unrecorded" });
  expect(await t.run(ctx => ctx.db.query("personHistory").collect())).toEqual([]);
});

test("retains 64 details with stable paging, rechecks archive and owner, exports and purges only the affected records", async () => {
  const { t, site } = setup();
  const { personId } = await site.mutation(api.vaultMutations.upsertPerson, capturePerson);
  const neighbor = await t.withIdentity({ subject: other, issuer }).mutation(api.vaultMutations.upsertPerson, {
    ...capturePerson, vaultOwnerId: other,
  });
  for (let index = 0; index < 64; index++) {
    await site.mutation(api.vaultMutations.upsertPerson, { ...capturePerson, notes: `private memo ${index}` });
  }
  const page = (before: number | null) => site.action(api.personHistory.page, { vaultOwnerId: owner, personId, before });
  const newest = await page(null);
  expect(newest.rows).toHaveLength(8);
  expect(newest.rows[0].fields).toEqual(["notes"]);
  await site.mutation(api.vaultMutations.upsertPerson, { ...capturePerson, notes: "one new private memo" });
  expect((await page(newest.before)).before).toBe(newest.before! - 8);
  let cursor = (await page(null)).before;
  let rows = 8;
  while (cursor !== null) {
    const next = await page(cursor);
    rows += next.rows.length;
    cursor = next.before;
  }
  expect(rows).toBe(65); // 64 details and the native creation fallback.
  const exported: unknown[] = [];
  let exportCursor: string | null = null;
  do {
    const next = await site.action(api.yourData.exportPage, { vaultOwnerId: owner, table: "personHistory", cursor: exportCursor });
    exported.push(...next.rows);
    exportCursor = next.cursor;
  } while (exportCursor !== null);
  expect(exported).toHaveLength(64);
  expect(JSON.stringify(exported)).not.toMatch(/private memo|user_other_tree/);
  await expect(t.withIdentity({ subject: other, issuer }).action(api.yourData.exportPage, {
    vaultOwnerId: owner, table: "personHistory", cursor: null,
  })).rejects.toThrow(/Trust boundary denied/);
  await t.run(ctx => ctx.db.patch(personId, { archivedAt: Date.now() }));
  await expect(page(newest.before)).rejects.toThrow(/unavailable/);
  await t.run(ctx => ctx.db.patch(personId, { archivedAt: undefined, vaultOwnerId: other }));
  await expect(page(newest.before)).rejects.toThrow(/unavailable/);
  const moved = await t.withIdentity({ subject: other, issuer }).action(api.personHistory.page, { vaultOwnerId: other, personId, before: null });
  expect(moved).toMatchObject({ rows: [{ actor: "Writer unrecorded", source: "Source unrecorded" }], before: null });
  expect((await site.action(api.yourData.exportPage, { vaultOwnerId: owner, table: "personHistory", cursor: null })).rows).toEqual([]);
  await t.mutation(internal.persons.remove, { id: personId });
  await expect(page(null)).rejects.toThrow(/unavailable/);
  expect(await t.run(ctx => ctx.db.query("personHistory").collect()))
    .toMatchObject([{ personId: neighbor.personId, vaultOwnerId: other }]);
});

test("MCP commit checks the exact principal and grant, including replay and replacement", async () => {
  const { t, site } = setup();
  const principal = { subject: owner, issuer, clientId: "client-primary", scopes: [] };
  const grantId = await seedGrant(t, { vaultOwnerId: owner, clientId: principal.clientId, issuer, label: "untrusted https://private.invalid/name" });
  const anotherGrant = await seedGrant(t, { vaultOwnerId: owner, issuer, clientId: "client-secondary" });
  const input = { mode: "create", createKey: "synthetic-person", name: capturePerson.name, sex: "unknown", living: false };
  const request = { principal, grantId, operationId: "person-history-create", requestHash: "create", input };
  const save = internal.mcpFamilyHistory.savePerson;
  await expect(t.mutation(save, { ...request, grantId: anotherGrant })).rejects.toThrow(/GRANT_REQUIRED/);
  await expect(t.mutation(save, { ...request, principal: { ...principal, issuer: "https://wrong.invalid" } })).rejects.toThrow(/GRANT_REQUIRED/);
  const created = await t.mutation(save, request);
  const person = created.person as { id: Id<"persons">; updatedAt: number };
  expect(await t.mutation(save, request)).toEqual({ ...created, deduplicated: true });
  await t.run(async ctx => {
    const receipt = await ctx.db.query("mcpOperations").first();
    await ctx.db.patch(receipt!._id, { personSaveGrantId: undefined });
  });
  expect(await t.mutation(save, request)).toEqual({ ...created, deduplicated: true });
  const legacy = await site.action(api.personHistory.page, { vaultOwnerId: owner, personId: person.id, before: null });
  expect(legacy.rows[0].actor).toBe("Connected AI");
  await t.run(async ctx => {
    const receipt = await ctx.db.query("mcpOperations").first();
    const activity = await ctx.db.query("agentActivity").first();
    await ctx.db.delete(activity!._id);
    await ctx.db.patch(receipt!._id, { personSaveGrantId: grantId as Id<"mcpGrants"> });
  });
  const expectedUpdatedAt = person.updatedAt;
  const update = { ...request, operationId: "person-history-edit", requestHash: "edit",
    input: { mode: "update", personId: person.id, expectedUpdatedAt, notes: "private words http://private.invalid" } };
  const edited = await t.mutation(save, update);
  expect(await t.mutation(save, update)).toEqual({ ...edited, deduplicated: true });
  const read = () => site.action(api.personHistory.page, { vaultOwnerId: owner, personId: person.id, before: null });
  const page = await read();
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ action: "Edited", source: "Hosted MCP", fields: ["notes"] });
  expect(page.rows[1].action).toBe("Created");
  expect(page.rows[0].actor).toMatch(/^Connected AI · Connection [0-9A-F]{12}$/);
  expect(page.rows[0].actor).toBe(page.rows[1].actor);
  expect(JSON.stringify(page)).not.toMatch(/client-primary|private|https?:/);
  const alternateInput = { ...update.input, expectedUpdatedAt: (edited.person as typeof person).updatedAt };
  await expect(t.mutation(save, { ...update, grantId: anotherGrant, principal: { ...principal, clientId: "client-secondary" } }))
    .rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  await t.mutation(save, { ...update, operationId: "person-history-noop", input: alternateInput });
  expect((await read()).rows).toHaveLength(2);
  const replacement = await seedGrant(t, { vaultOwnerId: owner, clientId: principal.clientId, issuer });
  await t.run(async ctx => {
    const alias = await ctx.db.query("mcpClientAliases")
      .withIndex("by_owner_client_issuer", q => q.eq("vaultOwnerId", owner).eq("clientId", principal.clientId).eq("issuer", issuer)).unique();
    await ctx.db.patch(alias!._id, { grantId: replacement as Id<"mcpGrants"> });
  });
  await expect(t.mutation(save, request)).rejects.toThrow(/GRANT_REVOKED/);
  await expect(t.mutation(save, { ...request, grantId: replacement })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  expect((await read()).rows[0].actor).toBe(page.rows[0].actor);
  await t.run(ctx => ctx.db.patch(grantId as Id<"mcpGrants">, { hiddenAt: Date.now() }));
  expect((await read()).rows[0].actor).toBe("Connected AI");
});

test.each(["single", "complete", "batch"] as const)("MCP %s rechecks resolved Persons after a grant narrows", async (kind) => {
  const { t } = setup();
  const clientId = "bounded-replay-client";
  const principal = { subject: owner, issuer, clientId, scopes: [] };
  const grantId = await seedGrant(t, { vaultOwnerId: owner, issuer, clientId });
  const handlers = internal.mcpFamilyHistory;
  const save = kind === "single" ? handlers.savePerson : kind === "complete" ? handlers.saveCompleteResult : handlers.saveRecords;
  const request = (key: string, operationId: string) => {
    const person = { mode: "create", createKey: key, name: capturePerson.name, sex: "unknown", living: false };
    const summary = "Synthetic Person save";
    const input = kind === "single" ? person : kind === "complete" ? { person, summary } : { people: [person], summary };
    return { principal, grantId, operationId, requestHash: key, input };
  };
  const inScope = request("selected-person", "selected-original");
  const outOfScope = request("other-person", "other-original");
  const kept = await t.mutation(save, inScope);
  await t.mutation(save, outOfScope);
  const mappings = await t.run(ctx => ctx.db.query("mcpRecordKeys").collect());
  const selectedId = mappings.find(row => row.recordKey === "selected-person")!.recordId;
  const otherId = mappings.find(row => row.recordKey === "other-person")!.recordId;
  await t.run(ctx => ctx.db.patch(grantId as Id<"mcpGrants">, {
    boundary: { kind: "selected_people", personIds: [selectedId] },
  }));

  expect(await t.mutation(save, inScope)).toEqual({ ...kept, deduplicated: true });
  await expect(t.mutation(save, outOfScope)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);

  const reused = await t.mutation(save, request("selected-person", "selected-new-operation"));
  expect(JSON.stringify(reused)).toContain(selectedId);
  const mapped = t.mutation(save, request("other-person", "other-new-operation"));
  if (kind === "batch") {
    const refusal = await mapped;
    expect(refusal).toMatchObject({
      results: { people: [{ status: "failed", reason: expect.stringContaining("OUTSIDE_GRANT_BOUNDARY") }] },
    });
    expect(JSON.stringify(refusal)).not.toContain(otherId);
  } else {
    await expect(mapped).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  }
});

test("an atomic complete result keeps a Person edit only after the entire result commits", async () => {
  const { t, site } = setup();
  const { personId } = await site.mutation(api.vaultMutations.upsertPerson, capturePerson);
  const person = await t.run(ctx => ctx.db.get(personId));
  const clientId = "complete-result-client";
  const grantId = await seedGrant(t, { vaultOwnerId: owner, issuer, clientId });
  const complete = internal.mcpFamilyHistory.saveCompleteResult;
  const args = {
    principal: { subject: owner, issuer, clientId, scopes: [] },
    grantId,
    operationId: "synthetic-complete",
    requestHash: "synthetic-complete",
    input: { summary: "Synthetic complete result", person: {
      mode: "update", personId, expectedUpdatedAt: person!.updatedAt, researchStatus: "in_progress",
    } },
  };
  await expect(t.mutation(complete, { ...args, input: { ...args.input, summary: " " } })).rejects.toThrow(/VALIDATION_ERROR/);
  const read = () => site.action(api.personHistory.page, { vaultOwnerId: owner, personId, before: null });
  expect((await read()).rows).toMatchObject([{ action: "Created", actor: "Vault owner" }]);
  const result = await t.mutation(complete, args);
  expect(await t.mutation(complete, args)).toEqual({ ...result, deduplicated: true });
  const rows = (await read()).rows;
  expect(rows).toMatchObject([
    { action: "Edited", fields: ["researchStatus"], source: "Hosted MCP" },
    { action: "Created", actor: "Vault owner" },
  ]);
  const detail = await t.run(ctx => ctx.db.query("personHistory").withIndex("by_person_sequence", q => q.eq("personId", personId)).order("desc").first());
  expect(detail?.grantId).toBe(grantId);
  console.info("Person History synthetic sample bytes", {
    storedEdit: new TextEncoder().encode(JSON.stringify(detail)).byteLength,
    projectedEdit: new TextEncoder().encode(JSON.stringify(rows[0])).byteLength,
  });
});
