import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireTrustBoundarySuperAdmin } from "./access";

export const recordShadowDenial = internalMutation({
  args: {
    functionName: v.string(),
    caller: v.string(),
    callerKind: v.union(v.literal("anonymous"), v.literal("authenticated")),
    reason: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, entry) => ctx.db.insert("trustBoundaryShadowLog", entry),
});

export const getShadowLogSummary = query({
  args: {
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requireTrustBoundarySuperAdmin(identity?.subject);

    const now = Date.now();
    const since = Math.max(0, args.since ?? now - 7 * 24 * 60 * 60 * 1000);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 5_000), 1), 10_000);
    const rows = await ctx.db
      .query("trustBoundaryShadowLog")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .order("desc")
      .take(limit);

    const countBy = (key: "functionName" | "reason" | "caller") => {
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
      return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    };

    return {
      mode:
        process.env.TRUST_BOUNDARY_MODE === "enforce"
          ? "enforce" as const
          : "shadow" as const,
      since,
      generatedAt: now,
      total: rows.length,
      truncated: rows.length === limit,
      firstTimestamp: rows.at(-1)?.timestamp ?? null,
      lastTimestamp: rows[0]?.timestamp ?? null,
      byFunction: countBy("functionName"),
      byReason: countBy("reason"),
      byCaller: countBy("caller"),
    };
  },
});
