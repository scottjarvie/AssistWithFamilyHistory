/**
 * The person's own view of their workspace: stats (`/app/me`), the Library
 * shelves (`/app/library`) and the export (`/app/settings/data`).
 *
 * Everything reads existing records; nothing here is a parallel store. Reads
 * are capped so one page view stays cheap even on a 5,000-person tree.
 */
import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { TableNames } from "./_generated/dataModel";
import { action, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeTenantAction, type TrustBoundaryShadowEntry } from "./access";
import { EXPORT_TABLES, type ExportTable } from "../lib/vault/exportTables";

const self = (internal as unknown as {
  yourData: {
    getYourStatsInternal: FunctionReference<"query", "internal">;
    getLibraryShelvesInternal: FunctionReference<"query", "internal">;
    exportPageInternal: FunctionReference<"query", "internal">;
  };
}).yourData;
const shadowRecorder = (internal as unknown as {
  trustBoundary: { recordShadowDenial: FunctionReference<"mutation", "internal"> };
}).trustBoundary.recordShadowDenial;

/** Persons are counted up to this; everything else up to SMALL_CAP. */
const PEOPLE_CAP = 5_000;
const SMALL_CAP = 1_000;
const DAY = 24 * 60 * 60 * 1000;

async function ownedRows(ctx: QueryCtx, table: TableNames, owner: string, cap: number) {
  // Every table read here declares a by_owner index (scripts/check-owned-tables-parity.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (ctx.db.query(table) as any).withIndex("by_owner", (q: any) => q.eq("vaultOwnerId", owner)).take(cap + 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { rows: rows.slice(0, cap) as any[], more: rows.length > cap };
}

function tally<T>(rows: T[], key: (row: T) => string) {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] ?? 0) + 1;
  return out;
}

export type YourStats = Awaited<ReturnType<typeof readYourStats>>;

async function readYourStats(ctx: QueryCtx, owner: string) {
  const [people, relationships, sources, citations, stories, queue, grants, activity] = await Promise.all([
    ownedRows(ctx, "persons", owner, PEOPLE_CAP),
    ownedRows(ctx, "relationships", owner, SMALL_CAP),
    ownedRows(ctx, "sources", owner, SMALL_CAP),
    ownedRows(ctx, "citations", owner, SMALL_CAP),
    ownedRows(ctx, "stories", owner, SMALL_CAP),
    ownedRows(ctx, "queueItems", owner, SMALL_CAP),
    ownedRows(ctx, "mcpGrants", owner, 100),
    ownedRows(ctx, "agentActivity", owner, SMALL_CAP),
  ]);
  const since = Date.now() - 30 * DAY;
  const recentAi = activity.rows.filter((row) => row.principalKind === "mcp" && row.outcome === "ok" && row.createdAt >= since);
  return {
    people: {
      count: people.rows.length,
      more: people.more,
      living: people.rows.filter((row) => row.living).length,
      fromImports: people.rows.filter((row) => row.creationProvenance?.method === "import").length,
      byYourAi: people.rows.filter((row) => row.creationProvenance?.actorKind === "chosen_ai").length,
    },
    relationships: { count: relationships.rows.length, more: relationships.more },
    sources: { count: sources.rows.length, more: sources.more },
    citations: { count: citations.rows.length, more: citations.more },
    stories: { count: stories.rows.length, more: stories.more, byStatus: tally(stories.rows, (row) => String(row.status)) },
    queue: { count: queue.rows.length, more: queue.more, byState: tally(queue.rows, (row) => String(row.state)) },
    ai: {
      activeConnections: grants.rows.filter((row) => row.status === "active").length,
      savesLast30Days: recentAi.length,
      savesCapped: activity.more,
    },
  };
}

export const getYourStatsInternal = internalQuery({
  args: { vaultOwnerId: v.string() },
  handler: (ctx, args) => readYourStats(ctx, args.vaultOwnerId),
});

export type LibraryShelves = Awaited<ReturnType<typeof readLibraryShelves>>;

async function readLibraryShelves(ctx: QueryCtx, owner: string) {
  const [log, tasks, packs, topics] = await Promise.all([
    ctx.db.query("researchLog").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(50),
    ctx.db.query("researchTasks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(50),
    ctx.db.query("historicalContext").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(50),
    ctx.db.query("topics").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(50),
  ]);
  return {
    research: [
      ...log.map((row) => ({
        id: String(row._id),
        kind: "finding" as const,
        title: row.summary,
        status: row.status,
        about: row.entityType,
        byAi: row.creationProvenance?.actorKind === "chosen_ai",
        at: row.updatedAt,
      })),
      ...tasks.map((row) => ({
        id: String(row._id),
        kind: "task" as const,
        title: row.title,
        status: row.status,
        about: row.type,
        byAi: row.aiSuggested,
        at: row.updatedAt,
      })),
    ].sort((a, b) => b.at - a.at).slice(0, 60),
    resources: [
      ...packs.map((row) => ({
        id: String(row._id),
        kind: "research_pack" as const,
        title: row.title,
        detail: `${row.topic.replace(/_/g, " ")}, ${row.timePeriod.startYear}–${row.timePeriod.endYear}`,
        sources: row.sources.length,
      })),
      ...topics.map((row) => ({
        id: String(row._id),
        kind: "topic" as const,
        title: row.name,
        detail: row.kind.replace(/_/g, " ") + (row.startYear ? `, from ${row.startYear}` : ""),
        sources: row.sourceRefs?.length ?? 0,
      })),
    ],
  };
}

export const getLibraryShelvesInternal = internalQuery({
  args: { vaultOwnerId: v.string() },
  handler: (ctx, args) => readLibraryShelves(ctx, args.vaultOwnerId),
});


export const exportPageInternal = internalQuery({
  args: { vaultOwnerId: v.string(), table: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    if (!(EXPORT_TABLES as readonly string[]).includes(args.table)) throw new Error("Unknown export table.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (ctx.db.query(args.table as ExportTable) as any)
      .withIndex("by_owner", (q: any) => q.eq("vaultOwnerId", args.vaultOwnerId)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .paginate({ numItems: 200, cursor: args.cursor });
    return { rows: page.page as unknown[], cursor: page.isDone ? null : (page.continueCursor as string) };
  },
});

/* ------------------------------------------------- public, owner-checked */

async function authorizedOwner(ctx: Parameters<typeof authorizeTenantAction>[0] & { runMutation: (ref: FunctionReference<"mutation", "internal">, args: TrustBoundaryShadowEntry) => Promise<unknown> }, functionName: string, suppliedOwner: string) {
  const decision = await authorizeTenantAction(ctx, functionName, suppliedOwner, (entry) => ctx.runMutation(shadowRecorder, entry));
  return decision.owner;
}

export const getYourStats = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<YourStats> =>
    ctx.runQuery(self.getYourStatsInternal, { vaultOwnerId: await authorizedOwner(ctx, "yourData.getYourStats", args.vaultOwnerId) }),
});

export const getLibraryShelves = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<LibraryShelves> =>
    ctx.runQuery(self.getLibraryShelvesInternal, { vaultOwnerId: await authorizedOwner(ctx, "yourData.getLibraryShelves", args.vaultOwnerId) }),
});

export const exportPage = action({
  args: { vaultOwnerId: v.string(), table: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ rows: unknown[]; cursor: string | null }> =>
    ctx.runQuery(self.exportPageInternal, {
      vaultOwnerId: await authorizedOwner(ctx, "yourData.exportPage", args.vaultOwnerId),
      table: args.table,
      cursor: args.cursor,
    }),
});
