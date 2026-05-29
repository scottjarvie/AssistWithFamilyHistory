/**
 * Agent API-key management mutations/queries.
 *
 * Owner-scoped lifecycle for the credentials that let an external AI agent act
 * as one vault owner. The raw secret is generated + hashed in the Next server
 * (lib/auth/apiKey.ts); this layer only ever stores/returns the SHA-256 hash and
 * never the raw secret. All routes go through resolveOwner + matchesVaultOwner,
 * so keys inherit owner isolation like the rest of the vault.
 *
 * NOTE: resolution of an incoming key -> owner (the read/auth path) is a
 * separate, internal-only function added when the agent-auth middleware lands;
 * it is intentionally NOT a public query here (no public lookup-by-keyId).
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { filterByVaultOwner, matchesVaultOwner, resolveOwner } from "./vaultCore";

const tierValidator = v.union(v.literal("free"), v.literal("standard"), v.literal("trusted"));

export const mintKey = mutation({
  args: {
    vaultOwnerId: v.string(),
    keyId: v.string(),
    hashedSecret: v.string(),
    label: v.string(),
    scopes: v.array(v.string()),
    tier: tierValidator,
    expiresAt: v.optional(v.number()),
    createdByUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    if (!args.keyId.startsWith("dts_")) {
      throw new Error("Invalid API key id prefix");
    }
    if (args.label.trim().length === 0) {
      throw new Error("API key label is required");
    }
    const now = Date.now();
    const id = await ctx.db.insert("apiKeys", {
      vaultOwnerId,
      keyId: args.keyId,
      hashedSecret: args.hashedSecret,
      label: args.label.trim(),
      scopes: args.scopes,
      tier: args.tier,
      status: "active",
      createdAt: now,
      expiresAt: args.expiresAt,
      createdByUserId: args.createdByUserId,
    });
    return { _id: id, keyId: args.keyId };
  },
});

export const revokeKey = mutation({
  args: { vaultOwnerId: v.string(), keyId: v.string() },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", args.keyId))
      .first();
    if (!row || !matchesVaultOwner(row.vaultOwnerId, vaultOwnerId)) {
      throw new Error("API key not found");
    }
    if (row.status !== "revoked") {
      await ctx.db.patch(row._id, { status: "revoked", revokedAt: Date.now() });
    }
    return { keyId: args.keyId, status: "revoked" as const };
  },
});

/** Owner's keys, newest first. NEVER returns hashedSecret. */
export const listKeys = query({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
      .collect();
    return filterByVaultOwner(rows, vaultOwnerId)
      .map((row) => ({
        keyId: row.keyId,
        label: row.label,
        scopes: row.scopes,
        tier: row.tier,
        status: row.status,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
        expiresAt: row.expiresAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
