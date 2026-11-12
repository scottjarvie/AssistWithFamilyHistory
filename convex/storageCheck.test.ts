import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import schema from "./schema";
import { internal, api } from "./_generated/api";
import { manifestPage, convexStoragePage } from "./storageCheck";

const modules = import.meta.glob("./**/*.ts");
const object = (key: string, bucketClass: "private" | "public" = "private") => ({
  bucketClass, bucketName: "synthetic", objectKey: key, versionId: "opaque-version",
  sizeBytes: 7, sha256: "synthetic", contentType: "image/jpeg", metadataClean: true, verifiedAt: "synthetic",
});
async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async ctx => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(7)]));
    const pendingId = await ctx.storage.store(new Blob([new Uint8Array(5)]));
    const mediaId = await ctx.db.insert("media", {
      vaultOwnerId: "opaque-owner", type: "photo", title: "Synthetic placeholder", description: "Excluded text",
      personIds: [], createdAt: 1, updatedAt: 1, storageId, sizeBytes: 7,
      b2Original: object("opaque-1"), b2Renditions: { tiny: object("opaque-2"), medium: object("opaque-3"), large: object("opaque-4", "public") },
      replacedB2Files: [{ replacedAt: 1, original: object("opaque-5"), renditions: { tiny: object("opaque-6"), medium: object("opaque-7"), large: object("opaque-8") } }],
    });
    await ctx.db.insert("media", { type: "document", title: "Synthetic placeholder", personIds: [], storageId, sizeBytes: 7, createdAt: 1, updatedAt: 1 });
    const session = { vaultOwnerId: "opaque-owner", ref: "opaque-ref", sourceKind: "person" as const,
      state: "uploaded" as const, operationId: "opaque-operation", requestHash: "synthetic", title: "Synthetic placeholder",
      fileName: "excluded-placeholder", personIds: [], declaredContentType: "image/jpeg", declaredSizeBytes: 7,
      expectedSha256: "synthetic", objectKey: "opaque-root/original", relayTokenHash: "synthetic", createdAt: 1, expiresAt: 2 };
    await ctx.db.insert("mediaUploadSessions", session);
    // Saved originals/history own the rows even while session receipts remain.
    await ctx.db.insert("mediaUploadSessions", { ...session, ref: "opaque-linked", operationId: "opaque-linked", objectKey: "opaque-5", mediaId, state: "ready" });
    const reservation = { ownerId: "opaque-owner", operationId: "opaque-reservation", bytes: 5, day: "synthetic", source: "web", status: "reserved" as const, expiresAt: 2 };
    await ctx.db.insert("uploadReservations", { ...reservation, storageId: pendingId });
    await ctx.db.insert("uploadReservations", { ...reservation, operationId: "opaque-duplicate", storageId: pendingId });
    await ctx.db.insert("uploadReservations", { ...reservation, operationId: "opaque-saved", storageId });
    await ctx.db.insert("uploadReservations", { ...reservation, operationId: "opaque-capacity" });
    return { mediaId, storageId, pendingId };
  });
}
async function scan(t: ReturnType<typeof convexTest>, limit: number) {
  let cursor: string | null = null;
  const rows = [];
  for (let n = 0; n < 100; n++) {
    const p = await t.query(internal.storageCheck.manifestPage, { cursor, limit });
    rows.push(...p.rows);
    if (p.isDone) return { rows, revision: p.revision };
    cursor = p.nextCursor;
  }
  throw new Error("Paging did not finish");
}
test("every reference kind is paged once, with only allowlisted fields", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const one = await scan(t, 1);
  const many = await scan(t, 100);
  expect(one).toEqual(many);
  expect(one.rows).toHaveLength(14);
  expect(new Set(one.rows.map(r => JSON.stringify([r.store, r.key ?? r.storageId, r.versionId]))).size).toBe(14);
  expect(one.rows.filter(r => r.role === "retained")).toHaveLength(4);
  expect(one.rows.filter(r => r.role === "public")).toMatchObject([{ ownerRef: null, store: "b2-public" }]);
  for (const row of one.rows) {
    expect(Object.keys(row).sort()).toEqual(["store", "bucketRole", row.store === "convex" ? "storageId" : "key", "versionId", "expectedBytes", "ownerRef", "recordRef", "role", "state"].sort());
  }
  expect(JSON.stringify(one.rows)).not.toMatch(/Synthetic placeholder|Excluded text|excluded-placeholder/);
});
test("two complete revisions detect a write to a record already passed mid-run", async () => {
  const t = convexTest(schema, modules);
  const { mediaId } = await seed(t);
  const before = await scan(t, 1);
  const first = await t.query(internal.storageCheck.manifestPage, { cursor: null, limit: 100 });
  await t.run(ctx => ctx.db.patch(mediaId, { b2Original: object("opaque-replacement"), updatedAt: 2 }));
  let page = first;
  while (!page.isDone) page = await t.query(internal.storageCheck.manifestPage, { cursor: page.nextCursor, limit: 100 });
  expect(page.revision).toBe(before.revision); // An earlier record needs a second pass.
  expect((await scan(t, 1)).revision).not.toBe(page.revision);
});
test("a new file during paging changes the completed revision", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const before = await scan(t, 1);
  const first = await t.query(internal.storageCheck.manifestPage, { cursor: null, limit: 100 });
  await t.run(ctx => ctx.db.insert("media", { type: "document", title: "Synthetic placeholder", personIds: [], b2Original: object("opaque-new"), createdAt: 2, updatedAt: 2 }));
  let page = first;
  while (!page.isDone) page = await t.query(internal.storageCheck.manifestPage, { cursor: page.nextCursor, limit: 100 });
  expect((await scan(t, 100)).revision).not.toBe(before.revision);
});
test("system storage pages contain ids and sizes only", async () => {
  const t = convexTest(schema, modules);
  const { storageId, pendingId } = await seed(t);
  let cursor: string | null = null;
  const rows = [];
  for (;;) {
    const p = await t.query(internal.storageCheck.convexStoragePage, { cursor, limit: 1 });
    rows.push(...p.rows);
    if (p.isDone) break;
    cursor = p.nextCursor;
  }
  expect(rows).toEqual([{ storageId, size: 7 }, { storageId: pendingId, size: 5 }]);
});
test("both functions are internal queries and have no application caller", () => {
  expect(manifestPage.isInternal).toBe(true);
  expect(manifestPage.isQuery).toBe(true);
  expect(convexStoragePage.isInternal).toBe(true);
  expect(convexStoragePage.isQuery).toBe(true);
  // Compile-time public API boundary, including website/admin and AI callers.
  // @ts-expect-error Internal modules are excluded from the public API.
  void api.storageCheck;
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "_generated") return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? walk(path) : /\.[jt]sx?$/.test(path) && !path.endsWith(".test.ts") ? [path] : [];
  });
  for (const dir of ["app", "convex", "lib", "components"]) {
    for (const path of walk(dir)) if (path !== "convex/storageCheck.ts") expect(readFileSync(path, "utf8")).not.toMatch(/storageCheck[.:/](manifestPage|convexStoragePage)/);
  }
});
test("limits and malformed cursors are rejected", async () => {
  const t = convexTest(schema, modules);
  for (const limit of [0, -1, 101, 1.5]) await expect(t.query(internal.storageCheck.manifestPage, { cursor: null, limit })).rejects.toThrow();
  await expect(t.query(internal.storageCheck.manifestPage, { cursor: "{}", limit: 1 })).rejects.toThrow();
});
