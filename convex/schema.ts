import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Discover Their Stories - Convex Schema
 * 
 * This schema follows the GEDCOM X data model adapted for Convex's document-oriented storage.
 * 
 * Key Design Decisions:
 * - Uses GEDCOM X's relationship model (Person↔Person) instead of Gramps' Family entity
 * - Embeds common facts (birth, death) on Person for fast reads
 * - Maintains Source/Citation separation for genealogical rigor
 * - Tracks FamilySearch sync state per person
 * - Distinguishes evidence (raw from records) from conclusions (researcher's interpretation)
 * - Hierarchical places with temporal support
 * - AI-first extensions for storytelling and research
 */

export default defineSchema({
  /**
   * PERSONS
   * Core entity representing an individual (alive or deceased)
   * GEDCOM X: Person extends Subject extends Conclusion
   */
  persons: defineTable({
    vaultOwnerId: v.optional(v.string()),
    // FamilySearch Integration
    fsId: v.optional(v.string()),              // FamilySearch Person ID (e.g., "KWCJ-RN4")
    qualityScore: v.optional(v.string()),      // FamilySearch quality score
    
    // Name structure (primary name)
    name: v.object({
      given: v.string(),
      surname: v.string(),
      suffix: v.optional(v.string()),
      prefix: v.optional(v.string()),
      nickname: v.optional(v.string()),
    }),
    
    // Alternate names (married names, nicknames, spelling variations)
    alternateNames: v.optional(
      v.array(
        v.object({
          type: v.string(),                     // "BirthName", "MarriedName", "Nickname", "AlsoKnownAs", etc.
          given: v.string(),
          surname: v.string(),
          suffix: v.optional(v.string()),
          prefix: v.optional(v.string()),
        })
      )
    ),
    
    // Basic attributes
    sex: v.union(v.literal("male"), v.literal("female"), v.literal("unknown")),
    living: v.boolean(),
    
    // Embedded common facts for fast reads (GEDCOM X: Facts)
    // These are duplicated in the events table for complex queries
    birth: v.optional(
      v.object({
        date: v.optional(
          v.object({
            original: v.string(),               // "1 Jan 1900" (user-entered)
            formal: v.optional(v.string()),     // "+1900-01-01" (GEDCOM X format)
            year: v.optional(v.number()),
            month: v.optional(v.number()),
            day: v.optional(v.number()),
            approximate: v.optional(v.boolean()),
          })
        ),
        place: v.optional(
          v.object({
            original: v.string(),               // "Salt Lake City, Utah"
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
    
    // Research tracking
    researchStatus: v.union(
      v.literal("not_started"),
      v.literal("basic"),
      v.literal("in_progress"),
      v.literal("thorough"),
      v.literal("complete")
    ),
    researchPriority: v.optional(v.number()),   // 1-10
    
    // Notes and tags
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_fsId", ["fsId"])
    .index("by_surname", ["name.surname"])
    .index("by_research_status", ["researchStatus"])
    .index("by_living", ["living"]),

  /**
   * RELATIONSHIPS
   * Direct Person↔Person relationships (replaces the Family entity)
   * GEDCOM X: Relationship (type: Couple, ParentChild, etc.)
   * 
   * This is cleaner for:
   * - Remarriages (multiple Couple relationships)
   * - Step-families (ParentChild relationships with different types)
   * - Complex family situations (adoptions, guardianships)
   * - Unknown parents (can have one-sided relationships)
   */
  relationships: defineTable({
    vaultOwnerId: v.optional(v.string()),
    type: v.union(
      v.literal("Couple"),                      // Marriage, partnership
      v.literal("ParentChild"),                 // Biological, adopted, step, foster, etc.
      v.literal("Godparent"),
      v.literal("Guardian"),
      v.literal("Other")
    ),
    
    // Relationship type details (for ParentChild)
    childRelationType: v.optional(
      v.union(
        v.literal("Biological"),
        v.literal("Adopted"),
        v.literal("Step"),
        v.literal("Foster"),
        v.literal("Guardianship"),
        v.literal("Unknown")
      )
    ),
    
    // Direct person references
    person1: v.id("persons"),                   // Parent or Spouse1
    person2: v.id("persons"),                   // Child or Spouse2
    
    // Relationship facts (e.g., marriage date/place for Couple relationships)
    facts: v.optional(
      v.array(
        v.object({
          type: v.string(),                     // "Marriage", "Divorce", "Annulment", etc.
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
    
    // FamilySearch integration
    familySearchId: v.optional(v.string()),
    importKey: v.optional(v.string()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person1", ["person1"])
    .index("by_person2", ["person2"])
    .index("by_type", ["type"])
    .index("by_type_person1", ["type", "person1"])     // Find all relationships of a type for person1
    .index("by_type_person2", ["type", "person2"])    // Find all relationships of a type for person2
    .index("by_import_key", ["importKey"])
    .index("by_familySearchId", ["familySearchId"]),

  /**
   * EVENTS
   * Standalone events (baptism, burial, census, occupation, etc.)
   * Not embedded on Person for:
   * - Multiple people at same event (witness, officiant)
   * - Complex date ranges
   * - Events that might not have a person yet
   */
  events: defineTable({
    vaultOwnerId: v.optional(v.string()),
    type: v.union(
      v.literal("birth"),
      v.literal("death"),
      v.literal("burial"),
      v.literal("baptism"),
      v.literal("christening"),
      v.literal("marriage"),
      v.literal("divorce"),
      v.literal("immigration"),
      v.literal("emigration"),
      v.literal("residence"),
      v.literal("occupation"),
      v.literal("military"),
      v.literal("census"),
      v.literal("naturalization"),
      v.literal("probate"),
      v.literal("land_record"),
      v.literal("custom")
    ),
    customType: v.optional(v.string()),
    
    // Date information
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
    
    // Location and details
    place: v.optional(
      v.object({
        original: v.string(),
        placeId: v.optional(v.id("places")),
      })
    ),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    importKey: v.optional(v.string()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_type", ["type"])
    .index("by_place", ["place.placeId"])
    .index("by_import_key", ["importKey"]),

  /**
   * PERSON EVENTS
   * Links persons to events with roles
   * GEDCOM X: EventRole
   */
  personEvents: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.id("persons"),
    eventId: v.id("events"),
    role: v.union(
      v.literal("primary"),                     // The person this event is about
      v.literal("witness"),                     // Witnessed the event
      v.literal("officiant"),                   // Performed the ceremony
      v.literal("family"),                      // Family member present
      v.literal("other")
    ),
    
    // Metadata
    createdAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"])
    .index("by_event", ["eventId"])
    .index("by_person_and_event", ["personId", "eventId"]),

  /**
   * PLACES
   * Hierarchical place descriptions
   * GEDCOM X: PlaceDescription with temporal support
   */
  places: defineTable({
    vaultOwnerId: v.optional(v.string()),
    name: v.string(),
    fullName: v.string(),                       // Full hierarchical name
    type: v.union(
      v.literal("country"),
      v.literal("state"),
      v.literal("county"),
      v.literal("city"),
      v.literal("town"),
      v.literal("village"),
      v.literal("parish"),
      v.literal("address"),
      v.literal("other")
    ),
    
    // Hierarchical structure
    parentId: v.optional(v.id("places")),       // jurisdiction hierarchy
    
    // Geographic coordinates
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    
    // Temporal description (places change names over time)
    temporalDescription: v.optional(
      v.object({
        startYear: v.optional(v.number()),
        endYear: v.optional(v.number()),
        formerNames: v.optional(v.array(v.string())),
      })
    ),
    
    // Additional info
    notes: v.optional(v.string()),
    
    // FamilySearch integration
    familySearchId: v.optional(v.string()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_name", ["name"])
    .index("by_parent", ["parentId"])
    .index("by_type", ["type"])
    .index("by_fsId", ["familySearchId"]),

  /**
   * SOURCES
   * Top-level source descriptions
   * GEDCOM X: SourceDescription
   * 
   * Follows Gramps' proven pattern: Source is the container (book, census, etc.),
   * Citation is the specific reference (page 42, line 3).
   */
  sources: defineTable({
    vaultOwnerId: v.optional(v.string()),
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
      v.literal("repository"),
      v.literal("collection"),
      v.literal("other")
    ),
    
    // Source details
    repository: v.optional(v.string()),
    url: v.optional(v.string()),
    fsId: v.optional(v.string()),
    importKey: v.optional(v.string()),
    author: v.optional(v.string()),
    publicationDate: v.optional(v.string()),
    
    // Coverage (what time/place does this source cover?)
    coverage: v.optional(
      v.object({
        temporal: v.optional(
          v.object({
            startYear: v.optional(v.number()),
            endYear: v.optional(v.number()),
          })
        ),
        spatial: v.optional(v.id("places")),
      })
    ),
    
    // Notes
    notes: v.optional(v.string()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_type", ["type"])
    .index("by_fsId", ["fsId"])
    .index("by_repository", ["repository"])
    .index("by_import_key", ["importKey"]),

  /**
   * CITATIONS
   * Specific references within sources
   * Links to persons, relationships, events, places
   * 
   * Evidence vs Conclusion Model:
   * - isEvidence: true = raw data extracted from a source (persona)
   * - isEvidence: false = researcher's conclusion combining multiple sources
   */
  citations: defineTable({
    vaultOwnerId: v.optional(v.string()),
    sourceId: v.id("sources"),
    
    // Evidence vs Conclusion (GEDCOM X distinction)
    isEvidence: v.boolean(),                    // true = raw from record, false = researcher's conclusion
    
    // Citation details
    importKey: v.optional(v.string()),
    page: v.optional(v.string()),               // "Page 42, Line 3"
    confidence: v.union(
      v.literal("very_high"),                   // 4 - Direct, original record
      v.literal("high"),                        // 3 - Derivative, solid evidence
      v.literal("medium"),                      // 2 - Circumstantial but reasonable
      v.literal("low"),                         // 1 - Weak or conflicting
      v.literal("very_low")                     // 0 - Highly questionable
    ),
    
    // Text extraction
    extractedText: v.optional(v.string()),      // Verbatim from source
    editedText: v.optional(v.string()),         // Cleaned up or interpreted
    
    // Access info
    url: v.optional(v.string()),
    accessDate: v.optional(v.string()),
    
    // Notes and conflicts
    notes: v.optional(v.string()),
    conflictsWith: v.optional(v.array(v.id("citations"))),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_source", ["sourceId"])
    .index("by_confidence", ["confidence"])
    .index("by_import_key", ["importKey"]),

  /**
   * CITATION LINKS
   * Links citations to the entities they support
   * (persons, relationships, events, places)
   */
  citationLinks: defineTable({
    vaultOwnerId: v.optional(v.string()),
    citationId: v.id("citations"),
    targetType: v.union(
      v.literal("person"),
      v.literal("relationship"),
      v.literal("event"),
      v.literal("place")
    ),
    targetId: v.string(),                       // ID of the linked record
    field: v.optional(v.string()),              // What specific field this supports
    
    // Metadata
    createdAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_citation", ["citationId"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_citation_and_target", ["citationId", "targetType", "targetId"]),

  /**
   * SOURCE FACTS
   * Citation-backed facts extracted from indexed source fields.
   *
   * These are candidates for review and traceability. They do not silently
   * overwrite canonical person fields.
   */
  sourceFacts: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.id("persons"),
    sourceId: v.id("sources"),
    citationId: v.id("citations"),
    importKey: v.string(),
    factType: v.union(
      v.literal("name"),
      v.literal("sex"),
      v.literal("birth"),
      v.literal("death"),
      v.literal("marriage"),
      v.literal("census_residence"),
      v.literal("residence"),
      v.literal("occupation"),
      v.literal("other")
    ),
    label: v.string(),
    value: v.string(),
    date: v.optional(v.string()),
    place: v.optional(v.string()),
    confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    status: v.union(
      v.literal("candidate"),
      v.literal("accepted"),
      v.literal("conflict"),
      v.literal("rejected")
    ),
    conflictReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"])
    .index("by_source", ["sourceId"])
    .index("by_citation", ["citationId"])
    .index("by_import_key", ["importKey"])
    .index("by_status", ["status"]),

  /**
   * MEDIA
   * Photos, documents, scans, videos, audio
   */
  media: defineTable({
    vaultOwnerId: v.optional(v.string()),
    type: v.union(
      v.literal("photo"),
      v.literal("document"),
      v.literal("scan"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("other")
    ),
    
    // Basic info
    title: v.string(),
    description: v.optional(v.string()),
    
    // File location
    filePath: v.optional(v.string()),
    url: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    
    // Date
    date: v.optional(
      v.object({
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
      })
    ),
    
    // Links
    personIds: v.array(v.id("persons")),
    sourceId: v.optional(v.id("sources")),
    importKey: v.optional(v.string()),
    
    // FamilySearch integration
    familySearchUrl: v.optional(v.string()),

    // Privacy and publishing review
    privacyLevel: v.optional(
      v.union(
        v.literal("private"),
        v.literal("family_review"),
        v.literal("publish_candidate"),
        v.literal("public_source")
      )
    ),
    reviewStatus: v.optional(
      v.union(
        v.literal("unreviewed"),
        v.literal("reviewed"),
        v.literal("redacted"),
        v.literal("rejected")
      )
    ),
    rightsStatus: v.optional(
      v.union(
        v.literal("unknown"),
        v.literal("owned"),
        v.literal("permitted"),
        v.literal("public_domain"),
        v.literal("restricted")
      )
    ),
    aiUseAllowed: v.optional(v.boolean()),
    privacyReviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_type", ["type"])
    .index("by_source", ["sourceId"])
    .index("by_import_key", ["importKey"])
    .index("by_familySearchUrl", ["familySearchUrl"]),

  /**
   * CONTEXT ITEMS
   * Loose, review-first context: notes, snippets, documents, cemetery/building
   * details, research clues, and generated summaries.
   */
  contextItems: defineTable({
    vaultOwnerId: v.optional(v.string()),
    title: v.string(),
    itemType: v.union(
      v.literal("note"),
      v.literal("document_ref"),
      v.literal("research_snippet"),
      v.literal("memory_note"),
      v.literal("place_context"),
      v.literal("building_context"),
      v.literal("generated_summary"),
      v.literal("other")
    ),
    evidenceRole: v.union(
      v.literal("raw_material"),
      v.literal("researcher_conclusion"),
      v.literal("generated_summary"),
      v.literal("lead_or_hint"),
      v.literal("background_context")
    ),
    content: v.string(),
    sourceLabel: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    provenanceNote: v.optional(v.string()),
    primaryPersonId: v.optional(v.id("persons")),
    personIds: v.array(v.id("persons")),
    placeIds: v.optional(v.array(v.id("places"))),
    eventIds: v.optional(v.array(v.id("events"))),
    storyIds: v.optional(v.array(v.id("stories"))),
    sourceIds: v.optional(v.array(v.id("sources"))),
    privacyLevel: v.union(
      v.literal("private"),
      v.literal("family_review"),
      v.literal("publish_candidate"),
      v.literal("public_source")
    ),
    reviewStatus: v.union(
      v.literal("unreviewed"),
      v.literal("reviewed"),
      v.literal("disputed"),
      v.literal("redacted"),
      v.literal("rejected")
    ),
    aiUseAllowed: v.boolean(),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_primary_person", ["primaryPersonId"]),

  /**
   * IMPORT RUNS
   * Canonical record of capture imports and merge outcomes
   */
  importRuns: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.optional(v.id("persons")),
    personFsId: v.string(),
    personName: v.string(),
    captureId: v.string(),
    captureVersion: v.string(),
    pageTypes: v.array(
      v.union(v.literal("sources"), v.literal("memories"), v.literal("person"))
    ),
    sourceUrls: v.array(v.string()),
    capturedAt: v.number(),
    importedAt: v.number(),
    compatibilityMode: v.boolean(),
    mergeStatus: v.union(
      v.literal("created"),
      v.literal("merged"),
      v.literal("updated"),
      v.literal("partial")
    ),
    counts: v.object({
      sources: v.number(),
      citations: v.number(),
      memories: v.number(),
      relationships: v.number(),
      places: v.number(),
      events: v.number(),
      warnings: v.number(),
    }),
    warnings: v.array(v.string()),
    artifactPaths: v.object({
      capturePackagePath: v.optional(v.string()),
      evidencePackPath: v.optional(v.string()),
      rawDocumentPath: v.optional(v.string()),
      contextualizedPath: v.optional(v.string()),
    }),
    metadata: v.optional(
      v.object({
        extractorVersion: v.optional(v.string()),
        mode: v.optional(v.union(v.literal("standard"), v.literal("admin"))),
        pageTitle: v.optional(v.string()),
      })
    ),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"])
    .index("by_person_fsId", ["personFsId"])
    .index("by_imported_at", ["importedAt"])
    .index("by_capture_id", ["captureId"]),

  /**
   * FAMILYSEARCH SYNC
   * Tracks sync state per person
   * 
   * Enables:
   * - Knowing when each person was last synced
   * - Tracking what changed since last sync
   * - Avoiding redundant API calls
   * - Conflict detection (local changes vs remote)
   */
  familySearchSync: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.id("persons"),
    fsPersonId: v.string(),                     // FamilySearch Person ID
    
    // Sync metadata
    lastSynced: v.number(),                     // Unix timestamp
    syncStatus: v.union(
      v.literal("never_synced"),
      v.literal("synced"),
      v.literal("conflict"),                    // Local changes + remote changes
      v.literal("error")
    ),
    
    // Change tracking
    changeHistory: v.optional(
      v.array(
        v.object({
          timestamp: v.number(),
          changeType: v.string(),               // "name_change", "fact_added", etc.
          source: v.union(v.literal("local"), v.literal("familysearch")),
          description: v.string(),
        })
      )
    ),
    
    // Error tracking
    lastError: v.optional(v.string()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"]),

  /**
   * RESEARCH TASKS
   * AI-suggested or user-created research tasks
   */
  researchTasks: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.optional(v.id("persons")),
    type: v.union(
      v.literal("source_extraction"),
      v.literal("record_search"),
      v.literal("conflict_resolution"),
      v.literal("story_writing"),
      v.literal("context_research"),
      v.literal("verification"),
      v.literal("other")
    ),
    
    // Task details
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("done")
    ),
    priority: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    
    // AI suggestions
    aiSuggested: v.boolean(),
    suggestedSources: v.optional(v.array(v.string())),
    
    // Assignment
    assignedTo: v.optional(v.string()),
    
    // Notes
    notes: v.optional(v.string()),
    
    // Metadata
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"])
    .index("by_status", ["status"]),

  /**
   * RESEARCH LOG
   * Tracks research activities across entity types
   */
  researchLog: defineTable({
    vaultOwnerId: v.optional(v.string()),
    entityType: v.union(
      v.literal("person"),
      v.literal("place"),
      v.literal("building"),
      v.literal("relationship"),
      v.literal("event"),
      v.literal("source"),
      v.literal("citation"),
      v.literal("story"),
      v.literal("historicalContext"),
      v.literal("other")
    ),
    entityId: v.optional(
      v.union(
        v.id("persons"),
        v.id("places"),
        v.id("relationships"),
        v.id("events"),
        v.id("sources"),
        v.id("citations"),
        v.id("stories"),
        v.id("historicalContext"),
        v.string() // external or non-Convex IDs (buildings, other)
      )
    ),
    activityType: v.union(
      v.literal("tier1_bulk_import"),
      v.literal("tier2_sources"),
      v.literal("tier2_memories"),
      v.literal("tier2_notes"),
      v.literal("tier2_relationships"),
      v.literal("tier2_places"),
      v.literal("tier3_deep_research"),
      v.literal("tier3_narrative"),
      v.literal("tier3_browser_extras"),
      v.literal("context_research"),
      v.literal("location_deep_research"),
      v.literal("building_research"),
      v.literal("photos_collected"),
      v.literal("other")
    ),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked")
    ),
    summary: v.string(),
    details: v.optional(v.string()),
    outputRefs: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_activity", ["activityType"])
    .index("by_status", ["status"])
    .index("by_entity_activity", ["entityType", "entityId", "activityType"]),

  /**
   * PRODUCT QUEUE
   *
   * A directive-first continuity record for a person and their chosen AI.
   * This is intentionally distinct from researchTasks and from the derived
   * research-operations view. `state` is the complete product state set;
   * failure, retry, cancellation, and handoff expiry are conditions within
   * those four states, never additional user-facing states.
   */
  queueItems: defineTable({
    vaultOwnerId: v.string(),
    directive: v.string(),
    summary: v.string(),
    requestedOutcome: v.optional(v.string()),
    state: v.union(
      v.literal("needs_you"),
      v.literal("working"),
      v.literal("waiting_for_your_ai"),
      v.literal("done"),
    ),
    condition: v.union(
      v.literal("ready"),
      v.literal("active"),
      v.literal("awaiting_user"),
      v.literal("retry_scheduled"),
      v.literal("failed"),
      v.literal("disconnected"),
      v.literal("expired"),
      v.literal("canceled"),
      v.literal("completed"),
    ),
    priority: v.union(v.literal("high"), v.literal("normal"), v.literal("low")),
    priorityReason: v.optional(v.string()),
    context: v.array(
      v.union(
        v.object({ kind: v.literal("person"), refId: v.id("persons") }),
        v.object({ kind: v.literal("relationship"), refId: v.id("relationships") }),
        v.object({ kind: v.literal("place"), refId: v.id("places") }),
        v.object({ kind: v.literal("event"), refId: v.id("events") }),
        v.object({ kind: v.literal("source"), refId: v.id("sources") }),
        v.object({ kind: v.literal("citation"), refId: v.id("citations") }),
        v.object({ kind: v.literal("media"), refId: v.id("media") }),
        v.object({ kind: v.literal("context_item"), refId: v.id("contextItems") }),
        v.object({ kind: v.literal("research_task"), refId: v.id("researchTasks") }),
        v.object({ kind: v.literal("research_check"), refId: v.id("researchChecks") }),
        v.object({ kind: v.literal("story"), refId: v.id("stories") }),
        v.object({ kind: v.literal("import_run"), refId: v.id("importRuns") }),
        v.object({ kind: v.literal("provisional_relative"), refId: v.id("provisionalRelatives") }),
      ),
    ),
    authority: v.object({
      actorKind: v.union(
        v.literal("user"),
        v.literal("chosen_ai"),
        v.literal("first_party_ai"),
        v.literal("system"),
      ),
      actorId: v.string(),
      operations: v.array(
        v.union(
          v.literal("queue:read"),
          v.literal("queue:claim"),
          v.literal("queue:update"),
          v.literal("queue:complete"),
        ),
      ),
      scopeNote: v.string(),
    }),
    leftForActorKind: v.union(v.literal("user"), v.literal("chosen_ai")),
    leftForActorId: v.optional(v.string()),
    activeActorKind: v.optional(
      v.union(v.literal("user"), v.literal("chosen_ai"), v.literal("first_party_ai"), v.literal("system")),
    ),
    activeActorId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    handoffExpiresAt: v.optional(v.number()),
    requiredAction: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
    resultRefs: v.optional(v.array(v.string())),
    failureCode: v.optional(v.string()),
    failureSummary: v.optional(v.string()),
    retryCount: v.number(),
    maxRetries: v.number(),
    nextRetryAt: v.optional(v.number()),
    canceledReason: v.optional(v.string()),
    submittedAt: v.number(),
    pickedUpAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    createdByActorKind: v.union(v.literal("user"), v.literal("chosen_ai"), v.literal("first_party_ai")),
    createdByActorId: v.string(),
    lastUserResponse: v.optional(v.string()),
    lastReopenReason: v.optional(v.string()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_owner_updated", ["vaultOwnerId", "updatedAt"])
    .index("by_owner_state_updated", ["vaultOwnerId", "state", "updatedAt"])
    .index("by_owner_priority_updated", ["vaultOwnerId", "priority", "updatedAt"]),

  /** Append-only, owner-visible Queue history. Content-bearing rows share the
   * Queue item's deletion/export lifecycle; they are not permanent telemetry. */
  queueActivity: defineTable({
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    eventType: v.union(
      v.literal("created"),
      v.literal("claimed"),
      v.literal("checkpointed"),
      v.literal("needs_you"),
      v.literal("resumed"),
      v.literal("released"),
      v.literal("failed"),
      v.literal("retry_scheduled"),
      v.literal("completed"),
      v.literal("canceled"),
      v.literal("expired"),
      v.literal("reopened"),
    ),
    fromState: v.optional(v.string()),
    toState: v.string(),
    actorKind: v.union(
      v.literal("user"),
      v.literal("chosen_ai"),
      v.literal("first_party_ai"),
      v.literal("system"),
    ),
    actorId: v.string(),
    summary: v.string(),
    detail: v.optional(v.string()),
    commandId: v.string(),
    itemVersion: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_item_created", ["queueItemId", "createdAt"])
    .index("by_owner_actor_created", ["vaultOwnerId", "actorId", "createdAt"]),

  /** Idempotency receipts for Queue commands. The request key is unique only
   * inside one owner boundary and never grants authority by itself. */
  queueCommandReceipts: defineTable({
    vaultOwnerId: v.string(),
    idempotencyKey: v.string(),
    command: v.string(),
    queueItemId: v.id("queueItems"),
    actorKind: v.union(
      v.literal("user"),
      v.literal("chosen_ai"),
      v.literal("first_party_ai"),
      v.literal("system"),
    ),
    actorId: v.string(),
    resultVersion: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_owner_key", ["vaultOwnerId", "idempotencyKey"])
    .index("by_item", ["queueItemId"]),

  /**
   * DOCUMENTS
   * Person-level documents (Person Sheet + CST)
   */
  documents: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.string(),
    importRunId: v.optional(v.id("importRuns")),
    type: v.union(v.literal("PS"), v.literal("CST")),
    title: v.string(),
    contentMarkdown: v.string(),
    contentText: v.string(),
    artifactPath: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_personId", ["personId"])
    .index("by_personId_type", ["personId", "type"]),

  /**
   * STORIES
   * AI-generated or user-written narratives
   * Our unique differentiator!
   */
  stories: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.optional(v.id("persons")),
    relationshipId: v.optional(v.id("relationships")),
    type: v.union(
      v.literal("biography"),
      v.literal("day_in_life"),
      v.literal("historical_context"),
      v.literal("migration_story"),
      v.literal("family_narrative"),
      v.literal("anecdote"),
      v.literal("timeline"),
      v.literal("letter"),
      v.literal("interview"),
      v.literal("research_summary"),
      v.literal("custom")
    ),
    
    // Content
    title: v.string(),
    content: v.string(),                        // Markdown or rich text
    citationIds: v.array(v.id("citations")),    // Which sources support this story
    sourceFactIds: v.optional(v.array(v.string())), // Which specific facts were used
    contextPackIds: v.optional(v.array(v.id("historicalContext"))),
    
    // Status
    status: v.union(
      v.literal("draft"),
      v.literal("review"),
      v.literal("published")
    ),
    generatedBy: v.union(
      v.literal("ai"),
      v.literal("human"),
      v.literal("ai_edited")
    ),
    
    // AI metadata
    promptUsed: v.optional(v.string()),
    modelUsed: v.optional(v.string()),
    
    // Publishing
    publishedToHive: v.optional(v.string()),    // Hive permlink if published
    publicSlug: v.optional(v.string()),
    publicIndexing: v.optional(v.union(v.literal("noindex"), v.literal("index"))),
    assignedReviewer: v.optional(v.string()),
    secondReviewRequired: v.optional(v.boolean()),
    secondReviewer: v.optional(v.string()),
    secondReviewedAt: v.optional(v.number()),
    reviewRequestedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    lastPublishPreviewAt: v.optional(v.number()),
    lastPublishedAt: v.optional(v.number()),
    unpublishReason: v.optional(v.string()),
    
    // Organization
    tags: v.optional(v.array(v.string())),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"])
    .index("by_relationship", ["relationshipId"])
    .index("by_status", ["status"])
    .index("by_public_slug", ["publicSlug"])
    .index("by_type", ["type"]),

  storyReviewEvents: defineTable({
    vaultOwnerId: v.optional(v.string()),
    storyId: v.id("stories"),
    personId: v.optional(v.id("persons")),
    eventType: v.union(
      v.literal("publish_preview"),
      v.literal("status_change"),
      v.literal("publish_confirmation"),
      v.literal("assignment"),
      v.literal("draft_edit")
    ),
    fromStatus: v.optional(
      v.union(v.literal("draft"), v.literal("review"), v.literal("published"))
    ),
    toStatus: v.optional(
      v.union(v.literal("draft"), v.literal("review"), v.literal("published"))
    ),
    actorRole: v.union(
      v.literal("first_party_owner"),
      v.literal("story_writer"),
      v.literal("reviewer"),
      v.literal("trusted_publisher"),
      v.literal("unknown")
    ),
    actorName: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    reviewerName: v.optional(v.string()),
    humanReviewNote: v.optional(v.string()),
    readinessSnapshot: v.optional(v.any()),
    blockerCount: v.optional(v.number()),
    warningCount: v.optional(v.number()),
    readinessScore: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_story", ["storyId"])
    .index("by_story_created", ["storyId", "createdAt"]),

  provisionalRelatives: defineTable({
    vaultOwnerId: v.optional(v.string()),
    anchorPersonId: v.id("persons"),
    anchorPersonFsId: v.optional(v.string()),
    displayName: v.string(),
    relationshipHint: v.optional(v.string()),
    dedupeKey: v.string(),
    familySearchId: v.optional(v.string()),
    possibleBirthYear: v.optional(v.number()),
    possibleDeathYear: v.optional(v.number()),
    possiblePlaces: v.optional(v.array(v.string())),
    sourceKeys: v.array(v.string()),
    sourceTitles: v.optional(v.array(v.string())),
    evidenceCount: v.number(),
    mergeState: v.union(
      v.literal("provisional"),
      v.literal("promoted"),
      v.literal("merged"),
      v.literal("dismissed")
    ),
    canonicalPersonId: v.optional(v.id("persons")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_anchor", ["anchorPersonId"])
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_merge_state", ["mergeState"]),

  researchChecks: defineTable({
    vaultOwnerId: v.optional(v.string()),
    personId: v.id("persons"),
    personFsId: v.optional(v.string()),
    checkKey: v.string(),
    status: v.union(
      v.literal("missing"),
      v.literal("in_progress"),
      v.literal("complete"),
      v.literal("not_applicable"),
      v.literal("needs_review")
    ),
    applicability: v.union(
      v.literal("required"),
      v.literal("recommended"),
      v.literal("not_applicable"),
      v.literal("unknown")
    ),
    completionSource: v.union(
      v.literal("inferred"),
      v.literal("user"),
      v.literal("ai_agent"),
      v.literal("import")
    ),
    confidence: v.number(),
    summary: v.optional(v.string()),
    notes: v.optional(v.string()),
    linkedSourceIds: v.optional(v.array(v.id("sources"))),
    linkedPlaceIds: v.optional(v.array(v.id("places"))),
    linkedPersonIds: v.optional(v.array(v.id("persons"))),
    lastReviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_person", ["personId"])
    .index("by_person_check", ["personId", "checkKey"])
    .index("by_status", ["status"]),

  /**
   * HISTORICAL CONTEXT
   * Reusable historical context snippets
   * (e.g., "Daily life in 1920s New York", "The Great Migration")
   */
  historicalContext: defineTable({
    vaultOwnerId: v.optional(v.string()),
    placeId: v.optional(v.id("places")),
    timePeriod: v.object({
      startYear: v.number(),
      endYear: v.number(),
    }),
    topic: v.union(
      v.literal("daily_life"),
      v.literal("economy"),
      v.literal("religion"),
      v.literal("politics"),
      v.literal("migration"),
      v.literal("health"),
      v.literal("technology"),
      v.literal("culture"),
      v.literal("war"),
      v.literal("disaster"),
      v.literal("other")
    ),
    
    // Content
    title: v.string(),
    content: v.string(),                        // Markdown
    sources: v.array(v.string()),               // URLs or references

    // Research-pack metadata and AI/story gates
    packType: v.optional(
      v.union(
        v.literal("locality_era_brief"),
        v.literal("region_era"),
        v.literal("occupation_era"),
        v.literal("religion_community"),
        v.literal("migration_corridor"),
        v.literal("building_institution"),
        v.literal("local_event"),
        v.literal("cemetery_burial")
      )
    ),
    templateVersion: v.optional(v.string()),
    privacyLevel: v.optional(
      v.union(
        v.literal("private"),
        v.literal("family_review"),
        v.literal("publish_candidate"),
        v.literal("public_source")
      )
    ),
    reviewStatus: v.optional(
      v.union(
        v.literal("unreviewed"),
        v.literal("reviewed"),
        v.literal("disputed"),
        v.literal("redacted"),
        v.literal("rejected")
      )
    ),
    aiUseAllowed: v.optional(v.boolean()),
    categoryBlocks: v.optional(
      v.array(
        v.object({
          category: v.union(
            v.literal("scope"),
            v.literal("place_summary"),
            v.literal("daily_life"),
            v.literal("institutions"),
            v.literal("migration_work_religion"),
            v.literal("evidence_limits"),
            v.literal("story_synthesis")
          ),
          summary: v.string(),
          sourcedClaims: v.array(
            v.object({
              text: v.string(),
              sourceRefs: v.array(v.string()),
              confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
            })
          ),
          synthesisNotes: v.optional(v.string()),
        })
      )
    ),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_place", ["placeId"]),

  /**
   * RATE LIMITS (GEN-89-RL)
   *
   * Ephemeral per-vaultOwner request counters used to throttle expensive
   * external-AI calls (OpenRouter spend protection). This is a fixed-window
   * counter: each row holds the number of requests an owner made for a given
   * `action` within the window that begins at `windowStart` (epoch ms).
   *
   * IMPORTANT: these are NOT user vault content — they are throwaway counters.
   * Deliberately NOT part of OWNED_TABLES (convex/vaultMigration.ts) and the
   * owner index is intentionally named "by_owner_window" (NOT "by_owner") so the
   * owned-tables-parity check does not couple these counters to the vault
   * migration set.
   */
  rateLimits: defineTable({
    vaultOwnerId: v.string(),
    action: v.string(),               // logical bucket, e.g. "process"
    windowStart: v.number(),          // epoch ms at the start of the fixed window
    count: v.number(),                // requests recorded in this window
    updatedAt: v.number(),
  })
    // NOTE: not "by_owner" on purpose — see comment above.
    .index("by_owner_window", ["vaultOwnerId", "action", "windowStart"]),

  /**
   * API KEYS (agent platform)
   *
   * Owner-scoped credentials that let an external AI agent act AS one vault
   * owner without a Clerk browser session. The raw secret is shown ONCE at mint;
   * only its SHA-256 hash is stored. `keyId` is the public, loggable prefix.
   * Scopes (resource:action, see lib/auth/scopes.ts) decide what the key may
   * attempt; the existing domain gates still decide what succeeds.
   */
  apiKeys: defineTable({
    vaultOwnerId: v.string(),
    keyId: v.string(),                 // public prefix, e.g. "dts_live_<hex>"
    hashedSecret: v.string(),          // SHA-256(secret) hex; raw secret never stored
    label: v.string(),
    scopes: v.array(v.string()),
    tier: v.union(v.literal("trial"), v.literal("standard"), v.literal("trusted")),
    status: v.union(v.literal("active"), v.literal("revoked"), v.literal("suspended")),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdByUserId: v.optional(v.string()),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_keyId", ["keyId"]),

  /**
   * AGENT ACTIVITY (agent platform)
   *
   * Append-only per-call audit/feed for agent (and key-authenticated) requests.
   * Backs the future /usage endpoint and the human "watch what my agent is
   * doing" view. `detail` is short and masked — never raw vault content.
   */
  agentActivity: defineTable({
    vaultOwnerId: v.string(),
    requestId: v.string(),
    keyId: v.optional(v.string()),
    principalKind: v.union(v.literal("user"), v.literal("api_key")),
    route: v.string(),
    method: v.string(),
    scope: v.optional(v.string()),
    outcome: v.union(
      v.literal("ok"),
      v.literal("denied"),
      v.literal("rate_limited"),
      v.literal("error"),
    ),
    statusCode: v.number(),
    createdAt: v.number(),
    detail: v.optional(v.string()),
  })
    .index("by_owner", ["vaultOwnerId"])
    .index("by_owner_request", ["vaultOwnerId", "requestId"]),

  /**
   * Guarded-rollout telemetry for calls that shadow mode would deny.
   *
   * Keep this deliberately sparse: no tokens, arguments, ancestor ids, story
   * content, or free-form errors. The caller is the verified Clerk subject (or
   * the literal <anonymous>) so an operator can distinguish a legitimate
   * integration mismatch from an unauthenticated probe before enforcement.
   */
  trustBoundaryShadowLog: defineTable({
    functionName: v.string(),
    caller: v.string(),
    callerKind: v.union(v.literal("anonymous"), v.literal("authenticated")),
    reason: v.string(),
    timestamp: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_function_timestamp", ["functionName", "timestamp"])
    .index("by_reason_timestamp", ["reason", "timestamp"])
    .index("by_caller_timestamp", ["caller", "timestamp"]),
});
