import { v } from "convex/values";
import { internalMutation as mutation, internalQuery as query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const create = mutation({
  args: {
    type: v.union(
      v.literal("photo"), v.literal("document"), v.literal("scan"),
      v.literal("video"), v.literal("audio"), v.literal("other")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    filePath: v.optional(v.string()),
    url: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    date: v.optional(v.object({
      year: v.optional(v.number()),
      month: v.optional(v.number()),
      day: v.optional(v.number()),
    })),
    personIds: v.array(v.id("persons")),
    sourceId: v.optional(v.id("sources")),
    familySearchUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("media", { ...args, createdAt: now, updatedAt: now });
  },
});

export const get = query({
  args: { id: v.id("media") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const getByFsUrl = query({
  args: { familySearchUrl: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("media").collect();
    return all.find(m => m.familySearchUrl === args.familySearchUrl) || null;
  },
});

export const list = query({
  args: {
    type: v.optional(v.union(
      v.literal("photo"), v.literal("document"), v.literal("scan"),
      v.literal("video"), v.literal("audio"), v.literal("other")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"media">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;

    if (args.type) {
      const results = await ctx.db.query("media")
        .withIndex("by_type", q => q.eq("type", args.type!))
        .collect();
      return applyLimit(results);
    }
    return applyLimit(await ctx.db.query("media").collect());
  },
});

export const listForPerson = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("media").collect();
    return all.filter(m => m.personIds.includes(args.personId));
  },
});
