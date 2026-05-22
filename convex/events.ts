import { v } from "convex/values";
import { internalMutation as mutation, internalQuery as query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// Create a new event
export const create = mutation({
  args: {
    type: v.union(
      v.literal("birth"),
      v.literal("death"),
      v.literal("burial"),
      v.literal("marriage"),
      v.literal("divorce"),
      v.literal("immigration"),
      v.literal("residence"),
      v.literal("occupation"),
      v.literal("military"),
      v.literal("census"),
      v.literal("christening"),
      v.literal("naturalization"),
      v.literal("custom")
    ),
    customType: v.optional(v.string()),
    date: v.optional(
      v.object({
        original: v.string(),
        formal: v.optional(v.string()),
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
        approximate: v.optional(v.boolean()),
        range: v.optional(v.boolean()),
      })
    ),
    endDate: v.optional(
      v.object({
        original: v.string(),
        formal: v.optional(v.string()),
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
      })
    ),
    place: v.optional(
      v.object({
        original: v.string(),
        placeId: v.optional(v.id("places")),
      })
    ),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return eventId;
  },
});

// Get an event by ID
export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// List events with optional filters
export const list = query({
  args: {
    type: v.optional(
      v.union(
        v.literal("birth"),
        v.literal("death"),
        v.literal("burial"),
        v.literal("marriage"),
        v.literal("divorce"),
        v.literal("immigration"),
        v.literal("residence"),
        v.literal("occupation"),
        v.literal("military"),
        v.literal("census"),
        v.literal("christening"),
        v.literal("naturalization"),
        v.literal("custom")
      )
    ),
    placeId: v.optional(v.id("places")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"events">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;

    if (args.type) {
      const results = await ctx.db
        .query("events")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
      return applyLimit(results);
    }

    if (args.placeId) {
      const results = await ctx.db
        .query("events")
        .withIndex("by_place", (q) => q.eq("place.placeId", args.placeId))
        .collect();
      return applyLimit(results);
    }

    const results = await ctx.db.query("events").collect();
    return applyLimit(results);
  },
});

// Get events for a specific person
export const getForPerson = query({
  args: {
    personId: v.id("persons"),
  },
  handler: async (ctx, args) => {
    // Get all personEvents for this person
    const personEvents = await ctx.db
      .query("personEvents")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();

    // Get the full event details for each
    const events = await Promise.all(
      personEvents.map(async (pe) => {
        const event = await ctx.db.get(pe.eventId);
        return {
          ...event,
          role: pe.role,
          personEventId: pe._id,
        };
      })
    );

    return events.filter((e) => e !== null);
  },
});

// Link a person to an event
export const linkPerson = mutation({
  args: {
    personId: v.id("persons"),
    eventId: v.id("events"),
    role: v.union(
      v.literal("primary"),
      v.literal("witness"),
      v.literal("officiant"),
      v.literal("family"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    // Check if link already exists
    const existing = await ctx.db
      .query("personEvents")
      .withIndex("by_person_and_event", (q) =>
        q.eq("personId", args.personId).eq("eventId", args.eventId)
      )
      .first();

    if (existing) {
      // Update the role if it changed
      await ctx.db.patch(existing._id, {
        role: args.role,
      });
      return existing._id;
    }

    // Create new link
    const linkId = await ctx.db.insert("personEvents", {
      personId: args.personId,
      eventId: args.eventId,
      role: args.role,
      createdAt: Date.now(),
    });

    return linkId;
  },
});

// Unlink a person from an event
export const unlinkPerson = mutation({
  args: {
    personId: v.id("persons"),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("personEvents")
      .withIndex("by_person_and_event", (q) =>
        q.eq("personId", args.personId).eq("eventId", args.eventId)
      )
      .first();

    if (link) {
      await ctx.db.delete(link._id);
      return { success: true };
    }

    return { success: false, message: "Link not found" };
  },
});

// Update an event
export const update = mutation({
  args: {
    id: v.id("events"),
    type: v.optional(
      v.union(
        v.literal("birth"),
        v.literal("death"),
        v.literal("burial"),
        v.literal("marriage"),
        v.literal("divorce"),
        v.literal("immigration"),
        v.literal("residence"),
        v.literal("occupation"),
        v.literal("military"),
        v.literal("census"),
        v.literal("christening"),
        v.literal("naturalization"),
        v.literal("custom")
      )
    ),
    customType: v.optional(v.string()),
    date: v.optional(
      v.object({
        original: v.string(),
        formal: v.optional(v.string()),
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
        approximate: v.optional(v.boolean()),
        range: v.optional(v.boolean()),
      })
    ),
    endDate: v.optional(
      v.object({
        original: v.string(),
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
      })
    ),
    placeId: v.optional(v.id("places")),
    description: v.optional(v.string()),
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

// Delete an event
export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    // Delete all personEvent links first
    const links = await ctx.db
      .query("personEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();

    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    // Delete the event
    await ctx.db.delete(args.id);
    return { success: true };
  },
});
