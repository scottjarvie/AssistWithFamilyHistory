import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { filterByVaultOwner, resolveOwner } from "./vaultCore";

const entityTypeValidator = v.union(
  v.literal("person"),
  v.literal("place"),
  v.literal("building"),
  v.literal("relationship"),
  v.literal("event"),
  v.literal("source"),
  v.literal("citation"),
  v.literal("story"),
  v.literal("historicalContext"),
  v.literal("other")
);

const entityIdValidator = v.union(
  v.id("persons"),
  v.id("places"),
  v.id("relationships"),
  v.id("events"),
  v.id("sources"),
  v.id("citations"),
  v.id("stories"),
  v.id("historicalContext"),
  v.string()
);

const activityTypeValidator = v.union(
  v.literal("tier1_bulk_import"),
  v.literal("tier2_sources"),
  v.literal("tier2_memories"),
  v.literal("tier2_notes"),
  v.literal("tier2_relationships"),
  v.literal("tier2_places"),
  v.literal("tier3_deep_research"),
  v.literal("tier3_narrative"),
  v.literal("tier3_browser_extras"),
  v.literal("context_research"),
  v.literal("location_deep_research"),
  v.literal("building_research"),
  v.literal("photos_collected"),
  v.literal("other")
);

const statusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
  v.literal("blocked")
);

/**
 * Upsert a research log entry for an entity + activity combination.
 * If entityId is omitted, we upsert by entityType + activityType only.
 */
export const upsert = mutation({
  args: {
    vaultOwnerId: v.string(),
    entityType: entityTypeValidator,
    entityId: v.optional(entityIdValidator),
    activityType: activityTypeValidator,
    status: statusValidator,
    summary: v.string(),
    details: v.optional(v.string()),
    outputRefs: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const now = Date.now();

    let existing: Doc<"researchLog"> | null = null;

    if (args.entityId !== undefined) {
      const matches = await ctx.db
        .query("researchLog")
        .withIndex("by_entity_activity", (q) =>
          q
            .eq("entityType", args.entityType)
            .eq("entityId", args.entityId)
            .eq("activityType", args.activityType)
        )
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    } else {
      const candidates = await ctx.db
        .query("researchLog")
        .withIndex("by_activity", (q) => q.eq("activityType", args.activityType))
        .collect();

      existing =
        filterByVaultOwner(candidates, vaultOwnerId).find(
          (entry) =>
            entry.entityType === args.entityType && entry.entityId === undefined
        ) || null;
    }

    const completedAt =
      args.completedAt !== undefined
        ? args.completedAt
        : args.status === "done"
          ? now
          : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        summary: args.summary,
        details: args.details,
        outputRefs: args.outputRefs,
        model: args.model,
        completedAt,
        updatedAt: now,
      });

      return { researchLogId: existing._id, updated: true };
    }

    const researchLogId = await ctx.db.insert("researchLog", {
      vaultOwnerId,
      entityType: args.entityType,
      entityId: args.entityId,
      activityType: args.activityType,
      status: args.status,
      summary: args.summary,
      details: args.details,
      outputRefs: args.outputRefs,
      model: args.model,
      createdAt: now,
      updatedAt: now,
      completedAt,
    });

    return { researchLogId, updated: false };
  },
});

export const listForEntity = query({
  args: {
    vaultOwnerId: v.string(),
    entityType: entityTypeValidator,
    entityId: v.optional(entityIdValidator),
    activityType: v.optional(activityTypeValidator),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    let query = ctx.db
      .query("researchLog")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType));

    if (args.activityType) {
      query = query.filter((q) =>
        q.eq(q.field("activityType"), args.activityType)
      );
    }

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    if (args.entityId !== undefined) {
      query = query.filter((q) => q.eq(q.field("entityId"), args.entityId));
    } else {
      query = query.filter((q) => q.eq(q.field("entityId"), undefined));
    }

    return filterByVaultOwner(await query.collect(), vaultOwnerId);
  },
});
