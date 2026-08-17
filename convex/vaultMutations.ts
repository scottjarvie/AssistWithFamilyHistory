import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { buildStoryPublicSlug } from "../lib/stories/slug";
import { redactPublicText } from "../lib/privacy/publicTextRedaction";
import {
  assessStoryPublishReadiness,
  evaluateStoryPublishGate,
} from "../lib/stories/publishSafety";
import {
  assessConflictResolution,
  describeConflictResolution,
} from "../lib/vault/conflictResolution";
import { TASK_DONE_NOTES_MIN } from "../lib/operations/taskLifecycle";
import {
  authorizeOwnedReferenceMutation,
  authorizeTenantMutation,
  getTrustBoundaryMode,
  handlePolicyViolationMutation,
} from "./access";
import { buildStoryBundle, loadStoryScopedSnapshot } from "./vault";
import {
  buildProvisionalDedupeKey,
  filterByVaultOwner,
  formatPersonName,
  inferResearchChecks,
  matchesVaultOwner,
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

const firstStartPersonValidator = v.object({
  given: v.string(),
  surname: v.optional(v.string()),
  living: v.boolean(),
});

function cleanFirstStartName(value: string, label: string, required: boolean): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (required && !normalized) throw new Error(`${label} is required`);
  if (normalized.length > 100) throw new Error(`${label} must be 100 characters or fewer`);
  return normalized;
}

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

const researchPackTypeValidator = v.union(
  v.literal("locality_era_brief"),
  v.literal("region_era"),
  v.literal("occupation_era"),
  v.literal("religion_community"),
  v.literal("migration_corridor"),
  v.literal("building_institution"),
  v.literal("local_event"),
  v.literal("cemetery_burial")
);

const researchPackCategoryValidator = v.union(
  v.literal("scope"),
  v.literal("place_summary"),
  v.literal("daily_life"),
  v.literal("institutions"),
  v.literal("migration_work_religion"),
  v.literal("evidence_limits"),
  v.literal("story_synthesis")
);

const researchPackCategoryBlockValidator = v.object({
  category: researchPackCategoryValidator,
  summary: v.string(),
  sourcedClaims: v.array(
    v.object({
      text: v.string(),
      sourceRefs: v.array(v.string()),
      confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    })
  ),
  synthesisNotes: v.optional(v.string()),
});

const storyStatusValidator = v.union(v.literal("draft"), v.literal("review"), v.literal("published"));

const sourceFactTypeValidator = v.union(
  v.literal("name"),
  v.literal("sex"),
  v.literal("birth"),
  v.literal("death"),
  v.literal("marriage"),
  v.literal("census_residence"),
  v.literal("residence"),
  v.literal("occupation"),
  v.literal("other")
);

const sourceFactStatusValidator = v.union(
  v.literal("candidate"),
  v.literal("accepted"),
  v.literal("conflict"),
  v.literal("rejected")
);

const contextItemTypeValidator = v.union(
  v.literal("note"),
  v.literal("document_ref"),
  v.literal("research_snippet"),
  v.literal("memory_note"),
  v.literal("place_context"),
  v.literal("building_context"),
  v.literal("generated_summary"),
  v.literal("other")
);

const contextEvidenceRoleValidator = v.union(
  v.literal("raw_material"),
  v.literal("researcher_conclusion"),
  v.literal("generated_summary"),
  v.literal("lead_or_hint"),
  v.literal("background_context")
);

const privacyLevelValidator = v.union(
  v.literal("private"),
  v.literal("family_review"),
  v.literal("publish_candidate"),
  v.literal("public_source")
);

const mediaReviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("reviewed"),
  v.literal("redacted"),
  v.literal("rejected")
);

const contextReviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("reviewed"),
  v.literal("disputed"),
  v.literal("redacted"),
  v.literal("rejected")
);

const rightsStatusValidator = v.union(
  v.literal("unknown"),
  v.literal("owned"),
  v.literal("permitted"),
  v.literal("public_domain"),
  v.literal("restricted")
);

async function buildStorySlugForPerson(
  ctx: MutationCtx,
  params: {
    storyId: string;
    title: string;
    vaultOwnerId: string;
    functionName: string;
    personId?: Doc<"stories">["personId"];
  }
) {
  const person = params.personId
    ? await authorizeOwnedReferenceMutation(
        ctx,
        params.functionName,
        params.vaultOwnerId,
        await ctx.db.get(params.personId),
        "Story person",
      )
    : null;
  return buildStoryPublicSlug({
    storyId: params.storyId,
    title: redactPublicText(params.title),
    personName: person ? redactPublicText(formatPersonName(person)) : undefined,
  });
}

const storyReviewActorRoleValidator = v.union(
  v.literal("first_party_owner"),
  v.literal("story_writer"),
  v.literal("reviewer"),
  v.literal("trusted_publisher"),
  v.literal("unknown")
);

const storyReviewEventTypeValidator = v.union(
  v.literal("publish_preview"),
  v.literal("status_change"),
  v.literal("publish_confirmation"),
  v.literal("assignment"),
  v.literal("draft_edit")
);

function getBackendPublishReadiness(
  bundle: NonNullable<ReturnType<typeof buildStoryBundle>>,
) {
  return assessStoryPublishReadiness({
    story: bundle.story,
    person: bundle.person,
    readiness: bundle.readiness,
    researchChecks: bundle.researchChecks,
    contextCoverage: bundle.contextCoverage,
    evidence: bundle.evidence,
    events: bundle.events,
    places: bundle.places,
    relationships: bundle.relationships,
    provisionalRelatives: bundle.provisionalRelatives,
    publishWarnings: bundle.publishWarnings,
  });
}

function toPublishAuditSnapshot(readiness: ReturnType<typeof getBackendPublishReadiness>) {
  return {
    canPublish: readiness.canPublish,
    status: readiness.status,
    score: readiness.score,
    summary: readiness.summary,
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    provenance: readiness.provenance,
    recommendedNextActions: readiness.recommendedNextActions,
  };
}

/**
 * Tenant-auth mismatches may be observed during the guarded shadow rollout,
 * but story publication policy was already fail-closed before that rollout.
 * Never let shadow mode turn an invalid publish or public-story edit into an
 * allowed write.
 */
