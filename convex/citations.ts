import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { filterByVaultOwner, matchesVaultOwner, normalizeVaultOwnerId } from "./vaultCore";

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
    const now = Date.now();
    const citationId = await ctx.db.insert("citations", {
      ...args,
      vaultOwnerId: normalizeVaultOwnerId(args.vaultOwnerId),
      isEvidence: false,
      createdAt: now,
      updatedAt: now,
    });
    return citationId;
  },
});

// Get a citation by ID
export const get = query({
  args: { id: v.id("citations"), vaultOwnerId: v.string() },
  handler: async (ctx, args) => {
    const citation = await ctx.db.get(args.id);
    return citation && matchesVaultOwner(citation.vaultOwnerId, args.vaultOwnerId) ? citation : null;
  },
});

// Get citations for a source
export const getForSource = query({
  args: {
    vaultOwnerId: v.string(),
    sourceId: v.id("sources"),
  },
  handler: async (ctx, args) => {
    return filterByVaultOwner(
      await ctx.db
      .query("citations")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect(),
      normalizeVaultOwnerId(args.vaultOwnerId)
    );
  },
});

// Get citations for a person, event, relationship, or place
export const getForTarget = query({
  args: {
    vaultOwnerId: v.string(),
    targetType: v.union(
      v.literal("person"),
      v.literal("event"),
      v.literal("relationship"),
      v.literal("place")
    ),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
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

// List citations with optional filters
export const list = query({
  args: {
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
  },
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"citations">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);

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
    const existing = filterByVaultOwner(existingRows, normalizeVaultOwnerId(args.vaultOwnerId))[0] ?? null;

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
      vaultOwnerId: normalizeVaultOwnerId(args.vaultOwnerId),
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
    const links = await ctx.db
      .query("citationLinks")
      .withIndex("by_citation_and_target", (q) =>
        q
          .eq("citationId", args.citationId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
      )
      .collect();
    const link = filterByVaultOwner(links, normalizeVaultOwnerId(args.vaultOwnerId))[0] ?? null;

    if (link) {
      await ctx.db.delete(link._id);
      return { success: true };
    }

    return { success: false, message: "Link not found" };
  },
});

// Update a citation
export const update = mutation({
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

// Delete a citation
export const remove = mutation({
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
