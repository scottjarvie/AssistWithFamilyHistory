import {refreshPersonScore,refreshProvisionalScore} from "./personScores";
/* eslint-disable @typescript-eslint/no-explicit-any */
import {directPlaces,syncDirectPlaces,syncPlaceMediaConnection,refreshMediaAvailability} from "./placeCounts";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { syncSourceCount } from "./searchWrites";
import { internal } from "./_generated/api";

/** Source records only: never count derived tables, credentials or operational receipts. */
export const COUNT_TABLES = [
  "persons", "relationships", "events", "personEvents", "places", "sources", "citations",
  "citationLinks", "sourceFacts", "media", "contextItems", "importRuns", "researchTasks",
  "researchLog", "documents", "stories", "storyReviewEvents", "historicalContext",
  "researchChecks", "provisionalRelatives", "sourceContents", "recordPersonas", "topics", "connections",
] as const;
export type CountTable = typeof COUNT_TABLES[number];
export const BUILD = "vaultCounts:v6";
export const COUNTER_SHARDS = 32;
export function counterShard(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % COUNTER_SHARDS;
}

// An ascending negative timestamp index retains full numeric precision and the
// implicit ascending _creationTime tie-break of the original stable JS sort.
export function researchOrderTime(row: {updatedAt: number}) {
  return -row.updatedAt;
}

/** IEEE sortable keys preserve full numeric precision and stable creation ties,
 * while permitting a byte-bounded hydration loop to resume mid-candidate page. */
export function researchCursorKey(row:{updatedAt:number;_creationTime:number;_id:unknown}) {
 const ordered=(input:number)=>{const n=input===0?0:input;const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,n,false);const bits=data.getBigUint64(0,false);return ((bits>>63n)?(~bits&0xffffffffffffffffn):(bits^0x8000000000000000n)).toString(16).padStart(16,"0");};
 return `${ordered(-row.updatedAt)}:${ordered(row._creationTime)}:${row._id}`;
}

export function contribution(table: CountTable, row: any): {owner: string; keys: string[]} | null {
  // Match the original snapshot's by_owner range exactly, including its legacy
  // exclusion of rows without a stored owner. Zero is an archive timestamp too.
  if (!row || row.archivedAt !== undefined || !row.vaultOwnerId) return null;
  const keys = ["active"];
  if (table === "researchTasks" || table === "researchLog") keys.push(`status:${row.status}`);
  if (table === "provisionalRelatives") keys.push(`mergeState:${row.mergeState}`);
  if (table === "researchLog") {
    keys.push(`activity:${row.activityType}`, `author:${row.creationProvenance?.actorKind ?? "unattributed"}`);
  }
  return {owner: row.vaultOwnerId, keys};
}

/** Idempotent membership ledger makes backfill and concurrent normal writes commute.
 * Never subtract an unvisited legacy row. Once visited, its owner/archive/status
 * changes remove precisely the old contribution in the same source transaction. */
