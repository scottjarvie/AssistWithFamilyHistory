import { internal } from "./_generated/api";
import { authorizeTenantAction, authorizeTenantMutation } from "./access";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isAdminUser } from "../lib/auth/admin";
import { siteDefaults } from "../lib/media/siteDefaults";

import {
  LIMIT_NAMES, checkCommit, applyStoredAddition, storageSummary, storageLine, effectiveFileCap, checkFileSize, validateFileCaps, 
  applyCommit,
  applyDownload,
  applyRelease,
  applyReserve,
  applyStoredRemoval,
  batchVerdict,
  checkDownload,
  checkUpload,
  effectiveLimits,
  emptyCounters,
  pressureBp,
  rollBuckets,
  usageLimitError,
  validateLimits,
  type EffectiveLimits,
  type Enforcement,
  type LimitName,
  type RequestTooLarge,
  type UsageCounters,
  type UsageLimitError,
  type UsageLimits,
} from "./lib/usageLimits/core";
import { enforcementValidator, limitPatchValidator, nullableLimitPatch } from "./usageLimitsSchema";

/**
 * Per-owner upload and usage limits.
 *
 * Only file bytes and file-upload counts are limited; text and records never are.
 * Every check runs inside the mutation that would write, so a refusal writes nothing.
 * With no settings row the family defaults apply with enforcement off: nothing is
 * ever refused until an operator turns it on. AI connections are never touched — an
 * over-limit upload gets the same friendly refusal the website shows.
 */

export type UploadSource = "web" | "mcp";
/** What the upload row remembers so commit or release can return the held room. */
export type Reservation = { usageReservedBytes?: number; usageReservedDay?: string };

const RECOMPUTE_PAGE = 100;
const ADMIN_ROW_LIMIT = 500;
const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Ctx = QueryCtx | MutationCtx;

async function siteSettings(ctx: Ctx) {
  return await ctx.db.query("usageLimitSettings").withIndex("by_key", (q) => q.eq("key", "site")).unique();
}

async function overrideFor(ctx: Ctx, ownerId: string) {
  return await ctx.db.query("usageLimitOverrides").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).unique();
}

export async function limitsFor(ctx: Ctx, ownerId: string): Promise<EffectiveLimits> {
  return effectiveLimits(await siteSettings(ctx), await overrideFor(ctx, ownerId), planFor(ownerId));
}

async function counterRow(ctx: Ctx, ownerId: string) {
  return await ctx.db.query("usageCounters").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).unique();
}

const countersOf = (row: Doc<"usageCounters">): UsageCounters => ({
  storedBytes: row.storedBytes,
  reservedBytes: row.reservedBytes,
  inFlight: row.inFlight,
  hourKey: row.hourKey,
  hourUploads: row.hourUploads,
  dayKey: row.dayKey,
  dayUploads: row.dayUploads,
  dayUploadBytes: row.dayUploadBytes,
  dayDownloadBytes: row.dayDownloadBytes,
});

/** Whether this owner already has files that a fresh counter would not know about. */
async function hasStoredHistory(ctx: Ctx, ownerId: string): Promise<boolean> {
  const attachment = await ctx.db.query("media")
    .withIndex("by_owner", (q) => q.eq("vaultOwnerId", ownerId)).first();
  return attachment !== null;
}

async function loadCounters(ctx: MutationCtx, ownerId: string, now: number) {
  const row = await counterRow(ctx, ownerId);
  return { row, counters: rollBuckets(row ? countersOf(row) : emptyCounters(now), now) };
}

async function saveCounters(
  ctx: MutationCtx,
  ownerId: string,
  row: Doc<"usageCounters"> | null,
  counters: UsageCounters,
  now: number,
  storedChanged: boolean,
) {
  if (row) {
    await ctx.db.patch(row._id, { ...counters, revision: row.revision + (storedChanged ? 1 : 0), updatedAt: now });
    return;
  }
  // Counting starts now. Owners with earlier files stay "not counted yet" until a recompute.
  const ready = !(await hasStoredHistory(ctx, ownerId));
  await ctx.db.insert("usageCounters", { ownerId, ...counters, ready, revision: 1, updatedAt: now });
}

