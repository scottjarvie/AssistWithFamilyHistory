import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./evidenceB2";
import { finalizeEvidenceImage, type EvidenceVerificationStore } from "./evidenceFinalize";
import { hasEmbeddedImageMetadata } from "./evidenceStandard";

async function fixture() {
  return new Uint8Array(await sharp({
    create: { width: 16, height: 12, channels: 3, background: "#7c3aed" },
  }).jpeg().toBuffer());
}

function storeFor(bytes: Uint8Array, failSlot?: string) {
  const written = new Map<string, Uint8Array>();
  const deleteVersion = vi.fn(async () => undefined);
  const store: EvidenceVerificationStore = {
    config: { bucket: "family-private", bucketClass: "private", environment: "development" },
    async head() {
      return { versionId: "original-v1", sizeBytes: bytes.byteLength, contentType: "image/jpeg" };
    },
    async read() { return bytes; },
    async put(input) {
      const slot = input.objectKey.split("/").at(-1)!;
      if (slot === failSlot) throw new Error("provider write failed");
      written.set(input.objectKey, input.bytes);
      return { versionId: `${slot}-v1`, sha256: sha256Hex(input.bytes) };
    },
    deleteVersion,
  };
  return { store, written, deleteVersion };
}

describe("family evidence finalization", () => {
  it("keeps the exact original and creates three clean, attributed renditions", async () => {
    const originalBytes = await fixture();
    const { store, written } = storeFor(originalBytes);
    const result = await finalizeEvidenceImage({
      store,
      uploadRef: "family_evidence_test",
      objectKey: "private/v1/development/family-evidence/family_evidence_test/original",
      declaredContentType: "image/jpeg",
      declaredSizeBytes: originalBytes.byteLength,
      expectedSha256: sha256Hex(originalBytes),
      fileModifiedTime: "2026-09-01T01:02:03.000Z",
      now: "2026-09-02T00:00:00.000Z",
    });

    expect(result.original.sha256).toBe(sha256Hex(originalBytes));
    expect(result.original.metadataClean).toBe(false);
    expect(Object.keys(result.renditions)).toEqual(["tiny", "medium", "large"]);
    for (const rendition of Object.values(result.renditions)) {
      expect(rendition.metadataClean).toBe(true);
      expect(rendition.sourceSha256).toBe(result.original.sha256);
      expect(hasEmbeddedImageMetadata(written.get(rendition.objectKey)!, rendition.contentType)).toBe(false);
    }
    expect(result.metadataProposal.temporal.fileModifiedTime).toBe("2026-09-01T01:02:03.000Z");
    expect(result.metadataProposal.temporal.uploadTime).toBe("2026-09-02T00:00:00.000Z");
    expect(result.metadataProposal.decision).toBe("pending");
  });

  it("rejects changed bytes before writing any rendition", async () => {
    const originalBytes = await fixture();
    const { store, written } = storeFor(originalBytes);
    await expect(finalizeEvidenceImage({
      store,
      uploadRef: "family_evidence_changed",
      objectKey: "private/v1/development/family-evidence/family_evidence_changed/original",
      declaredContentType: "image/jpeg",
      declaredSizeBytes: originalBytes.byteLength,
      expectedSha256: "0".repeat(64),
    })).rejects.toThrow(/SHA-256/i);
    expect(written.size).toBe(0);
  });

  it("deletes every successful version from a partially failed parallel write", async () => {
    const originalBytes = await fixture();
    const { store, deleteVersion } = storeFor(originalBytes, "medium");
    await expect(finalizeEvidenceImage({
      store,
      uploadRef: "family_evidence_partial",
      objectKey: "private/v1/development/family-evidence/family_evidence_partial/original",
      declaredContentType: "image/jpeg",
      declaredSizeBytes: originalBytes.byteLength,
      expectedSha256: sha256Hex(originalBytes),
    })).rejects.toThrow(/provider write failed/i);
    expect(deleteVersion).toHaveBeenCalledTimes(2);
  });
});
