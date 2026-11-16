import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { countsReady, ownerTableCounter } from "./vaultCounts";
import { normalizeVaultOwnerId } from "./vaultCore";

const status = v.union(v.literal("todo"), v.literal("in_progress"), v.literal("blocked"), v.literal("done"));
const args = {vaultOwnerId: v.string(), cursor: v.union(v.string(), v.null())};
export type TaskWithPerson = Doc<"researchTasks"> & {person: Doc<"persons"> | null};
export type LogWithPerson = Doc<"researchLog"> & {person: Doc<"persons"> | null};

export type TaskPage = PaginationResult<TaskWithPerson> & {totals: Record<string, number>};
export type LogPage = PaginationResult<LogWithPerson> & {totals: Record<string, number>};

async function peopleForRows(ctx: QueryCtx, owner: string, ids: string[]) {
  const pairs = await Promise.all([...new Set(ids)].map(async id => {
    const personId = ctx.db.normalizeId("persons", id);
    const person = personId ? await ctx.db.get(personId) : null;
    return [id, person?.vaultOwnerId === owner && person.archivedAt === undefined ? person : null] as const;
  }));
  return new Map(pairs);
}

// Pages hydrate only people referenced by the returned rows, not the whole tree.
// Exactly one paginator in each query; a byte-split page may contain fewer than 50.
export const tasks = internalQuery({args: {...args, status: v.optional(status)}, handler: async (ctx, args): Promise<TaskPage> => {
  if (!await countsReady(ctx)) throw new Error("Research pages require vaultCounts backfill completion");
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  const range = args.status
    ? ctx.db.query("researchTasks").withIndex("by_owner_active_status_order", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined).eq("status", args.status!))
    : ctx.db.query("researchTasks").withIndex("by_owner_active_order", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined));
  const result = await range.paginate({cursor: args.cursor, numItems: 50, maximumRowsRead: 50, maximumBytesRead: 250_000});
  const people = await peopleForRows(ctx, owner, result.page.flatMap(row => row.personId ? [String(row.personId)] : []));
  const page: TaskWithPerson[] = result.page.map(row => ({...row, person: row.personId ? people.get(String(row.personId)) ?? null : null}));
  const counter = await ownerTableCounter(ctx, owner, "researchTasks");
  return {...result, page, totals: counter?.counts ?? {active: 0}};
}});
export const log = internalQuery({args, handler: async (ctx, args): Promise<LogPage> => {
  if (!await countsReady(ctx)) throw new Error("Research pages require vaultCounts backfill completion");
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  const result = await ctx.db.query("researchLog").withIndex("by_owner_active_order", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined))
    .paginate({cursor: args.cursor, numItems: 50, maximumRowsRead: 50, maximumBytesRead: 250_000});
  const people = await peopleForRows(ctx, owner, result.page.flatMap(row => row.entityType === "person" && row.entityId !== undefined ? [String(row.entityId)] : []));
  const page: LogWithPerson[] = result.page.map(row => ({...row, person: row.entityType === "person" && row.entityId !== undefined ? people.get(String(row.entityId)) ?? null : null}));
  const counter = await ownerTableCounter(ctx, owner, "researchLog");
  return {...result, page, totals: counter?.counts ?? {active: 0}};
}});

export const version = internalQuery({args: {vaultOwnerId: v.string()}, handler: async (ctx, args) => {
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  const [persons, tasks, log] = await Promise.all((["persons", "researchTasks", "researchLog"] as const).map(table => ownerTableCounter(ctx, owner, table)));
  return {ready: await countsReady(ctx), revisions: [persons?.revision ?? 0, tasks?.revision ?? 0, log?.revision ?? 0], tasks: tasks?.counts.active ?? 0, log: log?.counts.active ?? 0};
}});
