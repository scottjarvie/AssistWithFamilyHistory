import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  buildProvisionalDedupeKey,
  filterByVaultOwner,
  inferResearchChecks,
  matchesVaultOwner,
  normalizeVaultOwnerId,
} from "./vaultCore";

const dateValidator = v.object({
  original: v.string(),
  formal: v.optional(v.string()),
  year: v.optional(v.number()),
  month: v.optional(v.number()),
  day: v.optional(v.number()),
  approximate: v.optional(v.boolean()),
});

const placeRefValidator = v.object({
  original: v.string(),
  placeId: v.optional(v.id("places")),
});

const factValidator = v.object({
  date: v.optional(dateValidator),
  place: v.optional(placeRefValidator),
  description: v.optional(v.string()),
});

const relationshipFactValidator = v.object({
  type: v.string(),
  date: v.optional(dateValidator),
  place: v.optional(placeRefValidator),
  description: v.optional(v.string()),
});

const researchCheckStatusValidator = v.union(
  v.literal("missing"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("not_applicable"),
  v.literal("needs_review")
);

const researchCheckApplicabilityValidator = v.union(
  v.literal("required"),
  v.literal("recommended"),
  v.literal("not_applicable"),
  v.literal("unknown")
);

const researchCheckSourceValidator = v.union(
  v.literal("inferred"),
  v.literal("user"),
  v.literal("ai_agent"),
  v.literal("import")
);

const storyTypeValidator = v.union(
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
);

const historicalContextTopicValidator = v.union(
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
);

export const upsertPerson = mutation({
  args: {
    vaultOwnerId: v.string(),
    fsId: v.optional(v.string()),
    name: v.object({
      given: v.string(),
      surname: v.string(),
      suffix: v.optional(v.string()),
      prefix: v.optional(v.string()),
      nickname: v.optional(v.string()),
    }),
    sex: v.union(v.literal("male"), v.literal("female"), v.literal("unknown")),
    living: v.boolean(),
    birth: v.optional(factValidator),
    death: v.optional(factValidator),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    let existing: Doc<"persons"> | null = null;

    if (args.fsId) {
      const fsMatches = await ctx.db
        .query("persons")
        .withIndex("by_fsId", (q) => q.eq("fsId", args.fsId))
        .collect();
      existing = filterByVaultOwner(fsMatches, vaultOwnerId)[0] ?? null;
    }

    if (!existing) {
      const candidates = await ctx.db
        .query("persons")
        .withIndex("by_surname", (q) => q.eq("name.surname", args.name.surname))
        .collect();

      existing =
        filterByVaultOwner(candidates, vaultOwnerId).find((candidate) => {
          const sameName =
            candidate.name.given.trim().toLowerCase() === args.name.given.trim().toLowerCase() &&
            candidate.name.surname.trim().toLowerCase() === args.name.surname.trim().toLowerCase();

          if (!sameName) return false;

          if (args.birth?.date?.year && candidate.birth?.date?.year) {
            return args.birth.date.year === candidate.birth.date.year;
          }

          return true;
        }) || null;
    }

    const payload = {
      vaultOwnerId,
      fsId: args.fsId ?? existing?.fsId,
      name: args.name,
      sex: args.sex,
      living: args.living,
      birth: args.birth ?? existing?.birth,
      death: args.death ?? existing?.death,
      notes: args.notes ?? existing?.notes,
      tags:
        args.tags && existing?.tags
          ? Array.from(new Set([...existing.tags, ...args.tags]))
          : args.tags ?? existing?.tags,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { personId: existing._id, created: false };
    }

    const personId = await ctx.db.insert("persons", {
      ...payload,
      researchStatus: "basic",
      createdAt: now,
    });

    return { personId, created: true };
  },
});

export const upsertSource = mutation({
  args: {
    vaultOwnerId: v.string(),
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
    repository: v.optional(v.string()),
    url: v.optional(v.string()),
    fsId: v.optional(v.string()),
    importKey: v.optional(v.string()),
    author: v.optional(v.string()),
    publicationDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    let existing: Doc<"sources"> | null = null;

    if (args.fsId) {
      const matches = await ctx.db
        .query("sources")
        .withIndex("by_fsId", (q) => q.eq("fsId", args.fsId))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    if (!existing && args.importKey) {
      const matches = await ctx.db
        .query("sources")
        .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    if (!existing && args.url) {
      const matches = filterByVaultOwner(await ctx.db.query("sources").collect(), vaultOwnerId);
      existing =
        matches.find((source) => source.url === args.url && source.title === args.title) || null;
    }

    const payload = {
      ...args,
      vaultOwnerId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { sourceId: existing._id, created: false };
    }

    const sourceId = await ctx.db.insert("sources", {
      ...payload,
      createdAt: now,
    });

    return { sourceId, created: true };
  },
});

export const upsertCitation = mutation({
  args: {
    vaultOwnerId: v.string(),
    sourceId: v.id("sources"),
    isEvidence: v.boolean(),
    importKey: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    let existing: Doc<"citations"> | null = null;

    if (args.importKey) {
      const matches = await ctx.db
        .query("citations")
        .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    if (!existing) {
      const sourceCitations = await ctx.db
        .query("citations")
        .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
        .collect();
      existing =
        filterByVaultOwner(sourceCitations, vaultOwnerId).find(
          (citation) =>
            citation.page === args.page &&
            citation.url === args.url &&
            citation.extractedText === args.extractedText
        ) || null;
    }

    const payload = {
      ...args,
      vaultOwnerId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { citationId: existing._id, created: false };
    }

    const citationId = await ctx.db.insert("citations", {
      ...payload,
      createdAt: now,
    });

    return { citationId, created: true };
  },
});

export const upsertEvent = mutation({
  args: {
    vaultOwnerId: v.string(),
    importKey: v.optional(v.string()),
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
    place: v.optional(placeRefValidator),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    let existing: Doc<"events"> | null = null;

    if (args.importKey) {
      const matches = await ctx.db
        .query("events")
        .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    if (!existing) {
      const sameType = await ctx.db
        .query("events")
        .withIndex("by_type", (q) => q.eq("type", args.type))
        .collect();
      existing =
        filterByVaultOwner(sameType, vaultOwnerId).find(
          (event) =>
            event.date?.original === args.date?.original &&
            event.place?.original === args.place?.original &&
            event.description === args.description
        ) || null;
    }

    const payload = {
      ...args,
      vaultOwnerId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { eventId: existing._id, created: false };
    }

    const eventId = await ctx.db.insert("events", {
      ...payload,
      createdAt: now,
    });

    return { eventId, created: true };
  },
});

export const upsertPersonEvent = mutation({
  args: {
    vaultOwnerId: v.string(),
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
    const existingRows = await ctx.db
      .query("personEvents")
      .withIndex("by_person_and_event", (q) =>
        q.eq("personId", args.personId).eq("eventId", args.eventId)
      )
      .collect();
    const existing = filterByVaultOwner(existingRows, normalizeVaultOwnerId(args.vaultOwnerId))[0] ?? null;

    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    }

    return await ctx.db.insert("personEvents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const upsertRelationship = mutation({
  args: {
    vaultOwnerId: v.string(),
    type: v.union(
      v.literal("Couple"),
      v.literal("ParentChild"),
      v.literal("Godparent"),
      v.literal("Guardian"),
      v.literal("Other")
    ),
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
    person1: v.id("persons"),
    person2: v.id("persons"),
    facts: v.optional(v.array(relationshipFactValidator)),
    familySearchId: v.optional(v.string()),
    importKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    let existing: Doc<"relationships"> | null = null;

    if (args.familySearchId) {
      const rows = filterByVaultOwner(await ctx.db.query("relationships").collect(), vaultOwnerId);
      existing =
        rows.find((relationship) => relationship.familySearchId === args.familySearchId) || null;
    }

    if (!existing && args.importKey) {
      const matches = await ctx.db
        .query("relationships")
        .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    if (!existing) {
      const rows = await ctx.db
        .query("relationships")
        .withIndex("by_type_person1", (q) => q.eq("type", args.type).eq("person1", args.person1))
        .collect();
      existing =
        filterByVaultOwner(rows, vaultOwnerId).find((relationship) => relationship.person2 === args.person2) || null;
    }

    const payload = {
      ...args,
      vaultOwnerId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { relationshipId: existing._id, created: false };
    }

    const relationshipId = await ctx.db.insert("relationships", {
      ...payload,
      createdAt: now,
    });

    return { relationshipId, created: true };
  },
});

export const upsertMedia = mutation({
  args: {
    vaultOwnerId: v.string(),
    type: v.union(
      v.literal("photo"),
      v.literal("document"),
      v.literal("scan"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("other")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    filePath: v.optional(v.string()),
    url: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    date: v.optional(
      v.object({
        year: v.optional(v.number()),
        month: v.optional(v.number()),
        day: v.optional(v.number()),
      })
    ),
    personIds: v.array(v.id("persons")),
    sourceId: v.optional(v.id("sources")),
    familySearchUrl: v.optional(v.string()),
    importKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    let existing: Doc<"media"> | null = null;

    if (args.familySearchUrl) {
      const allMedia = filterByVaultOwner(await ctx.db.query("media").collect(), vaultOwnerId);
      existing =
        allMedia.find((media) => media.familySearchUrl === args.familySearchUrl) || null;
    }

    if (!existing && args.importKey) {
      const matches = await ctx.db
        .query("media")
        .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
        .collect();
      existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    }

    const personIds = existing
      ? Array.from(new Set([...existing.personIds, ...args.personIds]))
      : args.personIds;

    const payload = {
      ...args,
      vaultOwnerId,
      personIds,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { mediaId: existing._id, created: false };
    }

    const mediaId = await ctx.db.insert("media", {
      ...payload,
      createdAt: now,
    });

    return { mediaId, created: true };
  },
});

export const ensureResearchTask = mutation({
  args: {
    vaultOwnerId: v.string(),
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
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  },
  handler: async (ctx, args) => {
    const existingRows = await ctx.db
      .query("researchTasks")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const existing = filterByVaultOwner(existingRows, normalizeVaultOwnerId(args.vaultOwnerId));

    const match = existing.find((task) => task.title === args.title && task.status !== "done");
    if (match) {
      return { taskId: match._id, created: false };
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("researchTasks", {
      ...args,
      status: "todo",
      aiSuggested: true,
      createdAt: now,
      updatedAt: now,
    });

    return { taskId, created: true };
  },
});

export const upsertStoryDraft = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.id("persons"),
    type: storyTypeValidator,
    title: v.string(),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("review"), v.literal("published")),
    generatedBy: v.union(v.literal("ai"), v.literal("human"), v.literal("ai_edited")),
    promptUsed: v.optional(v.string()),
    modelUsed: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingRows = await ctx.db
      .query("stories")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const existing = filterByVaultOwner(existingRows, normalizeVaultOwnerId(args.vaultOwnerId));

    const match =
      existing.find(
        (story) =>
          story.type === args.type &&
          story.title === args.title &&
          story.status !== "published"
      ) ?? null;

    const payload = {
      title: args.title,
      content: args.content,
      citationIds: match?.citationIds ?? [],
      sourceFactIds: match?.sourceFactIds,
      status: args.status,
      generatedBy: args.generatedBy,
      promptUsed: args.promptUsed,
      modelUsed: args.modelUsed,
      tags: args.tags,
      updatedAt: now,
    };

    if (match) {
      await ctx.db.patch(match._id, payload);
      return { storyId: match._id, created: false };
    }

    const storyId = await ctx.db.insert("stories", {
      vaultOwnerId: normalizeVaultOwnerId(args.vaultOwnerId),
      personId: args.personId,
      relationshipId: undefined,
      type: args.type,
      ...payload,
      createdAt: now,
    });

    return { storyId, created: true };
  },
});

export const updateStoryStatus = mutation({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
    status: v.union(v.literal("draft"), v.literal("review"), v.literal("published")),
  },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);
    if (!story || !matchesVaultOwner(story.vaultOwnerId, args.vaultOwnerId)) {
      throw new Error("Story not found");
    }

    await ctx.db.patch(args.storyId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return { storyId: args.storyId, status: args.status };
  },
});

export const updateStoryDraft = mutation({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
    title: v.string(),
    content: v.string(),
    type: v.optional(storyTypeValidator),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);
    if (!story || !matchesVaultOwner(story.vaultOwnerId, args.vaultOwnerId)) {
      throw new Error("Story not found");
    }

    const generatedBy = story.generatedBy === "ai" ? "ai_edited" : story.generatedBy;
    const now = Date.now();

    await ctx.db.patch(args.storyId, {
      title: args.title.trim(),
      content: args.content.trim(),
      type: args.type ?? story.type,
      tags: args.tags,
      generatedBy,
      updatedAt: now,
    });

    return { storyId: args.storyId, updatedAt: now };
  },
});

export const upsertHistoricalContext = mutation({
  args: {
    vaultOwnerId: v.string(),
    placeId: v.optional(v.id("places")),
    timePeriod: v.object({
      startYear: v.number(),
      endYear: v.number(),
    }),
    topic: historicalContextTopicValidator,
    title: v.string(),
    content: v.string(),
    sources: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    const now = Date.now();
    const candidates = args.placeId
      ? await ctx.db
          .query("historicalContext")
          .withIndex("by_place", (q) => q.eq("placeId", args.placeId))
          .collect()
      : await ctx.db.query("historicalContext").collect();
    const existing =
      filterByVaultOwner(candidates, vaultOwnerId).find(
        (entry) =>
          entry.placeId === args.placeId &&
          entry.topic === args.topic &&
          entry.title.trim().toLowerCase() === args.title.trim().toLowerCase() &&
          entry.timePeriod.startYear === args.timePeriod.startYear &&
          entry.timePeriod.endYear === args.timePeriod.endYear
      ) ?? null;

    const payload = {
      vaultOwnerId,
      placeId: args.placeId,
      timePeriod: args.timePeriod,
      topic: args.topic,
      title: args.title.trim(),
      content: args.content.trim(),
      sources: args.sources.map((source) => source.trim()).filter(Boolean),
      updatedAt: now,
    };

    const historicalContextId = existing
      ? existing._id
      : await ctx.db.insert("historicalContext", {
          ...payload,
          createdAt: now,
        });

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    }

    const logMatches = await ctx.db
      .query("researchLog")
      .withIndex("by_entity_activity", (q) =>
        q
          .eq("entityType", "historicalContext")
          .eq("entityId", historicalContextId)
          .eq("activityType", "context_research")
      )
      .collect();
    const logEntry = filterByVaultOwner(logMatches, vaultOwnerId)[0] ?? null;
    const summary = `Context report: ${payload.title}`;
    const details = [
      `Topic: ${payload.topic.replace(/_/g, " ")}`,
      `Years: ${payload.timePeriod.startYear}-${payload.timePeriod.endYear}`,
      payload.placeId ? `Place ID: ${payload.placeId}` : "Vault-wide context",
      payload.sources.length > 0 ? `Sources: ${payload.sources.join("; ")}` : "Sources: none recorded",
    ].join("\n");

    if (logEntry) {
      await ctx.db.patch(logEntry._id, {
        status: "done",
        summary,
        details,
        completedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("researchLog", {
        vaultOwnerId,
        entityType: "historicalContext",
        entityId: historicalContextId,
        activityType: "context_research",
        status: "done",
        summary,
        details,
        outputRefs: [`historicalContext:${String(historicalContextId)}`],
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
    }

    return { historicalContextId, created: !existing };
  },
});

export const upsertProvisionalRelative = mutation({
  args: {
    vaultOwnerId: v.string(),
    anchorPersonId: v.id("persons"),
    anchorPersonFsId: v.optional(v.string()),
    displayName: v.string(),
    relationshipHint: v.optional(v.string()),
    familySearchId: v.optional(v.string()),
    sourceKey: v.string(),
    sourceTitle: v.optional(v.string()),
    possibleBirthYear: v.optional(v.number()),
    possibleDeathYear: v.optional(v.number()),
    possiblePlaces: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    const dedupeKey = buildProvisionalDedupeKey({
      vaultOwnerId,
      anchorPersonId: args.anchorPersonId,
      displayName: args.displayName,
      relationshipHint: args.relationshipHint,
    });

    const candidates = await ctx.db
      .query("provisionalRelatives")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .collect();
    const existing = filterByVaultOwner(candidates, vaultOwnerId)[0] ?? null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        anchorPersonFsId: args.anchorPersonFsId ?? existing.anchorPersonFsId,
        relationshipHint: args.relationshipHint ?? existing.relationshipHint,
        familySearchId: args.familySearchId ?? existing.familySearchId,
        sourceKeys: Array.from(new Set([...existing.sourceKeys, args.sourceKey])),
        sourceTitles: Array.from(new Set([...(existing.sourceTitles || []), ...(args.sourceTitle ? [args.sourceTitle] : [])])),
        evidenceCount: existing.evidenceCount + 1,
        possibleBirthYear: args.possibleBirthYear ?? existing.possibleBirthYear,
        possibleDeathYear: args.possibleDeathYear ?? existing.possibleDeathYear,
        possiblePlaces: Array.from(new Set([...(existing.possiblePlaces || []), ...(args.possiblePlaces || [])])),
        notes: args.notes ?? existing.notes,
        updatedAt: now,
      });
      return { provisionalId: existing._id, created: false };
    }

    const provisionalId = await ctx.db.insert("provisionalRelatives", {
      vaultOwnerId,
      anchorPersonId: args.anchorPersonId,
      anchorPersonFsId: args.anchorPersonFsId,
      displayName: args.displayName,
      relationshipHint: args.relationshipHint,
      dedupeKey,
      familySearchId: args.familySearchId,
      possibleBirthYear: args.possibleBirthYear,
      possibleDeathYear: args.possibleDeathYear,
      possiblePlaces: args.possiblePlaces,
      sourceKeys: [args.sourceKey],
      sourceTitles: args.sourceTitle ? [args.sourceTitle] : [],
      evidenceCount: 1,
      mergeState: "provisional",
      canonicalPersonId: undefined,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    return { provisionalId, created: true };
  },
});

export const upsertResearchCheck = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.id("persons"),
    personFsId: v.optional(v.string()),
    checkKey: v.string(),
    status: researchCheckStatusValidator,
    applicability: researchCheckApplicabilityValidator,
    completionSource: researchCheckSourceValidator,
    confidence: v.number(),
    summary: v.optional(v.string()),
    notes: v.optional(v.string()),
    linkedSourceIds: v.optional(v.array(v.id("sources"))),
    linkedPlaceIds: v.optional(v.array(v.id("places"))),
    linkedPersonIds: v.optional(v.array(v.id("persons"))),
    lastReviewedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingRows = await ctx.db
      .query("researchChecks")
      .withIndex("by_person_check", (q) => q.eq("personId", args.personId).eq("checkKey", args.checkKey))
      .collect();
    const existing = filterByVaultOwner(existingRows, normalizeVaultOwnerId(args.vaultOwnerId))[0] ?? null;

    const payload = {
      vaultOwnerId: normalizeVaultOwnerId(args.vaultOwnerId),
      personFsId: args.personFsId,
      status: args.status,
      applicability: args.applicability,
      completionSource: args.completionSource,
      confidence: args.confidence,
      summary: args.summary,
      notes: args.notes,
      linkedSourceIds: args.linkedSourceIds,
      linkedPlaceIds: args.linkedPlaceIds,
      linkedPersonIds: args.linkedPersonIds,
      lastReviewedAt: args.lastReviewedAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { checkId: existing._id, created: false };
    }

    const checkId = await ctx.db.insert("researchChecks", {
      personId: args.personId,
      checkKey: args.checkKey,
      ...payload,
      createdAt: now,
    });
    return { checkId, created: true };
  },
});

export const bulkRefreshResearchChecks = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.id("persons"),
    source: researchCheckSourceValidator,
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    const now = Date.now();
    const person = await ctx.db.get(args.personId);
    if (!person || !matchesVaultOwner(person.vaultOwnerId, vaultOwnerId)) {
      return { updated: 0 };
    }

    const [
      relationships,
      personEvents,
      events,
      media,
      documents,
      stories,
      importRuns,
      researchChecks,
      provisionalRelatives,
      citationLinks,
      citations,
      sources,
      places,
    ] = await Promise.all([
      ctx.db.query("relationships").collect(),
      ctx.db.query("personEvents").collect(),
      ctx.db.query("events").collect(),
      ctx.db.query("media").collect(),
      ctx.db.query("documents").collect(),
      ctx.db.query("stories").collect(),
      ctx.db.query("importRuns").collect(),
      ctx.db.query("researchChecks").collect(),
      ctx.db.query("provisionalRelatives").collect(),
      ctx.db.query("citationLinks").collect(),
      ctx.db.query("citations").collect(),
      ctx.db.query("sources").collect(),
      ctx.db.query("places").collect(),
    ]);

    const ownedRelationships = filterByVaultOwner(relationships, vaultOwnerId).filter(
      (relationship) => relationship.person1 === args.personId || relationship.person2 === args.personId
    );
    const ownedPersonEvents = filterByVaultOwner(personEvents, vaultOwnerId).filter(
      (link) => link.personId === args.personId
    );
    const ownedEvents = filterByVaultOwner(events, vaultOwnerId).filter((event) =>
      ownedPersonEvents.some((link) => link.eventId === event._id)
    );
    const ownedMedia = filterByVaultOwner(media, vaultOwnerId).filter((item) =>
      item.personIds.includes(args.personId)
    );
    const personKey = person.fsId || String(person._id);
    const ownedDocuments = filterByVaultOwner(documents, vaultOwnerId).filter(
      (document) => document.personId === personKey
    );
    const ownedStories = filterByVaultOwner(stories, vaultOwnerId).filter(
      (story) => story.personId === args.personId
    );
    const ownedImportRuns = filterByVaultOwner(importRuns, vaultOwnerId).filter(
      (run) => run.personId === args.personId || run.personFsId === person.fsId
    );
    const ownedChecks = filterByVaultOwner(researchChecks, vaultOwnerId).filter(
      (check) => check.personId === args.personId
    );
    const ownedProvisional = filterByVaultOwner(provisionalRelatives, vaultOwnerId).filter(
      (relative) => relative.anchorPersonId === args.personId && relative.mergeState === "provisional"
    );
    const ownedLinks = filterByVaultOwner(citationLinks, vaultOwnerId).filter((link) => {
      if (link.targetType === "person" && link.targetId === String(args.personId)) return true;
      if (link.targetType === "event") {
        return ownedEvents.some((event) => String(event._id) === link.targetId);
      }
      return false;
    });
    const ownedCitations = filterByVaultOwner(citations, vaultOwnerId).filter((citation) =>
      ownedLinks.some((link) => link.citationId === citation._id)
    );
    const ownedSources = filterByVaultOwner(sources, vaultOwnerId).filter((source) =>
      ownedCitations.some((citation) => citation.sourceId === source._id)
    );
    const placeIds = new Set(
      [person.birth?.place?.placeId, person.death?.place?.placeId, ...ownedEvents.map((event) => event.place?.placeId)]
        .filter(Boolean)
        .map(String)
    );
    const ownedPlaces = filterByVaultOwner(places, vaultOwnerId).filter((place) =>
      placeIds.has(String(place._id))
    );

    const inferred = inferResearchChecks({
      person,
      sources: ownedSources,
      events: ownedEvents,
      relationships: ownedRelationships,
      media: ownedMedia,
      documents: ownedDocuments,
      stories: ownedStories,
      places: ownedPlaces,
      importRuns: ownedImportRuns,
      provisionalRelatives: ownedProvisional,
      existingChecks: ownedChecks,
    });

    let updated = 0;
    for (const check of inferred) {
      const existing = ownedChecks.find((row) => row.checkKey === check.checkKey);
      const payload = {
        vaultOwnerId,
        personId: args.personId,
        personFsId: person.fsId,
        checkKey: check.checkKey,
        status: check.status,
        applicability: check.applicability,
        completionSource:
          args.source === "import" && check.completionSource === "inferred"
            ? "import"
            : (check.completionSource as "inferred" | "user" | "ai_agent" | "import"),
        confidence: check.confidence,
        summary: "summary" in check ? check.summary : undefined,
        notes: "notes" in check ? check.notes : undefined,
        linkedSourceIds: "linkedSourceIds" in check ? check.linkedSourceIds : [],
        linkedPlaceIds: "linkedPlaceIds" in check ? check.linkedPlaceIds : [],
        linkedPersonIds: "linkedPersonIds" in check ? check.linkedPersonIds : [],
        lastReviewedAt: now,
        updatedAt: now,
      };
      if (existing) {
        if (existing.completionSource === "user" || existing.completionSource === "ai_agent") {
          continue;
        }
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("researchChecks", {
          ...payload,
          createdAt: now,
        });
      }
      updated += 1;
    }

    return { updated };
  },
});

