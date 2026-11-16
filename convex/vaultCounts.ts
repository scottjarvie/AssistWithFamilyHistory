/* eslint-disable @typescript-eslint/no-explicit-any */
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
const BUILD = "vaultCounts:v1";

// An ascending negative timestamp index retains full numeric precision and the
// implicit ascending _creationTime tie-break of the original stable JS sort.
export function researchOrderTime(row: {updatedAt: number}) {
  return -row.updatedAt;
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
export async function syncCount(ctx: Pick<MutationCtx, "db">, table: CountTable, id: string, row: any) {
  const old = await ctx.db.query("vaultCountMembers").withIndex("by_record", q => q.eq("recordId", id)).unique();
  const next = contribution(table, row);
  if ((!old && !next) || (old && next && old.owner === next.owner && JSON.stringify(old.keys) === JSON.stringify(next.keys))) return;
  const owners = new Set([old?.owner, next?.owner].filter((owner): owner is string => owner !== undefined));
  for (const owner of owners) {
    const counter = await ctx.db.query("vaultCounts").withIndex("by_owner_table", q => q.eq("vaultOwnerId", owner).eq("table", table)).unique();
    const counts: Record<string, number> = {...counter?.counts};
    if (old?.owner === owner) for (const key of old.keys) counts[key] = (counts[key] ?? 0) - 1;
    if (next?.owner === owner) for (const key of next.keys) counts[key] = (counts[key] ?? 0) + 1;
    if (Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid vault counter; source transaction rolled back");
    if (counter) await ctx.db.patch(counter._id, {counts});
    else await ctx.db.insert("vaultCounts", {vaultOwnerId: owner, table, counts});
  }
  if (next) {
    const value = {recordId: id, table, owner: next.owner, keys: next.keys};
    if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert("vaultCountMembers", value);
  } else if (old) await ctx.db.delete(old._id);
}

export async function countsReady(ctx: Pick<QueryCtx, "db">) {
  return !!(await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique())?.complete;
}
export async function ownerCounts(ctx: Pick<QueryCtx, "db">, owner: string) {
  const rows = await ctx.db.query("vaultCounts").withIndex("by_owner_table", q => q.eq("vaultOwnerId", owner)).collect();
  return Object.fromEntries(rows.map(row => [row.table, row.counts])) as Partial<Record<CountTable, Record<string, number>>>;
}

// One restartable page per transaction, bounded by both documents and source bytes.
// Cursor and contributions commit atomically. Do not reset state/counters by hand.
export const backfillStep = internalMutation({args: {}, handler: async ctx => {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique();
  if (state?.complete) return true;
  const position: {tableIndex: number; cursor: string | null} = state?.cursor ? JSON.parse(state.cursor) : {tableIndex: 0, cursor: null};
  const table = COUNT_TABLES[position.tableIndex];
  const result = await ctx.db.query(table).paginate({cursor: position.cursor, numItems: 100, maximumRowsRead: 100, maximumBytesRead: 500_000});
  for (const row of result.page) await syncSourceCount(ctx, table, String(row._id), row);
  if (result.isDone) { position.tableIndex++; position.cursor = null; } else position.cursor = result.continueCursor;
  const complete = position.tableIndex === COUNT_TABLES.length;
  const value = {table: BUILD, cursor: complete ? null : JSON.stringify(position), complete};
  if (state) await ctx.db.replace(state._id, value); else await ctx.db.insert("searchBuildState", value);
  return complete;
}});
export const backfillStatus = internalQuery({args: {}, handler: async ctx => {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique();
  const position = state?.cursor ? JSON.parse(state.cursor) as {tableIndex: number} : null;
  return {complete: state?.complete ?? false, table: state?.complete ? null : COUNT_TABLES[position?.tableIndex ?? 0]};
}});
export const backfill = internalAction({args: {}, handler: async (ctx): Promise<{complete: boolean}> => {
  const until = Date.now() + 90_000;
  do { if (await ctx.runMutation(internal.vaultCounts.backfillStep, {})) return {complete: true}; } while (Date.now() < until);
  return {complete: false};
}});
export const read = internalQuery({args: {vaultOwnerId: v.string()}, handler: async (ctx, args) => ({complete: await countsReady(ctx), counts: await ownerCounts(ctx, args.vaultOwnerId)})});
