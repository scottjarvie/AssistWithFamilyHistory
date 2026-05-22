import { v } from "convex/values";
import { internalMutation as mutation, internalQuery as query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type FamilyTreeNode = {
  person: Doc<"persons">;
  relationType?: Doc<"relationships">["childRelationType"];
  level: number;
  ancestors?: FamilyTreeNode[];
  descendants?: FamilyTreeNode[];
};

/**
 * RELATIONSHIPS API
 * 
 * Manages direct Person↔Person relationships following the GEDCOM X model
 * instead of the traditional Family entity.
 * 
 * This is more flexible for complex family situations:
 * - Multiple marriages (create multiple Couple relationships)
 * - Step-families (ParentChild with type "Step")
 * - Adoptions (ParentChild with type "Adopted")
 * - Unknown parents (can have one-sided relationships)
 */

// Create a Couple relationship
export const createCouple = mutation({
  args: {
    person1Id: v.id("persons"),
    person2Id: v.id("persons"),
    facts: v.optional(
      v.array(
        v.object({
          type: v.string(),
          date: v.optional(
            v.object({
              original: v.string(),
              formal: v.optional(v.string()),
              year: v.optional(v.number()),
              month: v.optional(v.number()),
              day: v.optional(v.number()),
              approximate: v.optional(v.boolean()),
            })
          ),
          place: v.optional(
            v.object({
              original: v.string(),
              placeId: v.optional(v.id("places")),
            })
          ),
          description: v.optional(v.string()),
        })
      )
    ),
    familySearchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const relationshipId = await ctx.db.insert("relationships", {
      type: "Couple",
      person1: args.person1Id,
      person2: args.person2Id,
      facts: args.facts,
      familySearchId: args.familySearchId,
      createdAt: now,
      updatedAt: now,
    });

    return relationshipId;
  },
});

// Create a ParentChild relationship
export const createParentChild = mutation({
  args: {
    parentId: v.id("persons"),
    childId: v.id("persons"),
    relationType: v.union(
      v.literal("Biological"),
      v.literal("Adopted"),
      v.literal("Step"),
      v.literal("Foster"),
      v.literal("Guardianship"),
      v.literal("Unknown")
    ),
    familySearchId: v.optional(v.string()),
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

    const relationshipId = await ctx.db.insert("relationships", {
      type: "ParentChild",
      childRelationType: args.relationType,
      person1: args.parentId,
      person2: args.childId,
      familySearchId: args.familySearchId,
      createdAt: now,
      updatedAt: now,
    });

    return { 
      success: true, 
      relationshipId 
    };
  },
});

// Get a relationship by ID
export const get = query({
  args: { id: v.id("relationships") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// List all Couple relationships
export const listCouples = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("relationships")
      .withIndex("by_type", (q) => q.eq("type", "Couple"))
      .collect();
    
    if (args.limit) {
      return relationships.slice(0, args.limit);
    }
    
    return relationships;
  },
});

// List all ParentChild relationships
export const listParentChild = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("relationships")
      .withIndex("by_type", (q) => q.eq("type", "ParentChild"))
      .collect();
    
    if (args.limit) {
      return relationships.slice(0, args.limit);
    }
    
    return relationships;
  },
});

// Get all couples for a person
export const getCouplesForPerson = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("relationships")
      .filter((q) => 
        q.and(
          q.eq(q.field("type"), "Couple"),
          q.or(
            q.eq(q.field("person1"), args.personId),
            q.eq(q.field("person2"), args.personId)
          )
        )
      )
      .collect();
    
    return relationships;
  },
});

// Get all children for a parent
export const getChildrenForParent = query({
  args: { parentId: v.id("persons") },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", args.parentId))
      .collect();
    
    return relationships;
  },
});

// Get all parents for a child
export const getParentsForChild = query({
  args: { childId: v.id("persons") },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("relationships")
      .withIndex("by_type_person2", (q) => q.eq("type", "ParentChild").eq("person2", args.childId))
      .collect();
    
    return relationships;
  },
});

// Update a relationship's facts
export const updateFacts = mutation({
  args: {
    id: v.id("relationships"),
    facts: v.array(
      v.object({
        type: v.string(),
        date: v.optional(
          v.object({
            original: v.string(),
            formal: v.optional(v.string()),
            year: v.optional(v.number()),
            month: v.optional(v.number()),
            day: v.optional(v.number()),
            approximate: v.optional(v.boolean()),
          })
        ),
        place: v.optional(
          v.object({
            original: v.string(),
            placeId: v.optional(v.id("places")),
          })
        ),
        description: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { id, facts } = args;
    
    await ctx.db.patch(id, {
      facts,
      updatedAt: Date.now(),
    });
    
    return id;
  },
});

// Update relationship type (for ParentChild relationships)
export const updateRelationType = mutation({
  args: {
    id: v.id("relationships"),
    relationType: v.union(
      v.literal("Biological"),
      v.literal("Adopted"),
      v.literal("Step"),
      v.literal("Foster"),
      v.literal("Guardianship"),
      v.literal("Unknown")
    ),
  },
  handler: async (ctx, args) => {
    const relationship = await ctx.db.get(args.id);
    if (!relationship) {
      throw new Error("Relationship not found");
    }

    if (relationship.type !== "ParentChild") {
      throw new Error("Can only update relation type for ParentChild relationships");
    }

    await ctx.db.patch(args.id, {
      childRelationType: args.relationType,
      updatedAt: Date.now(),
    });
    
    return args.id;
  },
});

// Delete a relationship
export const remove = mutation({
  args: { id: v.id("relationships") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// Get family tree data for a person (ancestors and descendants)
export const getFamilyTree = query({
  args: { 
    personId: v.id("persons"),
    generations: v.optional(v.number()), // How many generations up/down (default 3)
  },
  handler: async (ctx, args) => {
    const maxGenerations = args.generations || 3;
    const visited = new Set<string>();
    const tree = {
      person: await ctx.db.get(args.personId),
      ancestors: [] as FamilyTreeNode[],
      descendants: [] as FamilyTreeNode[],
    };

    if (!tree.person) return null;

    // Helper to get ancestors recursively
    async function getAncestors(personId: Id<"persons">, level: number): Promise<FamilyTreeNode[]> {
      if (level >= maxGenerations || visited.has(personId)) return [];
      visited.add(personId);

      const parentRels = await ctx.db
        .query("relationships")
        .withIndex("by_type_person2", (q) => q.eq("type", "ParentChild").eq("person2", personId))
        .collect();

      const ancestors = [];
      for (const rel of parentRels) {
        const parent = await ctx.db.get(rel.person1);
        if (parent) {
          ancestors.push({
            person: parent,
            relationType: rel.childRelationType,
            level,
            ancestors: await getAncestors(rel.person1, level + 1),
          });
        }
      }
      
      return ancestors;
    }

    // Helper to get descendants recursively
    async function getDescendants(personId: Id<"persons">, level: number): Promise<FamilyTreeNode[]> {
      if (level >= maxGenerations || visited.has(personId)) return [];
      visited.add(personId);

      const childRels = await ctx.db
        .query("relationships")
        .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", personId))
        .collect();

      const descendants = [];
      for (const rel of childRels) {
        const child = await ctx.db.get(rel.person2);
        if (child) {
          descendants.push({
            person: child,
            relationType: rel.childRelationType,
            level,
            descendants: await getDescendants(rel.person2, level + 1),
          });
        }
      }
      
      return descendants;
    }

    tree.ancestors = await getAncestors(args.personId, 1);
    visited.clear(); // Reset for descendants
    tree.descendants = await getDescendants(args.personId, 1);

    return tree;
  },
});
