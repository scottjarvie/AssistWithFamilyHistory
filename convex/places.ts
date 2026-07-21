import { v } from "convex/values";
import { action, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { authorizeTenantAction, authorizeTenantMutation } from "./access";
import { filterByVaultOwner } from "./vaultCore";

const placeTypeValidator = v.union(
  v.literal("country"),
  v.literal("state"),
  v.literal("county"),
  v.literal("city"),
  v.literal("town"),
  v.literal("village"),
  v.literal("parish"),
  v.literal("address"),
  v.literal("other")
);

// Create or update a place using the FamilySearch place id (or full name) as the key
export const upsert = mutation({
  args: {
    vaultOwnerId: v.string(),
    familySearchId: v.optional(v.string()),
    name: v.string(),
    fullName: v.string(),
    type: v.optional(placeTypeValidator),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "places.upsert", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const now = Date.now();
    let existing: Doc<"places"> | null = null;

    if (args.familySearchId) {
      const matches = await ctx.db
        .query("places")
        .withIndex("by_fsId", (q) => q.eq("familySearchId", args.familySearchId))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    if (!existing) {
      const matches = await ctx.db
        .query("places")
        .withIndex("by_name", (q) => q.eq("name", args.name))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId).find((p) => p.fullName === args.fullName) || null;
    }

    const update = {
      name: args.name,
      fullName: args.fullName,
      type: args.type || "other",
      latitude: args.latitude,
      longitude: args.longitude,
      familySearchId: args.familySearchId,
      vaultOwnerId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, update);
      return { placeId: existing._id, updated: true };
    }

    const placeId = await ctx.db.insert("places", {
      ...update,
      createdAt: now,
    });
    return { placeId, updated: false };
  },
});

const getByFsIdArgs = { fsId: v.string(), vaultOwnerId: v.string() };

export const getByFsIdInternal = internalQuery({
  args: getByFsIdArgs,
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("places")
      .withIndex("by_fsId", (q) => q.eq("familySearchId", args.fsId))
      .collect();
    return filterByVaultOwner(matches, args.vaultOwnerId)[0] ?? null;
  },
});

export const getByFsId = action({
  args: getByFsIdArgs,
  handler: async (ctx, args): Promise<Doc<"places"> | null> => {
    const decision = await authorizeTenantAction(
      ctx,
      "places.getByFsId",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.places.getByFsIdInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

const listArgs = {
  vaultOwnerId: v.string(),
  type: v.optional(placeTypeValidator),
  limit: v.optional(v.number()),
};

export const listInternal = internalQuery({
  args: listArgs,
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"places">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;

    if (args.type) {
      const results = await ctx.db
        .query("places")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
      return applyLimit(filterByVaultOwner(results, args.vaultOwnerId));
    }

    const results = await ctx.db.query("places").collect();
    return applyLimit(filterByVaultOwner(results, args.vaultOwnerId));
  },
});

export const list = action({
  args: listArgs,
  handler: async (ctx, args): Promise<Doc<"places">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "places.list",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.places.listInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});
