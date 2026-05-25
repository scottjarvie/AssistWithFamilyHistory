import { v } from "convex/values";
import { internalMutation as mutation, internalQuery as query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// Create a new person
export const create = mutation({
  args: {
    fsId: v.optional(v.string()),
    name: v.object({
      given: v.string(),
      surname: v.string(),
      suffix: v.optional(v.string()),
      prefix: v.optional(v.string()),
      nickname: v.optional(v.string()),
    }),
    alternateNames: v.optional(
      v.array(
        v.object({
          type: v.string(),
          given: v.string(),
          surname: v.string(),
          suffix: v.optional(v.string()),
          prefix: v.optional(v.string()),
        })
      )
    ),
    sex: v.union(v.literal("male"), v.literal("female"), v.literal("unknown")),
    living: v.boolean(),
    birth: v.optional(
      v.object({
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
    death: v.optional(
      v.object({
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
    researchStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("basic"),
        v.literal("in_progress"),
        v.literal("thorough"),
        v.literal("complete")
      )
    ),
    researchPriority: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const personId = await ctx.db.insert("persons", {
      ...args,
      researchStatus: args.researchStatus || "not_started",
      createdAt: now,
      updatedAt: now,
    });
    return personId;
  },
});

// Get a person by ID
export const get = query({
  args: { id: v.id("persons") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get a person by FamilySearch ID
export const getByFsId = query({
  args: { fsId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("persons")
      .withIndex("by_fsId", (q) => q.eq("fsId", args.fsId))
      .first();
  },
});

// List all persons with optional filters
export const list = query({
  args: {
    living: v.optional(v.boolean()),
    researchStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("basic"),
        v.literal("in_progress"),
        v.literal("thorough"),
        v.literal("complete")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const applyLimit = (rows: Doc<"persons">[]) =>
      args.limit ? rows.slice(0, args.limit) : rows;

    if (args.living !== undefined) {
      const results = await ctx.db
        .query("persons")
        .withIndex("by_living", (q) => q.eq("living", args.living!))
        .collect();
      return applyLimit(results);
    }

    if (args.researchStatus !== undefined) {
      const results = await ctx.db
        .query("persons")
        .withIndex("by_research_status", (q) => q.eq("researchStatus", args.researchStatus!))
        .collect();
      return applyLimit(results);
    }

    const results = await ctx.db.query("persons").collect();
    return applyLimit(results);
  },
});

// Search persons by name
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allPersons = await ctx.db.query("persons").collect();
    const searchLower = args.query.toLowerCase();

    const matches = allPersons.filter((person) => {
      const fullName = `${person.name.given} ${person.name.surname}`.toLowerCase();
      const surname = person.name.surname.toLowerCase();
      const given = person.name.given.toLowerCase();
      
      // Match full name, surname, or given name
      if (fullName.includes(searchLower)) return true;
      if (surname.includes(searchLower)) return true;
      if (given.includes(searchLower)) return true;
      
      // Check alternate names
      if (person.alternateNames) {
        for (const altName of person.alternateNames) {
          const altFullName = `${altName.given} ${altName.surname}`.toLowerCase();
          if (altFullName.includes(searchLower)) return true;
        }
      }
      
      // Check FamilySearch ID
      if (person.fsId && person.fsId.toLowerCase().includes(searchLower)) {
        return true;
      }
      
      return false;
    });

    const limit = args.limit || 50;
    return matches.slice(0, limit);
  },
});

// Update a person
export const update = mutation({
  args: {
    id: v.id("persons"),
    fsId: v.optional(v.string()),
    name: v.optional(
      v.object({
        given: v.string(),
        surname: v.string(),
        suffix: v.optional(v.string()),
        prefix: v.optional(v.string()),
        nickname: v.optional(v.string()),
      })
    ),
    alternateNames: v.optional(
      v.array(
        v.object({
          type: v.string(),
          given: v.string(),
          surname: v.string(),
          suffix: v.optional(v.string()),
          prefix: v.optional(v.string()),
        })
      )
    ),
    sex: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("unknown"))),
    living: v.optional(v.boolean()),
    birth: v.optional(
      v.object({
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
    death: v.optional(
      v.object({
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
    researchStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("basic"),
        v.literal("in_progress"),
        v.literal("thorough"),
        v.literal("complete")
      )
    ),
    researchPriority: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
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

// Update only the birth fact
export const updateBirth = mutation({
  args: {
    id: v.id("persons"),
    birth: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      birth: args.birth,
      updatedAt: Date.now(),
    });
    
    return args.id;
  },
});

// Update only the death fact
export const updateDeath = mutation({
  args: {
    id: v.id("persons"),
    death: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      death: args.death,
      living: false, // If we have death info, they're not living
      updatedAt: Date.now(),
    });
    
    return args.id;
  },
});

// Delete a person (and all their relationships)
export const remove = mutation({
  args: { id: v.id("persons") },
  handler: async (ctx, args) => {
    // Delete all relationships where this person is involved
    const relationships = await ctx.db
      .query("relationships")
      .filter((q) => 
        q.or(
          q.eq(q.field("person1"), args.id),
          q.eq(q.field("person2"), args.id)
        )
      )
      .collect();
    
    for (const rel of relationships) {
      await ctx.db.delete(rel._id);
    }
    
    // Delete all person-event links
    const personEvents = await ctx.db
      .query("personEvents")
      .withIndex("by_person", (q) => q.eq("personId", args.id))
      .collect();
    
    for (const pe of personEvents) {
      await ctx.db.delete(pe._id);
    }
    
    // Delete the person
    await ctx.db.delete(args.id);
    
    return { success: true };
  },
});

// Get all parents of a person
export const getParents = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    // Find all ParentChild relationships where this person is the child
    const relationships = await ctx.db
      .query("relationships")
      .withIndex("by_type_person2", (q) => q.eq("type", "ParentChild").eq("person2", args.personId))
      .collect();
    
    const parents = [];
    for (const rel of relationships) {
      const parent = await ctx.db.get(rel.person1);
      if (parent) {
        parents.push({
          person: parent,
          relationType: rel.childRelationType,
          relationshipId: rel._id,
        });
      }
    }
    
    return parents;
  },
});

// Get all children of a person
export const getChildren = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    // Find all ParentChild relationships where this person is the parent
    const relationships = await ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", args.personId))
      .collect();
    
    const children = [];
    for (const rel of relationships) {
      const child = await ctx.db.get(rel.person2);
      if (child) {
        children.push({
          person: child,
          relationType: rel.childRelationType,
          relationshipId: rel._id,
        });
      }
    }
    
    return children;
  },
});

