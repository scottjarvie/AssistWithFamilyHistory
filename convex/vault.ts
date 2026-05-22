import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildStoryPublicSlug } from "../lib/stories/slug";
import {
  buildOperationSummary,
  filterByVaultOwner,
  formatPersonName,
  inferResearchChecks,
  normalizeVaultOwnerId,
  sortByTimestampDesc,
} from "./vaultCore";

type VaultSnapshot = {
  people: Doc<"persons">[];
  relationships: Doc<"relationships">[];
  events: Doc<"events">[];
  personEvents: Doc<"personEvents">[];
  places: Doc<"places">[];
  sources: Doc<"sources">[];
  citations: Doc<"citations">[];
  citationLinks: Doc<"citationLinks">[];
  sourceFacts: Doc<"sourceFacts">[];
  media: Doc<"media">[];
  contextItems: Doc<"contextItems">[];
  importRuns: Doc<"importRuns">[];
  researchTasks: Doc<"researchTasks">[];
  researchLog: Doc<"researchLog">[];
  documents: Doc<"documents">[];
  stories: Doc<"stories">[];
  storyReviewEvents: Doc<"storyReviewEvents">[];
  historicalContext: Doc<"historicalContext">[];
  researchChecks: Doc<"researchChecks">[];
  provisionalRelatives: Doc<"provisionalRelatives">[];
};

const storyWorkflowValidator = v.union(
  v.literal("needs_genealogy_evidence"),
  v.literal("needs_context_research"),
  v.literal("ready_to_draft"),
  v.literal("ready_to_review"),
  v.literal("published")
);

