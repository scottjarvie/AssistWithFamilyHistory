import { v } from "convex/values";
import { internalMutation as mutation, internalQuery as query } from "./_generated/server";

// Create a person-event link
export const create = mutation({
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
    const linkId = await ctx.db.insert("personEvents", {
      personId: args.personId,
      eventId: args.eventId,
      role: args.role,
      createdAt: Date.now(),
    });
    return linkId;
  },
});

// Get all events for a person
export const getByPerson = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("personEvents")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    
    const events = [];
    for (const link of links) {
      const event = await ctx.db.get(link.eventId);
      if (event) {
        events.push({
          ...event,
          role: link.role,
          linkId: link._id,
        });
      }
    }
    
    return events;
  },
});

// Get all persons for an event
export const getByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("personEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    
    const persons = [];
    for (const link of links) {
      const person = await ctx.db.get(link.personId);
      if (person) {
        persons.push({
          ...person,
          role: link.role,
          linkId: link._id,
        });
      }
    }
    
    return persons;
  },
});

// Remove a person-event link
export const remove = mutation({
  args: { id: v.id("personEvents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});
