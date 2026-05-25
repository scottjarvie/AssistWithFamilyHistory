import { v } from "convex/values";
// GEN-73: helpers.ts exports orchestration mutations that don't accept
// vaultOwnerId. They were never called from the app surface (verified by
// grep). Internalize the whole file via alias so existing `mutation({...})`
// syntax still compiles but the underlying functions are not publicly
// callable.
import { internalMutation as mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Create a person with embedded birth fact
 * 
 * GEDCOM X approach: Common facts (birth, death) are embedded on Person
 * for fast reads, and also stored in events table for complex queries.
 */
export const createPersonWithBirth = mutation({
  args: {
    // Person details
    name: v.object({
      given: v.string(),
      surname: v.string(),
      suffix: v.optional(v.string()),
      prefix: v.optional(v.string()),
      nickname: v.optional(v.string()),
    }),
    sex: v.union(v.literal("male"), v.literal("female"), v.literal("unknown")),
    living: v.boolean(),
    fsId: v.optional(v.string()),
    
    // Birth fact details
    birthDate: v.optional(
      v.object({
        original: v.string(),
        formal: v.optional(v.string()),
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
        approximate: v.optional(v.boolean()),
      })
    ),
    birthPlace: v.optional(
      v.object({
        original: v.string(),
        placeId: v.optional(v.id("places")),
      })
    ),
    birthDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Create the person with embedded birth fact
    const personId = await ctx.db.insert("persons", {
      name: args.name,
      sex: args.sex,
      living: args.living,
      fsId: args.fsId,
      researchStatus: "basic",
      birth: args.birthDate || args.birthPlace
        ? {
            date: args.birthDate,
            place: args.birthPlace,
            description: args.birthDescription,
          }
        : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Also create a standalone event for complex queries
    let birthEventId = null;
    if (args.birthDate || args.birthPlace) {
      birthEventId = await ctx.db.insert("events", {
        type: "birth",
        date: args.birthDate,
        place: args.birthPlace,
        description: args.birthDescription,
        createdAt: now,
        updatedAt: now,
      });

      // Link person to birth event
      await ctx.db.insert("personEvents", {
        personId,
        eventId: birthEventId,
        role: "primary",
        createdAt: now,
      });
    }

    return {
      personId,
      birthEventId,
    };
  },
});

/**
 * Create a couple relationship with marriage fact
 * 
 * GEDCOM X: Relationships are direct Person↔Person, not Family entities
 * Marriage facts are embedded on the Relationship
 */
export const createCoupleWithMarriage = mutation({
  args: {
    person1Id: v.id("persons"),
    person2Id: v.id("persons"),
    marriageDate: v.optional(
      v.object({
        original: v.string(),
        formal: v.optional(v.string()),
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
        approximate: v.optional(v.boolean()),
      })
    ),
    marriagePlace: v.optional(
      v.object({
        original: v.string(),
        placeId: v.optional(v.id("places")),
      })
    ),
    marriageDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Create marriage event for complex queries
    let marriageEventId = null;
    if (args.marriageDate || args.marriagePlace) {
      marriageEventId = await ctx.db.insert("events", {
        type: "marriage",
        date: args.marriageDate,
        place: args.marriagePlace,
        description: args.marriageDescription,
        createdAt: now,
        updatedAt: now,
      });

      // Link both spouses to the marriage event
      await ctx.db.insert("personEvents", {
        personId: args.person1Id,
        eventId: marriageEventId,
        role: "primary",
        createdAt: now,
      });
      
      await ctx.db.insert("personEvents", {
        personId: args.person2Id,
        eventId: marriageEventId,
        role: "primary",
        createdAt: now,
      });
    }

    // Create the Couple relationship with embedded marriage fact
    const relationshipId = await ctx.db.insert("relationships", {
      type: "Couple",
      person1: args.person1Id,
      person2: args.person2Id,
      facts: args.marriageDate || args.marriagePlace
        ? [
            {
              type: "Marriage",
              date: args.marriageDate,
              place: args.marriagePlace,
              description: args.marriageDescription,
            },
          ]
        : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return {
      relationshipId,
      marriageEventId,
    };
  },
});

/**
 * Create a parent-child relationship
 * 
 * GEDCOM X: Direct relationship, no Family entity needed
 * Supports biological, adopted, step, foster, etc.
 */
export const createParentChildRelationship = mutation({
  args: {
    parentId: v.id("persons"),
    childId: v.id("persons"),
    relationType: v.optional(
      v.union(
        v.literal("Biological"),
        v.literal("Adopted"),
        v.literal("Step"),
        v.literal("Foster"),
        v.literal("Guardianship"),
        v.literal("Unknown")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if relationship already exists
    const existing = await ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", args.parentId))
      .filter((q) => q.eq(q.field("person2"), args.childId))
      .first();

    if (existing) {
      return { 
        success: false, 
        message: "Relationship already exists",
        relationshipId: existing._id
      };
    }

    // Create the ParentChild relationship
    const relationshipId = await ctx.db.insert("relationships", {
      type: "ParentChild",
      childRelationType: args.relationType || "Biological",
      person1: args.parentId,
      person2: args.childId,
      createdAt: now,
      updatedAt: now,
    });

    return { 
      success: true, 
      relationshipId 
    };
  },
});

/**
 * Add a child to a couple (creates two ParentChild relationships)
 * 
 * This is more flexible than the old Family model:
 * - Handles step-parents (one biological, one step)
 * - Handles adoptions (both adopted)
 * - Handles unknown parents (only one relationship created)
 */
export const addChildToCouple = mutation({
  args: {
    coupleRelationshipId: v.id("relationships"),
    childId: v.id("persons"),
    parent1RelationType: v.optional(
      v.union(
        v.literal("Biological"),
        v.literal("Adopted"),
        v.literal("Step"),
        v.literal("Foster"),
        v.literal("Guardianship"),
        v.literal("Unknown")
      )
    ),
    parent2RelationType: v.optional(
      v.union(
        v.literal("Biological"),
        v.literal("Adopted"),
        v.literal("Step"),
        v.literal("Foster"),
        v.literal("Guardianship"),
        v.literal("Unknown")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Get the couple relationship
    const coupleRel = await ctx.db.get(args.coupleRelationshipId);
    if (!coupleRel || coupleRel.type !== "Couple") {
      throw new Error("Invalid couple relationship");
    }

    // Create parent-child relationships
    const rel1Id = await ctx.db.insert("relationships", {
      type: "ParentChild",
      childRelationType: args.parent1RelationType || "Biological",
      person1: coupleRel.person1,
      person2: args.childId,
      createdAt: now,
      updatedAt: now,
    });

    const rel2Id = await ctx.db.insert("relationships", {
      type: "ParentChild",
      childRelationType: args.parent2RelationType || "Biological",
      person1: coupleRel.person2,
      person2: args.childId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      parent1RelationshipId: rel1Id,
      parent2RelationshipId: rel2Id,
    };
  },
});

/**
 * Remove a parent-child relationship
 */
export const removeParentChildRelationship = mutation({
  args: {
    relationshipId: v.id("relationships"),
  },
  handler: async (ctx, args) => {
    const relationship = await ctx.db.get(args.relationshipId);
    if (!relationship) {
      throw new Error("Relationship not found");
    }

    if (relationship.type !== "ParentChild") {
      throw new Error("Not a parent-child relationship");
    }

    await ctx.db.delete(args.relationshipId);

    return { success: true };
  },
});

/**
 * Create a hierarchical place (city → county → state → country)
 * 
 * GEDCOM X: Places have jurisdiction hierarchy
 * This creates the full chain and returns the leaf node
 */
export const createHierarchicalPlace = mutation({
  args: {
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.string(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let parentId: Id<"places"> | undefined = undefined;

    // Create country
    const countryId = await ctx.db.insert("places", {
      name: args.country,
      fullName: args.country,
      type: "country",
      createdAt: now,
      updatedAt: now,
    });
    parentId = countryId;

    // Create state if provided
    let stateId: Id<"places"> | undefined = undefined;
    if (args.state) {
      stateId = await ctx.db.insert("places", {
        name: args.state,
        fullName: `${args.state}, ${args.country}`,
        type: "state",
        parentId,
        createdAt: now,
        updatedAt: now,
      });
      parentId = stateId;
    }

    // Create county if provided
    let countyId: Id<"places"> | undefined = undefined;
    if (args.county) {
      const fullName = args.state
        ? `${args.county}, ${args.state}, ${args.country}`
        : `${args.county}, ${args.country}`;
      
      countyId = await ctx.db.insert("places", {
        name: args.county,
        fullName,
        type: "county",
        parentId,
        createdAt: now,
        updatedAt: now,
      });
      parentId = countyId;
    }

    // Create city if provided
    let cityId: Id<"places"> | undefined = undefined;
    if (args.city) {
      const parts = [args.city];
      if (args.county) parts.push(args.county);
      if (args.state) parts.push(args.state);
      parts.push(args.country);
      
      cityId = await ctx.db.insert("places", {
        name: args.city,
        fullName: parts.join(", "),
        type: "city",
        parentId,
        latitude: args.latitude,
        longitude: args.longitude,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      countryId,
      stateId,
      countyId,
      cityId,
      leafPlaceId: cityId || countyId || stateId || countryId,
    };
  },
});

/**
 * Create a citation with evidence/conclusion distinction
 * 
 * GEDCOM X: Distinguishes evidence (raw from records) from conclusions (interpreted)
 */
export const createCitation = mutation({
  args: {
    sourceId: v.id("sources"),
    isEvidence: v.boolean(),
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
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const citationId = await ctx.db.insert("citations", {
      sourceId: args.sourceId,
      isEvidence: args.isEvidence,
      page: args.page,
      confidence: args.confidence,
      extractedText: args.extractedText,
      editedText: args.editedText,
      url: args.url,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    return citationId;
  },
});

/**
 * Link a citation to a person, relationship, event, or place
 */
export const linkCitation = mutation({
  args: {
    citationId: v.id("citations"),
    targetType: v.union(
      v.literal("person"),
      v.literal("relationship"),
      v.literal("event"),
      v.literal("place")
    ),
    targetId: v.string(),
    field: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const linkId = await ctx.db.insert("citationLinks", {
      citationId: args.citationId,
      targetType: args.targetType,
      targetId: args.targetId,
      field: args.field,
      createdAt: now,
    });

    return linkId;
  },
});

/**
 * Initialize FamilySearch sync tracking for a person
 */
export const initializeFamilySearchSync = mutation({
  args: {
    personId: v.id("persons"),
    fsPersonId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if sync tracking already exists
    const existing = await ctx.db
      .query("familySearchSync")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .first();

    if (existing) {
      return { 
        success: false, 
        message: "Sync tracking already exists",
        syncId: existing._id
      };
    }

    const syncId = await ctx.db.insert("familySearchSync", {
      personId: args.personId,
      fsPersonId: args.fsPersonId,
      lastSynced: now,
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    });

    return { 
      success: true, 
      syncId 
    };
  },
});

/**
 * Record a sync change for conflict detection
 */
export const recordSyncChange = mutation({
  args: {
    syncId: v.id("familySearchSync"),
    changeType: v.string(),
    source: v.union(v.literal("local"), v.literal("familysearch")),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const sync = await ctx.db.get(args.syncId);
    if (!sync) {
      throw new Error("Sync record not found");
    }

    const now = Date.now();
    const newChange = {
      timestamp: now,
      changeType: args.changeType,
      source: args.source,
      description: args.description,
    };

    const changeHistory = sync.changeHistory || [];
    changeHistory.push(newChange);

    await ctx.db.patch(args.syncId, {
      changeHistory,
      updatedAt: now,
    });

    return { success: true };
  },
});