async function getVaultSnapshot(ctx: QueryCtx, vaultOwnerId: string): Promise<VaultSnapshot> {
  const owned = <T extends { vaultOwnerId?: string }>(rows: T[]) => filterByVaultOwner(rows, vaultOwnerId);

  // GEN-70: use by_owner indexes instead of full-table scans. All 20 tables
  // queried below have a `by_owner` index defined in convex/schema.ts. The
  // `owned()` JS filter at the return is now defense-in-depth (should be
  // redundant after the index) — kept because correctness is cheap and the
  // predicate also normalizes the `vaultOwnerId` cookie path.
  const byOwner = <T extends string>(table: T) =>
    ctx.db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(table as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_owner" as any, (q: any) => q.eq("vaultOwnerId", vaultOwnerId))
      .collect();

  const [
    people,
    relationships,
    events,
    personEvents,
    places,
    sources,
    citations,
    citationLinks,
    sourceFacts,
    media,
    contextItems,
    importRuns,
    researchTasks,
    researchLog,
    documents,
    stories,
    storyReviewEvents,
    historicalContext,
    researchChecks,
    provisionalRelatives,
  ] = await Promise.all([
    byOwner("persons"),
    byOwner("relationships"),
    byOwner("events"),
    byOwner("personEvents"),
    byOwner("places"),
    byOwner("sources"),
    byOwner("citations"),
    byOwner("citationLinks"),
    byOwner("sourceFacts"),
    byOwner("media"),
    byOwner("contextItems"),
    byOwner("importRuns"),
    byOwner("researchTasks"),
    byOwner("researchLog"),
    byOwner("documents"),
    byOwner("stories"),
    byOwner("storyReviewEvents"),
    byOwner("historicalContext"),
    byOwner("researchChecks"),
    byOwner("provisionalRelatives"),
  ]);

  return {
    people: owned(people),
    relationships: owned(relationships),
    events: owned(events),
    personEvents: owned(personEvents),
    places: owned(places),
    sources: owned(sources),
    citations: owned(citations),
    citationLinks: owned(citationLinks),
    sourceFacts: owned(sourceFacts),
    media: owned(media),
    contextItems: owned(contextItems),
    importRuns: owned(importRuns),
    researchTasks: owned(researchTasks),
    researchLog: owned(researchLog),
    documents: owned(documents),
    stories: owned(stories),
    storyReviewEvents: owned(storyReviewEvents),
    historicalContext: owned(historicalContext),
    researchChecks: owned(researchChecks),
    provisionalRelatives: owned(provisionalRelatives),
  };
}

function getPersonByIdentifier(snapshot: VaultSnapshot, personIdentifier: string) {
  return (
    snapshot.people.find(
      (person) => person.fsId === personIdentifier || String(person._id) === personIdentifier
    ) ?? null
  );
}

function getPersonLifespan(person: Doc<"persons"> | null) {
  if (!person) return "Unknown lifespan";
  const birth = person.birth?.date?.year ?? person.birth?.date?.original ?? "?";
  const death = person.death?.date?.year ?? person.death?.date?.original ?? "?";
  return `${birth} to ${death}`;
}

function getPersonPlaces(person: Doc<"persons">, events: Doc<"events">[], places: Doc<"places">[]) {
  const placeById = new Map(places.map((place) => [String(place._id), place]));
  const placeMap = new Map<string, Doc<"places">>();

  const addPlaceId = (placeId: Id<"places"> | undefined) => {
    if (!placeId) return;
    const place = placeById.get(String(placeId));
    if (place) placeMap.set(String(place._id), place);
  };

  addPlaceId(person.birth?.place?.placeId);
  addPlaceId(person.death?.place?.placeId);
  for (const event of events) {
    addPlaceId(event.place?.placeId);
  }

  return Array.from(placeMap.values());
}

function getPersonSourceRecords(
  snapshot: VaultSnapshot,
  person: Doc<"persons">,
  events: Doc<"events">[]
) {
  const targetIds = new Set([String(person._id), ...events.map((event) => String(event._id))]);
  const relevantLinks = snapshot.citationLinks.filter((link) => {
    if (link.targetType === "person") return link.targetId === String(person._id);
    if (link.targetType === "event") return targetIds.has(link.targetId);
    return false;
  });

  const citations = relevantLinks
    .map((link) => {
      const citation = snapshot.citations.find((entry) => entry._id === link.citationId);
      if (!citation) return null;
      const source = snapshot.sources.find((entry) => entry._id === citation.sourceId);
      return source
        ? {
            ...citation,
            source,
            field: link.field,
          }
        : null;
    })
    .filter(Boolean) as Array<Doc<"citations"> & { source: Doc<"sources">; field?: string }>;

  const sourceMap = new Map<string, { source: Doc<"sources">; citations: typeof citations }>();
  for (const citation of citations) {
    const key = String(citation.source._id);
    const existing = sourceMap.get(key);
    if (existing) {
      existing.citations.push(citation);
    } else {
      sourceMap.set(key, { source: citation.source, citations: [citation] });
    }
  }

  return {
    citations,
    groupedSources: Array.from(sourceMap.values()),
  };
}

function buildPersonOperations(snapshot: VaultSnapshot, person: Doc<"persons">) {
  const personEvents = snapshot.personEvents
    .filter((link) => link.personId === person._id)
    .map((link) => snapshot.events.find((event) => event._id === link.eventId))
    .filter(Boolean) as Doc<"events">[];
  const personRelationships = snapshot.relationships.filter(
    (relationship) => relationship.person1 === person._id || relationship.person2 === person._id
  );
  const personMedia = snapshot.media.filter((item) => item.personIds.includes(person._id));
  const personContextItems = snapshot.contextItems.filter((item) => item.personIds.includes(person._id));
  const personSourceFacts = snapshot.sourceFacts.filter((item) => item.personId === person._id);
  const personStories = snapshot.stories.filter((story) => story.personId === person._id);
  const personPlaces = getPersonPlaces(person, personEvents, snapshot.places);
  const personDocuments = snapshot.documents.filter(
    (document) => document.personId === (person.fsId || String(person._id))
  );
  const personImportRuns = sortByTimestampDesc(
    snapshot.importRuns.filter((run) => run.personId === person._id || run.personFsId === person.fsId)
  );
  const personChecks = snapshot.researchChecks.filter((check) => check.personId === person._id);
  const personProvisional = snapshot.provisionalRelatives.filter(
    (relative) => relative.anchorPersonId === person._id && relative.mergeState === "provisional"
  );
  const personSources = getPersonSourceRecords(snapshot, person, personEvents).groupedSources.map(
    (entry) => entry.source
  );

  const resolvedChecks = inferResearchChecks({
    person,
    sources: personSources,
    events: personEvents,
    relationships: personRelationships,
    media: personMedia,
    documents: personDocuments,
    stories: personStories,
    places: personPlaces,
    importRuns: personImportRuns,
    provisionalRelatives: personProvisional,
    existingChecks: personChecks,
  });
  const summary = buildOperationSummary(
    resolvedChecks.map((check) => ({
      checkKey: check.checkKey,
      status: check.status,
      applicability: check.applicability,
      lastReviewedAt: check.lastReviewedAt,
      summary: "summary" in check ? check.summary : undefined,
    }))
  );

  return {
    checks: resolvedChecks,
    summary,
    relatedEvents: personEvents,
    relatedRelationships: personRelationships,
    relatedMedia: personMedia,
    relatedContextItems: personContextItems,
    relatedSourceFacts: personSourceFacts,
    relatedStories: personStories,
    relatedPlaces: personPlaces,
    relatedDocuments: personDocuments,
    relatedImportRuns: personImportRuns,
    provisionalRelatives: personProvisional,
    relatedSources: personSources,
  };
}

function overlapsPersonYears(
  entry: Doc<"historicalContext">,
  person: Doc<"persons">
) {
  const birthYear = person.birth?.date?.year;
  const deathYear = person.death?.date?.year;
  if (!birthYear && !deathYear) return true;

  const startYear = birthYear ?? deathYear ?? entry.timePeriod.startYear;
  const endYear = deathYear ?? birthYear ?? entry.timePeriod.endYear;

  return entry.timePeriod.endYear >= startYear && entry.timePeriod.startYear <= endYear;
}

// AI-export gate: only research packs explicitly reviewed, non-private, and
// flagged for AI use may flow into the context-pack export consumed by
// Story Writer and other AI surfaces. This is *not* a visibility gate — the
// human reviewer needs to see the unreviewed and private rows to act on them.
export function isContextPackEligibleHistoricalContext(entry: Doc<"historicalContext">) {
  const privacyLevel = entry.privacyLevel ?? "private";
  const reviewStatus = entry.reviewStatus ?? "unreviewed";

  return (
    entry.aiUseAllowed === true &&
    (reviewStatus === "reviewed" || reviewStatus === "redacted") &&
    privacyLevel !== "private"
  );
}

// Public-publish gate: stricter than AI eligibility. A row may be allowed for
// AI use inside the vault (e.g. family_review) but still must not appear on a
// public story page until it carries an explicit publish-candidate or
// public-source privacy level and a reviewed status.
export function isPublishablePublicHistoricalContext(entry: Doc<"historicalContext">) {
  const privacyLevel = entry.privacyLevel ?? "private";
  const reviewStatus = entry.reviewStatus ?? "unreviewed";

  return (
    (privacyLevel === "publish_candidate" || privacyLevel === "public_source") &&
    (reviewStatus === "reviewed" || reviewStatus === "redacted")
  );
}

function buildContextCoverage(
  snapshot: VaultSnapshot,
  person: Doc<"persons">,
  operations: ReturnType<typeof buildPersonOperations>
) {
  const placeIds = new Set(operations.relatedPlaces.map((place) => String(place._id)));
  // `entries` is the full set of context the human reviewer needs to see for
  // this person. AI-eligibility and public-publish gates are derived below
  // and applied only at their respective boundaries.
  const entries = sortByTimestampDesc(
    snapshot.historicalContext.filter((entry) => {
      if (!overlapsPersonYears(entry, person)) return false;
      return !entry.placeId || placeIds.has(String(entry.placeId));
    })
  );
  const aiEligibleEntries = entries.filter(isContextPackEligibleHistoricalContext);
  const publishableEntries = entries.filter(isPublishablePublicHistoricalContext);
  const placeIdsWithContext = new Set(
    entries
      .filter((entry) => entry.placeId)
      .map((entry) => String(entry.placeId))
  );
  // GEN-72: AI surfaces need a stricter "missing places" — coverage from
  // the AI-eligible subset only, not from any-context-exists. A place with
  // only unreviewed/private context should count as missing from the AI's
  // perspective because that's what the AI actually receives.
  const aiPlaceIdsWithContext = new Set(
    aiEligibleEntries
      .filter((entry) => entry.placeId)
      .map((entry) => String(entry.placeId))
  );
  const missingPlaces = operations.relatedPlaces.filter(
    (place) => !placeIdsWithContext.has(String(place._id))
  );
  const aiMissingPlaces = operations.relatedPlaces.filter(
    (place) => !aiPlaceIdsWithContext.has(String(place._id))
  );
  const topics = Array.from(new Set(entries.map((entry) => entry.topic)));

  return {
    entries,
    count: entries.length,
    aiEligibleEntries,
    aiEligibleCount: aiEligibleEntries.length,
    publishableEntries,
    publishableCount: publishableEntries.length,
    topics,
    relatedPlaceCount: operations.relatedPlaces.length,
    placeCountWithContext: placeIdsWithContext.size,
    aiPlaceCountWithContext: aiPlaceIdsWithContext.size,
    missingPlaces: missingPlaces.map((place) => ({
      _id: place._id,
      name: place.fullName || place.name,
      type: place.type,
    })),
    aiMissingPlaces: aiMissingPlaces.map((place) => ({
      _id: place._id,
      name: place.fullName || place.name,
      type: place.type,
    })),
    status:
      entries.length === 0
        ? "missing"
        : missingPlaces.length > 0
          ? "partial"
          : "covered",
  };
}

function buildPublishWarnings(params: {
  checks: ReturnType<typeof inferResearchChecks>;
  contextCoverage: ReturnType<typeof buildContextCoverage> | null;
  sourceCount: number;
  media?: Doc<"media">[];
  storyStatus?: Doc<"stories">["status"];
}) {
  const requiredKeys = new Set([
    "biography",
    "timeline",
    "relationships",
    "birth_record",
    "death_record",
  ]);
  const recommendedKeys = new Set(["memories", "place_context"]);
  const warnings = [];

  if (params.sourceCount === 0) {
    warnings.push({
      key: "sources",
      label: "No linked source evidence",
      status: "missing",
      detail: "This story has no grouped source evidence attached through the person timeline yet.",
    });
  }

  for (const check of params.checks) {
    const actionable = check.status === "missing" || check.status === "needs_review";
    if (!actionable) continue;
    if (!requiredKeys.has(check.checkKey) && !recommendedKeys.has(check.checkKey)) continue;

    warnings.push({
      key: check.checkKey,
      label: check.checkKey.replace(/_/g, " "),
      status: check.status,
      detail: check.summary || "This readiness check still needs research attention.",
    });
  }

  if (!params.contextCoverage || params.contextCoverage.count === 0) {
    warnings.push({
      key: "historical_context",
      label: "Historical context reports",
      status: "missing",
      detail: "No place, era, church, building, news, or locality context report is linked to this person's known places and years.",
    });
  } else if (params.contextCoverage.missingPlaces.length > 0) {
    warnings.push({
      key: "historical_context",
      label: "Partial place context",
      status: "in_progress",
      detail: `${params.contextCoverage.missingPlaces.length} linked place${params.contextCoverage.missingPlaces.length === 1 ? "" : "s"} still lack context reports.`,
    });
  }

  if (params.storyStatus === "draft") {
    warnings.push({
      key: "story_review",
      label: "Internal review",
      status: "needs_review",
      detail: "This story is still marked as a draft. Move it to review before publishing if possible.",
    });
  }

  const unreviewedMedia = (params.media ?? []).filter((item) => !isPublicStoryMedia(item));
  if (unreviewedMedia.length > 0) {
    warnings.push({
      key: "media_privacy_review",
      label: "Media privacy and rights review",
      status: "needs_review",
      detail: `${unreviewedMedia.length} linked memor${unreviewedMedia.length === 1 ? "y" : "ies"} or media item${unreviewedMedia.length === 1 ? "" : "s"} are private, unreviewed, or rights-restricted and will not appear publicly.`,
    });
  }

  return warnings;
}

// GEN-72: AI gate for media. `isPublicStoryMedia` is intentionally stricter
// (requires `rightsStatus` to be known-non-restricted) because it controls
// what renders on a public story page. The AI gate is comparable in privacy
// posture but does not require rights clearance — the AI is the owner's own
// model. Both require `aiUseAllowed === true`.
export function isContextPackEligibleMedia(item: Doc<"media">) {
  const reviewStatus = item.reviewStatus ?? "unreviewed";
  const privacyLevel = item.privacyLevel ?? "private";
  return (
    item.aiUseAllowed === true &&
    (reviewStatus === "reviewed" || reviewStatus === "redacted") &&
    privacyLevel !== "private"
  );
}

function isPublicStoryMedia(item: Doc<"media">) {
  const reviewStatus = item.reviewStatus ?? "unreviewed";
  const privacyLevel = item.privacyLevel ?? "private";
  const rightsStatus = item.rightsStatus ?? "unknown";

  return (
    reviewStatus === "reviewed" &&
    (privacyLevel === "publish_candidate" || privacyLevel === "public_source") &&
    rightsStatus !== "restricted" &&
    rightsStatus !== "unknown"
  );
}

// GEN-71: contextItems schema requires `aiUseAllowed: v.boolean()` (non-optional).
// The earlier gate ignored it, silently bypassing the user's explicit AI opt-out
// for loose context. Now mirrors the historicalContext AI gate shape.
export function isContextPackEligibleContextItem(item: Doc<"contextItems">) {
  const reviewed = item.reviewStatus === "reviewed" || item.reviewStatus === "redacted";
  const notPrivate = item.privacyLevel !== "private";
  return item.aiUseAllowed === true && reviewed && notPrivate;
}

function getStoryWorkflowStatus(params: {
  operations: ReturnType<typeof buildPersonOperations>;
  contextCoverage: ReturnType<typeof buildContextCoverage>;
}) {
  const publishedStory = params.operations.relatedStories.some((story) => story.status === "published");
  if (publishedStory) return "published" as const;

  const missingCritical = params.operations.summary.criticalMissing.filter(
    (key) => key !== "biography"
  );
  const hasDraftOrReview = params.operations.relatedStories.some(
    (story) => story.status === "draft" || story.status === "review"
  );

  if (missingCritical.length > 0 || params.operations.relatedSources.length === 0) {
    return "needs_genealogy_evidence" as const;
  }
  if (params.contextCoverage.count === 0) {
    return "needs_context_research" as const;
  }
  if (hasDraftOrReview) {
    return "ready_to_review" as const;
  }
  return "ready_to_draft" as const;
}

function buildStoryBundle(
  snapshot: VaultSnapshot,
  story: Doc<"stories">,
  options: { publicView?: boolean } = {}
) {
  const person = story.personId
    ? snapshot.people.find((entry) => entry._id === story.personId) ?? null
    : null;
  const publicSlug = story.publicSlug ?? buildStoryPublicSlug({
    storyId: String(story._id),
    title: story.title,
    personName: person ? formatPersonName(person) : undefined,
  });
  const operations = person ? buildPersonOperations(snapshot, person) : null;
  const sourceRecords = person && operations
    ? getPersonSourceRecords(snapshot, person, operations.relatedEvents)
    : { citations: [], groupedSources: [] };
  const contextCoverage = person && operations
    ? buildContextCoverage(snapshot, person, operations)
    : null;
  const researchChecks = operations?.checks ?? [];

  return {
    story: {
      ...story,
      publicSlug,
      publicIndexing: story.publicIndexing ?? "noindex",
    },
    person: person
      ? {
          ...person,
          displayName: formatPersonName(person),
          routeId: person.fsId || String(person._id),
          lifespan: getPersonLifespan(person),
        }
      : null,
    readiness: operations?.summary ?? null,
    researchChecks,
    contextCoverage,
    publishWarnings: buildPublishWarnings({
      checks: researchChecks,
      contextCoverage,
      sourceCount: sourceRecords.groupedSources.length,
      media: operations?.relatedMedia ?? [],
      storyStatus: story.status,
    }),
    evidence: sourceRecords.groupedSources.slice(0, 8).map((entry) => ({
      source: entry.source,
      citations: entry.citations.slice(0, 3),
    })),
    events: (operations?.relatedEvents ?? [])
      .slice()
      .sort((a, b) => (a.date?.year ?? 0) - (b.date?.year ?? 0))
      .slice(0, 8),
    places: (operations?.relatedPlaces ?? []).slice(0, 8),
    media: sortByTimestampDesc(
      options.publicView
        ? (operations?.relatedMedia ?? []).filter(isPublicStoryMedia)
        : (operations?.relatedMedia ?? [])
    ).slice(0, 6),
    relationships: operations?.relatedRelationships.map((relationship) => {
      if (!person) return null;
      const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
      const relatedPerson = snapshot.people.find((entry) => entry._id === relatedId);
      return relatedPerson
        ? {
            ...relationship,
            relatedPerson,
            relatedName: formatPersonName(relatedPerson),
          }
        : null;
    }).filter(Boolean) ?? [],
    provisionalRelatives: sortByTimestampDesc(operations?.provisionalRelatives ?? []),
    reviewHistory: sortByTimestampDesc(
      snapshot.storyReviewEvents.filter((entry) => entry.storyId === story._id)
    ).slice(0, 12),
    // Story review (internal) sees every entry that overlaps this person so
    // the reviewer can act on unreviewed/private rows. Public story pages get
    // a stricter publish gate so family_review or unreviewed packs never leak
    // to readers.
    historicalContext: options.publicView
      ? contextCoverage?.publishableEntries.slice(0, 8) ?? []
      : contextCoverage?.entries.slice(0, 8) ?? [],
    relatedStories: person
      ? sortByTimestampDesc(
          snapshot.stories.filter(
            (entry) => entry.personId === person._id && entry._id !== story._id
          )
        ).slice(0, 6)
      : [],
  };
}

// Public story DTO — explicit allowlist of fields safe to return to an
// unauthenticated client over the public Convex query surface
// (`getPublishedStory`, `getPublishedStoryByIdentifier`).
//
// Do NOT add `contextCoverage`, `readiness`, `researchChecks`,
// `publishWarnings`, `provisionalRelatives`, `reviewHistory`, full source
// citation bodies, or full `relatedPerson` Docs to this shape. Those are
// reviewer-facing internal data. If a future public surface needs more,
// add a narrowly-scoped field here with a comment explaining why it's safe.
export function buildPublicStoryBundle(
  snapshot: VaultSnapshot,
  story: Doc<"stories">
) {
  const person = story.personId
    ? snapshot.people.find((entry) => entry._id === story.personId) ?? null
    : null;
  const publicSlug = story.publicSlug ?? buildStoryPublicSlug({
    storyId: String(story._id),
    title: story.title,
    personName: person ? formatPersonName(person) : undefined,
  });
  const operations = person ? buildPersonOperations(snapshot, person) : null;
  const sourceRecords = person && operations
    ? getPersonSourceRecords(snapshot, person, operations.relatedEvents)
    : { citations: [], groupedSources: [] };
  const contextCoverage = person && operations
    ? buildContextCoverage(snapshot, person, operations)
    : null;

  return {
    // Story — title, content, status, slug, indexing only. NOT internal
    // workflow fields like `publishWarnings`, `lastReviewerNote`, etc.
    story: {
      _id: story._id,
      title: story.title,
      content: story.content,
      status: story.status,
      publicSlug,
      publicIndexing: story.publicIndexing ?? "noindex" as const,
    },
    // Person — display projection only. NOT `living`, `birth`/`death` notes,
    // tags, or research notes.
    person: person
      ? {
          _id: person._id,
          displayName: formatPersonName(person),
          routeId: person.fsId || String(person._id),
          lifespan: getPersonLifespan(person),
        }
      : null,
    // Evidence — source title + citation count only. NOT raw citation text,
    // confidence scores, page numbers, or repository links.
    evidence: sourceRecords.groupedSources.slice(0, 8).map((entry) => ({
      source: {
        _id: entry.source._id,
        title: entry.source.title,
      },
      citations: entry.citations.slice(0, 3).map((citation) => ({
        _id: citation._id,
      })),
    })),
    // Events — type + date only, capped at 8. NOT notes, citationIds,
    // or full place objects.
    events: (operations?.relatedEvents ?? [])
      .slice()
      .sort((a, b) => (a.date?.year ?? 0) - (b.date?.year ?? 0))
      .slice(0, 8)
      .map((event) => ({
        _id: event._id,
        type: event.type,
        date: event.date
          ? {
              original: event.date.original,
              year: event.date.year,
            }
          : undefined,
        endDate: event.endDate
          ? {
              original: event.endDate.original,
              year: event.endDate.year,
            }
          : undefined,
      })),
    // Places — display fields only. NOT temporal descriptions, parent IDs,
    // FamilySearch IDs, or notes.
    places: (operations?.relatedPlaces ?? []).slice(0, 8).map((place) => ({
      _id: place._id,
      fullName: place.fullName,
      name: place.name,
      type: place.type,
    })),
    // Media — public-gated subset, title only. NOT URLs, descriptions,
    // FamilySearch URLs, attribution metadata, or privacy fields.
    media: sortByTimestampDesc(
      (operations?.relatedMedia ?? []).filter(isPublicStoryMedia)
    ).slice(0, 6).map((item) => ({
      _id: item._id,
      title: item.title,
    })),
    // Relationships — `relatedName` only, no full `relatedPerson` Doc.
    // The public page only needs the display string.
    relationships: (operations?.relatedRelationships ?? []).map((relationship) => {
      if (!person) return null;
      const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
      const relatedPerson = snapshot.people.find((entry) => entry._id === relatedId);
      return relatedPerson
        ? {
            _id: relationship._id,
            type: relationship.type,
            relatedName: formatPersonName(relatedPerson),
          }
        : null;
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    // Historical context — strict public gate (publishableEntries), display
    // fields only. NOT review/privacy/AI flags, full categoryBlocks, or
    // sources arrays.
    historicalContext: (contextCoverage?.publishableEntries ?? []).slice(0, 8).map((entry) => ({
      _id: entry._id,
      title: entry.title,
      topic: entry.topic,
      timePeriod: entry.timePeriod,
      content: entry.content,
    })),
  };
}

function buildPeopleRows(snapshot: VaultSnapshot) {
  return snapshot.people.map((person) => {
    const operations = buildPersonOperations(snapshot, person);
    const contextCoverage = buildContextCoverage(snapshot, person, operations);
    const storyWorkflow = getStoryWorkflowStatus({ operations, contextCoverage });
    const latestImport = operations.relatedImportRuns[0] ?? null;
    const hasStory = operations.relatedStories.length > 0;
    const keyPlaces = operations.relatedPlaces.slice(0, 2).map((place) => place.fullName || place.name);

    return {
      ...person,
      displayName: formatPersonName(person),
      routeId: person.fsId || String(person._id),
      stats: {
        sources: operations.relatedSources.length,
        memories: operations.relatedMedia.length,
        documents: operations.relatedDocuments.length,
        stories: operations.relatedStories.length,
        tasks: snapshot.researchTasks.filter(
          (task) => task.personId === person._id && task.status !== "done"
        ).length,
        imports: operations.relatedImportRuns.length,
        provisionalRelatives: operations.provisionalRelatives.length,
        contextReports: contextCoverage.count,
      },
      operations: {
        completionPercent: operations.summary.completionPercent,
        requiredMissingCount: operations.summary.requiredMissingCount,
        recommendedMissingCount: operations.summary.recommendedMissingCount,
        staleChecksCount: operations.summary.staleChecksCount,
        criticalMissing: operations.summary.criticalMissing,
        nextActions: operations.summary.nextActions,
      },
      latestImport,
      keyPlaces,
      hasStory,
      contextCoverage,
      storyWorkflow,
      storyReadinessScore:
        (operations.summary.requiredMissingCount === 0 ? 100 : operations.summary.completionPercent) +
        (hasStory ? 20 : 0) +
        (contextCoverage.count > 0 ? 10 : 0),
      lastTouched:
        latestImport?.importedAt ??
        person.updatedAt ??
        person.createdAt,
      researchChecks: operations.checks,
    };
  });
}

async function assemblePersonWorkspace(
  ctx: QueryCtx,
  vaultOwnerId: string,
  personIdentifier: string
) {
  const snapshot = await getVaultSnapshot(ctx, vaultOwnerId);
  const person = getPersonByIdentifier(snapshot, personIdentifier);
  if (!person) return null;

  const operations = buildPersonOperations(snapshot, person);
  const contextCoverage = buildContextCoverage(snapshot, person, operations);
  const sourceRecords = getPersonSourceRecords(snapshot, person, operations.relatedEvents);
  const relatedPeople = new Map<string, Doc<"persons">>();

  for (const relationship of operations.relatedRelationships) {
    const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
    const related = snapshot.people.find((entry) => entry._id === relatedId);
    if (related) relatedPeople.set(String(related._id), related);
  }

  return {
    person: {
      ...person,
      displayName: formatPersonName(person),
      routeId: person.fsId || String(person._id),
    },
    documents: sortByTimestampDesc(operations.relatedDocuments),
    stories: sortByTimestampDesc(operations.relatedStories),
    researchTasks: sortByTimestampDesc(
      snapshot.researchTasks.filter((task) => task.personId === person._id)
    ),
    researchLog: sortByTimestampDesc(
      snapshot.researchLog.filter(
        (entry) => entry.entityType === "person" && String(entry.entityId) === String(person._id)
      )
    ),
    importRuns: operations.relatedImportRuns,
    sources: sourceRecords.groupedSources,
    sourceFacts: sortByTimestampDesc(operations.relatedSourceFacts),
    citations: sourceRecords.citations,
    events: operations.relatedEvents,
    timeline: [...operations.relatedEvents].sort(
      (a, b) => (a.date?.year ?? 0) - (b.date?.year ?? 0)
    ),
    relationships: operations.relatedRelationships.map((relationship) => {
      const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
      const relatedPerson = snapshot.people.find((entry) => entry._id === relatedId);
      return relatedPerson
        ? {
            ...relationship,
            relatedPerson,
            relatedName: formatPersonName(relatedPerson),
          }
        : null;
    }).filter(Boolean),
    media: sortByTimestampDesc(operations.relatedMedia),
    contextItems: sortByTimestampDesc(operations.relatedContextItems),
    places: operations.relatedPlaces,
    contextCoverage,
    provisionalRelatives: sortByTimestampDesc(operations.provisionalRelatives),
    researchChecks: operations.checks,
    operations: operations.summary,
    stats: {
      sources: operations.relatedSources.length,
      citations: sourceRecords.citations.length,
      events: operations.relatedEvents.length,
      memories: operations.relatedMedia.length,
      stories: operations.relatedStories.length,
      documents: operations.relatedDocuments.length,
      places: operations.relatedPlaces.length,
      imports: operations.relatedImportRuns.length,
      provisionalRelatives: operations.provisionalRelatives.length,
      contextReports: contextCoverage.count,
    },
    relatedPeople: Array.from(relatedPeople.values()),
  };
}

export const getPeopleExplorer = query({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
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
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const search = args.search?.trim().toLowerCase();

    const rows = buildPeopleRows(snapshot).filter((person) => {
      if (args.researchStatus && person.researchStatus !== args.researchStatus) return false;
      if (!search) return true;
      return [
        person.displayName,
        person.fsId || "",
        String(person._id),
        person.birth?.date?.original || "",
        person.death?.date?.original || "",
        ...person.keyPlaces,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const sorted = rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return args.limit ? sorted.slice(0, args.limit) : sorted;
  },
});

export const getPersonWorkspace = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    return assemblePersonWorkspace(ctx, normalizeVaultOwnerId(args.vaultOwnerId), args.personIdentifier);
  },
});

export const getStoriesIndex = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    return sortByTimestampDesc(snapshot.stories).map((story) => {
      const person = story.personId
        ? snapshot.people.find((entry) => entry._id === story.personId) ?? null
        : null;
      const publicSlug = story.publicSlug ?? buildStoryPublicSlug({
        storyId: String(story._id),
        title: story.title,
        personName: person ? formatPersonName(person) : undefined,
      });
      const operations = person ? buildPersonOperations(snapshot, person) : null;
      const contextCoverage = person && operations ? buildContextCoverage(snapshot, person, operations) : null;
      const sourceCount = operations?.relatedSources.length ?? 0;

      return {
        ...story,
        publicSlug,
        publicIndexing: story.publicIndexing ?? "noindex",
        person: person
          ? {
              ...person,
              displayName: formatPersonName(person),
              routeId: person.fsId || String(person._id),
              lifespan: getPersonLifespan(person),
            }
          : null,
        readiness: operations?.summary ?? null,
        storyWorkflow: operations && contextCoverage
          ? getStoryWorkflowStatus({ operations, contextCoverage })
          : "needs_genealogy_evidence",
        publishWarnings: buildPublishWarnings({
          checks: operations?.checks ?? [],
          contextCoverage,
          sourceCount,
          media: operations?.relatedMedia ?? [],
          storyStatus: story.status,
        }),
        evidenceCount: sourceCount,
        placeCount: operations?.relatedPlaces.length ?? 0,
        memoryCount: operations?.relatedMedia.length ?? 0,
        contextReportCount: contextCoverage?.count ?? 0,
      };
    });
  },
});

