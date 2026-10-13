/**
 * Originals over 20 MiB (a scanned book, a long recording) go up in parts.
 * These tests hold the control-plane rules: parts are recorded only under the
 * session's own capability and only at their fixed sizes, and finish refuses
 * until every part has arrived.
 */
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { seedGrant } from "../lib/mcp/testSupport";
import { EVIDENCE_PART_BYTES, evidenceUploadParts } from "../lib/media/evidenceStandard";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_media_multipart_AAAAAAAA";
const MIB = 1024 * 1024;
const SIZE = 40 * MIB;

const plan = makeFunctionReference<"mutation">("mediaEvidenceControl:planMcpEvidenceUpload");
const attach = makeFunctionReference<"mutation">("mediaEvidenceControl:attachMultipartUpload");
const recordPart = makeFunctionReference<"mutation">("mediaEvidenceControl:recordMcpEvidencePart");
const claim = makeFunctionReference<"mutation">("mediaEvidenceControl:claimSessionForFinish");

const principal = {
  issuer: "https://identity.example.test",
  subject: OWNER,
  clientId: "synthetic-media-client",
  scopes: [],
};

async function plannedBook() {
  const t = convexTest(schema, modules);
  const personId = await t.run((ctx) => ctx.db.insert("persons", {
    vaultOwnerId: OWNER,
    name: { given: "Synthetic", surname: "Author" },
    sex: "unknown",
    living: false,
    researchStatus: "basic",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  const grantId = await seedGrant(t, {
    vaultOwnerId: OWNER,
    clientId: "synthetic-media-client",
    scopes: ["family_history:evidence:write"],
  });
  await t.mutation(plan, {
    principal,
    grantId,
    operationId: "operation-book-001",
    requestHash: "request-hash-book",
    uploadRef: "family_evidence_book",
    relayTokenHash: "token-hash-book",
    objectKey: "private/v1/development/family-evidence/family_evidence_book/original",
    expiresAt: Date.now() + 60 * 60_000,
    input: {
      personId: String(personId),
      title: "Family history book",
      fileName: "book.pdf",
      contentType: "application/pdf",
      sizeBytes: SIZE,
      sha256: "c".repeat(64),
    },
  });
  await t.mutation(attach, {
    uploadRef: "family_evidence_book",
    multipartUploadId: "b2-upload-1",
    partSizeBytes: EVIDENCE_PART_BYTES,
  });
  return { t, grantId };
}

const part = (partNumber: number, sizeBytes: number, relayTokenHash = "token-hash-book") => ({
  uploadRef: "family_evidence_book",
  relayTokenHash,
  partNumber,
  etag: `"etag-${partNumber}"`,
  sizeBytes,
  sha256: "d".repeat(64),
});

describe("multipart evidence uploads", () => {
  test("a second attach keeps the first provider upload", async () => {
    const { t } = await plannedBook();
    const again = await t.mutation(attach, {
      uploadRef: "family_evidence_book",
      multipartUploadId: "b2-upload-2",
      partSizeBytes: EVIDENCE_PART_BYTES,
    });
    expect(again).toMatchObject({ attached: false, multipartUploadId: "b2-upload-1" });
  });

  test("parts are refused under a different capability or at the wrong size", async () => {
    const { t } = await plannedBook();
    await expect(t.mutation(recordPart, part(1, 16 * MIB, "someone-else"))).rejects.toThrow(/not found/);
    await expect(t.mutation(recordPart, part(1, 15 * MIB))).rejects.toThrow(/not found/);
    await expect(t.mutation(recordPart, part(4, 8 * MIB))).rejects.toThrow(/not found/);
  });

  test("finish waits for every part, and a re-sent part replaces its receipt", async () => {
    const { t, grantId } = await plannedBook();
    const finish = () => t.mutation(claim, {
      principal,
      grantId,
      uploadRef: "family_evidence_book",
      operationId: "operation-book-001",
    });
    expect(evidenceUploadParts(SIZE).map((p) => p.sizeBytes)).toEqual([16 * MIB, 16 * MIB, 8 * MIB]);

    await t.mutation(recordPart, part(1, 16 * MIB));
    await t.mutation(recordPart, part(3, 8 * MIB));
    await expect(finish()).rejects.toThrow(/UPLOAD_INCOMPLETE[\s\S]*Parts 2 have not arrived/);

    await t.mutation(recordPart, part(2, 16 * MIB));
    await t.mutation(recordPart, { ...part(2, 16 * MIB), etag: "\"etag-2-resent\"" });
    const claimed = await finish();
    expect(claimed.state).toBe("uploaded");
    expect(claimed.parts?.map((p: { etag: string }) => p.etag)).toEqual(["\"etag-1\"", "\"etag-2-resent\"", "\"etag-3\""]);

    // Once finish has claimed the session no further part is accepted.
    await expect(t.mutation(recordPart, part(1, 16 * MIB))).rejects.toThrow(/not found/);
  });
});
