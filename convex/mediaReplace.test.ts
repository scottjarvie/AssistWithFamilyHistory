/**
 * "Replace file" on an item whose bytes live in B2: the person's new upload
 * must be what the owner's file route and the AI evidence delivery serve.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_replace_owner_AAAAAAAAAAA";

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
        temporal: { uploadTime: "2026-10-01T00:00:00Z" },
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
      }),
    ]);

    // Once the person reviews the new file, the AI receives it, not the old B2 copy.
    await t.run(async (ctx) => ctx.db.patch(mediaId, { reviewStatus: "reviewed", aiUseAllowed: true, rightsStatus: "owned" }));
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const evidence = await t.query(internal.mcpEvidence.getEvidenceBatch, {
      principal: { issuer: "https://identity.example.test", subject: OWNER, clientId: "synthetic-mcp-client", scopes: [] },
      grantId,
      items: [{ kind: "media", id: String(mediaId) }],
    });
    expect(evidence.b2Stored).toHaveLength(0);
    expect(evidence.stored).toEqual([expect.objectContaining({ id: String(mediaId), storageId: String(storageId), mimeType: "application/pdf" })]);
  });
});
