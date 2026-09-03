import { describe, expect, it } from "vitest";
import {
  assertEvidenceUploadShape,
  assertSha256,
  privateEvidenceObjectKey,
  remainingEvidenceUploadTtl,
  sniffEvidenceImage,
} from "./evidenceStandard";

describe("family evidence storage contract", () => {
  it("uses opaque environment-scoped keys without family labels", () => {
    expect(privateEvidenceObjectKey("preview", "family_evidence_a-b_123", "original"))
      .toBe("private/v1/preview/family-evidence/family_evidence_a-b_123/original");
  });

  it("accepts only admitted image types and bounded exact lengths", () => {
    expect(() => assertEvidenceUploadShape("image/jpeg", 1)).not.toThrow();
    expect(() => assertEvidenceUploadShape("application/pdf", 1)).toThrow(/currently accepts/i);
    expect(() => assertEvidenceUploadShape("image/png", 0)).toThrow(/allowed range/i);
  });

  it("normalizes SHA-256 and fails closed on malformed values", () => {
    expect(assertSha256("A".repeat(64))).toBe("a".repeat(64));
    expect(() => assertSha256("abcd")).toThrow(/64 hexadecimal/i);
  });

  it("does not extend an expired upload capability", () => {
    expect(() => remainingEvidenceUploadTtl(1_000, 1_001)).toThrow(/expired/i);
    expect(remainingEvidenceUploadTtl(31 * 60_000, 0)).toBe(30 * 60);
  });

  it("sniffs PNG from bytes instead of trusting a label", () => {
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 2, 0, 0, 0, 3,
    ]);
    expect(sniffEvidenceImage(pngHeader)).toEqual({ contentType: "image/png", width: 2, height: 3 });
    expect(sniffEvidenceImage(new TextEncoder().encode("not an image"))).toBeNull();
  });
});