async function enforceStoryPolicyViolation(
  ctx: MutationCtx,
  functionName: string,
  reason: "publish_gate_failed" | "published_edit_requires_review" | "direct_publish_bypass",
): Promise<never> {
  if (getTrustBoundaryMode() === "enforce") {
    await handlePolicyViolationMutation(ctx, functionName, reason);
  }
  throw new Error(`Story publishing policy denied: ${reason}`);
}

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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertPerson",
      args.vaultOwnerId,
    );
    for (const placeId of [args.birth?.place?.placeId, args.death?.place?.placeId]) {
      if (!placeId) continue;
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertPerson",
        vaultOwnerId,
        await ctx.db.get(placeId),
        "Person fact place",
      );
    }
    const now = Date.now();
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

/**
 * Create the smallest useful private family picture in one transaction.
 *
 * This is intentionally narrower than a general tree editor: it only runs in
 * a workspace with no durable content, records two people and one explicit
 * relationship, and marks the information as the user's unsourced statement.
 * The operation id makes a lost-response retry safe without creating a second
 * family pair.
 */
export const startPrivateWorkspace = mutation({
  args: {
    vaultOwnerId: v.string(),
    operationId: v.string(),
    startingPerson: firstStartPersonValidator,
    relatedPerson: firstStartPersonValidator,
    relationship: v.union(v.literal("parent"), v.literal("child"), v.literal("partner")),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.startPrivateWorkspace",
      args.vaultOwnerId,
    );
    const operationId = args.operationId.trim();
    if (!operationId || operationId.length > 160) {
      throw new Error("First-start operation id must be between 1 and 160 characters");
    }

    const existingOperation = await ctx.db
      .query("persons")
      .withIndex("by_owner_creation_operation", (q) =>
        q.eq("vaultOwnerId", vaultOwnerId).eq("creationProvenance.operationId", operationId),
      )
      .collect();
    if (existingOperation.length > 0) {
      const starting = existingOperation.find((person) => person.creationRole === "starting_person");
      const related = existingOperation.find((person) => person.creationRole === "related_person");
      if (!starting || !related) throw new Error("First-start retry could not recover the complete family pair");
      const relationships = await ctx.db
        .query("relationships")
        .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
        .collect();
      const relationship = relationships.find(
        (row) => row.creationProvenance?.operationId === operationId,
      );
      if (!relationship) throw new Error("First-start retry could not recover the relationship");
      return {
        startingPersonId: starting._id,
        relatedPersonId: related._id,
        relationshipId: relationship._id,
        deduplicated: true,
      };
    }

    const workspaceChecks = await Promise.all([
      ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("relationships").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("events").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("personEvents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("places").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("citations").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("citationLinks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("sourceFacts").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("media").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("contextItems").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("stories").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("importRuns").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("documents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("researchTasks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("researchLog").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("storyReviewEvents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("provisionalRelatives").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("researchChecks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("historicalContext").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
      ctx.db.query("queueItems").withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId)).first(),
    ]);
    if (workspaceChecks.some(Boolean)) {
      throw new Error("First start is only available in an empty private workspace");
    }

    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const provenance = {
      actorKind: "user" as const,
      actorId: identity?.subject ?? vaultOwnerId,
      method: "manual_first_start" as const,
      evidenceStatus: "unsourced" as const,
      operationId,
      recordedAt: now,
    };
    const startingName = {
      given: cleanFirstStartName(args.startingPerson.given, "First person's given name", true),
      surname: cleanFirstStartName(args.startingPerson.surname ?? "", "First person's family name", false),
    };
    const relatedName = {
      given: cleanFirstStartName(args.relatedPerson.given, "Related person's given name", true),
      surname: cleanFirstStartName(args.relatedPerson.surname ?? "", "Related person's family name", false),
    };

    const startingPersonId = await ctx.db.insert("persons", {
      vaultOwnerId,
      name: startingName,
      sex: "unknown",
      living: args.startingPerson.living,
      researchStatus: "basic",
      creationProvenance: provenance,
      creationRole: "starting_person",
      createdAt: now,
      updatedAt: now,
    });
    const relatedPersonId = await ctx.db.insert("persons", {
      vaultOwnerId,
      name: relatedName,
      sex: "unknown",
      living: args.relatedPerson.living,
      researchStatus: "basic",
      creationProvenance: provenance,
      creationRole: "related_person",
      createdAt: now,
      updatedAt: now,
    });

    const type = args.relationship === "partner" ? ("Couple" as const) : ("ParentChild" as const);
    const person1 = args.relationship === "parent" ? relatedPersonId : startingPersonId;
    const person2 = args.relationship === "parent" ? startingPersonId : relatedPersonId;
    const relationshipId = await ctx.db.insert("relationships", {
      vaultOwnerId,
      type,
      childRelationType: type === "ParentChild" ? "Unknown" : undefined,
      person1,
      person2,
      creationProvenance: provenance,
      createdAt: now,
      updatedAt: now,
    });

    return { startingPersonId, relatedPersonId, relationshipId, deduplicated: false };
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertSource",
      args.vaultOwnerId,
    );
    const now = Date.now();
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertCitation",
      args.vaultOwnerId,
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertCitation",
      vaultOwnerId,
      await ctx.db.get(args.sourceId),
      "Citation source",
    );
    const now = Date.now();
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertEvent",
      args.vaultOwnerId,
    );
    if (args.place?.placeId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertEvent",
        vaultOwnerId,
        await ctx.db.get(args.place.placeId),
        "Event place",
      );
    }
    const now = Date.now();
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertPersonEvent",
      args.vaultOwnerId,
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertPersonEvent",
      vaultOwnerId,
      await ctx.db.get(args.personId),
      "Person event person",
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertPersonEvent",
      vaultOwnerId,
      await ctx.db.get(args.eventId),
      "Person event",
    );
    const existingRows = await ctx.db
      .query("personEvents")
      .withIndex("by_person_and_event", (q) =>
        q.eq("personId", args.personId).eq("eventId", args.eventId)
      )
      .collect();
    const existing = filterByVaultOwner(existingRows, vaultOwnerId)[0] ?? null;

    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    }

    return await ctx.db.insert("personEvents", {
      ...args,
      vaultOwnerId,
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertRelationship",
      args.vaultOwnerId,
    );
    for (const personId of [args.person1, args.person2]) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertRelationship",
        vaultOwnerId,
        await ctx.db.get(personId),
        "Relationship person",
      );
    }
    for (const placeId of (args.facts ?? [])
      .map((fact) => fact.place?.placeId)
      .filter((id): id is NonNullable<typeof id> => Boolean(id))) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertRelationship",
        vaultOwnerId,
        await ctx.db.get(placeId),
        "Relationship fact place",
      );
    }
    const now = Date.now();
    let existing: Doc<"relationships"> | null = null;

    if (args.familySearchId) {
      const rows = await ctx.db
        .query("relationships")
        .withIndex("by_familySearchId", (q) => q.eq("familySearchId", args.familySearchId))
        .collect();
      existing = filterByVaultOwner(rows, vaultOwnerId)[0] ?? null;
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
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertMedia",
      args.vaultOwnerId,
    );
    for (const personId of args.personIds) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertMedia",
        vaultOwnerId,
        await ctx.db.get(personId),
        "Media person",
      );
    }
    if (args.sourceId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertMedia",
        vaultOwnerId,
        await ctx.db.get(args.sourceId),
        "Media source",
      );
    }
    const now = Date.now();
    let existing: Doc<"media"> | null = null;

    if (args.familySearchUrl) {
      const rows = await ctx.db
        .query("media")
        .withIndex("by_familySearchUrl", (q) => q.eq("familySearchUrl", args.familySearchUrl))
        .collect();
      existing = filterByVaultOwner(rows, vaultOwnerId)[0] ?? null;
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

export const upsertSourceFact = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.id("persons"),
    sourceId: v.id("sources"),
    citationId: v.id("citations"),
    importKey: v.string(),
    factType: sourceFactTypeValidator,
    label: v.string(),
    value: v.string(),
    date: v.optional(v.string()),
    place: v.optional(v.string()),
    confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    status: sourceFactStatusValidator,
    conflictReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertSourceFact",
      args.vaultOwnerId,
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertSourceFact",
      vaultOwnerId,
      await ctx.db.get(args.personId),
      "Source fact person",
    );
    const source = await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertSourceFact",
      vaultOwnerId,
      await ctx.db.get(args.sourceId),
      "Source fact source",
    );
    const citation = await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertSourceFact",
      vaultOwnerId,
      await ctx.db.get(args.citationId),
      "Source fact citation",
    );
    if (citation.sourceId !== source._id) {
      throw new Error("Source fact citation does not belong to the selected source");
    }
    const now = Date.now();
    const matches = await ctx.db
      .query("sourceFacts")
      .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
      .collect();
    const existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
    const payload = {
      ...args,
      vaultOwnerId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { sourceFactId: existing._id, created: false };
    }

    const sourceFactId = await ctx.db.insert("sourceFacts", {
      ...payload,
      createdAt: now,
    });
    return { sourceFactId, created: true };
  },
});

