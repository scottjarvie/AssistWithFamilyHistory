import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
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

type CitationTargetType = "person" | "event" | "relationship" | "place";

async function loadCitationTarget(
  db: QueryCtx["db"],
  targetType: CitationTargetType,
  targetId: string,
) {
  if (targetType === "person") {
    const id = db.normalizeId("persons", targetId);
    return id ? db.get(id) : null;
  }
  if (targetType === "event") {
    const id = db.normalizeId("events", targetId);
    return id ? db.get(id) : null;
  }
  if (targetType === "relationship") {
    const id = db.normalizeId("relationships", targetId);
    return id ? db.get(id) : null;
  }
  const id = db.normalizeId("places", targetId);
  return id ? db.get(id) : null;
}

async function targetBelongsToOwner(
  db: QueryCtx["db"],
  targetType: CitationTargetType,
  targetId: string,
  vaultOwnerId: string,
) {
  const row = await loadCitationTarget(db, targetType, targetId);
  return Boolean(row && matchesVaultOwner(row.vaultOwnerId, vaultOwnerId));
}

// Create a new citation
export const create = mutation({
  args: {
    vaultOwnerId: v.string(),
    sourceId: v.id("sources"),
    page: v.optional(v.string()),
    confidence: v.union(
      v.literal("very_high"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
      v.literal("very_low")
    ),
    extractedText: v.optional(v.string()),
    editedText: v.optional(v.string()),
    url: v.optional(v.string()),
    accessDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    conflictsWith: v.optional(v.array(v.id("citations"))),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "citations.create", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    await authorizeOwnedReferenceMutation(
      ctx,
      "citations.create",
      vaultOwnerId,
      await ctx.db.get(args.sourceId),
      "Source",
    );
    if (args.conflictsWith) {
      const conflicts = await Promise.all(args.conflictsWith.map((id) => ctx.db.get(id)));
      for (const conflict of conflicts) {
        await authorizeOwnedReferenceMutation(
          ctx,
          "citations.create",
          vaultOwnerId,
          conflict,
          "Conflicting citation",
        );
      }
    }
    const now = Date.now();
    const citationId = await ctx.db.insert("citations", {
      ...args,
      vaultOwnerId,
      isEvidence: false,
      createdAt: now,
      updatedAt: now,
    });
    return citationId;
  },
});

// Get a citation by ID
const getArgs = { id: v.id("citations"), vaultOwnerId: v.string() };

export const getInternal = internalQuery({
  args: getArgs,
  handler: async (ctx, args) => {
    const citation = await ctx.db.get(args.id);
    return citation && matchesVaultOwner(citation.vaultOwnerId, args.vaultOwnerId) ? citation : null;
  },
});

export const get = action({
  args: getArgs,
  handler: async (ctx, args): Promise<Doc<"citations"> | null> => {
    const decision = await authorizeTenantAction(
      ctx,
      "citations.get",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.citations.getInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

// Get citations for a source
const getForSourceArgs = {
  vaultOwnerId: v.string(),
  sourceId: v.id("sources"),
};

export const getForSourceInternal = internalQuery({
  args: getForSourceArgs,
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source || !matchesVaultOwner(source.vaultOwnerId, args.vaultOwnerId)) return [];
    return filterByVaultOwner(
      await ctx.db
      .query("citations")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect(),
      args.vaultOwnerId
    );
  },
});

export const getForSource = action({
  args: getForSourceArgs,
  handler: async (ctx, args): Promise<Doc<"citations">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "citations.getForSource",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.citations.getForSourceInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

// Get citations for a person, event, relationship, or place
const getForTargetArgs = {
  vaultOwnerId: v.string(),
  targetType: v.union(
    v.literal("person"),
    v.literal("event"),
    v.literal("relationship"),
    v.literal("place")
  ),
  targetId: v.string(),
};

type CitationWithSource = Doc<"citations"> & {
  source: Doc<"sources">;
  field?: string;
  linkId: Doc<"citationLinks">["_id"];
};

export const getForTargetInternal = internalQuery({
  args: getForTargetArgs,
  handler: async (ctx, args) => {
    const vaultOwnerId = args.vaultOwnerId;
    if (!(await targetBelongsToOwner(ctx.db, args.targetType, args.targetId, vaultOwnerId))) {
      return [];
    }
    // Get all citation links for this target
    const links = filterByVaultOwner(
      await ctx.db
      .query("citationLinks")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .collect(),
      vaultOwnerId
    );

    // Get the full citation details for each
    const citations = await Promise.all(
      links.map(async (link) => {
        const citation = await ctx.db.get(link.citationId);
        if (!citation || !matchesVaultOwner(citation.vaultOwnerId, vaultOwnerId)) return null;
        
        // Get the source details too
        const source = await ctx.db.get(citation.sourceId);
        if (!source || !matchesVaultOwner(source.vaultOwnerId, vaultOwnerId)) return null;
        
        return {
          ...citation,
          source,
          field: link.field,
          linkId: link._id,
        };
      })
    );

    return citations.filter((c) => c !== null);
  },
});

export const getForTarget = action({
  args: getForTargetArgs,
  handler: async (ctx, args): Promise<CitationWithSource[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "citations.getForTarget",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.citations.getForTargetInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

// List citations with optional filters
const listArgs = {
  vaultOwnerId: v.string(),
  confidence: v.optional(
    v.union(
      v.literal("very_high"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
      v.literal("very_low")
    )
  ),
  limit: v.optional(v.number()),
};

export const listInternal = internalQuery({
  args: listArgs,
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"citations">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;
    const vaultOwnerId = args.vaultOwnerId;

    if (args.confidence !== undefined) {
      const results = await ctx.db
        .query("citations")
        .withIndex("by_confidence", (q) => q.eq("confidence", args.confidence!))
        .collect();
      return applyLimit(filterByVaultOwner(results, vaultOwnerId));
    }

    const results = await ctx.db.query("citations").collect();
    return applyLimit(filterByVaultOwner(results, vaultOwnerId));
  },
});

export const list = action({
  args: listArgs,
  handler: async (ctx, args): Promise<Doc<"citations">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "citations.list",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.citations.listInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

// Link a citation to a person, event, relationship, or place
export const linkToTarget = mutation({
  args: {
    vaultOwnerId: v.string(),
    citationId: v.id("citations"),
    targetType: v.union(
      v.literal("person"),
      v.literal("event"),
      v.literal("relationship"),
      v.literal("place")
    ),
    targetId: v.string(),
    field: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "citations.linkToTarget", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const citation = await authorizeOwnedReferenceMutation(
      ctx,
      "citations.linkToTarget",
      vaultOwnerId,
      await ctx.db.get(args.citationId),
      "Citation",
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "citations.linkToTarget",
      vaultOwnerId,
      await ctx.db.get(citation.sourceId),
      "Source",
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "citations.linkToTarget",
      vaultOwnerId,
      await loadCitationTarget(ctx.db, args.targetType, args.targetId),
      "Citation target",
    );
    // Check if link already exists
    const existingRows = await ctx.db
      .query("citationLinks")
      .withIndex("by_citation_and_target", (q) =>
        q
          .eq("citationId", args.citationId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
      )
      .collect();
    const existing = filterByVaultOwner(existingRows, vaultOwnerId)[0] ?? null;

    if (existing) {
      // Update the field if it changed
      if (args.field !== undefined) {
        await ctx.db.patch(existing._id, {
          field: args.field,
        });
      }
      return existing._id;
    }

    // Create new link
    const linkId = await ctx.db.insert("citationLinks", {
      vaultOwnerId,
      citationId: args.citationId,
      targetType: args.targetType,
      targetId: args.targetId,
      field: args.field,
      createdAt: Date.now(),
    });

    return linkId;
  },
});

// Unlink a citation from a target
export const unlinkFromTarget = mutation({
  args: {
    vaultOwnerId: v.string(),
    citationId: v.id("citations"),
    targetType: v.union(
      v.literal("person"),
      v.literal("event"),
      v.literal("relationship"),
      v.literal("place")
    ),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "citations.unlinkFromTarget", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    await authorizeOwnedReferenceMutation(
      ctx,
      "citations.unlinkFromTarget",
      vaultOwnerId,
      await ctx.db.get(args.citationId),
      "Citation",
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "citations.unlinkFromTarget",
      vaultOwnerId,
      await loadCitationTarget(ctx.db, args.targetType, args.targetId),
      "Citation target",
    );
    const links = await ctx.db
      .query("citationLinks")
      .withIndex("by_citation_and_target", (q) =>
        q
          .eq("citationId", args.citationId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
      )
      .collect();
    const link = filterByVaultOwner(links, vaultOwnerId)[0] ?? null;

    if (link) {
      await ctx.db.delete(link._id);
      return { success: true };
    }

    return { success: false, message: "Link not found" };
  },
});

// Update a citation. GEN-73: internal-only — no `vaultOwnerId` arg, so it
// must not be callable from public clients. Update through the owner-aware
// vaultMutations surface instead.
export const update = internalMutation({
  args: {
    id: v.id("citations"),
    sourceId: v.optional(v.id("sources")),
    page: v.optional(v.string()),
    confidence: v.optional(
      v.union(
        v.literal("very_high"),
        v.literal("high"),
        v.literal("medium"),
        v.literal("low"),
        v.literal("very_low")
      )
    ),
    extractedText: v.optional(v.string()),
    editedText: v.optional(v.string()),
    url: v.optional(v.string()),
    accessDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    conflictsWith: v.optional(v.array(v.id("citations"))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
    
    return id;
  },
});

// Delete a citation. GEN-73: internal-only — no `vaultOwnerId` arg.
export const remove = internalMutation({
  args: { id: v.id("citations") },
  handler: async (ctx, args) => {
    // Delete all citation links first
    const links = await ctx.db
      .query("citationLinks")
      .withIndex("by_citation", (q) => q.eq("citationId", args.id))
      .collect();

    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    // Delete the citation
    await ctx.db.delete(args.id);
    return { success: true };
  },
});
