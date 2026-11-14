/* eslint-disable @typescript-eslint/no-explicit-any */
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { searchText, type SearchTable } from "./searchWrites";

/** Old substring semantics until migration completes; indexed word/prefix search afterwards. */
export async function searchRows<T extends SearchTable>(ctx: QueryCtx, table: T, owner: string, needle: string, limit: number): Promise<Doc<T>[]> {
  const state = await ctx.db.query("searchBuildState").withIndex("by_table", (q: any) => q.eq("table", table)).unique();
  // All listed source tables share these field/index definitions.
  const base: any = ctx.db.query(table);
  if (state?.complete && needle) {
    return await base.withSearchIndex("search_text", (q: any) => q.search("searchText", needle).eq("vaultOwnerId", owner).eq("archivedAt", undefined)).take(limit) as Doc<T>[];
  }
  const rows = await base.withIndex("by_owner", (q: any) => q.eq("vaultOwnerId", owner)).order("desc").filter((q: any) => q.eq(q.field("archivedAt"), undefined)).take(251);
  return rows.filter((row: Doc<T>) => searchText(table, row).toLowerCase().includes(needle)).slice(0, limit) as Doc<T>[];
}