/**
 * AWF-0046: the closing move on a conflict.
 *
 * A census says 1847 and a headstone says 1849. Deciding which one to believe,
 * and writing down why, is the actual work of genealogy. Until now the vault
 * could only say "these disagree": `upsertSourceFact` above was the only writer
 * of `sourceFacts.status`, its one caller was the FamilySearch importer, and no
 * surface could move a fact out of `conflict`. The badge was permanent.
 *
 * Three things this deliberately does NOT do:
 *
 * - It does not delete the reading that lost. `rejected` is a recorded
 *   judgment, not an erasure; a reader a year from now must be able to see what
 *   was weighed. The row, its citation, and its source all stay.
 * - It does not rewrite the person's canonical fact. Source facts have never
 *   silently overwritten a conclusion, and accepting a source reading is a
 *   statement about the evidence, not an edit to the person record. Changing
 *   the canonical birth date remains a separate, deliberate act.
 * - It is not reachable by a connected AI. This is a public `mutation` in
 *   `vaultMutations`, which the MCP surface never calls — MCP dispatches only
 *   to `internal.*` functions in `convex/mcpFamilyHistory.ts`. An AI may
 *   propose a resolution on the `conflict_resolution` research task; the person
 *   confirms it here. Card AWF-0046 holds the open question of whether that
 *   line should ever move.
 */