async function changeCounter(ctx: Pick<MutationCtx, "db">, owner: string, table: CountTable, shard: number | undefined, keys: string[], delta: number, touch: boolean) {
  const counter = shard === undefined
    ? await ctx.db.query("vaultCounts").withIndex("by_owner_table", q => q.eq("vaultOwnerId", owner).eq("table", table)).unique()
    : await ctx.db.query("vaultCounterShards").withIndex("by_owner_table_shard", q => q.eq("vaultOwnerId", owner).eq("table", table).eq("shard", shard)).unique();
  const counts: Record<string, number> = {...counter?.counts};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + delta;
  const revision = (counter?.revision ?? 0) + (touch ? 1 : 0);
  if (!Number.isSafeInteger(revision) || Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid vault counter; source transaction rolled back");
  if (counter) await ctx.db.patch(counter._id, {counts, revision});
  else if (shard === undefined) await ctx.db.insert("vaultCounts", {vaultOwnerId: owner, table, counts, revision});
  else await ctx.db.insert("vaultCounterShards", {vaultOwnerId: owner, table, shard, counts, revision});
}

export async function syncCount(ctx: Pick<MutationCtx, "db">, table: CountTable, id: string, row: any, touch = false) {
  const old = await ctx.db.query("vaultCountMembers").withIndex("by_record", q => q.eq("recordId", id)).unique();
  const next = contribution(table, row);
  const places=directPlaces(ctx,table,row);
  await syncDirectPlaces(ctx,id,old?.places??[],places);
  if(table==="connections")await syncPlaceMediaConnection(ctx,id,row);
  // A legacy media row may have active connection memberships before its own
  // counter ledger is visited. Refresh even when old/next contributions are null.
  if(table==="media"&&(!old||old.owner!==next?.owner||!next))await refreshMediaAvailability(ctx,id);
  const shard = counterShard(id);
  const same = (!old && !next) || !!(old && next && old.shard === shard && old.owner === next.owner && JSON.stringify(old.keys) === JSON.stringify(next.keys));
  if (same) {
    if (touch && next) await changeCounter(ctx, next.owner, table, shard, [], 0, true);
    if(old&&JSON.stringify(old.places??[])!==JSON.stringify(places))await ctx.db.patch(old._id,{places});
    return;
  }
  // A legacy unsharded membership is moved atomically. Backfill and normal
  // writes both use this path; no reset or approximate initial totals.
  if (old) await changeCounter(ctx, old.owner, table, old.shard, old.keys, -1, touch);
  if (next) await changeCounter(ctx, next.owner, table, shard, next.keys, 1, touch);
  if (next) {
    const value = {recordId: id, table, owner: next.owner, keys: next.keys, shard, places};
    if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert("vaultCountMembers", value);
  } else if (old) await ctx.db.delete(old._id);
}

export async function scopedReadsReady(ctx: Pick<QueryCtx, "db">) {
  return !!(await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "vaultCounts:v5")).unique())?.complete || !!(await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique())?.complete;
}
/** v5 adds memberships, not new count semantics: keep already migrated v4
 * Dashboard/Research/Places readers on their bounded paths during the upgrade. */
export async function countsReady(ctx: Pick<QueryCtx, "db">) {
  const v4 = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", "vaultCounts:v4")).unique();
  return !!v4?.complete || await scopedReadsReady(ctx);
}
export async function ownerTableCounter(ctx: Pick<QueryCtx, "db">, owner: string, table: CountTable | "personScores") {
  const shards = await ctx.db.query("vaultCounterShards").withIndex("by_owner_table_shard", q => q.eq("vaultOwnerId", owner).eq("table", table)).collect();
  const legacy = await ctx.db.query("vaultCounts").withIndex("by_owner_table", q => q.eq("vaultOwnerId", owner).eq("table", table)).unique();
  const counts: Record<string, number> = {};
  let revision = 0;
  for (const row of [...shards, ...(legacy ? [legacy] : [])]) {
    revision += row.revision ?? 0;
    for (const [key, n] of Object.entries(row.counts)) counts[key] = (counts[key] ?? 0) + n;
  }
  return {counts, revision};
}
export async function ownerCounts(ctx: Pick<QueryCtx, "db">, owner: string) {
  const [shards, legacy] = await Promise.all([
    ctx.db.query("vaultCounterShards").withIndex("by_owner_table_shard", q => q.eq("vaultOwnerId", owner)).collect(),
    ctx.db.query("vaultCounts").withIndex("by_owner_table", q => q.eq("vaultOwnerId", owner)).collect(),
  ]);
  const result: Partial<Record<CountTable, Record<string, number>>> = {};
  for (const row of [...shards, ...legacy]) {
    const counts = result[row.table as CountTable] ??= {};
    for (const [key, n] of Object.entries(row.counts)) counts[key] = (counts[key] ?? 0) + n;
  }
  return result;
}