/** Owners whose earlier files are not counted yet are never refused: their stored total is unknown. */
async function modeFor(ctx: MutationCtx, enforcement: Enforcement, row: Doc<"usageCounters"> | null, ownerId: string): Promise<Enforcement> {
  if (enforcement !== "on") return enforcement;
  const ready = row ? row.ready : !(await hasStoredHistory(ctx, ownerId));
  return ready ? "on" : "warn";
}

export class UsageLimitRefusal extends ConvexError<{ code: "usage_limit_reached"; message: string; usage: UsageLimitError }> {}

function refuse(error: UsageLimitError): never {
  throw new UsageLimitRefusal({ code: "usage_limit_reached", message: error.message, usage: error });
}

/** The structured limit inside an error thrown by this module, if it is one. */
export function usageRefusalOf(error: unknown): UsageLimitError | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as { code?: string; usage?: UsageLimitError } | undefined;
  return data?.code === "usage_limit_reached" && data.usage ? data.usage : null;
}

async function logEvent(
  ctx: MutationCtx,
  ownerId: string,
  mode: Enforcement,
  source: string,
  r: { limit: string; used: number; cap: number; requested: number },
  now: number,
) {
  await ctx.db.insert("usageLimitEvents", {
    ownerId, at: now, mode, source, limit: r.limit, used: r.used, cap: r.cap, requested: r.requested,
  });
}

/**
 * Hold room for one upload before its bytes are kept. Throws `usage_limit_reached`
 * when enforcement is on and a limit would be broken; otherwise records the
 * would-have-refused event and continues. `countUpload: false` re-holds an upload
 * that was already counted (a retry reopening its own expired slot).
 */
export async function reserveUpload(
  ctx: MutationCtx,
  ownerId: string,
  bytes: number,
  opts: { source: UploadSource; countUpload?: boolean },
): Promise<{ reservation: Required<Reservation>; warning: UsageLimitError | null }> {
  const now = Date.now();
  const { row, counters } = await loadCounters(ctx, ownerId, now);
  const { limits, enforcement } = await limitsFor(ctx, ownerId);
  const refusal = checkUpload(counters, limits, bytes, now, { countUpload: opts.countUpload });
  let warning: UsageLimitError | null = null;
  if (refusal) {
    const mode = await modeFor(ctx, enforcement, row, ownerId);
    if (mode === "on") refuse(usageLimitError(refusal));
    await logEvent(ctx, ownerId, mode, opts.source, refusal, now);
    if (mode === "warn") warning = usageLimitError(refusal);
  }
  const next = applyReserve(counters, bytes, { countUpload: opts.countUpload });
  await saveCounters(ctx, ownerId, row, next, now, false);
  return { reservation: { usageReservedBytes: bytes, usageReservedDay: next.dayKey }, warning };
}

/** The file was kept: count its actual size and return what was held. */
export async function commitUpload(ctx: MutationCtx, ownerId: string, reservation: Reservation, actualBytes: number) {
  const now = Date.now();
  const { row, counters } = await loadCounters(ctx, ownerId, now);
  const effective = await limitsFor(ctx, ownerId);
  const refusal = checkCommit(counters, effective.limits, reservation.usageReservedBytes ?? 0, actualBytes);
  if (refusal) {
    const mode = await modeFor(ctx, effective.enforcement, row, ownerId);
    if (mode === "on") refuse(usageLimitError(refusal));
    await logEvent(ctx, ownerId, mode, "finish", refusal, now);
  }
  const next = reservation.usageReservedBytes === undefined
    // Started before limits were deployed: nothing was held, only the stored total grows.
    ? { ...counters, storedBytes: counters.storedBytes + actualBytes }
    : applyCommit(counters, reservation.usageReservedBytes, actualBytes, reservation.usageReservedDay === counters.dayKey);
  await saveCounters(ctx, ownerId, row, next, now, true);
}

/** The upload ended without a kept file: give the held room back. */
export async function releaseUpload(ctx: MutationCtx, ownerId: string, reservation: Reservation) {
  if (reservation.usageReservedBytes === undefined) return;
  const now = Date.now();
  const { row, counters } = await loadCounters(ctx, ownerId, now);
  if (!row) return;
  const next = applyRelease(counters, reservation.usageReservedBytes, reservation.usageReservedDay === counters.dayKey);
  await saveCounters(ctx, ownerId, row, next, now, false);
}