export const resolveSourceFactConflict = mutation({
  args: {
    vaultOwnerId: v.string(),
    sourceFactId: v.id("sourceFacts"),
    resolution: v.union(v.literal("accepted"), v.literal("rejected")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.resolveSourceFactConflict",
      args.vaultOwnerId,
    );
    const fact = await ctx.db.get(args.sourceFactId);
    if (!fact || !matchesVaultOwner(fact.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Source fact not found");
    }
    const person = await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.resolveSourceFactConflict",
      vaultOwnerId,
      await ctx.db.get(fact.personId),
      "Source fact person",
    );

    const verdict = assessConflictResolution({
      currentStatus: fact.status,
      resolution: args.resolution,
      reason: args.reason,
    });
    if (!verdict.allowed) throw new Error(verdict.message);

    const now = Date.now();
    const canonicalReading =
      fact.factType === "name"
        ? formatPersonName(person)
        : fact.factType === "birth"
          ? person.birth?.date?.original
          : fact.factType === "death"
            ? person.death?.date?.original
            : undefined;

    await ctx.db.patch(args.sourceFactId, {
      status: args.resolution,
      // The reason the conflict was raised stays on the row alongside the
      // decision, so the disagreement itself is still legible after it is settled.
      updatedAt: now,
    });

    const summary = describeConflictResolution({
      factType: fact.factType,
      label: fact.label,
      sourceReading: fact.value,
      canonicalReading,
      resolution: args.resolution,
    });

    await ctx.db.insert("researchLog", {
      vaultOwnerId,
      entityType: "person",
      entityId: fact.personId,
      activityType: "other",
      status: "done",
      summary,
      details: [
        `Source fact ID: ${String(args.sourceFactId)}`,
        `Source reading: ${fact.value}`,
        `This vault's reading: ${canonicalReading || "not recorded on the person"}`,
        fact.conflictReason ? `Why it was flagged: ${fact.conflictReason}` : null,
        `Decision: ${args.resolution}`,
        `Reason given: ${verdict.reason}`,
        "The reading decided against is kept, not deleted.",
      ].filter(Boolean).join("\n"),
      outputRefs: [
        `sourceFact:${String(args.sourceFactId)}`,
        `citation:${String(fact.citationId)}`,
        `source:${String(fact.sourceId)}`,
      ],
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    // The importer opens one `conflict_resolution` task per person, covering
    // every flagged fact at once. Closing it while other conflicts are still
    // open would hide them, so it closes only when the last one is settled —
    // as a consequence of the resolution, not independently of it.
    const remaining = filterByVaultOwner(
      await ctx.db
        .query("sourceFacts")
        .withIndex("by_person", (q) => q.eq("personId", fact.personId))
        .collect(),
      vaultOwnerId,
    ).filter((row) => row.status === "conflict");

    let closedTaskId: string | null = null;
    if (remaining.length === 0) {
      const tasks = filterByVaultOwner(
        await ctx.db
          .query("researchTasks")
          .withIndex("by_person", (q) => q.eq("personId", fact.personId))
          .collect(),
        vaultOwnerId,
      ).filter((task) => task.type === "conflict_resolution" && task.status !== "done");
      for (const task of tasks) {
        const notes = [task.notes, summary, `Reason: ${verdict.reason}`]
          .filter(Boolean)
          .join("\n");
        await ctx.db.patch(task._id, {
          status: "done",
          // `advanceResearchTask` requires a real summary before a task may be
          // marked done. Honour the same floor here rather than routing around it.
          notes: notes.length >= TASK_DONE_NOTES_MIN ? notes : summary,
          completedAt: now,
          updatedAt: now,
        });
        closedTaskId = String(task._id);
      }
    }

    return {
      sourceFactId: args.sourceFactId,
      status: args.resolution,
      remainingConflicts: remaining.length,
      closedTaskId,
    };
  },
});

/**
 * Media byte storage.
 *
 * Family history research runs on scanned records and photographs. Until a
 * scan's *bytes* live in the vault, a chosen AI cannot read the census page —
 * only its title — because the `url` on an imported media row points at
 * FamilySearch, which answers the person's own signed-in browser and nothing
 * else. Convex file storage is private: an object is readable only by
 * owner-checked server code, never by URL, which is exactly the property the
 * protected evidence delivery needs.
 */
export const startMediaUpload = mutation({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args) => {
    await authorizeTenantMutation(ctx, "vaultMutations.startMediaUpload", args.vaultOwnerId);
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

/**
 * Attach uploaded bytes to a media row — a new one, or an existing row that
 * until now held only a remote reference.
 *
 * Review state is deliberately NOT set here. A newly uploaded file arrives
 * `unreviewed` with `aiUseAllowed: false`, so putting a file in the vault never
 * silently widens what an AI may read; the person still decides that in the
 * media review panel. Re-attaching bytes to a reviewed row resets it to
 * unreviewed for the same reason — the bytes under a review are not the bytes
 * the person reviewed.
 */
export const attachMediaFile = mutation({
  args: {
    vaultOwnerId: v.string(),
    mediaId: v.optional(v.id("media")),
    storageId: v.id("_storage"),
    title: v.string(),
    type: v.union(
      v.literal("photo"),
      v.literal("document"),
      v.literal("scan"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("other")
    ),
    mimeType: v.string(),
    sizeBytes: v.number(),
    description: v.optional(v.string()),
    personIds: v.optional(v.array(v.id("persons"))),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.attachMediaFile",
      args.vaultOwnerId,
    );
    for (const personId of args.personIds ?? []) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.attachMediaFile",
        vaultOwnerId,
        await ctx.db.get(personId),
        "Media person",
      );
    }

    const now = Date.now();
    const shared = {
      storageId: args.storageId,
      title: args.title,
      type: args.type,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      description: args.description,
      // A file the person just handed the product is not yet a file they said
      // an AI may read. That stays a separate, deliberate act.
      reviewStatus: "unreviewed" as const,
      aiUseAllowed: false,
      privacyLevel: "private" as const,
      updatedAt: now,
    };

    if (args.mediaId) {
      const existing = await ctx.db.get(args.mediaId);
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.attachMediaFile",
        vaultOwnerId,
        existing,
        "Media item",
      );
      // Replacing bytes leaves no orphan behind.
      if (existing?.storageId && existing.storageId !== args.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      await ctx.db.patch(args.mediaId, {
        ...shared,
        rightsStatus: existing?.rightsStatus ?? "unknown",
        personIds: Array.from(
          new Set([...(existing?.personIds ?? []), ...(args.personIds ?? [])]),
        ),
        privacyReviewNote:
          "A file was attached or replaced, so this item needs review again before an AI may read it.",
        reviewedAt: undefined,
      });
      return { mediaId: args.mediaId, created: false };
    }

    const mediaId = await ctx.db.insert("media", {
      ...shared,
      vaultOwnerId,
      rightsStatus: "unknown",
      personIds: args.personIds ?? [],
      privacyReviewNote:
        "Uploaded to the vault. Set its rights and review it before an AI may read it.",
      createdAt: now,
    });
    return { mediaId, created: true };
  },
});

export const reviewMedia = mutation({
  args: {
    vaultOwnerId: v.string(),
    mediaId: v.id("media"),
    privacyLevel: privacyLevelValidator,
    reviewStatus: mediaReviewStatusValidator,
    rightsStatus: rightsStatusValidator,
    aiUseAllowed: v.boolean(),
    privacyReviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.reviewMedia",
      args.vaultOwnerId,
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.reviewMedia",
      vaultOwnerId,
      await ctx.db.get(args.mediaId),
      "Media item",
    );

    await ctx.db.patch(args.mediaId, {
      privacyLevel: args.privacyLevel,
      reviewStatus: args.reviewStatus,
      rightsStatus: args.rightsStatus,
      aiUseAllowed: args.aiUseAllowed,
      privacyReviewNote: args.privacyReviewNote,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { mediaId: args.mediaId };
  },
});

export const upsertContextItemForPerson = mutation({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
    title: v.string(),
    itemType: contextItemTypeValidator,
    evidenceRole: contextEvidenceRoleValidator,
    content: v.string(),
    sourceLabel: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    provenanceNote: v.optional(v.string()),
    privacyLevel: privacyLevelValidator,
    reviewStatus: contextReviewStatusValidator,
    aiUseAllowed: v.boolean(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertContextItemForPerson",
      args.vaultOwnerId,
    );
    const normalizedPersonId = ctx.db.normalizeId("persons", args.personIdentifier);
    const person =
      (normalizedPersonId ? await ctx.db.get(normalizedPersonId) : null) ??
      filterByVaultOwner(
        await ctx.db
          .query("persons")
          .withIndex("by_fsId", (q) => q.eq("fsId", args.personIdentifier))
          .collect(),
        vaultOwnerId
      )[0] ??
      null;

    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertContextItemForPerson",
      vaultOwnerId,
      person,
      "Person",
    );

    const now = Date.now();
    const contextItemId = await ctx.db.insert("contextItems", {
      vaultOwnerId,
      title: args.title,
      itemType: args.itemType,
      evidenceRole: args.evidenceRole,
      content: args.content,
      sourceLabel: args.sourceLabel,
      sourceUrl: args.sourceUrl,
      provenanceNote: args.provenanceNote,
      primaryPersonId: person._id,
      personIds: [person._id],
      placeIds: [],
      eventIds: [],
      storyIds: [],
      sourceIds: [],
      privacyLevel: args.privacyLevel,
      reviewStatus: args.reviewStatus,
      aiUseAllowed: args.aiUseAllowed,
      reviewNote: args.reviewNote,
      reviewedAt:
        args.reviewStatus === "reviewed" || args.reviewStatus === "redacted"
          ? now
          : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { contextItemId };
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.ensureResearchTask",
      args.vaultOwnerId,
    );
    if (args.personId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.ensureResearchTask",
        vaultOwnerId,
        await ctx.db.get(args.personId),
        "Research task person",
      );
    }
    const existingRows = await ctx.db
      .query("researchTasks")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const existing = filterByVaultOwner(existingRows, vaultOwnerId);

    const match = existing.find((task) => task.title === args.title && task.status !== "done");
    if (match) {
      return { taskId: match._id, created: false };
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("researchTasks", {
      ...args,
      vaultOwnerId,
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
    contextPackIds: v.optional(v.array(v.id("historicalContext"))),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertStoryDraft",
      args.vaultOwnerId,
    );
    if (args.status === "published") {
      await enforceStoryPolicyViolation(
        ctx,
        "vaultMutations.upsertStoryDraft",
        "direct_publish_bypass",
      );
    }

    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertStoryDraft",
      vaultOwnerId,
      await ctx.db.get(args.personId),
      "Person",
    );
    if (args.contextPackIds?.length) {
      const contextPacks = await Promise.all(args.contextPackIds.map((id) => ctx.db.get(id)));
      for (const contextPack of contextPacks) {
        await authorizeOwnedReferenceMutation(
          ctx,
          "vaultMutations.upsertStoryDraft",
          vaultOwnerId,
          contextPack,
          "Story context pack",
        );
      }
    }

    const now = Date.now();
    const existingRows = await ctx.db
      .query("stories")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const existing = filterByVaultOwner(existingRows, vaultOwnerId);

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
      contextPackIds: args.contextPackIds ?? match?.contextPackIds,
      status: args.status,
      publicIndexing: match?.publicIndexing ?? "noindex" as const,
      generatedBy: args.generatedBy,
      promptUsed: args.promptUsed,
      modelUsed: args.modelUsed,
      tags: args.tags,
      updatedAt: now,
    };

    if (match) {
      const publicSlug = await buildStorySlugForPerson(ctx, {
        storyId: String(match._id),
        title: args.title,
        vaultOwnerId,
        functionName: "vaultMutations.upsertStoryDraft",
        personId: args.personId,
      });
      await ctx.db.patch(match._id, {
        ...payload,
        publicSlug: match.status === "published" ? match.publicSlug : publicSlug,
      });
      return { storyId: match._id, created: false };
    }

    const storyId = await ctx.db.insert("stories", {
      vaultOwnerId,
      personId: args.personId,
      relationshipId: undefined,
      type: args.type,
      ...payload,
      createdAt: now,
    });
    await ctx.db.patch(storyId, {
      publicSlug: await buildStorySlugForPerson(ctx, {
        storyId: String(storyId),
        title: args.title,
        vaultOwnerId,
        functionName: "vaultMutations.upsertStoryDraft",
        personId: args.personId,
      }),
    });

    return { storyId, created: true };
  },
});

export const updateStoryStatus = mutation({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
    status: storyStatusValidator,
    // GEN-88 §A: the publish gate is now authoritative in the writer, not just
    // the Next API route. These carry the human-review confirmation the route
    // used to check on its own. Optional so non-publish transitions are
    // unaffected; enforced below only when transitioning to "published".
    humanReviewConfirmed: v.optional(v.boolean()),
    humanReviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.updateStoryStatus",
      args.vaultOwnerId,
    );
    const story = await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.updateStoryStatus",
      vaultOwnerId,
      await ctx.db.get(args.storyId),
      "Story",
    );

    let publishReadiness: ReturnType<typeof getBackendPublishReadiness> | undefined;
    if (args.status === "published") {
      const snapshot = await loadStoryScopedSnapshot(ctx, vaultOwnerId, args.storyId);
      const currentStory = snapshot?.stories.find((entry) => entry._id === args.storyId);
      if (!snapshot || !currentStory) throw new Error("Story not found");

      const bundle = buildStoryBundle(snapshot, currentStory);
      publishReadiness = getBackendPublishReadiness(bundle);
      const gateErrors = evaluateStoryPublishGate({
        story: {
          secondReviewRequired: story.secondReviewRequired,
          secondReviewedAt: story.secondReviewedAt,
        },
        readiness: {
          story: bundle.story,
          person: bundle.person,
          readiness: bundle.readiness,
          researchChecks: bundle.researchChecks,
          contextCoverage: bundle.contextCoverage,
          evidence: bundle.evidence,
          events: bundle.events,
          places: bundle.places,
          relationships: bundle.relationships,
          provisionalRelatives: bundle.provisionalRelatives,
          publishWarnings: bundle.publishWarnings,
        },
        humanReviewConfirmed: args.humanReviewConfirmed,
        humanReviewNote: args.humanReviewNote,
      });

      if (gateErrors.length > 0) {
        await enforceStoryPolicyViolation(
          ctx,
          "vaultMutations.updateStoryStatus",
          "publish_gate_failed",
        );
      }
    }

    const now = Date.now();
    const publicSlug =
      story.publicSlug ??
      (await buildStorySlugForPerson(ctx, {
        storyId: String(story._id),
        title: story.title,
        vaultOwnerId,
        functionName: "vaultMutations.updateStoryStatus",
        personId: story.personId,
      }));

    await ctx.db.patch(args.storyId, {
      status: args.status,
      publicSlug,
      publicIndexing: story.publicIndexing ?? "noindex",
      reviewRequestedAt:
        args.status === "review" && story.status === "draft"
          ? now
          : story.reviewRequestedAt,
      reviewedAt:
        args.status === "published"
          ? now
          : story.reviewedAt,
      lastPublishedAt:
        args.status === "published"
          ? now
          : story.lastPublishedAt,
      updatedAt: now,
    });

    if (args.status === "published" && publishReadiness) {
      await ctx.db.insert("storyReviewEvents", {
        vaultOwnerId,
        storyId: args.storyId,
        personId: story.personId,
        eventType: "publish_confirmation",
        fromStatus: story.status,
        toStatus: "published",
        actorRole: "first_party_owner",
        humanReviewNote: args.humanReviewNote?.trim(),
        readinessSnapshot: toPublishAuditSnapshot(publishReadiness),
        blockerCount: publishReadiness.blockers.length,
        warningCount: publishReadiness.warnings.length,
        readinessScore: publishReadiness.score,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { storyId: args.storyId, status: args.status, publishReadiness };
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.updateStoryDraft",
      args.vaultOwnerId,
    );
    const story = await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.updateStoryDraft",
      vaultOwnerId,
      await ctx.db.get(args.storyId),
      "Story",
    );
    if (story.status === "published") {
      await enforceStoryPolicyViolation(
        ctx,
        "vaultMutations.updateStoryDraft",
        "published_edit_requires_review",
      );
    }

    const generatedBy = story.generatedBy === "ai" ? "ai_edited" : story.generatedBy;
    const now = Date.now();
    const title = args.title.trim();
    const shouldRefreshSlug = story.status !== "published";
    const publicSlug = shouldRefreshSlug
      ? await buildStorySlugForPerson(ctx, {
          storyId: String(story._id),
          title,
          vaultOwnerId,
          functionName: "vaultMutations.updateStoryDraft",
          personId: story.personId,
        })
      : story.publicSlug;

    await ctx.db.patch(args.storyId, {
      title,
      content: args.content.trim(),
      type: args.type ?? story.type,
      tags: args.tags,
      publicSlug,
      generatedBy,
      updatedAt: now,
    });

    return { storyId: args.storyId, updatedAt: now };
  },
});

