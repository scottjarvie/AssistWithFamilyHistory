/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any -- Action results cross the generated internal API untyped; the test asserts their runtime shape. */
/**
 * The whole evidence-upload path, end to end, against an in-memory stand-in
 * for the private B2 bucket: begin -> relay PUT (whole file or parts) -> finish
 * -> scheduled cleanup. The provider is the only fake; the Convex actions,
 * mutations and HTTP relay are the real ones.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { EVIDENCE_ORIGINAL_MAX_BYTES } from "../lib/media/evidenceStandard";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_media_orchestration_AAAA";
const CLIENT_ID = "synthetic-media-client";
const MIB = 1024 * 1024;

type Version = { versionId: string; bytes: Uint8Array; contentType: string };
type Multipart = { objectKey: string; contentType: string; parts: Map<number, Uint8Array>; done: boolean };

/** In-memory private bucket shared by the fake store and the fake provider endpoint. */
const bucket = vi.hoisted(() => ({
  objects: new Map<string, Version[]>(),
  multiparts: new Map<string, Multipart>(),
  failNextPuts: 0,
  failNextHeads: 0,
  sequence: 0,
  reset() {
    this.objects.clear();
    this.multiparts.clear();
    this.failNextPuts = 0;
    this.failNextHeads = 0;
  },
}));

function sha(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
function etagOf(bytes: Uint8Array) {
  return `"${createHash("md5").update(bytes).digest("hex")}"`;
}
function putVersion(objectKey: string, bytes: Uint8Array, contentType: string) {
  const versionId = `v${++bucket.sequence}`;
  bucket.objects.set(objectKey, [...(bucket.objects.get(objectKey) ?? []), { versionId, bytes, contentType }]);
  return versionId;
}

vi.mock("../lib/media/evidenceB2", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/media/evidenceB2")>();
  const version = (objectKey: string, versionId?: string) => {
    const versions = bucket.objects.get(objectKey) ?? [];
    const found = versionId ? versions.find((entry) => entry.versionId === versionId) : versions.at(-1);
    if (!found) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
    return found;
  };
  class FakeEvidenceB2Store {
    constructor(readonly config: unknown) {}
    async signPut(input: { objectKey: string }) {
      return `https://fake-b2.test/put/${encodeURIComponent(input.objectKey)}`;
    }
    async createMultipart(input: { objectKey: string; contentType: string }) {
      const uploadId = `upload-${++bucket.sequence}`;
      bucket.multiparts.set(uploadId, { ...input, parts: new Map(), done: false });
      return uploadId;
    }
    async signUploadPart(input: { uploadId: string; partNumber: number }) {
      return `https://fake-b2.test/part/${input.uploadId}/${input.partNumber}`;
    }
    async completeMultipart(input: { objectKey: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }) {
      const upload = bucket.multiparts.get(input.uploadId);
      if (!upload || upload.done) throw Object.assign(new Error("NoSuchUpload"), { name: "NoSuchUpload" });
      const ordered = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
      const chunks = ordered.map((part) => {
        const bytes = upload.parts.get(part.partNumber);
        if (!bytes || part.etag !== etagOf(bytes)) throw Object.assign(new Error("InvalidPart"), { name: "InvalidPart" });
        return bytes;
      });
      const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      upload.done = true;
      putVersion(input.objectKey, joined, upload.contentType);
    }
    async abortMultipart(_objectKey: string, uploadId: string) {
      const upload = bucket.multiparts.get(uploadId);
      if (!upload || upload.done) throw Object.assign(new Error("NoSuchUpload"), { name: "NoSuchUpload" });
      bucket.multiparts.delete(uploadId);
    }
    async head(objectKey: string, versionId?: string) {
      if (bucket.failNextHeads > 0) {
        bucket.failNextHeads -= 1;
        throw Object.assign(new Error("socket hang up"), { name: "TimeoutError" });
      }
      const found = version(objectKey, versionId);
      return { versionId: found.versionId, sizeBytes: found.bytes.byteLength, contentType: found.contentType };
    }
    async digest(objectKey: string, versionId: string, keepBytes = 64 * 1024) {
      const found = version(objectKey, versionId);
      return { sha256: sha(found.bytes), sizeBytes: found.bytes.byteLength, head: found.bytes.slice(0, keepBytes) };
    }
    async read(objectKey: string, versionId: string) {
      return version(objectKey, versionId).bytes;
    }
    async deleteAllVersions(objectKey: string) {
      bucket.objects.delete(objectKey);
    }
    async deleteVersionsExcept(objectKey: string, keepVersionId: string) {
      bucket.objects.set(objectKey, (bucket.objects.get(objectKey) ?? []).filter((entry) => entry.versionId === keepVersionId));
    }
  }
  return {
    ...real,
    EvidenceB2Store: FakeEvidenceB2Store,
    loadEvidenceB2Config: (bucketClass: "private" | "public") => ({
      endpoint: "https://fake-b2.test",
      region: "us-west-000",
      bucket: `synthetic-${bucketClass}`,
      keyId: `synthetic-${bucketClass}-key`,
      applicationKey: "synthetic",
      environment: "development",
      bucketClass,
    }),
  };
});