export const getStoryReview = query({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const story = snapshot.stories.find((entry) => entry._id === args.storyId);
    return story ? buildStoryBundle(snapshot, story) : null;
  },
});

export const getPublishedStory = query({
  args: {
    storyId: v.id("stories"),
  },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);
    if (!story || story.status !== "published") return null;

    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(story.vaultOwnerId));
    const ownedStory = snapshot.stories.find((entry) => entry._id === story._id);
    // GEN-77: use buildPublicStoryBundle (explicit field allowlist) instead
    // of the older internal bundle, which only gated 2 of 12 fields and
    // returned reviewer-only data on the public query response.
    return ownedStory ? buildPublicStoryBundle(snapshot, ownedStory) : null;
  },
});

export const getPublishedStoryByIdentifier = query({
  args: {
    storyIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const identifier = args.storyIdentifier.trim();
    if (!identifier) return null;

    const slugMatch = await ctx.db
      .query("stories")
      .withIndex("by_public_slug", (q) => q.eq("publicSlug", identifier))
      .first();
    const normalizedStoryId = ctx.db.normalizeId("stories", identifier);
    const idMatch = normalizedStoryId ? await ctx.db.get(normalizedStoryId) : null;
    const candidate = slugMatch ?? idMatch;
    if (!candidate || candidate.status !== "published") return null;

    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(candidate.vaultOwnerId));
    const ownedStory = snapshot.stories.find((entry) => entry._id === candidate._id);
    if (!ownedStory) return null;

    // GEN-77: public DTO with explicit field allowlist.
    const bundle = buildPublicStoryBundle(snapshot, ownedStory);
    if (
      identifier !== String(ownedStory._id) &&
      identifier !== bundle.story.publicSlug
    ) {
      return null;
    }

    return bundle;
  },
});