export const backfillStoryPublicSlugs = mutation({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.backfillStoryPublicSlugs",
      args.vaultOwnerId,
    );
    const stories = filterByVaultOwner(await ctx.db.query("stories").collect(), vaultOwnerId);
    const now = Date.now();
    let updated = 0;

    for (const story of stories) {
      if (story.publicSlug && story.publicIndexing) continue;
      await ctx.db.patch(story._id, {
        publicSlug:
          story.publicSlug ??
          (await buildStorySlugForPerson(ctx, {
            storyId: String(story._id),
            title: story.title,
            vaultOwnerId,
            functionName: "vaultMutations.backfillStoryPublicSlugs",
            personId: story.personId,
          })),
        publicIndexing: story.publicIndexing ?? "noindex",
        updatedAt: now,
      });
      updated += 1;
    }

    return { updated, checked: stories.length };
  },
});

export const assignStoryReviewer = mutation({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
    assignedReviewer: v.string(),
    secondReviewRequired: v.optional(v.boolean()),
    secondReviewer: v.optional(v.string()),
    secondReviewApproved: v.optional(v.boolean()),
    actorRole: storyReviewActorRoleValidator,
    actorName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.assignStoryReviewer",
      args.vaultOwnerId,
    );
    const story = await ctx.db.get(args.storyId);
    if (!story || !matchesVaultOwner(story.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Story not found");
    }

    const now = Date.now();
    const assignedReviewer = args.assignedReviewer.trim();
    const secondReviewer = args.secondReviewer?.trim();
    const secondReviewRequired = args.secondReviewRequired ?? story.secondReviewRequired ?? false;
    await ctx.db.patch(args.storyId, {
      assignedReviewer,
      secondReviewRequired,
      secondReviewer: secondReviewRequired ? secondReviewer : undefined,
      secondReviewedAt: secondReviewRequired
        ? args.secondReviewApproved
          ? story.secondReviewedAt ?? now
          : undefined
        : undefined,
      reviewRequestedAt: story.reviewRequestedAt ?? now,
      updatedAt: now,
    });

    const secondReviewNote = secondReviewRequired
      ? `Second approval${secondReviewer ? ` by ${secondReviewer}` : ""}${args.secondReviewApproved ? " marked complete" : " required"}.`
      : undefined;
    const eventId = await ctx.db.insert("storyReviewEvents", {
      vaultOwnerId,
      storyId: args.storyId,
      personId: story.personId,
      eventType: "assignment",
      fromStatus: story.status,
      toStatus: story.status,
      actorRole: args.actorRole,
      actorName: args.actorName,
      assignedTo: assignedReviewer,
      humanReviewNote: [args.note, secondReviewNote].filter(Boolean).join(" ") || undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { storyId: args.storyId, eventId, assignedReviewer, updatedAt: now };
  },
});

export const recordStoryReviewEvent = mutation({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
    eventType: storyReviewEventTypeValidator,
    fromStatus: v.optional(storyStatusValidator),
    toStatus: v.optional(storyStatusValidator),
    actorRole: storyReviewActorRoleValidator,
    actorName: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    reviewerName: v.optional(v.string()),
    humanReviewNote: v.optional(v.string()),
    readinessSnapshot: v.optional(v.any()),
    blockerCount: v.optional(v.number()),
    warningCount: v.optional(v.number()),
    readinessScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.recordStoryReviewEvent",
      args.vaultOwnerId,
    );
    const story = await ctx.db.get(args.storyId);
    if (!story || !matchesVaultOwner(story.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Story not found");
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("storyReviewEvents", {
      vaultOwnerId,
      storyId: args.storyId,
      personId: story.personId,
      eventType: args.eventType,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      actorRole: args.actorRole,
      actorName: args.actorName,
      assignedTo: args.assignedTo,
      reviewerName: args.reviewerName,
      humanReviewNote: args.humanReviewNote,
      readinessSnapshot: args.readinessSnapshot,
      blockerCount: args.blockerCount,
      warningCount: args.warningCount,
      readinessScore: args.readinessScore,
      createdAt: now,
      updatedAt: now,
    });

    if (args.eventType === "publish_preview") {
      await ctx.db.patch(args.storyId, {
        lastPublishPreviewAt: now,
        updatedAt: now,
      });
    }

    return { storyId: args.storyId, eventId, updatedAt: now };
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
    packType: v.optional(researchPackTypeValidator),
    templateVersion: v.optional(v.string()),
    privacyLevel: v.optional(privacyLevelValidator),
    reviewStatus: v.optional(contextReviewStatusValidator),
    aiUseAllowed: v.optional(v.boolean()),
    categoryBlocks: v.optional(v.array(researchPackCategoryBlockValidator)),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertHistoricalContext",
      args.vaultOwnerId,
    );
    if (args.placeId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertHistoricalContext",
        vaultOwnerId,
        await ctx.db.get(args.placeId),
        "Historical context place",
      );
    }
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
      packType: args.packType,
      templateVersion: args.templateVersion?.trim() || undefined,
      privacyLevel: args.privacyLevel ?? "private" as const,
      reviewStatus: args.reviewStatus ?? "unreviewed" as const,
      aiUseAllowed: args.aiUseAllowed ?? false,
      categoryBlocks: args.categoryBlocks?.map((block) => ({
        category: block.category,
        summary: block.summary.trim(),
        sourcedClaims: block.sourcedClaims
          .map((claim) => ({
            text: claim.text.trim(),
            sourceRefs: claim.sourceRefs.map((sourceRef) => sourceRef.trim()).filter(Boolean),
            confidence: claim.confidence,
          }))
          .filter((claim) => claim.text.length > 0),
        synthesisNotes: block.synthesisNotes?.trim() || undefined,
      })).filter((block) => block.summary.length > 0 || block.sourcedClaims.length > 0 || block.synthesisNotes),
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
      payload.packType ? `Pack type: ${payload.packType}` : "Pack type: untyped context report",
      `Review: ${payload.reviewStatus}; privacy: ${payload.privacyLevel}; AI use: ${payload.aiUseAllowed ? "allowed" : "blocked"}`,
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertProvisionalRelative",
      args.vaultOwnerId,
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertProvisionalRelative",
      vaultOwnerId,
      await ctx.db.get(args.anchorPersonId),
      "Provisional relative anchor",
    );
    const now = Date.now();
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.upsertResearchCheck",
      args.vaultOwnerId,
    );
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.upsertResearchCheck",
      vaultOwnerId,
      await ctx.db.get(args.personId),
      "Research check person",
    );
    for (const sourceId of args.linkedSourceIds ?? []) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertResearchCheck",
        vaultOwnerId,
        await ctx.db.get(sourceId),
        "Research check source",
      );
    }
    for (const placeId of args.linkedPlaceIds ?? []) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertResearchCheck",
        vaultOwnerId,
        await ctx.db.get(placeId),
        "Research check place",
      );
    }
    for (const personId of args.linkedPersonIds ?? []) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.upsertResearchCheck",
        vaultOwnerId,
        await ctx.db.get(personId),
        "Research check linked person",
      );
    }
    const now = Date.now();
    const existingRows = await ctx.db
      .query("researchChecks")
      .withIndex("by_person_check", (q) => q.eq("personId", args.personId).eq("checkKey", args.checkKey))
      .collect();
    const existing = filterByVaultOwner(existingRows, vaultOwnerId)[0] ?? null;

    const payload = {
      vaultOwnerId,
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.bulkRefreshResearchChecks",
      args.vaultOwnerId,
    );
    const now = Date.now();
    const person = await ctx.db.get(args.personId);
    if (!person || !matchesVaultOwner(person.vaultOwnerId, vaultOwnerId)) {
      return { updated: 0 };
    }

    // GEN-93: replace 13 full-table .collect() scans with indexed per-person
    // reads. `inferResearchChecks` consumes every array only through
    // order-insensitive reductions (.length / .some / .every / keyword scans /
    // .includes) and the mutation loop matches existing checks by checkKey, so
    // the index ordering of these reads does not change the computed output.
    const personKey = person.fsId || String(person._id);
    const personFsId = person.fsId;

    const [
      relationshipsAsPerson1,
      relationshipsAsPerson2,
      personEvents,
      personMedia,
      ownedDocuments,
      ownedStoriesRaw,
      importRunsByPerson,
      importRunsByFsId,
      ownedChecksRaw,
      provisionalByAnchor,
      personLinks,
    ] = await Promise.all([
      ctx.db
        .query("relationships")
        .withIndex("by_person1", (q) => q.eq("person1", args.personId))
        .collect(),
      ctx.db
        .query("relationships")
        .withIndex("by_person2", (q) => q.eq("person2", args.personId))
        .collect(),
      ctx.db
        .query("personEvents")
        .withIndex("by_person", (q) => q.eq("personId", args.personId))
        .collect(),
      ctx.db
        .query("media")
        .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
        .collect(),
      ctx.db
        .query("documents")
        .withIndex("by_personId", (q) => q.eq("personId", personKey))
        .collect(),
      ctx.db
        .query("stories")
        .withIndex("by_person", (q) => q.eq("personId", args.personId))
        .collect(),
      ctx.db
        .query("importRuns")
        .withIndex("by_person", (q) => q.eq("personId", args.personId))
        .collect(),
      // importRuns.personFsId is a non-optional string, so the original
      // predicate `run.personFsId === person.fsId` can only match when
      // person.fsId is defined. When undefined, there are no fsId matches.
      personFsId
        ? ctx.db
            .query("importRuns")
            .withIndex("by_person_fsId", (q) => q.eq("personFsId", personFsId))
            .collect()
        : Promise.resolve([] as Doc<"importRuns">[]),
      ctx.db
        .query("researchChecks")
        .withIndex("by_person", (q) => q.eq("personId", args.personId))
        .collect(),
      ctx.db
        .query("provisionalRelatives")
        .withIndex("by_anchor", (q) => q.eq("anchorPersonId", args.personId))
        .collect(),
      ctx.db
        .query("citationLinks")
        .withIndex("by_target", (q) => q.eq("targetType", "person").eq("targetId", String(args.personId)))
        .collect(),
    ]);

    // Relationships: union of person1/person2 matches, deduped, owner-scoped.
    const relationshipById = new Map<string, Doc<"relationships">>();
    for (const relationship of [...relationshipsAsPerson1, ...relationshipsAsPerson2]) {
      relationshipById.set(String(relationship._id), relationship);
    }
    const ownedRelationships = filterByVaultOwner(
      Array.from(relationshipById.values()),
      vaultOwnerId
    );

    const ownedPersonEvents = filterByVaultOwner(personEvents, vaultOwnerId);
    // Resolve events by id from the person's event links (owner-scoped). Dedup
    // by eventId so a person with multiple links to one event yields it once,
    // matching the original events-table filter (a table is unique by _id).
    const uniqueEventIds = Array.from(
      new Set(ownedPersonEvents.map((link) => String(link.eventId)))
    );
    const ownedEvents = (
      await Promise.all(
        uniqueEventIds.map((id) => ctx.db.get(id as Doc<"events">["_id"]))
      )
    ).filter(
      (event): event is Doc<"events"> =>
        event !== null && matchesVaultOwner(event.vaultOwnerId, vaultOwnerId)
    );

    const ownedMedia = filterByVaultOwner(personMedia, vaultOwnerId).filter((item) =>
      item.personIds.includes(args.personId)
    );
    const ownedStories = filterByVaultOwner(ownedStoriesRaw, vaultOwnerId);
    const ownedImportRuns = (() => {
      const byId = new Map<string, Doc<"importRuns">>();
      for (const run of [...importRunsByPerson, ...importRunsByFsId]) {
        byId.set(String(run._id), run);
      }
      return filterByVaultOwner(Array.from(byId.values()), vaultOwnerId);
    })();
    const ownedChecks = filterByVaultOwner(ownedChecksRaw, vaultOwnerId);
    const ownedProvisional = filterByVaultOwner(provisionalByAnchor, vaultOwnerId).filter(
      (relative) => relative.mergeState === "provisional"
    );

    // Citation links: person-target links read by index, plus event-target
    // links for this person's events (read per event by index).
    const eventLinkLists = await Promise.all(
      ownedEvents.map((event) =>
        ctx.db
          .query("citationLinks")
          .withIndex("by_target", (q) =>
            q.eq("targetType", "event").eq("targetId", String(event._id))
          )
          .collect()
      )
    );
    const linkById = new Map<string, Doc<"citationLinks">>();
    for (const link of [...personLinks, ...eventLinkLists.flat()]) {
      linkById.set(String(link._id), link);
    }
    const ownedLinks = filterByVaultOwner(Array.from(linkById.values()), vaultOwnerId);

    // Resolve citations by id from the gathered links (owner-scoped), then
    // resolve sources by id from those citations.
    const citationIds = Array.from(new Set(ownedLinks.map((link) => String(link.citationId))));
    const ownedCitations = (
      await Promise.all(citationIds.map((id) => ctx.db.get(id as Doc<"citations">["_id"])))
    ).filter(
      (citation): citation is Doc<"citations"> =>
        citation !== null && matchesVaultOwner(citation.vaultOwnerId, vaultOwnerId)
    );
    const sourceIds = Array.from(new Set(ownedCitations.map((citation) => String(citation.sourceId))));
    const ownedSources = (
      await Promise.all(sourceIds.map((id) => ctx.db.get(id as Doc<"sources">["_id"])))
    ).filter(
      (source): source is Doc<"sources"> =>
        source !== null && matchesVaultOwner(source.vaultOwnerId, vaultOwnerId)
    );

    const placeIds = new Set(
      [person.birth?.place?.placeId, person.death?.place?.placeId, ...ownedEvents.map((event) => event.place?.placeId)]
        .filter(Boolean)
        .map(String)
    );
    const ownedPlaces = (
      await Promise.all(
        Array.from(placeIds).map((id) => ctx.db.get(id as Doc<"places">["_id"]))
      )
    ).filter(
      (place): place is Doc<"places"> =>
        place !== null && matchesVaultOwner(place.vaultOwnerId, vaultOwnerId)
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
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.createResearchTask",
      args.vaultOwnerId,
    );
    if (args.personId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "vaultMutations.createResearchTask",
        vaultOwnerId,
        await ctx.db.get(args.personId),
        "Research task person",
      );
    }
    const now = Date.now();
    const taskId = await ctx.db.insert("researchTasks", {
      vaultOwnerId,
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
    humanReviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.promoteProvisionalRelative",
      args.vaultOwnerId,
    );
    const now = Date.now();
    const provisional = await ctx.db.get(args.provisionalId);
    if (!provisional || !matchesVaultOwner(provisional.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Provisional relative not found");
    }
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.promoteProvisionalRelative",
      vaultOwnerId,
      await ctx.db.get(provisional.anchorPersonId),
      "Provisional relative anchor",
    );
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
    if (existingPerson && existingPerson._id === provisional.anchorPersonId) {
      throw new Error("Provisional relative resolves to the anchor person and cannot be promoted");
    }

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
        createdAt: now,
        updatedAt: now,
      }));

    const canonicalPersonId = typeof target === "object" ? target._id : target;
    await ctx.db.patch(args.provisionalId, {
      mergeState: "promoted",
      canonicalPersonId,
      updatedAt: now,
    });
    await ctx.db.insert("researchLog", {
      vaultOwnerId,
      entityType: "person",
      entityId: canonicalPersonId,
      activityType: "other",
      status: "done",
      summary: `Promoted provisional relative: ${provisional.displayName}`,
      details: [
        `Provisional ID: ${String(args.provisionalId)}`,
        `Anchor person ID: ${String(provisional.anchorPersonId)}`,
        provisional.relationshipHint ? `Relationship hint: ${provisional.relationshipHint}` : null,
        provisional.familySearchId ? `FamilySearch ID: ${provisional.familySearchId}` : null,
        `Evidence count: ${provisional.evidenceCount}`,
        args.humanReviewNote ? `Human review note: ${args.humanReviewNote}` : "Human review note: not recorded",
      ].filter(Boolean).join("\n"),
      outputRefs: [`provisionalRelative:${String(args.provisionalId)}`],
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    return { personId: canonicalPersonId };
  },
});

