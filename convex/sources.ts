import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// Create a new source
export const create = mutation({
  args: {
    title: v.string(),
    type: v.union(
      v.literal("census"),
      v.literal("vital_record"),
      v.literal("church_record"),
      v.literal("military"),
      v.literal("immigration"),
      v.literal("newspaper"),
      v.literal("obituary"),
      v.literal("photograph"),
      v.literal("letter"),
      v.literal("book"),
      v.literal("website"),
      v.literal("other")
    ),
    repository: v.optional(v.string()),
    url: v.optional(v.string()),
    fsId: v.optional(v.string()),
    author: v.optional(v.string()),
    publicationDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sourceId = await ctx.db.insert("sources", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return sourceId;
  },
});

// Get a source by ID
export const get = query({
  args: { id: v.id("sources") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get a source by FamilySearch ID
export const getByFsId = query({
  args: { fsId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sources")
      .withIndex("by_fsId", (q) => q.eq("fsId", args.fsId))
      .first();
  },
});

// List sources with optional filters
export const list = query({
  args: {
    type: v.optional(
      v.union(
        v.literal("census"),
        v.literal("vital_record"),
        v.literal("church_record"),
        v.literal("military"),
        v.literal("immigration"),
        v.literal("newspaper"),
        v.literal("obituary"),
        v.literal("photograph"),
        v.literal("letter"),
        v.literal("book"),
        v.literal("website"),
        v.literal("other")
      )
    ),
    repository: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"sources">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;

    if (args.type !== undefined) {
      const results = await ctx.db
        .query("sources")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
      return applyLimit(results);
    }

    if (args.repository !== undefined) {
      const results = await ctx.db
        .query("sources")
        .withIndex("by_repository", (q) => q.eq("repository", args.repository!))
        .collect();
      return applyLimit(results);
    }

    const results = await ctx.db.query("sources").collect();
    
    return results;
  },
});

// Update a source
export const update = mutation({
  args: {
    id: v.id("sources"),
    title: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("census"),
        v.literal("vital_record"),
        v.literal("church_record"),
        v.literal("military"),
        v.literal("immigration"),
        v.literal("newspaper"),
        v.literal("obituary"),
        v.literal("photograph"),
        v.literal("letter"),
        v.literal("book"),
        v.literal("website"),
        v.literal("other")
      )
    ),
    repository: v.optional(v.string()),
    url: v.optional(v.string()),
    fsId: v.optional(v.string()),
    author: v.optional(v.string()),
    publicationDate: v.optional(v.string()),
    notes: v.optional(v.string()),
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

// Delete a source
export const remove = mutation({
  args: { id: v.id("sources") },
  handler: async (ctx, args) => {
    // Check for citations that reference this source
    const citations = await ctx.db
      .query("citations")
      .withIndex("by_source", (q) => q.eq("sourceId", args.id))
      .collect();

    if (citations.length > 0) {
      throw new Error(
        `Cannot delete source: ${citations.length} citation(s) reference this source. Delete citations first.`
      );
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
