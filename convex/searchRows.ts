/* eslint-disable @typescript-eslint/no-explicit-any */
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { searchText, type SearchTable } from "./searchWrites";

export type SearchRowCoverage =
  | { source: "text_index" }
  | { source: "recent_window"; windowReached: boolean; matchesOmitted: boolean };

/** Old substring semantics until migration completes; indexed word/prefix search afterwards. */
export async function searchRows<T extends SearchTable>(ctx: QueryCtx, table: T, owner: string, needle: string, limit: number): Promise<{ rows: Doc<T>[]; coverage: SearchRowCoverage }> {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", (q: any) => q.eq("table", table)).unique();
  // All listed source tables share these field/index definitions.
  const base: any = ctx.db.query(table);
  if (state?.complete && needle) {
    const rows: Doc<T>[] = await base.withSearchIndex("search_text", (q: any) => q.search("searchText", needle).eq("vaultOwnerId", owner).eq("archivedAt", undefined)).take(limit);
    return { rows, coverage: { source: "text_index" } };
  }
  const windowSize = 251;
  const candidates: Doc<T>[] = await base.withIndex("by_owner", (q: any) => q.eq("vaultOwnerId", owner)).order("desc").filter((q: any) => q.eq(q.field("archivedAt"), undefined)).take(windowSize);
  const matches = candidates.filter(row => searchText(table, row).toLowerCase().includes(needle));
  return {
    rows: matches.slice(0, limit),
    // A full window cannot tell whether there are older eligible rows.
    coverage: { source: "recent_window", windowReached: candidates.length === windowSize, matchesOmitted: matches.length > limit },
  };
}