export const getPersonResearchChecks = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await assemblePersonWorkspace(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.personIdentifier
    );
    return workspace?.researchChecks ?? [];
  },
});

export const getProvisionalRelatives = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    if (!args.personIdentifier) {
      return sortByTimestampDesc(snapshot.provisionalRelatives);
    }

    const person = getPersonByIdentifier(snapshot, args.personIdentifier);
    if (!person) return [];
    return sortByTimestampDesc(
      snapshot.provisionalRelatives.filter((relative) => relative.anchorPersonId === person._id)
    );
  },
});

export const getOperationsQueue = query({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    rowType: v.optional(v.union(v.literal("person"), v.literal("provisional"))),
    missingCheck: v.optional(v.string()),
    storyStatus: v.optional(v.union(v.literal("has_story"), v.literal("no_story"))),
    storyWorkflow: v.optional(storyWorkflowValidator),
    staleOnly: v.optional(v.boolean()),
    sortBy: v.optional(
      v.union(
        v.literal("missingCritical"),
        v.literal("completion"),
        v.literal("lastTouched"),
        v.literal("sourceCount"),
        v.literal("storyReadiness"),
        v.literal("newestImport")
      )
    ),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const peopleRows = buildPeopleRows(snapshot).map((row) => ({
      rowType: "person" as const,
      id: row.routeId,
      personIdentifier: row.routeId,
      displayName: row.displayName,
      relationshipHint: undefined,
      lifespan: `${row.birth?.date?.year || "?"} to ${row.death?.date?.year || "?"}`,
      keyPlaces: row.keyPlaces,
      completionPercent: row.operations.completionPercent,
      sourceCount: row.stats.sources,
      memoryCount: row.stats.memories,
      documentCount: row.stats.documents,
      storyCount: row.stats.stories,
      openTaskCount: row.stats.tasks,
      contextReportCount: row.stats.contextReports,
      storyWorkflow: row.storyWorkflow,
      latestImportAt: row.latestImport?.importedAt ?? null,
      lastTouched: row.lastTouched,
      missingCritical: row.operations.criticalMissing,
      nextActions: row.operations.nextActions,
      staleChecksCount: row.operations.staleChecksCount,
      researchChecks: row.researchChecks,
      storyReadinessScore:
        (row.operations.requiredMissingCount === 0 ? 100 : row.operations.completionPercent) +
        (row.hasStory ? 20 : 0),
      anchorPersonIdentifier: row.routeId,
      badge: row.researchStatus,
    }));

    const provisionalRows = snapshot.provisionalRelatives
      .filter((relative) => relative.mergeState === "provisional")
      .map((relative) => {
        const anchor = snapshot.people.find((person) => person._id === relative.anchorPersonId);
        const sourceStoryCount = anchor
          ? snapshot.stories.filter((story) => story.personId === anchor._id).length
          : 0;
        return {
          rowType: "provisional" as const,
          id: String(relative._id),
          personIdentifier: null,
          displayName: relative.displayName,
          relationshipHint: relative.relationshipHint,
          lifespan:
            relative.possibleBirthYear || relative.possibleDeathYear
              ? `${relative.possibleBirthYear || "?"} to ${relative.possibleDeathYear || "?"}`
              : "Undated",
          keyPlaces: relative.possiblePlaces || [],
          completionPercent: 0,
          sourceCount: relative.evidenceCount,
          memoryCount: 0,
          documentCount: 0,
          storyCount: sourceStoryCount,
          openTaskCount: 0,
          contextReportCount: 0,
          storyWorkflow: "needs_genealogy_evidence" as const,
          latestImportAt: null,
          lastTouched: relative.updatedAt,
          missingCritical: ["identity_review", "relationships"],
          nextActions: [
            `Review ${relative.displayName} and decide whether to promote or merge.`,
          ],
          staleChecksCount: 0,
          researchChecks: [],
          storyReadinessScore: 0,
          anchorPersonIdentifier: anchor?.fsId || String(relative.anchorPersonId),
          badge: relative.relationshipHint || "provisional",
        };
      });

    let rows = [...peopleRows, ...provisionalRows];
    const search = args.search?.trim().toLowerCase();

    rows = rows.filter((row) => {
      if (args.rowType && row.rowType !== args.rowType) return false;
      if (args.storyStatus === "has_story" && row.storyCount === 0) return false;
      if (args.storyStatus === "no_story" && row.storyCount > 0) return false;
      if (args.storyWorkflow && row.storyWorkflow !== args.storyWorkflow) return false;
      if (args.staleOnly && row.staleChecksCount === 0) return false;
      if (args.missingCheck && !row.missingCritical.includes(args.missingCheck)) return false;
      if (!search) return true;
      return [row.displayName, row.relationshipHint || "", ...row.keyPlaces, row.lifespan]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const direction = args.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let primary = 0;
      switch (args.sortBy) {
        case "completion":
          primary = direction * (a.completionPercent - b.completionPercent);
          break;
        case "sourceCount":
          primary = direction * (a.sourceCount - b.sourceCount);
          break;
        case "storyReadiness":
          primary = direction * (a.storyReadinessScore - b.storyReadinessScore);
          break;
        case "newestImport":
          primary = direction * ((a.latestImportAt ?? 0) - (b.latestImportAt ?? 0));
          break;
        case "lastTouched":
          primary = direction * ((a.lastTouched ?? 0) - (b.lastTouched ?? 0));
          break;
        case "missingCritical":
        default:
          primary = direction * (a.missingCritical.length - b.missingCritical.length);
      }

      if (primary !== 0) return primary;
      return `${a.rowType}:${a.displayName}:${a.id}`.localeCompare(`${b.rowType}:${b.displayName}:${b.id}`);
    });

    const visibleRows = args.limit ? rows.slice(0, args.limit) : rows;
    const personRows = visibleRows.filter((row) => row.rowType === "person");
    const averageCompletion =
      personRows.length === 0
        ? 0
        : Math.round(
            personRows.reduce((total, row) => total + row.completionPercent, 0) / personRows.length
          );

    return {
      summary: {
        visibleRows: visibleRows.length,
        provisionalRows: visibleRows.filter((row) => row.rowType === "provisional").length,
        missingRequired: visibleRows.reduce((total, row) => total + row.missingCritical.length, 0),
        missingRecommended: personRows.reduce(
          (total, row) =>
            total +
            row.researchChecks.filter(
              (check) =>
                check.applicability === "recommended" &&
                (check.status === "missing" || check.status === "needs_review")
            ).length,
          0
        ),
        staleChecks: visibleRows.reduce((total, row) => total + row.staleChecksCount, 0),
        averageCompletion,
      },
      rows: visibleRows,
    };
  },
});

