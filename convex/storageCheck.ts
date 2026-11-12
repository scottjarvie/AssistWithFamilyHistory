import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/** Metadata only. A revision is a cumulative digest: compare COMPLETE passes.
 * Matching two complete revisions is required; intermediate digests are prefixes,
 * not a global write counter or a transactional snapshot across requests.
 */
type Row = {
  store: "b2-private" | "b2-public" | "convex";
  bucketRole: "private" | "public" | "convex";
  key?: string;
  storageId?: string;
  versionId: string | null;
  expectedBytes: number | null;
  ownerRef: string | null;
  recordRef: string;
  role: "original" | "copy" | "generated" | "session" | "retained" | "public";
  state: "live" | "archived" | "pending" | "deleting";
};
type Cursor = { phase: number; after: string | null; offset: number; revision: string };
const tables = ["media", "mediaUploadSessions", "uploadReservations"] as const;
const args = { cursor: v.union(v.string(), v.null()), limit: v.number() };
function limitOf(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be 1–100");
  return limit;
}
function cursorOf(value: string | null): Cursor {
  if (value === null) return { phase: 0, after: null, offset: 0, revision: "0" };
  const c = JSON.parse(value) as Cursor;
  if (!Number.isInteger(c.phase) || c.phase < 0 || c.phase >= tables.length ||
      !Number.isInteger(c.offset) || c.offset < 0 ||
      !(c.after === null || typeof c.after === "string") || !/^(0|[a-f0-9]{64})$/.test(c.revision)) {
    throw new Error("Invalid manifest cursor");
  }
  return c;
}
async function digest(previous: string, value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([previous, value]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
type B2 = NonNullable<Doc<"media">["b2Original"]>;
function b2(object: B2, owner: string | undefined, recordRef: string, role: Row["role"], state: Row["state"]): Row {
  const isPublic = object.bucketClass === "public";
  return { store: isPublic ? "b2-public" : "b2-private", bucketRole: object.bucketClass,
    key: object.objectKey, versionId: object.versionId, expectedBytes: object.sizeBytes,
    ownerRef: isPublic ? null : owner ?? null, recordRef, role: isPublic ? "public" : role, state };
}
function mediaRows(m: Doc<"media">): Row[] {
  const rows: Row[] = [];
  const state = m.mediaState === "deleting" ? "deleting" : m.mediaState === "deleted" ? "archived" : "live";
  if (m.storageId) rows.push({ store: "convex", bucketRole: "convex", storageId: m.storageId,
    versionId: null, expectedBytes: m.sizeBytes ?? null, ownerRef: m.vaultOwnerId ?? null,
    recordRef: m._id, role: "original", state });
  if (m.b2Original) rows.push(b2(m.b2Original, m.vaultOwnerId, m._id, "original", state));
  for (const copy of Object.values(m.b2Renditions ?? {})) rows.push(b2(copy, m.vaultOwnerId, m._id, "copy", state));
  for (const history of m.replacedB2Files ?? []) {
    rows.push(b2(history.original, m.vaultOwnerId, m._id, "retained", "archived"));
    for (const copy of Object.values(history.renditions ?? {})) rows.push(b2(copy, m.vaultOwnerId, m._id, "retained", "archived"));
  }
  return rows;
}
async function sessionRows(ctx: QueryCtx, s: Doc<"mediaUploadSessions">): Promise<Row[]> {
  const media = s.mediaId ? await ctx.db.get(s.mediaId) : null;
  const held = media ? mediaRows(media) : [];
  const keys = [s.objectKey];
  // Failed partial image finalization can leave copies without exact receipts.
  // Enumerate their deterministic slots with unknown versions/sizes, never zero.
  if ((s.state === "uploaded" || (s.orphanedBytes ?? 0) > 0) && s.declaredContentType.startsWith("image/")) {
    keys.push(...["tiny", "medium", "large"].map(slot => s.objectKey.replace(/\/original$/, `/${slot}`)));
  }
  return [...new Set(keys)].filter(key => !held.some(row => row.key === key)).map(key => ({
    store: "b2-private", bucketRole: "private", key, versionId: null,
    expectedBytes: key === s.objectKey ? s.declaredSizeBytes : null,
    ownerRef: s.vaultOwnerId, recordRef: s._id, role: "session",
    state: s.state === "failed" || s.state === "expired" ? "deleting" : "pending",
  }));
}
async function reservationRows(ctx: QueryCtx, r: Doc<"uploadReservations">): Promise<Row[]> {
  if (!r.storageId) return []; // A capacity hold alone does not identify stored bytes.
  const media = await ctx.db.query("media").withIndex("by_storage", q => q.eq("storageId", r.storageId)).first();
  if (media) return [];
  const first = await ctx.db.query("uploadReservations").withIndex("by_storage", q => q.eq("storageId", r.storageId)).first();
  if (first?._id !== r._id) return [];
  return [{ store: "convex", bucketRole: "convex", storageId: r.storageId,
    versionId: null, expectedBytes: r.bytes, ownerRef: r.ownerId, recordRef: r._id,
    role: "session", state: r.status === "released" ? "deleting" : "pending" }];
}

export const manifestPage = internalQuery({ args, handler: async (ctx, a) => {
  const limit = limitOf(a.limit);
  const c = cursorOf(a.cursor);
  // Exactly one source record per request, including empty-reference records.
  // Offset pages large retained histories without dropping their remaining rows.
  const options = { cursor: c.after, numItems: 1 };
  let rows: Row[];
  let next: string;
  let done: boolean;
  if (c.phase === 0) {
    const p = await ctx.db.query("media").order("asc").paginate(options);
    rows = p.page.flatMap(mediaRows);
    const media = p.page[0];
    if (media?.storageId) {
      const first = await ctx.db.query("media").withIndex("by_storage", q => q.eq("storageId", media.storageId)).first();
      if (first?._id !== media._id) rows = rows.filter(row => row.storageId !== media.storageId);
    }
    next = p.continueCursor; done = p.isDone;
  } else if (c.phase === 1) {
    const p = await ctx.db.query("mediaUploadSessions").order("asc").paginate(options);
    rows = p.page[0] ? await sessionRows(ctx, p.page[0]) : []; next = p.continueCursor; done = p.isDone;
  } else {
    const p = await ctx.db.query("uploadReservations").order("asc").paginate(options);
    rows = p.page[0] ? await reservationRows(ctx, p.page[0]) : []; next = p.continueCursor; done = p.isDone;
  }
  // Fold a whole record once so changing the requested limit does not change revision.
  if (c.offset === 0) c.revision = await digest(c.revision, [c.phase, rows]);
  const page = rows.slice(c.offset, c.offset + limit);
  if (c.offset + limit < rows.length) c.offset += limit;
  else { c.offset = 0; c.after = done ? null : next; if (done) c.phase++; }
  const isDone = c.phase === tables.length;
  return { rows: page, nextCursor: isDone ? null : JSON.stringify(c), isDone, revision: c.revision };
} });

export const convexStoragePage = internalQuery({ args, handler: async (ctx, a) => {
  const p = await ctx.db.system.query("_storage").order("asc").paginate({ cursor: a.cursor, numItems: limitOf(a.limit) });
  return { rows: p.page.map(row => ({ storageId: row._id, size: row.size })),
    nextCursor: p.isDone ? null : p.continueCursor, isDone: p.isDone };
} });