export const mergeProvisionalRelative = mutation({
  args: {
    vaultOwnerId: v.string(),
    provisionalId: v.id("provisionalRelatives"),
    targetPersonId: v.id("persons"),
    humanReviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner: vaultOwnerId } = await authorizeTenantMutation(
      ctx,
      "vaultMutations.mergeProvisionalRelative",
      args.vaultOwnerId,
    );
    const now = Date.now();
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
    await authorizeOwnedReferenceMutation(
      ctx,
      "vaultMutations.mergeProvisionalRelative",
      vaultOwnerId,
      await ctx.db.get(provisional.anchorPersonId),
      "Provisional relative anchor",
    );
    if (provisional.mergeState !== "provisional") {
      throw new Error("This provisional relative has already been resolved");
    }
    if (provisional.anchorPersonId === args.targetPersonId) {
      throw new Error("Choose a different canonical person than the anchor person");
    }
    if (provisional.familySearchId && target.fsId && provisional.familySearchId !== target.fsId) {
      throw new Error("Target FamilySearch ID does not match this provisional relative");
    }

    await ctx.db.patch(args.provisionalId, {
      mergeState: "merged",
      canonicalPersonId: args.targetPersonId,
      updatedAt: now,
    });
    await ctx.db.insert("researchLog", {
      vaultOwnerId,
      entityType: "person",
      entityId: args.targetPersonId,
      activityType: "other",
      status: "done",
      summary: `Merged provisional relative into ${formatPersonName(target)}`,
      details: [
        `Provisional relative: ${provisional.displayName}`,
        `Provisional ID: ${String(args.provisionalId)}`,
        `Anchor person ID: ${String(provisional.anchorPersonId)}`,
        provisional.relationshipHint ? `Relationship hint: ${provisional.relationshipHint}` : null,
        provisional.familySearchId ? `FamilySearch ID: ${provisional.familySearchId}` : null,
        `Evidence count: ${provisional.evidenceCount}`,
        args.humanReviewNote ? `Human review note: ${args.humanReviewNote}` : "Human review note: not recorded",
      ].filter(Boolean).join("\n"),
      outputRefs: [`provisionalRelative:${String(args.provisionalId)}`],
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    return { success: true };
  },
});