// One restartable page per transaction, bounded by both documents and source bytes.
// Cursor and contributions commit atomically. Do not reset state/counters by hand.
export const backfillStep = internalMutation({args: {}, handler: async ctx => {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique();
  if (state?.complete) return true;
  const position: {tableIndex: number; cursor: string | null} = state?.cursor ? JSON.parse(state.cursor) : {tableIndex: 0, cursor: null};
  if(position.tableIndex >= COUNT_TABLES.length) {
    const phase=position.tableIndex-COUNT_TABLES.length;
    const result=await ctx.db.query(phase===0?"persons":"provisionalRelatives").paginate({cursor:position.cursor,numItems:1,maximumBytesRead:100_000});
    for(const row of result.page) {
      if(phase===0) await refreshPersonScore(ctx,row._id as import("./_generated/dataModel").Id<"persons">,true);
      else await refreshProvisionalScore(ctx,row._id as import("./_generated/dataModel").Id<"provisionalRelatives">);
    }
    if(result.isDone){position.tableIndex++;position.cursor=null;}else position.cursor=result.continueCursor;
    const complete=position.tableIndex===COUNT_TABLES.length+2;
    const value={table:BUILD,cursor:complete?null:JSON.stringify(position),complete};
    if(state)await ctx.db.replace(state._id,value);else await ctx.db.insert("searchBuildState",value);
    return complete;
  }
  const table = COUNT_TABLES[position.tableIndex];
  const result = await ctx.db.query(table).paginate({cursor: position.cursor, numItems: 100, maximumRowsRead: 100, maximumBytesRead: 500_000});
  for (const row of result.page) await syncSourceCount(ctx, table, String(row._id), row);
  if (result.isDone) { position.tableIndex++; position.cursor = null; } else position.cursor = result.continueCursor;
  if(position.tableIndex===COUNT_TABLES.length) {
    // All membership sources were visited. Release the prerequisite gates before
    // visiting scores so concurrent writes behind that cursor maintain them too.
    for(const table of ["vaultCounts:v5","mediaPeople"]) {
      const gate=await ctx.db.query("searchBuildState").withIndex("by_table",q=>q.eq("table",table)).unique();
      if(!gate)await ctx.db.insert("searchBuildState",{table,cursor:null,complete:true});
      else if(!gate.complete)await ctx.db.patch(gate._id,{complete:true,cursor:null});
    }
  }
  const complete = false;
  const value = {table: BUILD, cursor: complete ? null : JSON.stringify(position), complete};
  if (state) await ctx.db.replace(state._id, value); else await ctx.db.insert("searchBuildState", value);
  return complete;
}});
export const backfillStatus = internalQuery({args: {}, handler: async ctx => {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique();
  const position = state?.cursor ? JSON.parse(state.cursor) as {tableIndex: number} : null;
  return {build:BUILD,complete: state?.complete ?? false, table: state?.complete ? null : ([...COUNT_TABLES,"personScores","provisionalScores"])[position?.tableIndex ?? 0]};
}});
export const backfill = internalAction({args: {}, handler: async (ctx): Promise<{complete: boolean}> => {
  const until = Date.now() + 90_000;
  do { if (await ctx.runMutation(internal.vaultCounts.backfillStep, {})) return {complete: true}; } while (Date.now() < until);
  return {complete: false};
}});
export const read = internalQuery({args: {vaultOwnerId: v.string()}, handler: async (ctx, args) => ({complete: await countsReady(ctx), counts: await ownerCounts(ctx, args.vaultOwnerId)})});

/** Read-only, bounded drift diagnosis. Sum subtotal across pages only while
 * counter.revision is unchanged, otherwise restart. No automatic data repair. */
export const recountPage = internalQuery({args: {vaultOwnerId: v.string(), table: v.union(...COUNT_TABLES.map(table => v.literal(table))), cursor: v.union(v.string(), v.null())}, handler: async (ctx, args) => {
  if (!await countsReady(ctx)) throw new Error("Finish the counter backfill before auditing");
  const page = await ctx.db.query(args.table).withIndex("by_owner", q => q.eq("vaultOwnerId", args.vaultOwnerId))
    .paginate({cursor: args.cursor, numItems: 100, maximumRowsRead: 100, maximumBytesRead: 500_000});
  const subtotal: Record<string, number> = {};
  for (const row of page.page) for (const key of contribution(args.table, row)?.keys ?? []) subtotal[key] = (subtotal[key] ?? 0) + 1;
  const counter = await ownerTableCounter(ctx, args.vaultOwnerId, args.table);
  return {subtotal, counter: counter?.counts ?? {}, revision: counter?.revision ?? 0, continueCursor: page.continueCursor, isDone: page.isDone};
}});