export const getOperationsSummary = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const rows = buildPeopleRows(snapshot);
    return {
      people: rows.length,
      provisional: snapshot.provisionalRelatives.filter((relative) => relative.mergeState === "provisional").length,
      avgCompletion:
        rows.length === 0
          ? 0
          : Math.round(rows.reduce((total, row) => total + row.operations.completionPercent, 0) / rows.length),
      missingRequired: rows.reduce((total, row) => total + row.operations.requiredMissingCount, 0),
      staleChecks: rows.reduce((total, row) => total + row.operations.staleChecksCount, 0),
    };
  },
});

export const getVaultAudit = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const peopleRows = buildPeopleRows(snapshot);
    const storyWorkflowCounts = peopleRows.reduce<Record<string, number>>((totals, row) => {
      totals[row.storyWorkflow] = (totals[row.storyWorkflow] || 0) + 1;
      return totals;
    }, {});
    const peopleWithoutContext = peopleRows.filter((row) => row.contextCoverage.count === 0);
    const peopleWithoutSources = peopleRows.filter((row) => row.stats.sources === 0);
    const peopleWithoutStories = peopleRows.filter((row) => row.stats.stories === 0);

    return {
      counts: {
        people: snapshot.people.length,
        relationships: snapshot.relationships.length,
        events: snapshot.events.length,
        places: snapshot.places.length,
        sources: snapshot.sources.length,
        citations: snapshot.citations.length,
        media: snapshot.media.length,
        documents: snapshot.documents.length,
        historicalContext: snapshot.historicalContext.length,
        researchChecks: snapshot.researchChecks.length,
        researchTasks: snapshot.researchTasks.length,
        researchLog: snapshot.researchLog.length,
        stories: snapshot.stories.length,
        publishedStories: snapshot.stories.filter((story) => story.status === "published").length,
      },
      storyWorkflowCounts,
      gaps: {
        peopleWithoutSources: peopleWithoutSources.length,
        peopleWithoutContext: peopleWithoutContext.length,
        peopleWithoutStories: peopleWithoutStories.length,
        openResearchTasks: snapshot.researchTasks.filter((task) => task.status !== "done").length,
        placesWithoutContext: snapshot.places.filter(
          (place) => !snapshot.historicalContext.some((entry) => entry.placeId === place._id)
        ).length,
      },
      priorityPeople: peopleRows
        .filter((row) => row.storyWorkflow !== "published")
        .sort((a, b) => b.storyReadinessScore - a.storyReadinessScore)
        .slice(0, 8)
        .map((row) => ({
          _id: row._id,
          displayName: row.displayName,
          routeId: row.routeId,
          storyWorkflow: row.storyWorkflow,
          completionPercent: row.operations.completionPercent,
          sourceCount: row.stats.sources,
          contextReportCount: row.stats.contextReports,
          storyCount: row.stats.stories,
          nextActions: row.operations.nextActions,
        })),
      recentContext: sortByTimestampDesc(snapshot.historicalContext).slice(0, 8),
    };
  },
});