/** The provider's signed-URL endpoint, as the relay reaches it with fetch. */
async function fakeProvider(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  if (url.hostname !== "fake-b2.test") throw new Error(`Unexpected fetch to ${url.hostname}`);
  if (bucket.failNextPuts > 0) {
    bucket.failNextPuts -= 1;
    return new Response("provider unavailable", { status: 503 });
  }
  const body = new Uint8Array(init?.body as ArrayBuffer);
  const [, kind, ...rest] = url.pathname.split("/");
  if (kind === "put") {
    const headers = new Headers(init?.headers);
    putVersion(decodeURIComponent(rest.join("/")), body, headers.get("content-type") ?? "application/octet-stream");
    return new Response(null, { status: 200 });
  }
  const upload = bucket.multiparts.get(rest[0]);
  if (!upload || upload.done) return new Response("NoSuchUpload", { status: 404 });
  upload.parts.set(Number(rest[1]), body);
  return new Response(null, { status: 200, headers: { etag: etagOf(body) } });
}

function pdfBytes(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.4\n% synthetic family history book\n"));
  for (let index = 64; index < size; index += 4096) bytes[index] = index % 251;
  return bytes;
}

async function setup() {
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
  const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID });
  const principal = { issuer: "https://identity.example.test", subject: OWNER, clientId: CLIENT_ID, scopes: [] as string[] };
  const begin = (operationId: string, bytes: Uint8Array, declaredSha = sha(bytes)): Promise<any> =>
    t.action(internal.mediaEvidenceStorage.beginMcpEvidenceUpload, {
      principal, grantId, operationId, requestHash: `hash-${operationId}`,
      input: {
        personId: String(personId),
        title: "Family history book",
        fileName: "book.pdf",
        contentType: "application/pdf",
        sizeBytes: bytes.byteLength,
        sha256: declaredSha,
      },
    });
  const finish = (operationId: string, uploadRef: string): Promise<any> =>
    t.action(internal.mediaEvidenceStorage.finishMcpEvidenceUpload, {
      principal, grantId, operationId, requestHash: `finish-${operationId}`, input: { uploadRef },
    });
  const put = (url: string, bytes: Uint8Array) => t.fetch(new URL(url).pathname, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });
  const session = (uploadRef: string) => t.run((ctx) => ctx.db.query("mediaUploadSessions")
    .withIndex("by_ref", (q) => q.eq("ref", uploadRef)).first());
  const expire = (uploadRef: string) => t.run(async (ctx) => {
    const row = await ctx.db.query("mediaUploadSessions").withIndex("by_ref", (q) => q.eq("ref", uploadRef)).first();
    await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 });
  });
  const cleanup = (uploadRef: string) => t.action(internal.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef });
  const slice = (bytes: Uint8Array, part: { offset: number; sizeBytes: number }) => bytes.slice(part.offset, part.offset + part.sizeBytes);
  return { t, begin, finish, put, session, expire, cleanup, slice };
}

