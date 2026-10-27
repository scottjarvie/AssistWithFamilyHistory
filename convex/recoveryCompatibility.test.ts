import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "synthetic_recovery_owner";
beforeEach(() => vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce"));
afterEach(() => vi.unstubAllEnvs());
const history = [{ replacedAt: 1, original: {
  bucketClass: "private" as const, bucketName: "synthetic-private", objectKey: "synthetic-private-original", versionId: "synthetic-v1",
  sha256: "a".repeat(64), contentType: "image/jpeg", sizeBytes: 1, metadataClean: false, verifiedAt: "2026-10-01T00:00:00Z",
}, metadataProposal: {
  temporal: { uploadTime: "2026-10-01T00:00:00Z" },
  location: { latitude: 1.25, longitude: 2.5, source: "embedded_gps" as const, status: "proposed" as const,
    association: "person_media" as const, precision: "exact_private" as const, disclosurePrecision: "withheld" as const },
  extractedFromOriginalSha256: "a".repeat(64), extractedAt: "2026-10-01T00:00:00Z", reversible: true as const,
  decision: "declined" as const, declinedAt: "2026-10-02T00:00:00Z",
} }];

test.each(["empty", "legacy_owned", "history_owned", "foreign_history"] as const)(
  "old/new frontend eligibility APIs agree for %s records", async state => {
    const t = convexTest(schema, modules);
    if (state !== "empty") await t.run(ctx => ctx.db.insert("media", {
      vaultOwnerId: state === "foreign_history" ? "other_synthetic_owner" : OWNER,
      type: "document", title: "Synthetic current file", personIds: [], reviewStatus: "reviewed", privacyLevel: "family_review",
      rightsStatus: "owned", aiUseAllowed: true, createdAt: 1, updatedAt: 1,
      ...(state === "legacy_owned" ? {} : { replacedB2Files: history }),
    }));
    const owner = t.withIdentity({ subject: OWNER });
    const oldFrontend = await owner.action(api.vaultReads.getDashboardSummary, { vaultOwnerId: OWNER });
    const newFrontend = await owner.action(api.vaultReads.getFirstStartEligibility, { vaultOwnerId: OWNER });
    const expected = state === "empty" || state === "foreign_history";
    expect(oldFrontend.firstStartEligible).toBe(expected);
    expect(newFrontend).toEqual({ firstStartEligible: expected });
    expect(JSON.stringify(newFrontend)).not.toContain("synthetic-private");
  },
);

test.each([false, true])("replacement remains correct after recovery with pre-existing history=%s", async hasHistory => {
  const t = convexTest(schema, modules);
  const { personId, mediaId, oldStorageId, newStorageId } = await t.run(async ctx => {
    const personId = await ctx.db.insert("persons", { vaultOwnerId: OWNER, name: { given: "Synthetic", surname: "Recovery" },
      sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 });
    const oldStorageId = await ctx.storage.store(new Blob([new Uint8Array([1])], { type: "application/pdf" }));
    const newStorageId = await ctx.storage.store(new Blob([new Uint8Array([9, 8])], { type: "application/pdf" }));
    const mediaId = await ctx.db.insert("media", { vaultOwnerId: OWNER, type: "document", title: "Synthetic prior current file",
      personIds: [personId], storageId: oldStorageId, mimeType: "application/pdf", sizeBytes: 1, reviewStatus: "reviewed",
      privacyLevel: "family_review", rightsStatus: "owned", aiUseAllowed: true, createdAt: 1, updatedAt: 1,
      ...(hasHistory ? { replacedB2Files: history } : {}),
    });
    return { personId, mediaId, oldStorageId, newStorageId };
  });
  const owner = t.withIdentity({ subject: OWNER });
  await owner.mutation(api.vaultMutations.attachMediaFile, { vaultOwnerId: OWNER, mediaId, storageId: newStorageId,
    title: "Synthetic recovered replacement", type: "document", mimeType: "application/pdf", sizeBytes: 2 });
  const row = await t.run(ctx => ctx.db.get(mediaId));
  expect(row?.storageId).toBe(newStorageId);
  expect(row?.replacedB2Files).toEqual(hasHistory ? history : undefined);
  expect(row).toMatchObject({ reviewStatus: "unreviewed", aiUseAllowed: false });
  expect(await t.run(ctx => ctx.storage.get(oldStorageId))).toBeNull();
  const newBytes = await t.run(async ctx => Array.from(new Uint8Array(await (await ctx.storage.get(newStorageId))!.arrayBuffer())));
  expect(newBytes).toEqual([9, 8]);
  const file = await owner.action(api.vaultReads.getOwnedMediaFile, { vaultOwnerId: OWNER, mediaId: String(mediaId) });
  expect(file).not.toHaveProperty("b2");
  expect(file).toMatchObject({ mimeType: "application/pdf", sizeBytes: 2, title: "Synthetic recovered replacement" });
  await owner.mutation(api.vaultMutations.reviewMedia, { vaultOwnerId: OWNER, mediaId, reviewStatus: "reviewed", aiUseAllowed: true,
    privacyLevel: "family_review", rightsStatus: "owned" });
  const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
  const evidence = await t.query(internal.mcpEvidence.getEvidenceBatch, {
    principal: { issuer: "https://identity.example.test", subject: OWNER, clientId: "synthetic-recovery-client", scopes: [] },
    grantId, items: [{ kind: "media", id: String(mediaId) }],
  });
  expect(evidence.b2Stored).toEqual([]);
  expect(evidence.stored).toEqual([expect.objectContaining({ storageId: String(newStorageId) })]);
  const pack = await owner.action(api.vaultReads.getContextPack, { vaultOwnerId: OWNER, personIdentifier: String(personId) });
  const exported = JSON.stringify(pack);
  expect(exported).not.toContain("replacedB2Files");
  expect(exported).not.toContain("synthetic-private-original");
  expect(exported).not.toContain("exact_private");
  expect((await t.run(ctx => ctx.db.get(mediaId)))?.replacedB2Files).toEqual(hasHistory ? history : undefined);
});
