import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { EvidenceB2Config } from "../lib/media/evidenceB2";

// Test double only: no credentials/environment are configured and no S3 client exists.
const providerCalls = vi.hoisted(() => [] as string[]);
vi.mock("../lib/media/evidenceB2", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/media/evidenceB2")>(),
  loadEvidenceB2Config: (bucketClass: "private" | "public"): EvidenceB2Config => ({
    endpoint: "https://synthetic-storage.invalid", region: "synthetic-region", bucket: `synthetic-${bucketClass}`,
    keyId: "synthetic-fixture-id", applicationKey: "synthetic-fixture-value", environment: "development", bucketClass,
  }),
  EvidenceB2Store: class {
    constructor(readonly config: EvidenceB2Config) {}
    async deleteVersionsExcept(key: string, version: string) { providerCalls.push(`keep:${key}:${version}`); }
    async deleteAllVersions(key: string) { providerCalls.push(`delete:${key}`); }
    async abortMultipart(key: string) { providerCalls.push(`abort:${key}`); }
  },
}));

const modules = import.meta.glob("./**/*.ts");
const OWNER = "synthetic_cleanup_owner";
beforeEach(() => { providerCalls.length = 0; vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce"); });
afterEach(() => vi.unstubAllEnvs());

test("existing ready-upload cleanup pins active exact versions but leaves replacement history untouched", async () => {
  const t = convexTest(schema, modules);
  const manifest = (slot: string) => ({ bucketClass: "private" as const, bucketName: "synthetic-private", objectKey: `synthetic/${slot}`, versionId: `${slot}-v1`, sha256: "a".repeat(64), contentType: "image/jpeg", sizeBytes: 1, metadataClean: true, verifiedAt: "2026-10-01T00:00:00Z" });
  const mediaId = await t.run(async ctx => {
    const id = await ctx.db.insert("media", { vaultOwnerId: OWNER, type: "photo", title: "Synthetic original", personIds: [], mediaState: "ready", renditionState: "ready", b2Original: manifest("original"), b2Renditions: { tiny: manifest("tiny"), medium: manifest("medium"), large: manifest("large") }, privacyLevel: "private", reviewStatus: "unreviewed", rightsStatus: "unknown", aiUseAllowed: false, uploadSessionRef: "synthetic_cleanup_ref", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("mediaUploadSessions", { vaultOwnerId: OWNER, ref: "synthetic_cleanup_ref", sourceKind: "chosen_ai", state: "ready", operationId: "synthetic-op", requestHash: "synthetic-request", title: "Synthetic original", fileName: "fixture.jpg", personIds: [], declaredContentType: "image/jpeg", declaredSizeBytes: 1, expectedSha256: "a".repeat(64), objectKey: "synthetic/original", relayTokenHash: "synthetic-fixture-hash", createdAt: 1, expiresAt: 2, finalizedAt: 1, mediaId: id });
    return id;
  });

  await t.action(internal.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: "synthetic_cleanup_ref" });
  expect(providerCalls.sort()).toEqual(["large", "medium", "original", "tiny"].map(slot => `keep:synthetic/${slot}:${slot}-v1`));
  providerCalls.length = 0;
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array([7])], { type: "application/pdf" })));
  await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.attachMediaFile, { vaultOwnerId: OWNER, mediaId, storageId, title: "Synthetic replacement", type: "document", mimeType: "application/pdf", sizeBytes: 1 });
  const state = await t.query(internal.mediaEvidenceControl.sessionForCleanup, { uploadRef: "synthetic_cleanup_ref" });
  expect(state).toMatchObject({ session: { state: "ready" }, manifests: null });
  await t.action(internal.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: "synthetic_cleanup_ref" });
  expect(providerCalls).toEqual([]);
  expect((await t.run(ctx => ctx.db.get(mediaId)))?.replacedB2Files).toEqual([expect.objectContaining({ original: manifest("original") })]);
});
