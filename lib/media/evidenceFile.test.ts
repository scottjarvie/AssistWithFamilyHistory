import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./evidenceB2";
import { finalizeEvidenceFile, type EvidenceVerificationStore } from "./evidenceFinalize";
import { assertEvidenceUploadShape, sniffEvidenceFile } from "./evidenceStandard";

const text = (value: string) => new TextEncoder().encode(value);
const pdf = text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n");
const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
const heic = new Uint8Array([0, 0, 0, 24, ...text("ftypheic"), 0, 0, 0, 0, ...text("mif1heic")]);
const wav = new Uint8Array([...text("RIFF"), 36, 0, 0, 0, ...text("WAVEfmt ")]);
const mp3 = new Uint8Array([...text("ID3"), 4, 0, 0, 0, 0, 0, 0]);

function storeFor(bytes: Uint8Array, contentType: string) {
  const store: EvidenceVerificationStore = {
    config: { bucket: "family-private", bucketClass: "private", environment: "development" },
    async head() { return { versionId: "original-v1", sizeBytes: bytes.byteLength, contentType }; },
    async read() { return bytes; },
    put: vi.fn(async () => { throw new Error("files get no display copies"); }),
    deleteVersion: vi.fn(async () => undefined),
  };
  return store;
}

describe("non-image evidence originals", () => {
  it("recognizes each admitted file type from its bytes", () => {
    expect(sniffEvidenceFile(pdf)).toBe("application/pdf");
    expect(sniffEvidenceFile(tiff)).toBe("image/tiff");
    expect(sniffEvidenceFile(heic)).toBe("image/heic");
    expect(sniffEvidenceFile(wav)).toBe("audio/wav");
    expect(sniffEvidenceFile(mp3)).toBe("audio/mpeg");
    expect(sniffEvidenceFile(text("Born 3rd March 1871 at Millbrook.\nBaptised 12th."))).toBe("text/plain");
    expect(sniffEvidenceFile(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it("admits files up to 20 MiB and refuses larger or unlisted ones", () => {
    expect(() => assertEvidenceUploadShape("application/pdf", 20 * 1024 * 1024)).not.toThrow();
    expect(() => assertEvidenceUploadShape("application/pdf", 20 * 1024 * 1024 + 1)).toThrow();
    expect(() => assertEvidenceUploadShape("application/zip", 10)).toThrow();
  });

  it("keeps a PDF byte-exact with no display copies", async () => {
    const store = storeFor(pdf, "application/pdf");
    const result = await finalizeEvidenceFile({
      store,
      objectKey: "private/v1/development/family-evidence/ref/original",
      declaredContentType: "application/pdf",
      declaredSizeBytes: pdf.byteLength,
      expectedSha256: sha256Hex(pdf),
      scanTime: "2026-10-01T00:00:00.000Z",
      now: "2026-10-13T00:00:00.000Z",
    });
    expect(result.original).toMatchObject({ contentType: "application/pdf", sizeBytes: pdf.byteLength, sha256: sha256Hex(pdf), versionId: "original-v1" });
    expect(result.metadataProposal.temporal).toEqual({ uploadTime: "2026-10-13T00:00:00.000Z", scanTime: "2026-10-01T00:00:00.000Z" });
    expect(store.put).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not what was declared, or that changed", async () => {
    await expect(finalizeEvidenceFile({
      store: storeFor(mp3, "application/pdf"),
      objectKey: "k",
      declaredContentType: "application/pdf",
      declaredSizeBytes: mp3.byteLength,
      expectedSha256: sha256Hex(mp3),
    })).rejects.toThrow(/declared file type/);
    await expect(finalizeEvidenceFile({
      store: storeFor(pdf, "application/pdf"),
      objectKey: "k",
      declaredContentType: "application/pdf",
      declaredSizeBytes: pdf.byteLength,
      expectedSha256: "0".repeat(64),
    })).rejects.toThrow(/SHA-256/);
  });
});