export const getContextCoverage = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const person = getPersonByIdentifier(snapshot, args.personIdentifier);
    if (!person) return null;
    const operations = buildPersonOperations(snapshot, person);
    return buildContextCoverage(snapshot, person, operations);
  },
});

export const getStoryReadinessCandidates = query({
  args: {
    vaultOwnerId: v.string(),
    storyWorkflow: v.optional(storyWorkflowValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const rows = buildPeopleRows(snapshot)
      .filter((row) => !args.storyWorkflow || row.storyWorkflow === args.storyWorkflow)
      .sort((a, b) => b.storyReadinessScore - a.storyReadinessScore)
      .map((row) => ({
        _id: row._id,
        displayName: row.displayName,
        routeId: row.routeId,
        lifespan: getPersonLifespan(row),
        storyWorkflow: row.storyWorkflow,
        completionPercent: row.operations.completionPercent,
        sourceCount: row.stats.sources,
        contextReportCount: row.stats.contextReports,
        storyCount: row.stats.stories,
        nextActions: row.operations.nextActions,
      }));

    return args.limit ? rows.slice(0, args.limit) : rows;
  },
});

export const getPlacesExplorer = query({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const search = args.search?.trim().toLowerCase();
    const rows = snapshot.places.filter((place) => {
      if (!search) return true;
      return `${place.name} ${place.fullName}`.toLowerCase().includes(search);
    }).map((place) => ({
      ...place,
      stats: {
        events: snapshot.events.filter((event) => event.place?.placeId === place._id).length,
        citations: snapshot.citationLinks.filter(
          (link) => link.targetType === "place" && link.targetId === String(place._id)
        ).length,
        media: snapshot.media.filter(
          (item) => item.description?.includes(place.name) || item.title.includes(place.name)
        ).length,
      },
    }));

    return args.limit ? rows.slice(0, args.limit) : rows;
  },
});