/** Stored originals were deleted from storage. */
export async function removeStoredBytes(ctx: MutationCtx, ownerId: string, bytes: number) {
  if (bytes <= 0) return;
  const now = Date.now();
  const { row, counters } = await loadCounters(ctx, ownerId, now);
  if (!row) return;
  await saveCounters(ctx, ownerId, row, applyStoredRemoval(counters, bytes), now, true);
}

/** Count bytes handed to the owner or their AI. Download limits stay at warn (design doc, open question). */
export async function chargeDownload(ctx: MutationCtx, ownerId: string, bytes: number, source: UploadSource) {
  if (bytes <= 0) return;
  const now = Date.now();
  const { row, counters } = await loadCounters(ctx, ownerId, now);
  const { limits, downloadEnforcement } = await limitsFor(ctx, ownerId);
  const over = checkDownload(counters, limits, bytes, now);
  if (over && downloadEnforcement !== "off" && counters.dayDownloadBytes <= limits.downloadBytesPerDay) {
    // One event when the budget is first crossed today, not one per file after it.
    await logEvent(ctx, ownerId, downloadEnforcement, source, over, now);
  }
  await saveCounters(ctx, ownerId, row, applyDownload(counters, bytes), now, false);
}

export const chargeDownloadInternal = internalMutation({
  args: { ownerId: v.string(), bytes: v.number() },
  handler: async (ctx, args) => {
    await chargeDownload(ctx, args.ownerId, args.bytes, "mcp");
  },
});

/* -------------------------------------------------------------------------- */
/* Per-request size limits for AI batch writes                                */
/* -------------------------------------------------------------------------- */

/**
 * Check one AI write call from its sizes. Follows the same enforcement switch:
 * off records an event, warn lets it through, on refuses before anything is written.
 */
export const checkWriteRequest = internalMutation({
  args: { ownerId: v.string(), tool: v.string(), items: v.number(), bytes: v.number() },
  handler: async (ctx, args): Promise<RequestTooLarge | null> => {
    const { limits, enforcement } = await limitsFor(ctx, args.ownerId);
    const verdict = batchVerdict({ items: args.items, bytes: args.bytes }, limits);
    if (!verdict) return null;
    await logEvent(ctx, args.ownerId, enforcement, `mcp:${args.tool}`.slice(0, 80), { limit: verdict.limit, used: verdict.got, cap: verdict.max, requested: 0 }, Date.now());
    return enforcement === "on" ? verdict : null;
  },
});

/* -------------------------------------------------------------------------- */
/* Recompute and dry run (backfill is a separate, reviewed step)              */
/* -------------------------------------------------------------------------- */

const STORED_TABLES = ["media", "mediaUploadSessions"] as const;

async function storedPage(ctx: Ctx, table: (typeof STORED_TABLES)[number], ownerId: string, cursor: string | null) {
  if(table==="mediaUploadSessions") {
    const page=await ctx.db.query("mediaUploadSessions").withIndex("by_owner",q=>q.eq("vaultOwnerId",ownerId)).paginate({numItems:RECOMPUTE_PAGE,cursor});
    return {bytes:page.page.reduce((n,r)=>n+(r.orphanedBytes ?? 0),0),files:page.page.length,cursor:page.continueCursor,isDone:page.isDone};
  }
  // Every retained original and display copy counts, including replacements.
  const page = await ctx.db.query(table).withIndex("by_owner", (q) => q.eq("vaultOwnerId", ownerId))
    .paginate({ numItems: RECOMPUTE_PAGE, cursor });
  const sizes=await Promise.all(page.page.map(async row=>{const stored=row.storageId ? await ctx.db.system.get(row.storageId) : null;return mediaBytes(row) - (row.storageId ? row.sizeBytes ?? 0 : 0) + (stored?.size ?? 0);}));
  return {
    bytes: sizes.reduce((sum, bytes) => sum + bytes, 0),
    files: page.page.length,
    cursor: page.continueCursor,
    isDone: page.isDone,
  };
}

