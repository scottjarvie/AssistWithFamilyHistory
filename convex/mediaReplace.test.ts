/**
 * "Replace file" on an item whose bytes live in B2: the person's new upload
 * must be what the owner's file route and the AI evidence delivery serve.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_replace_owner_AAAAAAAAAAA";

beforeEach(() => vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce"));
afterEach(() => vi.unstubAllEnvs());

function manifest(name: string, contentType = "image/jpeg") {
  return {
    bucketClass: "private" as const,
    bucketName: "synthetic-private-bucket",
    objectKey: `evidence/old/${name}`,
    versionId: `version-${name}`,
    sha256: `sha-${name}`,
    contentType,
    sizeBytes: 1234,
    metadataClean: true,
    verifiedAt: "2026-10-01T00:00:00Z",
  };
}

async function seedB2Media(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const personId = await ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Replace", surname: "Subject" },
      sex: "unknown",
      living: false,
      researchStatus: "basic",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const mediaId = await ctx.db.insert("media", {
      vaultOwnerId: OWNER,
      type: "photo",
      title: "Old scan",
      personIds: [personId],
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      mediaState: "ready",
      renditionState: "ready",
      b2Original: manifest("original"),
      b2Renditions: { tiny: manifest("tiny"), medium: manifest("medium"), large: manifest("large") },
      metadataProposal: {
        temporal: { uploadTime: "2026-10-01T00:00:00Z", cameraCaptureTime: "1990-04-02T12:00:00Z" },
        location: { latitude: 1.25, longitude: 2.5, source: "embedded_gps", status: "proposed", association: "person_media", precision: "exact_private", disclosurePrecision: "withheld" },
        extractedFromOriginalSha256: "sha-original",
        extractedAt: "2026-10-01T00:00:00Z",
        reversible: true,
        decision: "pending",
      },
      reviewStatus: "reviewed",
      aiUseAllowed: true,
      rightsStatus: "owned",
      privacyLevel: "private",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { personId, mediaId };
  });
}

describe("replacing a B2-backed file", () => {
  test("the owner's file route and AI delivery serve the replacement, and the old original is kept as history", async () => {
    const t = convexTest(schema, modules);
    const { mediaId } = await seedB2Media(t);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array([4, 2])], { type: "application/pdf" })));

    await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.attachMediaFile, {
      vaultOwnerId: OWNER,
      mediaId,
      storageId,
      title: "New scan",
      type: "document",
      mimeType: "application/pdf",
      sizeBytes: 2,
    });

    const file = await t.query(internal.vault.getOwnedMediaFile, { vaultOwnerId: OWNER, mediaId: String(mediaId) });
    expect(file).not.toBeNull();
    expect(file).not.toHaveProperty("b2");
    expect(file).toMatchObject({ mimeType: "application/pdf", title: "New scan", sizeBytes: 2 });

    const row = await t.run(async (ctx) => ctx.db.get(mediaId));
    expect(row?.b2Original).toBeUndefined();
    expect(row?.b2Renditions).toBeUndefined();
    expect(row?.mediaState).toBeUndefined();
    expect(row?.metadataProposal).toBeUndefined();
    expect(row?.reviewStatus).toBe("unreviewed");
    expect(row?.replacedB2Files).toEqual([
      expect.objectContaining({
        original: expect.objectContaining({ objectKey: "evidence/old/original", versionId: "version-original" }),
        renditions: expect.objectContaining({ medium: expect.objectContaining({ objectKey: "evidence/old/medium" }) }),
        metadataProposal: expect.objectContaining({ decision: "pending", extractedFromOriginalSha256: "sha-original" }),
      }),
    ]);

    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const beforeReview = await evidenceFor(t, mediaId, grantId);
    expect(beforeReview.stored).toEqual([]);
    expect(beforeReview.b2Stored).toEqual([]);
    expect(beforeReview.skipped).toEqual([expect.objectContaining({ reason: "NOT_REVIEWED" })]);

    // The actual owner review path unlocks only the new file, never history.
    await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.reviewMedia, {
      vaultOwnerId: OWNER, mediaId, reviewStatus: "reviewed", aiUseAllowed: true,
      privacyLevel: "private", rightsStatus: "owned",
    });
    const evidence = await t.query(internal.mcpEvidence.getEvidenceBatch, {
      principal: { issuer: "https://identity.example.test", subject: OWNER, clientId: "synthetic-mcp-client", scopes: [] },
      grantId,
      items: [{ kind: "media", id: String(mediaId) }],
    });
    expect(evidence.b2Stored).toHaveLength(0);
    expect(evidence.stored).toEqual([expect.objectContaining({ id: String(mediaId), storageId: String(storageId), mimeType: "application/pdf" })]);
  });
});

async function evidenceFor(t: ReturnType<typeof convexTest>, mediaId: Id<"media">, grantId: string) {
  return t.query(internal.mcpEvidence.getEvidenceBatch, {
    principal: { issuer: "https://identity.example.test", subject: OWNER, clientId: "synthetic-mcp-client", scopes: [] },
    grantId, items: [{ kind: "media", id: String(mediaId) }],
  });
}

async function storedBytes(t: ReturnType<typeof convexTest>, id: Id<"_storage">) {
  return t.run(async ctx => { const blob = await ctx.storage.get(id); return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null; });
}

async function uploaded(t: ReturnType<typeof convexTest>, value = 42) {
  return t.run(ctx => ctx.storage.store(new Blob([new Uint8Array([value])], { type: "application/pdf" })));
}

function replace(t: ReturnType<typeof convexTest>, mediaId: Id<"media">, storageId: Id<"_storage">, owner = OWNER, personIds?: Id<"persons">[]) {
  return t.withIdentity({ subject: owner }).mutation(api.vaultMutations.attachMediaFile, {
    vaultOwnerId: owner, mediaId, storageId, title: "Synthetic replacement", type: "document", mimeType: "application/pdf", sizeBytes: 1, personIds,
  });
}

describe("replacement boundaries and provenance", () => {
  test.each(["accepted", "declined"] as const)("retains the original's %s camera/GPS decision without applying it to the replacement", async decision => {
    const t = convexTest(schema, modules); const { mediaId } = await seedB2Media(t);
    await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.reviewMedia, {
      vaultOwnerId: OWNER, mediaId, privacyLevel: "private", reviewStatus: "reviewed", rightsStatus: "owned", aiUseAllowed: true, metadataDecision: decision,
    });
    const original = await t.run(ctx => ctx.db.get(mediaId));
    await replace(t, mediaId, await uploaded(t));
    const row = await t.run(ctx => ctx.db.get(mediaId));
    expect(row?.replacedB2Files?.[0].metadataProposal).toEqual(original?.metadataProposal);
    expect(row?.metadataProposal).toBeUndefined();
    expect(row?.reviewedAt).toBeUndefined();
    expect(row).toMatchObject({ privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false });
  });

  test.each(["application/pdf", "audio/mpeg"])("replaces an original-only %s item without inventing renditions", async contentType => {
    const t = convexTest(schema, modules); const { mediaId } = await seedB2Media(t);
    await t.run(ctx => ctx.db.patch(mediaId, { b2Original: manifest("original", contentType), b2Renditions: undefined, renditionState: undefined }));
    const storageId = await uploaded(t, 7); await replace(t, mediaId, storageId);
    const file = await t.query(internal.vault.getOwnedMediaFile, { vaultOwnerId: OWNER, mediaId: String(mediaId) });
    expect(file).not.toHaveProperty("b2"); expect(file).toMatchObject({ mimeType: "application/pdf", sizeBytes: 1 });
    const row = await t.run(ctx => ctx.db.get(mediaId));
    expect(row?.replacedB2Files?.[0].original.contentType).toBe(contentType);
    expect(row?.replacedB2Files?.[0].renditions).toBeUndefined();
  });

  test("repeated attachment preserves one history entry, deletes superseded Convex bytes, and keeps replayed bytes", async () => {
    const t = convexTest(schema, modules); const { mediaId } = await seedB2Media(t);
    const first = await uploaded(t, 11); await replace(t, mediaId, first);
    const history = (await t.run(ctx => ctx.db.get(mediaId)))?.replacedB2Files;
    const second = await uploaded(t, 22); await replace(t, mediaId, second); await replace(t, mediaId, second);
    const row = await t.run(ctx => ctx.db.get(mediaId));
    expect(row?.replacedB2Files).toEqual(history); expect(row?.storageId).toBe(second);
    expect(await storedBytes(t, first)).toBeNull();
    expect(await storedBytes(t, second)).toEqual([22]);
  });

  test.each([OWNER, "other_synthetic_owner"])("wrong caller cannot replace or delete existing bytes when supplying %s", async suppliedOwner => {
    const t = convexTest(schema, modules); const { mediaId } = await seedB2Media(t); const old = await uploaded(t, 3);
    await t.run(ctx => ctx.db.patch(mediaId, { storageId: old }));
    const before = await t.run(ctx => ctx.db.get(mediaId)); const next = await uploaded(t, 4);
    await expect(t.withIdentity({ subject: "other_synthetic_owner" }).mutation(api.vaultMutations.attachMediaFile, {
      vaultOwnerId: suppliedOwner, mediaId, storageId: next, title: "Refused", type: "document", mimeType: "application/pdf", sizeBytes: 1,
    })).rejects.toThrow(/owner_mismatch/);
    expect(await t.run(ctx => ctx.db.get(mediaId))).toEqual(before); expect(await storedBytes(t, old)).not.toBeNull();
    expect(await t.query(internal.vault.getOwnedMediaFile, { vaultOwnerId: "other_synthetic_owner", mediaId: String(mediaId) })).toBeNull();
  });

  test("a foreign person reference refuses the replacement without changing media or old bytes", async () => {
    const t = convexTest(schema, modules); const { mediaId } = await seedB2Media(t); const before = await t.run(ctx => ctx.db.get(mediaId));
    const foreign = await t.run(ctx => ctx.db.insert("persons", { vaultOwnerId: "other_synthetic_owner", name: { given: "Other", surname: "Fixture" }, sex: "unknown", living: true, researchStatus: "basic", createdAt: 1, updatedAt: 1 }));
    await expect(replace(t, mediaId, await uploaded(t), OWNER, [foreign])).rejects.toThrow(/reference_owner_mismatch/);
    expect(await t.run(ctx => ctx.db.get(mediaId))).toEqual(before);
  });

  test("concurrent replacements keep one original history and serve the surviving current file", async () => {
    const t = convexTest(schema, modules); const { mediaId } = await seedB2Media(t);
    const left = await uploaded(t, 8); const right = await uploaded(t, 9);
    await Promise.all([replace(t, mediaId, left), replace(t, mediaId, right)]);
    const row = await t.run(ctx => ctx.db.get(mediaId)); expect(row?.replacedB2Files).toHaveLength(1); expect([left, right]).toContain(row?.storageId);
    expect(await storedBytes(t, row!.storageId!)).not.toBeNull();
    expect(await storedBytes(t, row?.storageId === left ? right : left)).toBeNull();
  });
});

test("reviewing replacement bytes does not export the old original's private history in JSON context", async () => {
  const t = convexTest(schema, modules); const { personId, mediaId } = await seedB2Media(t);
  await replace(t, mediaId, await uploaded(t));
  await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.reviewMedia, { vaultOwnerId: OWNER, mediaId, reviewStatus: "reviewed", aiUseAllowed: true, privacyLevel: "family_review", rightsStatus: "owned" });
  const pack = await t.withIdentity({ subject: OWNER }).action(api.vaultReads.getContextPack, { vaultOwnerId: OWNER, personIdentifier: String(personId) });
  expect(pack.structured.memories).toEqual([expect.objectContaining({ _id: mediaId, title: "Synthetic replacement", aiUseAllowed: true })]);
  const text = JSON.stringify(pack); expect(text).not.toContain("replacedB2Files"); expect(text).not.toContain("evidence/old/"); expect(text).not.toContain("exact_private");
  expect((await t.run(ctx => ctx.db.get(mediaId)))?.replacedB2Files?.[0].metadataProposal?.location?.latitude).toBe(1.25);
});
