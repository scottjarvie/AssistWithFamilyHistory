import { describe, expect, it } from "vitest";
import { isEvidenceB2AccessDenied } from "../lib/media/evidenceB2";

describe("isEvidenceB2AccessDenied", () => {
  it("accepts provider access-denied names and HTTP statuses", () => {
    expect(isEvidenceB2AccessDenied({ name: "AccessDenied" })).toBe(true);
    expect(isEvidenceB2AccessDenied({ Code: "Unauthorized" })).toBe(true);
    expect(isEvidenceB2AccessDenied({ $metadata: { httpStatusCode: 403 } })).toBe(true);
    expect(isEvidenceB2AccessDenied({ $metadata: { httpStatusCode: 401 } })).toBe(true);
  });

  it("does not mistake provider failures for an authorization denial", () => {
    expect(isEvidenceB2AccessDenied({ name: "TimeoutError" })).toBe(false);
    expect(isEvidenceB2AccessDenied({ $metadata: { httpStatusCode: 500 } })).toBe(false);
    expect(isEvidenceB2AccessDenied(null)).toBe(false);
  });
});