/** Read-only preflight: page each table and sum what a recompute would count. */
export const dryRunPage = internalQuery({
  args: { ownerId: v.string(), table: v.union(v.literal("media"),v.literal("mediaUploadSessions")), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => await storedPage(ctx, args.table, args.ownerId, args.cursor),
});

/**
 * One bounded page of an owner's stored-bytes recompute. Repeat until done.
 * A stored-bytes change during the recompute bumps the revision and restarts it,
 * and the final write shares the transaction of its last read.
 */
export const recomputeStep = internalMutation({
  args: { ownerId: v.string() },
  handler: async (ctx, args): Promise<{ done: boolean; restarts: number }> => {
    const now = Date.now();
    let row = await counterRow(ctx, args.ownerId);
    if (!row) {
      const id = await ctx.db.insert("usageCounters", { ownerId: args.ownerId, ...emptyCounters(now), ready: false, revision: 1, updatedAt: now });
      row = (await ctx.db.get(id))!;
    }
    const repair = row.repair ?? { phase: 0, cursor: null, bytes: 0, revision: row.revision, restarts: 0 };
    if (repair.revision !== row.revision) {
      await ctx.db.patch(row._id, { repair: { phase: 0, cursor: null, bytes: 0, revision: row.revision, restarts: repair.restarts + 1 } });
      return { done: false, restarts: repair.restarts + 1 };
    }
    const page = await storedPage(ctx, STORED_TABLES[repair.phase], args.ownerId, repair.cursor);
    const bytes = repair.bytes + page.bytes;
    if (!page.isDone) {
      await ctx.db.patch(row._id, { repair: { ...repair, cursor: page.cursor, bytes } });
      return { done: false, restarts: repair.restarts };
    }
    if (repair.phase + 1 < STORED_TABLES.length) {
      await ctx.db.patch(row._id, { repair: { ...repair, phase: repair.phase + 1, cursor: null, bytes } });
      return { done: false, restarts: repair.restarts };
    }
    await ctx.db.patch(row._id, { storedBytes: bytes, ready: true, repair: undefined, revision: row.revision + 1, updatedAt: now });
    return { done: true, restarts: repair.restarts };
  },
});

/* -------------------------------------------------------------------------- */
/* Operator page: uploads and storage                                         */
/* -------------------------------------------------------------------------- */

/** The Accounts tab identifies people by account ID; usage uses the same ID, shortened. */
const labelOf = (ownerId: string) => `Account …${ownerId.slice(-8)}`;

/**
 * Same gate as every admin read here: the ADMIN_USER_IDS allowlist on the
 * deployment, never an argument. Reads answer null to everyone else; writes refuse.
 */
async function adminSubject(ctx: QueryCtx): Promise<string | null> {
  const subject = (await ctx.auth.getUserIdentity())?.subject;
  return isAdminUser(subject) ? subject! : null;
}
async function requireAdmin(ctx: QueryCtx): Promise<string> {
  const subject = await adminSubject(ctx);
  if (!subject) throw new ConvexError("Not found.");
  return subject;
}

export const adminOverviewInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await adminSubject(ctx))) return null;
    const now = Date.now();
    const settings = await siteSettings(ctx);
    const site = effectiveLimits(settings);
    const rows = await ctx.db.query("usageCounters").take(ADMIN_ROW_LIMIT + 1);
    const overrides = await ctx.db.query("usageLimitOverrides").take(ADMIN_ROW_LIMIT);
    const overrideBy = new Map(overrides.map((row) => [row.ownerId, row]));
    const labels = new Map(rows.map((row) => [row.ownerId, labelOf(row.ownerId)]));
    const byCounter = new Map(rows.map((row) => [String(row._id), labelOf(row.ownerId)]));
    const people = rows.slice(0, ADMIN_ROW_LIMIT).map((row) => {
      const override = overrideBy.get(row.ownerId) ?? null;
      const effective = effectiveLimits(settings, override, planFor(row.ownerId));
      const counters = rollBuckets(countersOf(row), now);
      return {
        id: row._id,
        label: labelOf(row.ownerId),
        ready: row.ready,
        counters,
        limits: effective.limits,
        enforcement: effective.enforcement,
        pressureBp: row.ready ? pressureBp(counters, effective.limits) : 0,
        override: override
          ? { ...Object.fromEntries(LIMIT_NAMES.filter((name) => override[name] !== undefined).map((name) => [name, override[name]])), enforcement: override.enforcement, reason: override.reason }
          : null,
      };
    }).sort((a, b) => b.pressureBp - a.pressureBp || b.counters.storedBytes - a.counters.storedBytes);
    const events = (await ctx.db.query("usageLimitEvents").withIndex("by_at", (q) => q.gt("at", now - EVENT_WINDOW_MS)).order("desc").take(50))
      .map((event) => ({ id: event._id, at: event.at, label: labels.get(event.ownerId) ?? "An account not counted yet", limit: event.limit, mode: event.mode, source: event.source, used: event.used, cap: event.cap }));
    const audit = (await ctx.db.query("usageLimitAudit").withIndex("by_at").order("desc").take(50))
      .map((entry) => ({ id: entry._id, at: entry.at, target: entry.target === "site" ? "Site" : byCounter.get(entry.target) ?? "An account", field: entry.field, before: entry.before, after: entry.after, reason: entry.reason }));
    return {
      site: { limits: site.limits, enforcement: site.enforcement, downloadEnforcement: site.downloadEnforcement, saved: settings !== null },
      people,
      truncated: rows.length > ADMIN_ROW_LIMIT,
      events,
      audit,
    };
  },
});

