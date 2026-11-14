import { v } from "convex/values";
import { internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SEARCH_TABLES, searchFields } from "./searchWrites";

export const step = internalMutation({
  args: { table: v.union(...SEARCH_TABLES.map(t => v.literal(t))) },
  handler: async (ctx, { table }) => {
    const state = await ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", table)).unique();
    if (state?.complete) return true;
    const page = await ctx.db.query(table).paginate({ cursor: state?.cursor ?? null, numItems: 50, maximumBytesRead: 1_000_000 });
    for (const row of page.page) await ctx.db.patch(row._id, searchFields(table, row));
    const value = { table, cursor: page.continueCursor, complete: page.isDone };
    if (state) await ctx.db.patch(state._id, value);
    else await ctx.db.insert("searchBuildState", value);
    return page.isDone;
  },
});
/** Restartable, internal, and writes only derived search text and progress. */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ complete: boolean }> => {
    for (const table of SEARCH_TABLES) {
      // Bound an action; rerun to resume if an exceptionally large vault needs more.
      for (let i = 0; i < 10000; i++) {
        const done: boolean = await ctx.runMutation(internal.searchBackfill.step, { table });
        if (done) break;
        if (i === 9999) return { complete: false };
      }
    }
    return { complete: true };
  },
});
