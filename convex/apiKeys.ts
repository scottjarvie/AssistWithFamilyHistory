/**
 * Agent API-key management mutations/queries.
 *
 * Owner-scoped lifecycle for the credentials that let an external AI agent act
 * as one vault owner. The raw secret is generated + hashed in the Next server
 * (lib/auth/apiKey.ts); this layer only ever stores/returns the SHA-256 hash and
 * never the raw secret. Mutations authorize in-place; reads enter through an
 * authorized public action before reaching their internal query.
 *
 * NOTE: resolution of an incoming key -> owner (the read/auth path) is a
 * separate, internal-only function added when the agent-auth middleware lands;
 * it is intentionally NOT a public query here (no public lookup-by-keyId).
 */
import { v } from "convex/values";
import { action, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { authorizeTenantAction, authorizeTenantMutation } from "./access";
import { filterByVaultOwner, matchesVaultOwner } from "./vaultCore";

const tierValidator = v.union(v.literal("trial"), v.literal("standard"), v.literal("trusted"));

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
    const decision = await authorizeTenantMutation(ctx, "apiKeys.mintKey", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
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
      createdByUserId:
        decision.callerKind === "authenticated"
          ? decision.caller
          : args.createdByUserId,
    });
    return { _id: id, keyId: args.keyId };
  },
});

export const revokeKey = mutation({
  args: { vaultOwnerId: v.string(), keyId: v.string() },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "apiKeys.revokeKey", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
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

/** Suspend or reactivate a key (operator tooling). Revoked keys are terminal. */
export const setKeyStatus = mutation({
  args: {
    vaultOwnerId: v.string(),
    keyId: v.string(),
    status: v.union(v.literal("active"), v.literal("suspended")),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "apiKeys.setKeyStatus", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", args.keyId))
      .first();
    if (!row || !matchesVaultOwner(row.vaultOwnerId, vaultOwnerId)) {
      throw new Error("API key not found");
    }
    if (row.status === "revoked") {
      throw new Error("Revoked keys cannot be reactivated");
    }
    await ctx.db.patch(row._id, { status: args.status });
    return { keyId: args.keyId, status: args.status };
  },
});

/** Owner's keys, newest first. NEVER returns hashedSecret. */
const listKeysArgs = { vaultOwnerId: v.string() };

type ListedApiKey = Pick<
  Doc<"apiKeys">,
  "keyId" | "label" | "scopes" | "tier" | "status" | "createdAt" | "lastUsedAt" | "revokedAt" | "expiresAt"
>;

export const listKeysInternal = internalQuery({
  args: listKeysArgs,
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", args.vaultOwnerId))
      .collect();
    return filterByVaultOwner(rows, args.vaultOwnerId)
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

export const listKeys = action({
  args: listKeysArgs,
  handler: async (ctx, args): Promise<ListedApiKey[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "apiKeys.listKeys",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.apiKeys.listKeysInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});