type LimitPatch = Partial<Record<LimitName, number | null>>;

function cleanPatch(patch: LimitPatch): LimitPatch {
  const values = Object.fromEntries(Object.entries(patch).filter(([key, value]) => LIMIT_NAMES.includes(key as LimitName) && value !== null)) as Partial<UsageLimits>;
  const problems = validateLimits(values);
  if (problems.length) throw new ConvexError(problems.join("; "));
  return patch;
}

const reasonOf = (reason: string) => {
  const trimmed = reason.trim();
  if (!trimmed) throw new ConvexError("Say why the limit is changing.");
  return trimmed.slice(0, 300);
};


export const adminSetSiteLimits = mutation({
  args: { limits: limitPatchValidator, enforcement: v.optional(enforcementValidator), downloadEnforcement: v.optional(enforcementValidator), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await authorizeTenantMutation(ctx,"usageLimits.admin",actor);
    const reason = reasonOf(args.reason);
    cleanPatch(args.limits);
    for (const table of [args.limits.planStoredBytes, args.limits.maxFileBytes]) { if (table && validateFileCaps(table).length) throw new ConvexError("Invalid byte table"); }
    const now = Date.now();
    const existing = await siteSettings(ctx);
    const before = effectiveLimits(existing);
    const changes: Array<{ field: string; before?: number | string; after?: number | string }> = [];
    for (const name of [...LIMIT_NAMES, "planStoredBytes", "maxFileBytes"] as const) {
      const after = args.limits[name];
      if (after !== undefined && JSON.stringify(after) !== JSON.stringify(name === "planStoredBytes" || name === "maxFileBytes" ? existing?.[name] : before.limits[name])) changes.push({ field: name, before: JSON.stringify(existing?.[name]), after: typeof after === "number" ? after : JSON.stringify(after) });
    }
    if (args.enforcement && args.enforcement !== before.enforcement) changes.push({ field: "enforcement", before: before.enforcement, after: args.enforcement });
    if (args.downloadEnforcement && args.downloadEnforcement !== (existing?.downloadEnforcement ?? "warn")) {
      changes.push({ field: "downloadEnforcement", before: existing?.downloadEnforcement ?? "warn", after: args.downloadEnforcement });
    }
    if (!changes.length) return { changed: 0 };
    const fields = {
      ...args.limits,
      enforcement: args.enforcement ?? existing?.enforcement ?? "off",
      downloadEnforcement: args.downloadEnforcement ?? existing?.downloadEnforcement,
      updatedAt: now,
      updatedBy: actor,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("usageLimitSettings", { key: "site", ...fields });
    for (const change of changes) await ctx.db.insert("usageLimitAudit", { at: now, actor, target: "site", reason, ...change });
    return { changed: changes.length };
  },
});

export const adminSetPersonLimits = mutation({
  args: { counterId: v.id("usageCounters"), limits: nullableLimitPatch, enforcement: v.optional(v.union(enforcementValidator, v.null())), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await authorizeTenantMutation(ctx,"usageLimits.admin",actor);
    const reason = reasonOf(args.reason);
    const patch = cleanPatch(args.limits as LimitPatch);
    const counter = await ctx.db.get(args.counterId);
    if (!counter) throw new ConvexError("That person is not counted yet.");
    const now = Date.now();
    const existing = await overrideFor(ctx, counter.ownerId);
    const changes: Array<{ field: string; before?: number | string; after?: number | string }> = [];
    const next: Record<string, number | string | Record<string,number> | undefined> = {};
    for(const name of ["planStoredBytes","maxFileBytes"] as const) {
      if(!(name in args.limits)) continue;
      const value=args.limits[name] ?? undefined;
      if(value && validateFileCaps(value).length) throw new ConvexError("Invalid byte table");
      next[name]=value;
      changes.push({field:name,before:JSON.stringify(existing?.[name]),after:JSON.stringify(value)});
    }
    for (const name of LIMIT_NAMES) {
      if (!(name in patch)) continue;
      const after = patch[name] ?? undefined;
      if (after !== existing?.[name]) changes.push({ field: name, before: existing?.[name], after });
      next[name] = after;
    }
    if (args.enforcement !== undefined) {
      const after = args.enforcement ?? undefined;
      if (after !== existing?.enforcement) changes.push({ field: "enforcement", before: existing?.enforcement, after });
      next.enforcement = after;
    }
    if (!changes.length) return { changed: 0 };
    const target = String(counter._id);
    if (existing) await ctx.db.patch(existing._id, { ...next, reason, updatedAt: now, updatedBy: actor });
    else await ctx.db.insert("usageLimitOverrides", { ownerId: counter.ownerId, ...next, reason, updatedAt: now, updatedBy: actor });
    for (const change of changes) await ctx.db.insert("usageLimitAudit", { at: now, actor, target, reason, ...change });
    return { changed: changes.length };
  },
});

export const planFor = (ownerId: string) => isAdminUser(ownerId) ? "pro" : "free";
export function mediaBytes(row: Doc<"media">): number {
  const manifests = (x: {original: {sizeBytes:number}; renditions?: {tiny:{sizeBytes:number};medium:{sizeBytes:number};large:{sizeBytes:number}}}) => x.original.sizeBytes + Object.values(x.renditions ?? {}).reduce((n,r)=>n+r.sizeBytes,0);
  return (row.storageId ? row.sizeBytes ?? 0 : 0) + (row.b2Original ? manifests({original:row.b2Original,renditions:row.b2Renditions}) : 0) + (row.replacedB2Files ?? []).reduce((n,x)=>n+manifests(x),0);
}
export async function summaryFor(ctx: Ctx, ownerId: string) {
  const row = await counterRow(ctx,ownerId);
  const summary = storageSummary(row ?? emptyCounters(Date.now()), await limitsFor(ctx,ownerId), {ready:row?.ready ?? false});
  return {...summary,line:storageLine(summary)};
}
export const ownerStorageInternal = internalQuery({args:{},handler:async(ctx)=>{
  const vaultOwnerId=(await ctx.auth.getUserIdentity())?.subject;
  if(!vaultOwnerId) return null;
  return summaryFor(ctx,vaultOwnerId);
}});
export const storageInternal = internalQuery({args:{ownerId:v.string()},handler:(ctx,a)=>summaryFor(ctx,a.ownerId)});
export async function assertFileSize(ctx: Ctx, ownerId:string, kind:string, bytes:number) {
  if(!Number.isSafeInteger(bytes)||bytes<=0) throw new ConvexError("Invalid file size");
  const refusal=checkFileSize(kind,bytes,effectiveFileCap(kind,siteDefaults,await siteSettings(ctx),await overrideFor(ctx,ownerId)));
  if(refusal) throw new ConvexError(refusal);
}
export async function reserveOperation(ctx:MutationCtx,ownerId:string,operationId:string,bytes:number,source:UploadSource,kind:string) {
  await assertFileSize(ctx,ownerId,kind,bytes);
  const prior=await ctx.db.query("uploadReservations").withIndex("by_owner_operation",q=>q.eq("ownerId",ownerId).eq("operationId",operationId)).unique();
  if(prior) {
    if(prior.bytes!==bytes||prior.source!==source) throw new ConvexError("Operation conflict");
    if(prior.status==="committed" || (prior.status==="reserved" && prior.expiresAt>Date.now())) return prior;
    if(prior.status==="released") {
      const {reservation}=await reserveUpload(ctx,ownerId,bytes,{source,countUpload:false});
      await ctx.db.patch(prior._id,{status:"reserved",day:reservation.usageReservedDay,expiresAt:Date.now()+2*60*60*1000,storageId:undefined});
      return (await ctx.db.get(prior._id))!;
    }
    throw new ConvexError("Upload expired; begin with a new operation ID");
  }
  const {reservation}=await reserveUpload(ctx,ownerId,bytes,{source});
  const id=await ctx.db.insert("uploadReservations",{ownerId,operationId,bytes,day:reservation.usageReservedDay,source,status:"reserved",expiresAt:Date.now()+2*60*60*1000});
  return (await ctx.db.get(id))!;
}
export async function commitOperation(ctx:MutationCtx,ownerId:string,operationId:string|undefined,bytes:number) {
  const r=operationId ? await ctx.db.query("uploadReservations").withIndex("by_owner_operation",q=>q.eq("ownerId",ownerId).eq("operationId",operationId)).unique() : null;
  if(r?.status==="committed") return false;
  if(operationId && (!r||r.status!=="reserved")) throw new ConvexError("Upload reservation expired");
  await commitUpload(ctx,ownerId,r?{usageReservedBytes:r.bytes,usageReservedDay:r.day}:{},bytes);
  if(r) await ctx.db.patch(r._id,{status:"committed"});
  return true;
}
export async function releaseOperation(ctx:MutationCtx,ownerId:string,operationId:string) {
  const r=await ctx.db.query("uploadReservations").withIndex("by_owner_operation",q=>q.eq("ownerId",ownerId).eq("operationId",operationId)).unique();
  if(r?.status!=="reserved") return;
  await releaseUpload(ctx,ownerId,{usageReservedBytes:r.bytes,usageReservedDay:r.day});
  await ctx.db.patch(r._id,{status:"released"});
}
export async function addCopies(ctx:MutationCtx,ownerId:string,bytes:number) {
  const now=Date.now();const {row,counters}=await loadCounters(ctx,ownerId,now);
  await saveCounters(ctx,ownerId,row,applyStoredAddition(counters,bytes),now,true);
}

/** Release empty abandoned web sessions. Provider sessions release only after confirmed cleanup. */
export const expireReservations = internalMutation({args:{},handler:async(ctx)=>{
  const rows=await ctx.db.query("uploadReservations").withIndex("by_source_expiry",q=>q.eq("source","web").eq("status","reserved").lt("expiresAt",Date.now())).take(100);
  for(const row of rows) if(row.source==="web") { if(row.storageId) await ctx.storage.delete(row.storageId); await releaseOperation(ctx,row.ownerId,row.operationId); }
}});

export const ownerStorage = action({args:{},handler:async(ctx):Promise<(import("./lib/usageLimits/core").StorageSummary & {line:string})|null>=>{
 const vaultOwnerId=(await ctx.auth.getUserIdentity())?.subject;
 if(!vaultOwnerId) return null;
 await authorizeTenantAction(ctx,"usageLimits.ownerStorage",vaultOwnerId,e=>ctx.runMutation(internal.trustBoundary.recordShadowDenial,e));
 return ctx.runQuery(internal.usageLimits.ownerStorageInternal,{});
}});
export const adminOverview = action({args:{},handler:async(ctx):Promise<unknown>=>{
 const vaultOwnerId=(await ctx.auth.getUserIdentity())?.subject;
 if(!isAdminUser(vaultOwnerId))return null;
 await authorizeTenantAction(ctx,"usageLimits.adminOverview",vaultOwnerId,e=>ctx.runMutation(internal.trustBoundary.recordShadowDenial,e));
 return ctx.runQuery(internal.usageLimits.adminOverviewInternal,{});
}});

export async function fileCapsFor(ctx:Ctx,ownerId:string) {
 const site=await siteSettings(ctx),override=await overrideFor(ctx,ownerId);
 return Object.fromEntries(Object.keys(siteDefaults).map(kind=>[kind,effectiveFileCap(kind,siteDefaults,site,override)]));
}
export const fileCapsInternal=internalQuery({args:{ownerId:v.string()},handler:(ctx,a)=>fileCapsFor(ctx,a.ownerId)});

/** Preflight a complete AI batch in the same mutation as its records. */
export async function assertWriteBatch(ctx:MutationCtx,ownerId:string,tool:string,items:number,bytes:number) {
 const effective=await limitsFor(ctx,ownerId);
 const refusal=batchVerdict({items,bytes},effective.limits);
 if(!refusal)return;
 if(effective.enforcement==="on") throw new Error(`MCP_FAMILY_HISTORY_ERROR:${JSON.stringify(refusal)}`);
 await logEvent(ctx,ownerId,effective.enforcement,tool,{limit:refusal.limit,used:refusal.got,cap:refusal.max,requested:0},Date.now());
}