// Get all spouses of a person
export const getSpouses = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    // Find all Couple relationships where this person is either person1 or person2
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
    
    const spouses = [];
    for (const rel of relationships) {
      const spouseId = rel.person1 === args.personId ? rel.person2 : rel.person1;
      const spouse = await ctx.db.get(spouseId);
      if (spouse) {
        spouses.push({
          person: spouse,
          relationshipId: rel._id,
          marriageFacts: rel.facts,
        });
      }
    }
    
    return spouses;
  },
});

// Get family summary for a person (parents, spouses, children)
export const getFamilySummary = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person) {
      return null;
    }

    // Get parents
    const parentRels = await ctx.db
      .query("relationships")
      .withIndex("by_type_person2", (q) => q.eq("type", "ParentChild").eq("person2", args.personId))
      .collect();
    
    const parents = [];
    for (const rel of parentRels) {
      const parent = await ctx.db.get(rel.person1);
      if (parent) {
        parents.push({
          person: parent,
          relationType: rel.childRelationType,
        });
      }
    }

    // Get spouses
    const coupleRels = await ctx.db
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
    
    const spouses = [];
    for (const rel of coupleRels) {
      const spouseId = rel.person1 === args.personId ? rel.person2 : rel.person1;
      const spouse = await ctx.db.get(spouseId);
      if (spouse) {
        spouses.push({
          person: spouse,
          marriageFacts: rel.facts,
        });
      }
    }

    // Get children
    const childRels = await ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", args.personId))
      .collect();
    
    const children = [];
    for (const rel of childRels) {
      const child = await ctx.db.get(rel.person2);
      if (child) {
        children.push({
          person: child,
          relationType: rel.childRelationType,
        });
      }
    }

    return {
      person,
      parents,
      spouses,
      children,
    };
  },
});
