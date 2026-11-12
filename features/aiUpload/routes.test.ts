// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- Exercise registered handlers and synthetic provider boundaries. */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import { seedGrant } from "../../lib/mcp/testSupport";
import { EVIDENCE_PART_BYTES, EVIDENCE_RELAY_BODY_BYTES } from "../../lib/media/evidenceStandard";
const api = anyApi;
const provider = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; mime: string }>(), parts: new Map<number, Uint8Array>(), writes: 0, completes: 0, mode: "ok", onDigest: undefined as undefined | (() => Promise<void>), gate: undefined as undefined | (() => Promise<void>) }));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
vi.mock("../../lib/media/evidenceB2", async load => ({
  ...await load<typeof import("../../lib/media/evidenceB2")>(),
  loadEvidenceB2Config: (bucketClass: string) => ({ bucketClass, bucket: `synthetic-${bucketClass}`, environment: "development" }),
  EvidenceB2Store: class {
    constructor(readonly config: any) {}
    async signPut(a: any) { return `https://storage.invalid/${encodeURIComponent(a.objectKey)}?mime=${a.contentType}`; }
    async signUploadPart(a: any) { return `https://storage.invalid/${encodeURIComponent(a.objectKey)}?part=${a.partNumber}`; }
    async createMultipart() { return "synthetic-multipart"; }
    async abortMultipart() {}
    async completeMultipart(a: any) { provider.completes++; const bytes = new Uint8Array([...provider.parts.values()].reduce((n, p) => n + p.length, 0)); let offset = 0; for (const p of a.parts) { const part = provider.parts.get(p.partNumber)!; bytes.set(part, offset); offset += part.length; } provider.objects.set(a.objectKey, { bytes, mime: "text/plain" }); }
    async head(key: string) { const o = provider.objects.get(key); if (!o) throw new Error("Synthetic provider unavailable"); return { versionId: "synthetic-v1", sizeBytes: o.bytes.length, contentType: o.mime }; }
    async put(a: any) { provider.objects.set(a.objectKey, { bytes: a.bytes, mime: a.contentType }); return { versionId: "synthetic-v1", sha256: hash(a.bytes) }; }
    async deleteVersion(key: string) { provider.objects.delete(key); }
    async read(key: string) { return provider.objects.get(key)!.bytes; }
    async readRange(key: string, _version: string, offset: number, length: number) { return provider.objects.get(key)!.bytes.subarray(offset, offset + length); }
    async digest(key: string) { if (provider.onDigest) await provider.onDigest(); const bytes = provider.objects.get(key)!.bytes; return { sha256: hash(bytes), sizeBytes: bytes.length, head: bytes.subarray(0, 65536) }; }
    async deleteVersionsExcept() {}
    async deleteAllVersions(key: string) { provider.objects.delete(key); }
  },
}));
const modules = import.meta.glob("../../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers(); provider.objects.clear(); provider.parts.clear(); provider.writes = 0; provider.completes = 0; provider.mode = "ok"; provider.onDigest = undefined; provider.gate = undefined;
  vi.stubEnv("CONVEX_SITE_URL", "https://synthetic.convex.site");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (provider.gate) await provider.gate();
    if (provider.mode === "reject") return new Response(null, { status: 503 });
    if (provider.mode === "before_error") throw new Error("Synthetic disconnect");
    const u = new URL(url), bytes = init.body as Uint8Array;
    provider.writes++;
    if (u.searchParams.has("part")) provider.parts.set(Number(u.searchParams.get("part")), bytes);
    else provider.objects.set(decodeURIComponent(u.pathname.slice(1)), { bytes, mime: u.searchParams.get("mime")! });
    if (provider.mode === "after_error") throw new Error("Synthetic lost response");
    return new Response(null, { status: 200, headers: { etag: "synthetic-etag" } });
  }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture(bytes = new TextEncoder().encode("Synthetic evidence"), contentType = "text/plain") {
  const t = convexTest(schema, modules);
  const principal = { subject: "synthetic-upload-owner", clientId: "synthetic-upload-client", issuer: "https://identity.example.test", scopes: [] };
  const personId = await t.run(ctx => ctx.db.insert("persons", { vaultOwnerId: principal.subject, name: { given: "Synthetic", surname: "Fixture" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 }));
  const grantId = await seedGrant(t, { vaultOwnerId: principal.subject, clientId: principal.clientId, scopes: ["family_history:evidence:write"] });
  const args = { principal, grantId, operationId: "synthetic-operation", requestHash: "synthetic-request", input: { personId: String(personId), title: "Synthetic evidence", fileName: "fixture", contentType, sizeBytes: bytes.length, sha256: hash(bytes) } };
  const begin = (extra = {}) => t.action(api.mediaEvidenceStorage.beginMcpEvidenceUpload, { ...args, ...extra });
  const put = (result: any, data = bytes, part?: number) => t.fetch(new URL(part ? result.upload.parts[part - 1].url : result.upload.url).pathname, { method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(data.length) }, body: data });
  const finish = (r: any, extra = {}) => t.action(api.mediaEvidenceStorage.finishMcpEvidenceUpload, { ...args, input: { uploadRef: r.uploadRef }, ...extra });
  const rows = () => t.run(async ctx => ({ sessions: await ctx.db.query("mediaUploadSessions").collect(), counters: await ctx.db.query("usageCounters").collect(), holds: await ctx.db.query("uploadReservations").collect(), media: await ctx.db.query("media").collect(), jobs: await ctx.db.system.query("_scheduled_functions").collect(), events: await ctx.db.query("usageLimitEvents").collect(), grants: await ctx.db.query("mcpGrants").collect(), storage: await ctx.db.system.query("_storage").collect() }));
  return { t, args, bytes, begin, put, finish, rows };
}
test("concurrent single PUTs and replay produce one original version and one count", async () => {
  const f = await fixture(), r = await f.begin();
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  provider.gate = async () => { entered(); await waiting; };
  const first = f.put(r); await started;
  const before = await f.rows();
  expect((await f.put(r)).status).toBe(409); expect(await f.rows()).toEqual(before);
  release(); expect((await first).status).toBe(204); expect(provider.writes).toBe(1);
  expect((await f.put(r)).status).toBe(404);
  expect(await f.finish(r)).toMatchObject({ status: "pending_person_review" });
  expect((await f.put(r)).status).toBe(404);
  expect(await f.finish(r)).toMatchObject({ replayed: true });
  expect((await f.rows()).counters[0]).toMatchObject({ reservedBytes: 0, storedBytes: f.bytes.length, dayUploads: 1 });
});
for (const mode of ["reject", "after_error", "before_error"]) test(`recovery after ${mode} never rewrites an uncertain original`, async () => {
  const f = await fixture(), r = await f.begin(); provider.mode = mode;
  expect((await f.put(r)).status).toBe(mode === "reject" ? 404 : 409);
  provider.mode = "ok";
  const retried = await f.begin();
  if (mode === "before_error") {
    expect(retried).toMatchObject({ uploadRefusal: { code: "UPLOAD_ATTEMPT_CLOSED", resetsAt: new Date(r.upload.expiresAt).toISOString(), recovery: expect.stringContaining("new upload now") } });
    expect(provider.writes).toBe(0);
  } else {
    expect(retried.upload.url).not.toBe(r.upload.url);
    const before = await f.rows(); expect((await f.put(r)).status).toBe(404); expect(await f.rows()).toEqual(before);
    if (mode === "after_error") expect(retried.upload.alreadyUploaded).toBe(true);
    else expect((await f.put(retried)).status).toBe(204);
    await f.finish(retried); expect(provider.writes).toBe(1);
  }
});
test("wrong digest consumes one attempt, exact begin retries; changed request is refused unchanged", async () => {
  const f = await fixture(), r = await f.begin(); expect((await f.put(r, new Uint8Array(f.bytes.length))).status).toBe(404); expect(provider.writes).toBe(0);
  const before = await f.rows(); await expect(f.begin({ requestHash: "changed" })).rejects.toThrow("OPERATION_CONFLICT"); expect(await f.rows()).toEqual(before);
  const retry = await f.begin(); expect((await f.put(r)).status).toBe(404); expect((await f.put(retry)).status).toBe(204); await f.finish(retry);
});
for (const state of ["revoked", "paused", "expired", "removed", "power_removed", "boundary_removed"]) test(`${state} blocks begin, PUT, finish without changing rows`, async () => {
  const f = await fixture(), r = await f.begin();
  await f.t.run(async ctx => { const id = ctx.db.normalizeId("mcpGrants", f.args.grantId)!; if (state === "removed") await ctx.db.delete(id); else await ctx.db.patch(id, state === "paused" ? { pausedAt: Date.now() } : state === "expired" ? { expiresAt: Date.now() - 1 } : state === "power_removed" ? { scopes: [] } : state === "boundary_removed" ? { boundary: { kind: "selected_people", personIds: [] } } : { status: "revoked" }); });
  const before = await f.rows(); await expect(f.begin()).rejects.toThrow(); expect((await f.put(r)).status).toBe(404); await expect(f.finish(r)).rejects.toThrow(); expect(await f.rows()).toEqual(before); expect(provider.writes).toBe(0);
});
test("another connection cannot replay begin or finish; mismatched client cannot use an original grant", async () => {
  const f = await fixture(), r = await f.begin();
  const grantId = await seedGrant(f.t, { vaultOwnerId: f.args.principal.subject, clientId: "synthetic-other-client", scopes: ["family_history:evidence:write"] });
  for (const grant of [grantId, f.args.grantId]) {
    const extra = { grantId: grant, principal: { ...f.args.principal, clientId: "synthetic-other-client" } }, before = await f.rows();
    await expect(f.begin(extra)).rejects.toThrow(); await expect(f.finish(r, extra)).rejects.toThrow(); expect(await f.rows()).toEqual(before);
  }
});
test("multipart resend stays open, in-flight parts block completion, concurrent finish completes once", async () => {
  const bytes = new Uint8Array(EVIDENCE_RELAY_BODY_BYTES + 1).fill(65), f = await fixture(bytes), r = await f.begin();
  expect(r.upload.mode).toBe("parts");
  const first = bytes.subarray(0, EVIDENCE_PART_BYTES), last = bytes.subarray(EVIDENCE_PART_BYTES);
  expect((await f.put(r, first, 1)).status).toBe(204); expect((await f.put(r, first, 1)).status).toBe(204);
  expect((await f.put(r, last, 2)).status).toBe(204);
  const results = await Promise.allSettled([f.finish(r), f.finish(r)]);
  expect(results.some(r => r.status === "fulfilled")).toBe(true); expect(provider.completes).toBe(1); expect(provider.objects.size).toBe(1);
  const before = await f.rows(); expect((await f.put(r, first, 1)).status).toBe(404); expect(await f.rows()).toEqual(before);
});
for (const [extension, mime] of Object.entries({ webm: "audio/webm", ogg: "audio/ogg", mp4: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac" })) test(`${extension} validates real stored audio before counting`, async () => {
  const f = await fixture(new Uint8Array(readFileSync(`lib/media/fixtures/audio/tone.${extension}`)), mime), r = await f.begin();
  expect((await f.put(r)).status).toBe(204); await f.finish(r); expect((await f.rows()).media[0].mimeType).toBe(mime);
});
test("invalid stored audio never becomes ready and existing cleanup releases it", async () => {
  const f = await fixture(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm"), r = await f.begin();
  expect((await f.put(r)).status).toBe(204); expect(await f.finish(r)).toMatchObject({ uploadRefusal: { code: "INVALID_AUDIO_CONTAINER" } }); expect((await f.rows()).media).toHaveLength(0);
  await f.t.action(api.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: r.uploadRef });
  expect((await f.rows()).counters[0]).toMatchObject({ reservedBytes: 0, storedBytes: 0 });
});
test("product forwarding credential is one-use and reveals no provider URL", async () => {
  const f = await fixture(), r = await f.begin(), parts = new URL(r.upload.url).pathname.split("/"), relayToken = parts.at(-1)!;
  const result = await f.t.action(api.mediaEvidenceStorage.authorizeMcpEvidenceRelay, { uploadRef: r.uploadRef, relayToken }); expect(Object.keys(result)).toEqual(["relayToken"]);
  const before = await f.rows(); expect((await f.put(r)).status).toBe(404); await expect(f.t.action(api.mediaEvidenceStorage.authorizeMcpEvidenceRelay, { uploadRef: r.uploadRef, relayToken })).rejects.toThrow(); expect(await f.rows()).toEqual(before);
  const forwarded = { ...r, upload: { ...r.upload, url: r.upload.url.replace(relayToken, result.relayToken) } };
  expect((await f.put(forwarded)).status).toBe(204); expect((await f.put(forwarded)).status).toBe(404); expect(provider.writes).toBe(1);
});
for (const format of ["jpeg", "png", "webp"] as const) test(`${format} retains the original and counts display copies once`, async () => {
  const bytes = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).toFormat(format).toBuffer());
  const f = await fixture(bytes, `image/${format}`), r = await f.begin(); expect((await f.put(r)).status).toBe(204); await f.finish(r);
  const rows = await f.rows(); expect(rows.media[0].b2Original?.sha256).toBe(hash(bytes)); expect(rows.counters[0].storedBytes).toBe([...provider.objects.values()].reduce((n, o) => n + o.bytes.length, 0));
});
for (const [mime, bytes] of [
  ["application/pdf", new TextEncoder().encode("%PDF-1.7\n%%EOF\n")],
  ["image/tiff", new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0])],
  ["image/heic", new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0, ...new TextEncoder().encode("mif1heic")])],
  ["image/heif", new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypmif1"), 0, 0, 0, 0, ...new TextEncoder().encode("mif1heif")])],
] as const) test(`${mime} uses the existing stored-byte validator`, async () => {
  const f = await fixture(bytes, mime), r = await f.begin(); expect((await f.put(r)).status).toBe(204); await f.finish(r); expect((await f.rows()).media[0].b2Original?.sha256).toBe(hash(bytes));
});
test("a part in flight blocks finish and same-part overlap; invalid part bounds change nothing", async () => {
  const f = await fixture(new Uint8Array(EVIDENCE_RELAY_BODY_BYTES + 1).fill(65)), r = await f.begin();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  provider.gate = async () => { entered(); await gate; };
  const part = f.bytes.subarray(0, EVIDENCE_PART_BYTES), first = f.put(r, part, 1); await started;
  const before = await f.rows(); await expect(f.finish(r)).rejects.toThrow("UPLOAD_INCOMPLETE"); expect((await f.put(r, part, 1)).status).toBe(404); expect(await f.rows()).toEqual(before);
  release(); expect((await first).status).toBe(204); provider.gate = undefined;
  const closed = await f.rows(); const url = new URL(r.upload.parts[0].url); url.pathname = url.pathname.replace(/\/1$/, "/999");
  expect((await f.t.fetch(url.pathname, { method: "PUT", headers: { "Content-Type": "text/plain", "Content-Length": "1" }, body: "A" })).status).toBe(404); expect(await f.rows()).toEqual(closed);
});
test("the real HTTP handler claims before opening the body; refused bearer never opens it", async () => {
  const { evidenceUploadRelay } = await import("../../convex/httpRoutes/evidenceUpload");
  const f = await fixture(), r = await f.begin();
  const ctx = { runQuery: (ref: any, args: any) => f.t.query(ref, args), runAction: (ref: any, args: any) => f.t.action(ref, args), runMutation: (ref: any, args: any) => f.t.mutation(ref, args) };
  const req = new Request(r.upload.url, { method: "PUT", headers: { "Content-Type": "text/plain", "Content-Length": String(f.bytes.length) }, body: f.bytes });
  const body = req.body; let atRead: ReturnType<typeof f.rows> | undefined;
  Object.defineProperty(req, "body", { get() { atRead = f.rows(); return body; }, configurable: true });
  expect((await (evidenceUploadRelay as any)._handler(ctx, req)).status).toBe(204);
  expect((await atRead!).sessions[0].putState).toBe("in_progress");
  Object.defineProperty(req, "body", { get() { throw new Error("Refusal read the body"); }, configurable: true });
  expect((await (evidenceUploadRelay as any)._handler(ctx, req)).status).toBe(404);
});
test("revocation during verification refuses the commit without changing application rows", async () => {
  const f = await fixture(), r = await f.begin(); await f.put(r);
  const claimed = await f.t.mutation(api.mediaEvidenceControl.claimSessionForFinish, { principal: f.args.principal, grantId: f.args.grantId, operationId: f.args.operationId, uploadRef: r.uploadRef });
  await f.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("mcpGrants", f.args.grantId)!, { status: "revoked" })); const before = await f.rows();
  await expect(f.t.mutation(api.mediaEvidenceControl.commitMcpEvidenceUpload, { principal: f.args.principal, grantId: f.args.grantId, uploadRef: r.uploadRef, original: { bucketClass: "private", bucketName: "synthetic-private", objectKey: claimed.objectKey, versionId: "synthetic-v1", contentType: "text/plain", sizeBytes: f.bytes.length, sha256: hash(f.bytes), metadataClean: false, verifiedAt: new Date().toISOString() }, metadataProposal: { temporal: { uploadTime: new Date().toISOString() }, extractedFromOriginalSha256: hash(f.bytes), extractedAt: new Date().toISOString(), reversible: true, decision: "pending" } })).rejects.toThrow(); expect(await f.rows()).toEqual(before);
});
for (const enforcement of ["off", "warn", "on"] as const) test(`${enforcement}: invalid file and duration settings resolve to original defaults`, async () => {
  const { fileCapsFor, audioPolicyFor } = await import("../../convex/usageLimits");
  const { siteDefaults, audioDurationDefaults } = await import("../../lib/media/siteDefaults");
  for (const bad of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement, ...(bad === undefined ? {} : { maxFileBytes: Object.fromEntries(Object.keys(siteDefaults).map(kind => [kind, bad])), maxVoiceNoteSeconds: bad }), updatedAt: 1, updatedBy: "synthetic" }));
    expect(await f.t.run(ctx => fileCapsFor(ctx, f.args.principal.subject))).toEqual(siteDefaults);
    expect(await f.t.run(ctx => audioPolicyFor(ctx, f.args.principal.subject))).toEqual({ maxVoiceNoteSeconds: audioDurationDefaults.voicenote });
    const result = await f.begin({ input: { ...f.args.input, sizeBytes: siteDefaults.original + 1 } });
    expect(result).toMatchObject({ uploadRefusal: { code: "FILE_TOO_LARGE" } }); expect((await f.rows()).holds).toHaveLength(0);
  }
});
for (const enforcement of ["off", "warn", "on"] as const) test(`${enforcement}: file-level refusal reserves nothing, room enforcement matches the single-upload policy`, async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement, backfillCompletedAt: 1, planStoredBytes: { free: 1 }, maxFileBytes: { original: f.bytes.length - 1 }, updatedAt: 1, updatedBy: "synthetic" }));
  expect(await f.begin()).toMatchObject({ uploadRefusal: { code: "FILE_TOO_LARGE" } }); expect((await f.rows()).holds).toHaveLength(0);
  await f.t.run(async ctx => { const row = await ctx.db.query("usageLimitSettings").first(); await ctx.db.patch(row!._id, { maxFileBytes: {} }); });
  const result = await f.begin();
  if (enforcement === "on") { expect(result).toMatchObject({ uploadRefusal: { code: "USAGE_LIMIT_REACHED" } }); expect((await f.rows()).holds).toHaveLength(0); }
  else { expect(result.status).toBe("pending_upload"); await f.put(result); await f.finish(result); expect((await f.rows()).counters[0].storedBytes).toBe(f.bytes.length); }
});
test("connection-facing handlers use only the common session authorizer", () => {
  const source = readFileSync("convex/mediaEvidenceControl.ts", "utf8");
  for (const name of ["planMcpEvidenceUpload", "attachMultipartUpload", "recordMcpEvidencePart", "relayAuthorization", "delegateEvidencePut", "settleEvidencePut", "adoptEvidencePut", "recoveryRefusal", "sessionForFinish", "claimSessionForFinish", "commitMcpEvidenceUpload"]) {
    const body = source.split(`export const ${name} =`)[1].split("\n});")[0]; expect(body).toContain("requireEvidenceConnection(ctx, args)"); expect(body).not.toMatch(/\.query\("mediaUploadSessions"\)/);
  }
});
for (const putState of ["awaiting", "in_progress", "failed", "succeeded"] as const) test(`ordinary expiry covers a ${putState} single attempt`, async () => {
  const f = await fixture(), r = await f.begin();
  if (putState === "succeeded") await f.put(r);
  await f.t.run(async ctx => { const row = await ctx.db.query("mediaUploadSessions").first(); await ctx.db.patch(row!._id, { putState, expiresAt: Date.now() - 1 }); });
  await f.t.action(api.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: r.uploadRef });
  expect((await f.rows()).counters[0]).toMatchObject({ reservedBytes: 0, inFlight: 0, storedBytes: 0 }); expect(provider.objects.size).toBe(0);
});
test("a near-ceiling stream stays bounded and never calls arrayBuffer", async () => {
  const { evidenceUploadRelay } = await import("../../convex/httpRoutes/evidenceUpload");
  const f = await fixture(new Uint8Array(EVIDENCE_RELAY_BODY_BYTES).fill(65)), r = await f.begin();
  let offset = 0;
  const req = new Request(r.upload.url, { method: "PUT", headers: { "Content-Type": "text/plain", "Content-Length": String(f.bytes.length) }, body: new ReadableStream({ pull(controller) { if (offset === f.bytes.length) return controller.close(); const end = Math.min(offset + 65536, f.bytes.length); controller.enqueue(f.bytes.subarray(offset, end)); offset = end; } }), duplex: "half" } as RequestInit);
  req.arrayBuffer = async () => { throw new Error("Unbounded body copy"); };
  expect((await (evidenceUploadRelay as any)._handler({ runQuery: (ref: any, args: any) => f.t.query(ref, args), runAction: (ref: any, args: any) => f.t.action(ref, args), runMutation: (ref: any, args: any) => f.t.mutation(ref, args) }, req)).status).toBe(204);
  expect(provider.writes).toBe(1); await f.finish(r);
});
test("finish action leaves rows untouched when the committing grant is revoked during byte validation", async () => {
  const f = await fixture(), r = await f.begin(); await f.put(r); let atRevoke: Awaited<ReturnType<typeof f.rows>> | undefined;
  provider.onDigest = async () => { await f.t.run(ctx => ctx.db.patch(ctx.db.normalizeId("mcpGrants", f.args.grantId)!, { status: "revoked" })); atRevoke = await f.rows(); };
  await expect(f.finish(r)).rejects.toThrow("GRANT_REVOKED"); expect(await f.rows()).toEqual(atRevoke); expect((await f.rows()).media).toHaveLength(0);
});
for (const interrupted of [false, true]) test(`${interrupted ? "interrupted" : "uncertain"} attempt reports expiry and room without changing the hold`, async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement: "on", backfillCompletedAt: 1, planStoredBytes: { free: f.bytes.length }, updatedAt: 1, updatedBy: "synthetic" }));
  const r = await f.begin();
  if (interrupted) await f.t.mutation(api.mediaEvidenceControl.relayAuthorization, { uploadRef: r.uploadRef, relayTokenHash: hash(new TextEncoder().encode(new URL(r.upload.url).pathname.split("/").at(-1)!)) });
  else { provider.mode = "before_error"; const response = await f.put(r); expect(response.status).toBe(409); const body = await response.json(); expect(body.structuredContent).not.toHaveProperty("remaining"); expect(body).toMatchObject({ isError: true, structuredContent: { code: "UPLOAD_ATTEMPT_CLOSED", resetsAt: new Date(r.upload.expiresAt).toISOString(), error: { recovery: expect.stringContaining("same operation ID") } } }); }
  const before = await f.rows(), refusal = (await f.begin()).uploadRefusal;
  expect(refusal).toMatchObject({ code: "UPLOAD_ATTEMPT_CLOSED", remaining: 0, resetsAt: new Date(r.upload.expiresAt).toISOString() });
  expect(refusal.message).toContain("cannot be resumed"); expect(refusal.message).toContain("new upload now"); expect(refusal.message).toContain("keeps its reserved room"); expect(refusal.recovery).toContain("refused for room"); expect(refusal.recovery).toContain("ordinary cleanup");
  expect(await f.rows()).toEqual(before);
});
for (const interrupted of [false, true]) test(`${interrupted ? "interrupted" : "uncertain"}: immediate replacement with room counts late old bytes only until ordinary cleanup`, async () => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement: "on", backfillCompletedAt: 1, planStoredBytes: { free: f.bytes.length * 2 }, updatedAt: 1, updatedBy: "synthetic" }));
  const old = await f.begin();
  if (interrupted) await f.t.mutation(api.mediaEvidenceControl.relayAuthorization, { uploadRef: old.uploadRef, relayTokenHash: hash(new TextEncoder().encode(new URL(old.upload.url).pathname.split("/").at(-1)!)) });
  else { provider.mode = "before_error"; await f.put(old); provider.mode = "ok"; }
  const replacement = await f.begin({ operationId: "synthetic-replacement", requestHash: "replacement" }); expect((await f.put(replacement)).status).toBe(204); await f.finish(replacement, { operationId: "synthetic-replacement" });
  const oldSession = (await f.rows()).sessions.find(s => s.ref === old.uploadRef)!;
  provider.objects.set(oldSession.objectKey, { bytes: f.bytes, mime: "text/plain" });
  expect((await f.rows()).counters[0]).toMatchObject({ storedBytes: f.bytes.length, reservedBytes: f.bytes.length }); expect(provider.objects.size).toBe(2);
  expect((await f.begin()).upload.alreadyUploaded).toBe(true); // Late original is adoptable without another write.
  vi.setSystemTime(old.upload.expiresAt + 1); await f.t.action(api.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: old.uploadRef });
  const rows = await f.rows(); expect(rows.counters[0]).toMatchObject({ storedBytes: f.bytes.length, reservedBytes: 0, inFlight: 0 }); expect(rows.media).toHaveLength(1); expect(provider.objects.size).toBe(1); expect(provider.writes).toBe(1);
});
for (const interrupted of [false, true]) test(`${interrupted ? "interrupted" : "uncertain"}: tight-quota recovery matches the main capture and succeeds after ordinary expiry`, async () => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement: "on", backfillCompletedAt: 1, planStoredBytes: { free: f.bytes.length }, updatedAt: 1, updatedBy: "synthetic" }));
  const r = await f.begin();
  if (interrupted) await f.t.mutation(api.mediaEvidenceControl.relayAuthorization, { uploadRef: r.uploadRef, relayTokenHash: hash(new TextEncoder().encode(new URL(r.upload.url).pathname.split("/").at(-1)!)) });
  else { provider.mode = "before_error"; await f.put(r); provider.mode = "ok"; }
  const oldReservedBytes = (await f.rows()).counters[0].reservedBytes, args = { operationId: "synthetic-replacement", requestHash: "replacement" };
  const refused = await f.begin(args); expect(refused.uploadRefusal.code).toBe("USAGE_LIMIT_REACHED"); expect((await f.rows()).holds).toHaveLength(1);
  await f.t.action(api.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: r.uploadRef }); expect((await f.rows()).counters[0].reservedBytes).toBe(f.bytes.length);
  vi.setSystemTime(r.upload.expiresAt + 1); await f.t.action(api.mediaEvidenceStorage.cleanupMcpEvidenceUpload, { uploadRef: r.uploadRef });
  const replacement = await f.begin(args); expect((await f.put(replacement)).status).toBe(204); await f.finish(replacement, { operationId: args.operationId }); const counter = (await f.rows()).counters[0];
  expect({ declaredBytes: f.bytes.length, oldReservedBytes, newOperationRefusal: refused.uploadRefusal.code, reservedAfterOrdinaryExpiry: counter.reservedBytes, storedAfterRecovery: counter.storedBytes }).toEqual(JSON.parse(readFileSync("features/aiUpload/recoveryHoldBaseline.json", "utf8")));
});
test("interrupted transfer with a visible original adopts it without reopening the credential", async () => {
  const f = await fixture(), r = await f.begin(), token = new URL(r.upload.url).pathname.split("/").at(-1)!;
  await f.t.mutation(api.mediaEvidenceControl.relayAuthorization, { uploadRef: r.uploadRef, relayTokenHash: hash(new TextEncoder().encode(token)) });
  const row = (await f.rows()).sessions[0]; provider.objects.set(row.objectKey, { bytes: f.bytes, mime: "text/plain" });
  expect((await f.begin()).upload.alreadyUploaded).toBe(true); expect((await f.put(r)).status).toBe(404); await f.finish(r); expect(provider.writes).toBe(0); expect((await f.rows()).counters[0]).toMatchObject({ storedBytes: f.bytes.length, reservedBytes: 0 });
});