export const createResearchTask = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.optional(v.id("persons")),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const taskId = await ctx.db.insert("researchTasks", {
      vaultOwnerId: normalizeVaultOwnerId(args.vaultOwnerId),
      personId: args.personId,
      type: "other",
      title: args.title,
      description: args.description,
      status: "todo",
      priority: args.priority,
      aiSuggested: false,
      createdAt: now,
      updatedAt: now,
    });
    return { taskId };
  },
});

export const promoteProvisionalRelative = mutation({
  args: {
    vaultOwnerId: v.string(),
    provisionalId: v.id("provisionalRelatives"),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    const provisional = await ctx.db.get(args.provisionalId);
    if (!provisional || !matchesVaultOwner(provisional.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Provisional relative not found");
    }
    if (provisional.mergeState !== "provisional") {
      throw new Error("This provisional relative has already been resolved");
    }

    const existingPerson = provisional.familySearchId
      ? filterByVaultOwner(
          await ctx.db
            .query("persons")
            .withIndex("by_fsId", (q) => q.eq("fsId", provisional.familySearchId!))
            .collect(),
          vaultOwnerId
        )[0] ?? null
      : null;

    const target =
      existingPerson ||
      (await ctx.db.insert("persons", {
        vaultOwnerId,
        fsId: provisional.familySearchId,
        name: {
          given: provisional.displayName.split(/\s+/).slice(0, -1).join(" ") || provisional.displayName,
          surname: provisional.displayName.split(/\s+/).slice(-1)[0] || provisional.displayName,
        },
        sex: "unknown",
        living: false,
        researchStatus: "not_started",
        notes: provisional.notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

    const canonicalPersonId = typeof target === "object" ? target._id : target;
    await ctx.db.patch(args.provisionalId, {
      mergeState: "promoted",
      canonicalPersonId,
      updatedAt: Date.now(),
    });

    return { personId: canonicalPersonId };
  },
});

export const mergeProvisionalRelative = mutation({
  args: {
    vaultOwnerId: v.string(),
    provisionalId: v.id("provisionalRelatives"),
    targetPersonId: v.id("persons"),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = normalizeVaultOwnerId(args.vaultOwnerId);
    const provisional = await ctx.db.get(args.provisionalId);
    const target = await ctx.db.get(args.targetPersonId);
    if (
      !provisional ||
      !target ||
      !matchesVaultOwner(provisional.vaultOwnerId, vaultOwnerId) ||
      !matchesVaultOwner(target.vaultOwnerId, vaultOwnerId)
    ) {
      throw new Error("Could not merge provisional relative");
    }
    if (provisional.mergeState !== "provisional") {
      throw new Error("This provisional relative has already been resolved");
    }
    if (provisional.anchorPersonId === args.targetPersonId) {
      throw new Error("Choose a different canonical person than the anchor person");
    }

    await ctx.db.patch(args.provisionalId, {
      mergeState: "merged",
      canonicalPersonId: args.targetPersonId,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