export const getPlaceWorkspace = query({
  args: {
    vaultOwnerId: v.string(),
    placeId: v.id("places"),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const place = snapshot.places.find((entry) => entry._id === args.placeId);
    if (!place) return null;

    const events = snapshot.events.filter((event) => event.place?.placeId === args.placeId);
    const linkedPersonIds = new Set<Id<"persons">>();
    for (const event of events) {
      for (const link of snapshot.personEvents.filter((entry) => entry.eventId === event._id)) {
        linkedPersonIds.add(link.personId);
      }
    }
    for (const person of snapshot.people) {
      if (person.birth?.place?.placeId === args.placeId || person.death?.place?.placeId === args.placeId) {
        linkedPersonIds.add(person._id);
      }
    }

    const people = snapshot.people
      .filter((person) => linkedPersonIds.has(person._id))
      .map((person) => ({
        ...person,
        routeId: person.fsId || String(person._id),
      }));
    const citations = snapshot.citationLinks.filter(
      (link) => link.targetType === "place" && link.targetId === String(args.placeId)
    );
    const sources = citations
      .map((link) => snapshot.citations.find((citation) => citation._id === link.citationId))
      .filter(Boolean)
      .map((citation) => snapshot.sources.find((source) => source._id === citation!.sourceId))
      .filter(Boolean);

    return {
      place,
      events,
      people,
      sources,
      citations,
      contextEntries: sortByTimestampDesc(
        snapshot.historicalContext.filter((entry) => entry.placeId === args.placeId)
      ),
      media: snapshot.media.filter(
        (item) => item.description?.includes(place.name) || item.title.includes(place.name)
      ),
      researchLog: sortByTimestampDesc(
        snapshot.researchLog.filter(
          (entry) => entry.entityType === "place" && String(entry.entityId) === String(args.placeId)
        )
      ),
      openTasks: sortByTimestampDesc(
        snapshot.researchTasks.filter(
          (task) => task.status !== "done" && (task.description || "").toLowerCase().includes(place.name.toLowerCase())
        )
      ),
    };
  },
});

export const getDashboardSummary = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const peopleRows = buildPeopleRows(snapshot);
    const personById = new Map(snapshot.people.map((person) => [String(person._id), person]));

    return {
      counts: {
        people: snapshot.people.length,
        places: snapshot.places.length,
        stories: snapshot.stories.length,
        documents: snapshot.documents.length,
        imports: snapshot.importRuns.length,
        openTasks: snapshot.researchTasks.filter((task) => task.status !== "done").length,
        provisionalRelatives: snapshot.provisionalRelatives.filter(
          (relative) => relative.mergeState === "provisional"
        ).length,
      },
      recentPeople: peopleRows
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 6),
      recentImports: sortByTimestampDesc(snapshot.importRuns)
        .slice(0, 6)
        .map((run) => {
          const linkedPerson = run.personId ? personById.get(String(run.personId)) ?? null : null;
          return {
            ...run,
            personRouteId: linkedPerson?.fsId || (run.personId ? String(run.personId) : run.personFsId),
          };
        }),
      operationsHighlights: peopleRows
        .sort((a, b) => b.operations.requiredMissingCount - a.operations.requiredMissingCount)
        .slice(0, 5),
    };
  },
});

export const getResearchOverview = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const personById = new Map(snapshot.people.map((person) => [String(person._id), person]));

    return {
      tasks: sortByTimestampDesc(snapshot.researchTasks).map((task) => ({
        ...task,
        person: task.personId ? personById.get(String(task.personId)) ?? null : null,
      })),
      logEntries: sortByTimestampDesc(snapshot.researchLog).map((entry) => ({
        ...entry,
        person:
          entry.entityType === "person" && entry.entityId !== undefined
            ? personById.get(String(entry.entityId)) ?? null
            : null,
      })),
    };
  },
});

