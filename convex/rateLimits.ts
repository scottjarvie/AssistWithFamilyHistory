/**
 * GEN-89-RL: per-vaultOwner rate limiting for expensive external-AI calls.
 *
 * This protects the OpenRouter spend vector from abuse / runaway loops. The
 * limiter is a FIXED-WINDOW counter: time is divided into contiguous windows of
 * `windowMs`, and each (vaultOwnerId, action, windowStart) row tracks how many
 * requests landed in that window. When the count reaches `limit`, further
 * requests in the same window are rejected with a `retryAfterMs` that says how
 * long until the next window opens.
 *
 * Fixed-window (vs. sliding-window / token-bucket) is intentionally chosen for
 * simplicity and correctness under serverless: a single indexed read + a single
 * write per request, no background sweeps required. The tradeoff is the classic
 * fixed-window burst edge (up to ~2x `limit` across a window boundary), which is
 * acceptable for a spend guard. Stale rows from past windows are harmless and
 * can be cleaned up later if needed (they are ephemeral, not vault content).
 *
 * Trust model: the shared Convex guard binds vaultOwnerId to the verified Clerk
 * identity before reading or incrementing a counter.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { authorizeTenantMutation } from "./access";

export type RateLimitResult =
  | { allowed: true; remaining: number; limit: number; windowStart: number }
  | { allowed: false; retryAfterMs: number; limit: number; windowStart: number };

export const checkAndIncrementRateLimit = mutation({
  args: {
    vaultOwnerId: v.string(),
    action: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args): Promise<RateLimitResult> => {
    const decision = await authorizeTenantMutation(
      ctx,
      "rateLimits.checkAndIncrementRateLimit",
      args.vaultOwnerId,
    );
    const vaultOwnerId = decision.owner;
    const { action, limit, windowMs } = args;
    const now = Date.now();
    // Floor `now` to the start of its fixed window so all requests in the same
    // window share a single counter row.
    const safeWindowMs = windowMs > 0 ? windowMs : 1;
    const windowStart = Math.floor(now / safeWindowMs) * safeWindowMs;
    const windowEnd = windowStart + safeWindowMs;

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_owner_window", (q) =>
        q.eq("vaultOwnerId", vaultOwnerId).eq("action", action).eq("windowStart", windowStart),
      )
      .unique();

    const currentCount = existing?.count ?? 0;

    if (currentCount >= limit) {
      return {
        allowed: false,
        retryAfterMs: Math.max(0, windowEnd - now),
        limit,
        windowStart,
      };
    }

    const nextCount = currentCount + 1;
    if (existing) {
      await ctx.db.patch(existing._id, { count: nextCount, updatedAt: now });
    } else {
      await ctx.db.insert("rateLimits", {
        vaultOwnerId,
        action,
        windowStart,
        count: nextCount,
        updatedAt: now,
      });
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - nextCount),
      limit,
      windowStart,
    };
  },
});
