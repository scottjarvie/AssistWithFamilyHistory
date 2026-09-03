import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { seedGrant } from "../lib/mcp/testSupport";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_media_control_AAAAAAAAAA";

const plan = makeFunctionReference<"mutation">("mediaEvidenceControl:planMcpEvidenceUpload");
const claim = makeFunctionReference<"mutation">("mediaEvidenceControl:claimSessionForFinish");
const commit = makeFunctionReference<"mutation">("mediaEvidenceControl:commitMcpEvidenceUpload");

function principal() {
  return {
    issuer: "https://identity.example.test",
    subject: OWNER,
    clientId: "synthetic-media-client",
    scopes: [],
  };
}

function exact(slot: string, metadataClean: boolean) {
  return {
    bucketClass: "private" as const,
    bucketName: "family-private",
    objectKey: `private/v1/development/family-evidence/ref/${slot}`,
    versionId: `${slot}-v1`,
    sha256: slot === "original" ? "a".repeat(64) : "b".repeat(64),
    contentType: "image/jpeg",
    sizeBytes: 100,
    width: 10,
    height: 10,
    metadataClean,
    verifiedAt: "2026-09-02T00:00:00.000Z",
    transformation: metadataClean ? "decoded and re-encoded without metadata" : undefined,
    sourceSha256: metadataClean ? "a".repeat(64) : undefined,
  };
}

describe("connected-AI family evidence sessions", () => {
  test("replays one operation without duplicating its durable session", async () => {
    const t = convexTest(schema, modules);
    const personId = await t.run((ctx) => ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Synthetic", surname: "Ancestor" },
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
      boundary: { kind: "selected_people", personIds: [String(personId)] },
    });
    const input = {
      personId: String(personId),
      title: "Synthetic scan",
      fileName: "scan.jpg",
      contentType: "image/jpeg",
      sizeBytes: 100,
      sha256: "a".repeat(64),
    };
    const first = await t.mutation(plan, {
      principal: principal(),
      grantId,
      operationId: "operation-media-001",
      requestHash: "request-hash-one",
      uploadRef: "family_evidence_one",
      relayTokenHash: "token-one",
      objectKey: "private/v1/development/family-evidence/family_evidence_one/original",
      expiresAt: Date.now() + 60_000,
      input,
    });
    const replay = await t.mutation(plan, {
      principal: principal(),
      grantId,
      operationId: "operation-media-001",
      requestHash: "request-hash-one",
      uploadRef: "family_evidence_unused",
      relayTokenHash: "token-two",
      objectKey: "private/v1/development/family-evidence/family_evidence_unused/original",
      expiresAt: Date.now() + 60_000,
      input,
    });
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, uploadRef: "family_evidence_one" });
    expect(await t.run((ctx) => ctx.db.query("mediaUploadSessions").collect())).toHaveLength(1);
  });

  test("commits verified manifests only as private, unreviewed, AI-off evidence", async () => {
    const t = convexTest(schema, modules);
    const personId = await t.run((ctx) => ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Synthetic", surname: "Ancestor" },
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
      principal: principal(),
      grantId,
      operationId: "operation-media-002",
      requestHash: "request-hash-two",
      uploadRef: "family_evidence_two",
      relayTokenHash: "token",
      objectKey: "private/v1/development/family-evidence/family_evidence_two/original",
      expiresAt: Date.now() + 60_000,
      input: {
        personId: String(personId), title: "Synthetic scan", fileName: "scan.jpg",
        contentType: "image/jpeg", sizeBytes: 100, sha256: "a".repeat(64),
      },
    });
    await t.mutation(claim, {
      principal: principal(),
      grantId,
      uploadRef: "family_evidence_two",
      operationId: "operation-media-002",
    });
    const result = await t.mutation(commit, {
      principal: principal(),
      grantId,
      uploadRef: "family_evidence_two",
      original: exact("original", false),
      tiny: exact("tiny", true),
      medium: exact("medium", true),
      large: exact("large", true),
      metadataProposal: {
        temporal: { uploadTime: "2026-09-02T00:00:00.000Z" },
        location: {
          latitude: 40.7608,
          longitude: -111.891,
          source: "embedded_gps",
          status: "proposed",
          association: "person_media",
          precision: "exact_private",
          disclosurePrecision: "withheld",
        },
        extractedFromOriginalSha256: "a".repeat(64),
        extractedAt: "2026-09-02T00:00:00.000Z",
        reversible: true,
        decision: "pending",
      },
    });
    const media = await t.run((ctx) => ctx.db.get(result.mediaId));
    expect(media).toMatchObject({
      privacyLevel: "private",
      reviewStatus: "unreviewed",
      rightsStatus: "unknown",
      aiUseAllowed: false,
      mediaState: "ready",
      renditionState: "ready",
    });
    expect(media?.b2Original?.metadataClean).toBe(false);
    expect(media?.b2Renditions?.medium.metadataClean).toBe(true);
    expect(media?.metadataProposal?.location).toMatchObject({
      association: "person_media",
      disclosurePrecision: "withheld",
    });
  });

  test("allows only one concurrent finalizer and rechecks revocation before a finish", async () => {
    const t = convexTest(schema, modules);
    const personId = await t.run((ctx) => ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Concurrency", surname: "Fixture" },
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
    const common = {
      principal: principal(),
      grantId,
      operationId: "operation-media-003",
      uploadRef: "family_evidence_three",
    };
    await t.mutation(plan, {
      ...common,
      requestHash: "request-hash-three",
      relayTokenHash: "token",
      objectKey: "private/v1/development/family-evidence/family_evidence_three/original",
      expiresAt: Date.now() + 60_000,
      input: {
        personId: String(personId), title: "Concurrency scan", fileName: "scan.jpg",
        contentType: "image/jpeg", sizeBytes: 100, sha256: "a".repeat(64),
      },
    });
    await expect(t.mutation(claim, common)).resolves.toMatchObject({ state: "uploaded", replayed: false });
    await expect(t.mutation(claim, common)).rejects.toThrow(/UPLOAD_IN_PROGRESS/);

    const secondGrant = await seedGrant(t, {
      vaultOwnerId: OWNER,
      clientId: "synthetic-media-client",
      scopes: ["family_history:evidence:write"],
    });
    await t.mutation(plan, {
      principal: principal(),
      grantId: secondGrant,
      operationId: "operation-media-004",
      requestHash: "request-hash-four",
      uploadRef: "family_evidence_four",
      relayTokenHash: "token",
      objectKey: "private/v1/development/family-evidence/family_evidence_four/original",
      expiresAt: Date.now() + 60_000,
      input: {
        personId: String(personId), title: "Revoked scan", fileName: "scan.jpg",
        contentType: "image/jpeg", sizeBytes: 100, sha256: "a".repeat(64),
      },
    });
    await t.run(async (ctx) => ctx.db.patch(secondGrant as never, { status: "revoked", revokedAt: Date.now() }));
    await expect(t.mutation(claim, {
      principal: principal(),
      grantId: secondGrant,
      operationId: "operation-media-004",
      uploadRef: "family_evidence_four",
    })).rejects.toThrow(/GRANT_REVOKED/);
  });
});