function truncateText(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3)}...`;
}

export const getContextPack = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await assemblePersonWorkspace(ctx, normalizeVaultOwnerId(args.vaultOwnerId), args.personIdentifier);
    if (!workspace) return null;

    const evidenceTrace = workspace.sources.map((entry) => ({
      sourceId: entry.source._id,
      title: entry.source.title,
      type: entry.source.type,
      repository: entry.source.repository,
      url: entry.source.url,
      citationCount: entry.citations.length,
      supportedClaims: entry.citations.slice(0, 8).map((citation) => ({
        citationId: citation._id,
        field: citation.field || "general",
        confidence: citation.confidence,
        isEvidence: citation.isEvidence,
        page: citation.page,
        text: truncateText(citation.editedText || citation.extractedText || citation.notes, 240),
      })),
    }));
    const storyClaimReadiness = {
      evidenceSources: workspace.sources.length,
      citedClaims: workspace.citations.length,
      openRequiredChecks: workspace.researchChecks
        .filter(
          (check) =>
            check.applicability === "required" &&
            (check.status === "missing" || check.status === "needs_review")
        )
        .map((check) => ({
          checkKey: check.checkKey,
          status: check.status,
          summary: check.summary,
          completionSource: check.completionSource,
          lastReviewedAt: check.lastReviewedAt,
        })),
      staleChecks: workspace.researchChecks
        .filter(
          (check) =>
            check.lastReviewedAt &&
            check.lastReviewedAt < Date.now() - 1000 * 60 * 60 * 24 * 45 &&
            check.status !== "missing" &&
            check.status !== "needs_review"
        )
        .map((check) => ({
          checkKey: check.checkKey,
          status: check.status,
          lastReviewedAt: check.lastReviewedAt,
        })),
      unresolvedProvisionalRelatives: workspace.provisionalRelatives.length,
      unresolvedImportWarnings: workspace.importRuns.flatMap((run) => run.warnings).slice(0, 12),
      // GEN-72: use AI-aware missing-places signal in the AI export so the
      // AI sees "place X has no usable context" when X only has unreviewed
      // rows. Human surfaces still use `missingPlaces` (unfiltered).
      missingContextPlaces: workspace.contextCoverage.aiMissingPlaces,
      mediaNeedingPrivacyReview: workspace.media
        .filter((item) => !isPublicStoryMedia(item) || item.aiUseAllowed !== true)
        .slice(0, 12)
        .map((item) => ({
          mediaId: item._id,
          title: item.title,
          privacyLevel: item.privacyLevel ?? "private",
          reviewStatus: item.reviewStatus ?? "unreviewed",
          rightsStatus: item.rightsStatus ?? "unknown",
          aiUseAllowed: item.aiUseAllowed === true,
        })),
    };
    const structured = {
      person: workspace.person,
      stats: workspace.stats,
      operations: workspace.operations,
      researchChecks: workspace.researchChecks,
      timeline: workspace.timeline,
      relationships: workspace.relationships,
      places: workspace.places,
      provisionalRelatives: workspace.provisionalRelatives,
      sources: workspace.sources,
      // GEN-72: filter media by AI eligibility (reviewed/redacted +
      // non-private + aiUseAllowed=true). Items the user opted out of AI
      // use must not ship to the AI context-pack export.
      memories: workspace.media.filter(isContextPackEligibleMedia),
      sourceFacts: workspace.sourceFacts,
      reviewedContextItems: workspace.contextItems.filter(isContextPackEligibleContextItem),
      documents: workspace.documents,
      // AI surface: only ship reviewed, non-private, AI-allowed packs to the
      // structured context bundle. Unreviewed/private rows stay visible on
      // human-facing surfaces (person workspace, audit) via `entries`.
      historicalContext: workspace.contextCoverage.aiEligibleEntries,
      stories: workspace.stories,
      evidenceTrace,
      storyClaimReadiness,
      openResearchTasks: workspace.researchTasks.filter((task) => task.status !== "done"),
      unresolvedConflicts: storyClaimReadiness.unresolvedImportWarnings,
      recentImports: workspace.importRuns.slice(0, 5),
    };

    const markdown = [
      `# Context Pack: ${workspace.person.displayName}`,
      "",
      `- FamilySearch ID: ${workspace.person.fsId || "Unknown"}`,
      `- Research status: ${workspace.person.researchStatus}`,
      `- Completion: ${workspace.operations.completionPercent}%`,
      `- Missing critical checks: ${workspace.operations.criticalMissing.join(", ") || "None"}`,
      "",
      "## Person Summary",
      "",
      `- Name: ${workspace.person.displayName}`,
      `- Birth: ${workspace.person.birth?.date?.original || "Unknown"}${workspace.person.birth?.place?.original ? ` in ${workspace.person.birth.place.original}` : ""}`,
      `- Death: ${workspace.person.death?.date?.original || "Unknown"}${workspace.person.death?.place?.original ? ` in ${workspace.person.death.place.original}` : ""}`,
      "",
      "## Operations",
      "",
      ...workspace.researchChecks.map(
        (check) =>
          `- ${check.checkKey}: ${check.status} (${check.applicability}, source: ${check.completionSource}, reviewed: ${check.lastReviewedAt ? new Date(check.lastReviewedAt).toISOString() : "not recorded"})${check.summary ? ` - ${check.summary}` : ""}`
      ),
      "",
      "## Story Claim Readiness",
      "",
      `- Evidence sources: ${storyClaimReadiness.evidenceSources}`,
      `- Cited claims: ${storyClaimReadiness.citedClaims}`,
      `- Open required checks: ${storyClaimReadiness.openRequiredChecks.map((check) => check.checkKey).join(", ") || "None"}`,
      `- Stale checks: ${storyClaimReadiness.staleChecks.map((check) => check.checkKey).join(", ") || "None"}`,
      `- Provisional relatives needing review: ${storyClaimReadiness.unresolvedProvisionalRelatives}`,
      `- Missing context places: ${storyClaimReadiness.missingContextPlaces.map((place) => place.name).join("; ") || "None"}`,
      `- Media/privacy review needed: ${storyClaimReadiness.mediaNeedingPrivacyReview.map((item) => item.title).join("; ") || "None"}`,
      "",
      "## Timeline",
      "",
      ...workspace.timeline.map(
        (event) =>
          `- ${event.date?.original || "Undated"}: ${event.type}${event.place?.original ? ` in ${event.place.original}` : ""}`
      ),
      "",
      "## Relationships",
      "",
      ...workspace.relationships.map((relationship) => `- ${relationship!.type}: ${relationship!.relatedName}`),
      "",
      "## Provisional Relatives",
      "",
      ...(workspace.provisionalRelatives.length > 0
        ? workspace.provisionalRelatives.map(
            (relative) => `- ${relative.displayName}${relative.relationshipHint ? ` (${relative.relationshipHint})` : ""}`
          )
        : ["- No provisional relatives currently waiting for review."]),
      "",
      "## Places",
      "",
      ...workspace.places.map((place) => `- ${place.fullName || place.name || "Unknown place"}`),
      "",
      "## Historical and Local Context",
      "",
      ...(workspace.contextCoverage.aiEligibleEntries.length > 0
        ? workspace.contextCoverage.aiEligibleEntries.flatMap((entry) => [
            `- ${entry.title} (${entry.topic.replace(/_/g, " ")}, ${entry.timePeriod.startYear}-${entry.timePeriod.endYear})`,
            `  - Review/privacy: ${entry.reviewStatus ?? "unreviewed"} / ${entry.privacyLevel ?? "private"}; AI use: ${entry.aiUseAllowed === true ? "allowed" : "blocked"}`,
            entry.packType
              ? `  - Research pack: ${entry.packType}${entry.templateVersion ? ` (${entry.templateVersion})` : ""}`
              : `  - Research pack: untyped historical context`,
            ...(entry.categoryBlocks ?? []).flatMap((block) => [
              `  - ${block.category.replace(/_/g, " ")}: ${block.summary}`,
              ...block.sourcedClaims.map(
                (claim) =>
                  `    - ${claim.confidence}: ${claim.text}${claim.sourceRefs.length > 0 ? ` [${claim.sourceRefs.join("; ")}]` : ""}`
              ),
              ...(block.synthesisNotes ? [`    - Synthesis: ${block.synthesisNotes}`] : []),
            ]),
          ])
        : ["- No historical, place, era, church, building, news, or locality context reports linked yet."]),
      "",
      "## Sources",
      "",
      ...evidenceTrace.map(
        (entry) =>
          `- ${entry.title} (${entry.type}${entry.repository ? `, ${entry.repository}` : ""}) - ${entry.citationCount} citation${entry.citationCount === 1 ? "" : "s"}`
      ),
      "",
      "## Evidence Trace",
      "",
      ...(evidenceTrace.length > 0
        ? evidenceTrace.flatMap((entry) => [
            `### ${entry.title}`,
            ...entry.supportedClaims.map(
              (claim) =>
                `- ${claim.field}: ${claim.confidence}${claim.text ? ` - ${claim.text}` : ""}`
            ),
          ])
        : ["- No source-backed claims are linked yet."]),
      "",
      "## Source-Backed Facts",
      "",
      ...(workspace.sourceFacts.length > 0
        ? workspace.sourceFacts.slice(0, 24).map(
            (fact) =>
              `- ${fact.factType}: ${fact.value} (${fact.label}, ${fact.confidence}, ${fact.status})${fact.conflictReason ? ` - ${fact.conflictReason}` : ""}`
          )
        : ["- No indexed source facts have been extracted yet."]),
      "",
      "## Reviewed Loose Context",
      "",
      ...(workspace.contextItems.filter(isContextPackEligibleContextItem).length > 0
        ? workspace.contextItems.filter(isContextPackEligibleContextItem).slice(0, 12).map(
            (item) =>
              `- ${item.title} (${item.itemType}, ${item.evidenceRole}, AI use: ${item.aiUseAllowed ? "allowed" : "blocked"})`
          )
        : ["- No reviewed loose-context items are eligible for context packs yet."]),
      "",
      "## Memories",
      "",
      ...workspace.media.map(
        (item) =>
          `- ${item.title} (privacy: ${item.privacyLevel ?? "private"}, review: ${item.reviewStatus ?? "unreviewed"}, rights: ${item.rightsStatus ?? "unknown"}, AI use: ${item.aiUseAllowed === true ? "allowed" : "blocked"})`
      ),
      "",
      "## Open Research Questions",
      "",
      ...workspace.researchTasks
        .filter((task) => task.status !== "done")
        .map((task) => `- ${task.title}: ${task.description || task.type}`),
      "",
      "## Unresolved Import Warnings",
      "",
      ...(structured.unresolvedConflicts.length > 0
        ? structured.unresolvedConflicts.map((warning) => `- ${warning}`)
        : ["- No unresolved import warnings recorded."]),
    ].join("\n");

    return {
      structured,
      markdown,
    };
  },
});