beforeEach(() => {
  bucket.reset();
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
  vi.stubGlobal("fetch", vi.fn(fakeProvider));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("evidence upload orchestration against a fake private bucket", () => {
  test("a whole-file upload goes begin, relay, finish and records the exact version", async () => {
    const { t, begin, finish, put } = await setup();
    const bytes = pdfBytes(64 * 1024);
    const started = await begin("operation-single-001", bytes);
    expect(started.status).toBe("pending_upload");
    expect((await put(started.upload.url, bytes)).status).toBe(204);

    const finished = await finish("operation-single-001", started.uploadRef);
    expect(finished).toMatchObject({ status: "pending_person_review", replayed: false, aiUseAllowed: false });
    const media = await t.run((ctx) => ctx.db.get(finished.mediaId)) as any;
    const stored = bucket.objects.get(media.b2Original.objectKey)!.at(-1)!;
    expect(media.b2Original).toMatchObject({ versionId: stored.versionId, sha256: sha(bytes), sizeBytes: bytes.byteLength, contentType: "application/pdf" });
    expect(media).toMatchObject({ type: "document", reviewStatus: "unreviewed", aiUseAllowed: false });

    // Finishing again replays the receipt instead of writing a second media row.
    const replay = await finish("operation-single-001", started.uploadRef);
    expect(replay).toMatchObject({ replayed: true, mediaId: finished.mediaId });
    expect(await t.run((ctx) => ctx.db.query("media").collect())).toHaveLength(1);
  });

  test("a multipart upload records each part's ETag, survives a provider failure, and completes", async () => {
    const { t, begin, finish, put, session, slice } = await setup();
    const bytes = pdfBytes(EVIDENCE_ORIGINAL_MAX_BYTES + 2 * MIB);
    const started = await begin("operation-multi-001", bytes);
    expect(started.upload.mode).toBe("parts");
    expect(started.upload.parts).toHaveLength(2);
    const [first, second] = started.upload.parts;

    // The provider refuses the first attempt at part 1; re-sending it succeeds.
    bucket.failNextPuts = 1;
    expect((await put(first.url, slice(bytes, first))).status).toBe(502);
    await expect(finish("operation-multi-001", started.uploadRef)).rejects.toThrow(/UPLOAD_INCOMPLETE/);
    expect((await put(first.url, slice(bytes, first))).status).toBe(204);
    expect((await put(second.url, slice(bytes, second))).status).toBe(204);

    const recorded = (await session(started.uploadRef))!.parts!;
    expect(recorded.map((part) => [part.partNumber, part.etag]).sort()).toEqual([
      [1, etagOf(slice(bytes, first))],
      [2, etagOf(slice(bytes, second))],
    ]);

    const finished = await finish("operation-multi-001", started.uploadRef);
    expect(finished.status).toBe("pending_person_review");
    const media = await t.run((ctx) => ctx.db.get(finished.mediaId)) as any;
    expect(media.b2Original).toMatchObject({ sha256: sha(bytes), sizeBytes: bytes.byteLength });
  });

  test("a finish interrupted after the parts were joined can be retried (NoSuchUpload on the retry)", async () => {
    const { t, begin, finish, put, session, slice } = await setup();
    const bytes = pdfBytes(EVIDENCE_ORIGINAL_MAX_BYTES + MIB);
    const started = await begin("operation-retry-001", bytes);
    for (const part of started.upload.parts) expect((await put(part.url, slice(bytes, part))).status).toBe(204);

    // The join succeeds, then the provider times out reading it back.
    bucket.failNextHeads = 1;
    await expect(finish("operation-retry-001", started.uploadRef)).rejects.toThrow(/socket hang up/);
    expect((await session(started.uploadRef))!.state).toBe("authorized");

    // The retry finds no open multipart upload and verifies the joined object.
    const finished = await finish("operation-retry-001", started.uploadRef);
    expect(finished.status).toBe("pending_person_review");
    expect(await t.run((ctx) => ctx.db.query("media").collect())).toHaveLength(1);
  });

  test("bytes that do not match the declared SHA-256 fail terminally and save no media", async () => {
    const { t, begin, finish, put, session, slice } = await setup();
    const bytes = pdfBytes(EVIDENCE_ORIGINAL_MAX_BYTES + MIB);
    const started = await begin("operation-digest-001", bytes, "e".repeat(64));
    for (const part of started.upload.parts) expect((await put(part.url, slice(bytes, part))).status).toBe(204);
    await expect(finish("operation-digest-001", started.uploadRef)).rejects.toThrow(/SHA-256/);
    expect(await session(started.uploadRef)).toMatchObject({ state: "failed", failureCode: "verification_failed" });
    expect(await t.run((ctx) => ctx.db.query("media").collect())).toEqual([]);
    await expect(finish("operation-digest-001", started.uploadRef)).rejects.toThrow(/UPLOAD_EXPIRED/);
  });

  test("expired cleanup keeps a committed version and removes stray versions of it", async () => {
    const { t, begin, finish, put, expire, cleanup } = await setup();
    const bytes = pdfBytes(64 * 1024);
    const started = await begin("operation-cleanup-ready", bytes);
    await put(started.upload.url, bytes);
    const finished = await finish("operation-cleanup-ready", started.uploadRef);
    const media = await t.run((ctx) => ctx.db.get(finished.mediaId)) as any;
    // A stray later version at the same key (a late duplicate PUT).
    putVersion(media.b2Original.objectKey, pdfBytes(1024), "application/pdf");
    await expire(started.uploadRef);
    await cleanup(started.uploadRef);
    expect(bucket.objects.get(media.b2Original.objectKey)!.map((entry) => entry.versionId)).toEqual([media.b2Original.versionId]);
  });

  test("expired cleanup removes an abandoned upload's bytes and aborts its open multipart upload", async () => {
    const { begin, put, session, expire, cleanup, slice } = await setup();
    const bytes = pdfBytes(EVIDENCE_ORIGINAL_MAX_BYTES + MIB);
    const started = await begin("operation-cleanup-abandoned", bytes);
    const [first] = started.upload.parts;
    await put(first.url, slice(bytes, first));
    const row = (await session(started.uploadRef))!;
    putVersion(row.objectKey, pdfBytes(1024), "application/pdf");
    await expire(started.uploadRef);
    await cleanup(started.uploadRef);
    expect(bucket.objects.has(row.objectKey)).toBe(false);
    expect(bucket.multiparts.has(row.multipartUploadId!)).toBe(false);
    expect(await session(started.uploadRef)).toMatchObject({ state: "failed", failureCode: "expired_cleanup_complete" });
  });

  test("expired cleanup also removes an upload whose finish died mid-verification", async () => {
    // A finish that crashed (an action timeout) leaves the session "uploaded":
    // further PUTs are refused and commit refuses an expired session, so
    // nothing can ever claim those bytes.
    const { t, begin, put, session, expire, cleanup } = await setup();
    const bytes = pdfBytes(64 * 1024);
    const started = await begin("operation-cleanup-stuck", bytes);
    await put(started.upload.url, bytes);
    const row = (await session(started.uploadRef))!;
    await t.run((ctx) => ctx.db.patch(row._id, { state: "uploaded" }));
    await expire(started.uploadRef);
    await cleanup(started.uploadRef);
    expect(bucket.objects.has(row.objectKey)).toBe(false);
    expect(await session(started.uploadRef)).toMatchObject({ state: "failed", failureCode: "expired_cleanup_complete" });
  });
});
