import { v } from "convex/values";
import { internalQuery as query } from "./_generated/server";

/**
 * Get comprehensive details for an ancestor including:
 * - Basic person info
 * - All events (with places and citations)
 * - Relationships (spouses, parents, children)
 * - All citations and sources
 * - All media
 * - Research tasks
 * - Stories
 */
export const getAncestorWithDetails = query({
  args: {
    personId: v.id("persons"),
  },
  handler: async (ctx, args) => {
    // Get the person
    const person = await ctx.db.get(args.personId);
    if (!person) {
      return null;
    }

    // Get all person-event links
    const personEvents = await ctx.db
      .query("personEvents")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();

    // Get full event details with places and citations
    const events = await Promise.all(
      personEvents.map(async (pe) => {
        const event = await ctx.db.get(pe.eventId);
        if (!event) return null;

        // Get place if exists
        let place = null;
        if (event.place?.placeId) {
          place = await ctx.db.get(event.place.placeId);
        }

        // Get citations for this event
        const citationLinks = await ctx.db
          .query("citationLinks")
          .withIndex("by_target", (q) =>
            q.eq("targetType", "event").eq("targetId", pe.eventId)
          )
          .collect();

        const citations = await Promise.all(
          citationLinks.map(async (link) => {
            const citation = await ctx.db.get(link.citationId);
            if (!citation) return null;

            const source = await ctx.db.get(citation.sourceId);
            return {
              ...citation,
              source,
              field: link.field,
            };
          })
        );

        return {
          ...event,
          role: pe.role,
          place,
          citations: citations.filter((c) => c !== null),
        };
      })
    );

    // Get citations directly linked to the person
    const personCitationLinks = await ctx.db
      .query("citationLinks")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "person").eq("targetId", args.personId)
      )
      .collect();

    const personCitations = await Promise.all(
      personCitationLinks.map(async (link) => {
        const citation = await ctx.db.get(link.citationId);
        if (!citation) return null;

        const source = await ctx.db.get(citation.sourceId);
        return {
          ...citation,
          source,
          field: link.field,
        };
      })
    );

    // Get spouses (Couple relationships)
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

    const spouses = await Promise.all(
      coupleRels.map(async (rel) => {
        const spouseId = rel.person1 === args.personId ? rel.person2 : rel.person1;
        const spouse = await ctx.db.get(spouseId);
        
        // Get children of this couple
        const childRels1 = await ctx.db
          .query("relationships")
          .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", rel.person1))
          .collect();
        
        const childRels2 = await ctx.db
          .query("relationships")
          .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", rel.person2))
          .collect();
        
        // Find children who have both parents
        const sharedChildren = childRels1
          .filter((c1) => childRels2.some((c2) => c2.person2 === c1.person2))
          .map((c) => c.person2);
        
        const children = await Promise.all(
          sharedChildren.map((childId) => ctx.db.get(childId))
        );

        return {
          relationshipId: rel._id,
          spouse,
          marriageFacts: rel.facts,
          children: children.filter((c) => c !== null),
        };
      })
    );

    // Get parents (ParentChild relationships where this person is the child)
    const parentRels = await ctx.db
      .query("relationships")
      .withIndex("by_type_person2", (q) => q.eq("type", "ParentChild").eq("person2", args.personId))
      .collect();

    const parents = await Promise.all(
      parentRels.map(async (rel) => {
        const parent = await ctx.db.get(rel.person1);
        return {
          relationshipId: rel._id,
          parent,
          relationType: rel.childRelationType,
        };
      })
    );

    // Get children (ParentChild relationships where this person is the parent)
    const childRels = await ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", "ParentChild").eq("person1", args.personId))
      .collect();

    const allChildren = await Promise.all(
      childRels.map(async (rel) => {
        const child = await ctx.db.get(rel.person2);
        
        // Get the other parent (if any)
        const otherParentRels = await ctx.db
          .query("relationships")
          .withIndex("by_type_person2", (q) => q.eq("type", "ParentChild").eq("person2", rel.person2))
          .filter((q) => q.neq(q.field("person1"), args.personId))
          .collect();
        
        const otherParent = otherParentRels.length > 0
          ? await ctx.db.get(otherParentRels[0].person1)
          : null;

        return {
          relationshipId: rel._id,
          child,
          relationType: rel.childRelationType,
          otherParent,
        };
      })
    );

    // Get all media for this person
    const allMedia = await ctx.db.query("media").collect();
    const media = allMedia.filter((m) => m.personIds.includes(args.personId));

    // Get research tasks for this person
    const researchTasks = await ctx.db
      .query("researchTasks")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();

    // Get stories for this person
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();

    // Return comprehensive data
    return {
      person,
      events: events.filter((e) => e !== null),
      citations: personCitations.filter((c) => c !== null),
      spouses: spouses.filter((s) => s.spouse !== null),
      parents: parents.filter((p) => p.parent !== null),
      children: allChildren.filter((c) => c.child !== null),
      media,
      researchTasks,
      stories,
    };
  },
});

/**
 * Search for ancestors and return basic info
 */
export const searchAncestors = query({
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
    const results = matches.slice(0, limit);

    // Get basic info for each person (birth and death from embedded facts or events)
    return await Promise.all(
      results.map(async (person) => {
        // Try to get birth/death from embedded facts first
        let birthYear = person.birth?.date?.year;
        let deathYear = person.death?.date?.year;

        // If not embedded, check events table
        if (!birthYear || !deathYear) {
          const personEvents = await ctx.db
            .query("personEvents")
            .withIndex("by_person", (q) => q.eq("personId", person._id))
            .collect();

          const events = await Promise.all(
            personEvents.map((pe) => ctx.db.get(pe.eventId))
          );

          const birthEvent = events.find((e) => e?.type === "birth");
          const deathEvent = events.find((e) => e?.type === "death");

          birthYear = birthYear || birthEvent?.date?.year;
          deathYear = deathYear || deathEvent?.date?.year;
        }

        return {
          ...person,
          birthYear,
          deathYear,
        };
      })
    );
  },
});
