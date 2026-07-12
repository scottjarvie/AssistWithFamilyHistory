import { v } from "convex/values";
import {
  action,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  authorizeOwnedReferenceMutation,
  authorizeTenantAction,
  authorizeTenantMutation,
} from "./access";
import { filterByVaultOwner, matchesVaultOwner } from "./vaultCore";

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

const entityTableByType = {
  person: "persons",
  place: "places",
  building: "places",
  relationship: "relationships",
  event: "events",
  source: "sources",
  citation: "citations",
  story: "stories",
  historicalContext: "historicalContext",
} as const;

type ReferencedEntityType = keyof typeof entityTableByType;
type ResearchEntityType = ReferencedEntityType | "other";

const entityLabelByType: Record<ReferencedEntityType, string> = {
  person: "Person",
  place: "Place",
  building: "Building place",
  relationship: "Relationship",
  event: "Event",
  source: "Source",
  citation: "Citation",
  story: "Story",
  historicalContext: "Historical context",
};

async function loadResearchEntity(
  ctx: Pick<QueryCtx, "db">,
  entityType: ReferencedEntityType,
  entityId: string,
) {
  const table = entityTableByType[entityType];
  const normalizedId = ctx.db.normalizeId(table, entityId);
  return normalizedId ? ctx.db.get(normalizedId) : null;
}

async function authorizeResearchEntityForMutation(
  ctx: MutationCtx,
  functionName: string,
  vaultOwnerId: string,
  entityType: ResearchEntityType,
  entityId: string,
) {
  if (entityType === "other") return entityId;
  const entity = await authorizeOwnedReferenceMutation(
    ctx,
    functionName,
    vaultOwnerId,
    await loadResearchEntity(ctx, entityType, entityId),
    entityLabelByType[entityType],
  );
  return entity._id;
}

async function resolveOwnedResearchEntity(
  ctx: QueryCtx,
  vaultOwnerId: string,
  entityType: ResearchEntityType,
  entityId: string,
) {
  if (entityType === "other") return entityId;
  const entity = await loadResearchEntity(ctx, entityType, entityId);
  return entity && matchesVaultOwner(entity.vaultOwnerId, vaultOwnerId)
    ? entity._id
    : null;
}

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
    const functionName = "researchLog.upsert";
    const decision = await authorizeTenantMutation(ctx, functionName, args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const now = Date.now();
    const entityId =
      args.entityId === undefined
        ? undefined
        : await authorizeResearchEntityForMutation(
            ctx,
            functionName,
            vaultOwnerId,
            args.entityType,
            String(args.entityId),
          );

    let existing: Doc<"researchLog"> | null = null;

    if (entityId !== undefined) {
      const matches = await ctx.db
        .query("researchLog")
        .withIndex("by_entity_activity", (q) =>
          q
            .eq("entityType", args.entityType)
            .eq("entityId", entityId)
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
      entityId,
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

const listForEntityArgs = {
  vaultOwnerId: v.string(),
  entityType: entityTypeValidator,
  entityId: v.optional(entityIdValidator),
  activityType: v.optional(activityTypeValidator),
  status: v.optional(statusValidator),
};

export const listForEntityInternal = internalQuery({
  args: listForEntityArgs,
  handler: async (ctx, args) => {
    const entityId =
      args.entityId === undefined
        ? undefined
        : await resolveOwnedResearchEntity(
            ctx,
            args.vaultOwnerId,
            args.entityType,
            String(args.entityId),
          );
    if (args.entityId !== undefined && entityId === null) return [];

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

    if (entityId !== undefined) {
      query = query.filter((q) => q.eq(q.field("entityId"), entityId));
    } else {
      query = query.filter((q) => q.eq(q.field("entityId"), undefined));
    }

    return filterByVaultOwner(await query.collect(), args.vaultOwnerId);
  },
});

export const listForEntity = action({
  args: listForEntityArgs,
  handler: async (ctx, args): Promise<Doc<"researchLog">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "researchLog.listForEntity",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.researchLog.listForEntityInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});
