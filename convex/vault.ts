import { v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildStoryPublicSlug } from "../lib/stories/slug";
import { redactPublicText } from "../lib/privacy/publicTextRedaction";
import { buildContextPack } from "./contextPackBuilder";
import {
  buildOperationSummary,
  filterByVaultOwner,
  formatPersonName,
  inferResearchChecks,
  matchesVaultOwner,
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

// Exported for the GEN-92 parity test (scripts/test-person-snapshot-parity.ts),
// which deep-equals the full-snapshot assembly against the per-person loader.
export async function getVaultSnapshot(ctx: QueryCtx, vaultOwnerId: string): Promise<VaultSnapshot> {
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

// GEN-93: snapshot consumers used to re-filter the full snapshot arrays once
// per person, making buildPeopleRows O(people * total-rows). We pre-bucket each
// array by the personId/key it is filtered on into Maps a single time, then the
// per-person helpers do O(1) Map lookups. Output is byte-identical to the prior
// per-scan logic — these Maps preserve insertion order (matching Array.filter
// order) and the id lookup Maps replace .find() with the same first-match.
type SnapshotIndex = {
  // events keyed by event _id (replaces snapshot.events.find in personEvents map)
  eventById: Map<string, Doc<"events">>;
  // personEvents grouped by personId
  personEventsByPerson: Map<string, Doc<"personEvents">[]>;
  // relationships grouped by each participating personId (person1 or person2)
  relationshipsByPerson: Map<string, Doc<"relationships">[]>;
  // media grouped by each personId in personIds[]
  mediaByPerson: Map<string, Doc<"media">[]>;
  // contextItems grouped by each personId in personIds[]
  contextItemsByPerson: Map<string, Doc<"contextItems">[]>;
  // sourceFacts grouped by personId
  sourceFactsByPerson: Map<string, Doc<"sourceFacts">[]>;
  // stories grouped by personId
  storiesByPerson: Map<string, Doc<"stories">[]>;
  // documents grouped by document.personId (which matches person.fsId || _id)
  documentsByPersonKey: Map<string, Doc<"documents">[]>;
  // importRuns grouped by run.personId
  importRunsByPersonId: Map<string, Doc<"importRuns">[]>;
  // importRuns grouped by run.personFsId
  importRunsByPersonFsId: Map<string, Doc<"importRuns">[]>;
  // researchChecks grouped by personId
  researchChecksByPerson: Map<string, Doc<"researchChecks">[]>;
  // provisionalRelatives grouped by anchorPersonId
  provisionalByAnchor: Map<string, Doc<"provisionalRelatives">[]>;
  // citationLinks grouped by targetId (covers both person and event targets)
  citationLinksByTarget: Map<string, Doc<"citationLinks">[]>;
  // original index of each citationLink in snapshot.citationLinks, so collected
  // links can be re-sorted into the single-pass filter order (byte-identical).
  citationLinkOrder: Map<Doc<"citationLinks">, number>;
  // citations keyed by _id (replaces snapshot.citations.find)
  citationById: Map<string, Doc<"citations">>;
  // sources keyed by _id (replaces snapshot.sources.find)
  sourceById: Map<string, Doc<"sources">>;
};

function pushToMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

// Exported for the GEN-92FU-COV parity test (the test reproduces the exact
// getContextCoverage pipeline on both the scoped and full snapshots).
export function buildSnapshotIndex(snapshot: VaultSnapshot): SnapshotIndex {
  const eventById = new Map<string, Doc<"events">>();
  for (const event of snapshot.events) eventById.set(String(event._id), event);

  const personEventsByPerson = new Map<string, Doc<"personEvents">[]>();
  for (const link of snapshot.personEvents) {
    pushToMap(personEventsByPerson, String(link.personId), link);
  }

  const relationshipsByPerson = new Map<string, Doc<"relationships">[]>();
  for (const relationship of snapshot.relationships) {
    pushToMap(relationshipsByPerson, String(relationship.person1), relationship);
    // Avoid double-adding a self-relationship to the same bucket.
    if (relationship.person2 !== relationship.person1) {
      pushToMap(relationshipsByPerson, String(relationship.person2), relationship);
    }
  }

  const mediaByPerson = new Map<string, Doc<"media">[]>();
  for (const item of snapshot.media) {
    const seen = new Set<string>();
    for (const personId of item.personIds) {
      const key = String(personId);
      if (seen.has(key)) continue;
      seen.add(key);
      pushToMap(mediaByPerson, key, item);
    }
  }

  const contextItemsByPerson = new Map<string, Doc<"contextItems">[]>();
  for (const item of snapshot.contextItems) {
    const seen = new Set<string>();
    for (const personId of item.personIds) {
      const key = String(personId);
      if (seen.has(key)) continue;
      seen.add(key);
      pushToMap(contextItemsByPerson, key, item);
    }
  }

  const sourceFactsByPerson = new Map<string, Doc<"sourceFacts">[]>();
  for (const item of snapshot.sourceFacts) {
    pushToMap(sourceFactsByPerson, String(item.personId), item);
  }

  const storiesByPerson = new Map<string, Doc<"stories">[]>();
  for (const story of snapshot.stories) {
    if (story.personId) pushToMap(storiesByPerson, String(story.personId), story);
  }

  const documentsByPersonKey = new Map<string, Doc<"documents">[]>();
  for (const document of snapshot.documents) {
    pushToMap(documentsByPersonKey, String(document.personId), document);
  }

  const importRunsByPersonId = new Map<string, Doc<"importRuns">[]>();
  const importRunsByPersonFsId = new Map<string, Doc<"importRuns">[]>();
  for (const run of snapshot.importRuns) {
    if (run.personId) pushToMap(importRunsByPersonId, String(run.personId), run);
    if (run.personFsId) pushToMap(importRunsByPersonFsId, String(run.personFsId), run);
  }

  const researchChecksByPerson = new Map<string, Doc<"researchChecks">[]>();
  for (const check of snapshot.researchChecks) {
    pushToMap(researchChecksByPerson, String(check.personId), check);
  }

  const provisionalByAnchor = new Map<string, Doc<"provisionalRelatives">[]>();
  for (const relative of snapshot.provisionalRelatives) {
    pushToMap(provisionalByAnchor, String(relative.anchorPersonId), relative);
  }

  const citationLinksByTarget = new Map<string, Doc<"citationLinks">[]>();
  const citationLinkOrder = new Map<Doc<"citationLinks">, number>();
  for (let i = 0; i < snapshot.citationLinks.length; i++) {
    const link = snapshot.citationLinks[i];
    pushToMap(citationLinksByTarget, String(link.targetId), link);
    citationLinkOrder.set(link, i);
  }

  const citationById = new Map<string, Doc<"citations">>();
  for (const citation of snapshot.citations) citationById.set(String(citation._id), citation);

  const sourceById = new Map<string, Doc<"sources">>();
  for (const source of snapshot.sources) sourceById.set(String(source._id), source);

  return {
    eventById,
    personEventsByPerson,
    relationshipsByPerson,
    mediaByPerson,
    contextItemsByPerson,
    sourceFactsByPerson,
    storiesByPerson,
    documentsByPersonKey,
    importRunsByPersonId,
    importRunsByPersonFsId,
    researchChecksByPerson,
    provisionalByAnchor,
    citationLinksByTarget,
    citationLinkOrder,
    citationById,
    sourceById,
  };
}

export function getPersonByIdentifier(snapshot: VaultSnapshot, personIdentifier: string) {
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
  index: SnapshotIndex,
  person: Doc<"persons">,
  events: Doc<"events">[]
) {
  // GEN-93: reconstruct the exact ordering of the prior full-array filter.
  // The original scanned snapshot.citationLinks in order and kept any link
  // whose target was this person (person links) or one of this person's events
  // (event links). We gather the same links from the per-target bucket map and
  // re-sort the collected links by their original snapshot.citationLinks index
  // (precomputed once in index.citationLinkOrder) so the output is
  // byte-identical to the single-pass filter.
  const personIdStr = String(person._id);
  const eventIds = new Set(events.map((event) => String(event._id)));

  const candidateLinks: Doc<"citationLinks">[] = [];
  const personLinks = index.citationLinksByTarget.get(personIdStr) ?? [];
  for (const link of personLinks) {
    if (link.targetType === "person") candidateLinks.push(link);
  }
  for (const eventId of eventIds) {
    const eventLinks = index.citationLinksByTarget.get(eventId) ?? [];
    for (const link of eventLinks) {
      if (link.targetType === "event") candidateLinks.push(link);
    }
  }
  // Restore original snapshot.citationLinks ordering for byte-identical output.
  candidateLinks.sort(
    (a, b) => (index.citationLinkOrder.get(a) ?? 0) - (index.citationLinkOrder.get(b) ?? 0)
  );
  const relevantLinks = candidateLinks;

  const citations = relevantLinks
    .map((link) => {
      const citation = index.citationById.get(String(link.citationId));
      if (!citation) return null;
      const source = index.sourceById.get(String(citation.sourceId));
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

export function buildPersonOperations(
  snapshot: VaultSnapshot,
  index: SnapshotIndex,
  person: Doc<"persons">
) {
  // GEN-93: all per-person scans below now read from the pre-bucketed Maps in
  // `index` (built once per snapshot) instead of re-filtering the full arrays.
  const personIdStr = String(person._id);
  const personEvents = (index.personEventsByPerson.get(personIdStr) ?? [])
    .map((link) => index.eventById.get(String(link.eventId)))
    .filter(Boolean) as Doc<"events">[];
  const personRelationships = index.relationshipsByPerson.get(personIdStr) ?? [];
  const personMedia = index.mediaByPerson.get(personIdStr) ?? [];
  const personContextItems = index.contextItemsByPerson.get(personIdStr) ?? [];
  const personSourceFacts = index.sourceFactsByPerson.get(personIdStr) ?? [];
  const personStories = index.storiesByPerson.get(personIdStr) ?? [];
  const personPlaces = getPersonPlaces(person, personEvents, snapshot.places);
  const personDocuments = index.documentsByPersonKey.get(person.fsId || personIdStr) ?? [];
  // Original union: run.personId === person._id || run.personFsId === person.fsId.
  // Reconstruct from both buckets, dedup, and restore snapshot.importRuns order
  // before sortByTimestampDesc (which is stable, so input order is preserved
  // for equal timestamps — must match the original filter ordering exactly).
  const importRunsSet = new Set<Doc<"importRuns">>();
  for (const run of index.importRunsByPersonId.get(personIdStr) ?? []) {
    importRunsSet.add(run);
  }
  if (person.fsId) {
    for (const run of index.importRunsByPersonFsId.get(person.fsId) ?? []) {
      importRunsSet.add(run);
    }
  }
  const personImportRuns = sortByTimestampDesc(
    snapshot.importRuns.filter((run) => importRunsSet.has(run))
  );
  const personChecks = index.researchChecksByPerson.get(personIdStr) ?? [];
  const personProvisional = (index.provisionalByAnchor.get(personIdStr) ?? []).filter(
    (relative) => relative.mergeState === "provisional"
  );
  const personSources = getPersonSourceRecords(index, person, personEvents).groupedSources.map(
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

// Exported for the GEN-92FU-COV parity test
// (scripts/test-context-coverage-parity.ts), which deep-equals the scoped-loader
// coverage output against the full-snapshot output for getContextCoverage.
export function buildContextCoverage(
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

// Exported for the GEN-92FU-COV parity test, which deep-equals the
// story-scoped-loader bundle against the full-snapshot bundle.
export function buildStoryBundle(
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
  const index = buildSnapshotIndex(snapshot);
  const operations = person ? buildPersonOperations(snapshot, index, person) : null;
  const sourceRecords = person && operations
    ? getPersonSourceRecords(index, person, operations.relatedEvents)
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
  const index = buildSnapshotIndex(snapshot);
  const operations = person ? buildPersonOperations(snapshot, index, person) : null;
  const sourceRecords = person && operations
    ? getPersonSourceRecords(index, person, operations.relatedEvents)
    : { citations: [], groupedSources: [] };
  const contextCoverage = person && operations
    ? buildContextCoverage(snapshot, person, operations)
    : null;

  return {
    publicationSafety: {
      published: story.status === "published",
      redactionApplied: true,
      redactionVersion: "public-text-v1" as const,
    },
    // Story — title, content, status, slug, indexing only. NOT internal
    // workflow fields like `publishWarnings`, `lastReviewerNote`, etc.
    story: {
      _id: story._id,
      title: redactPublicText(story.title),
      content: redactPublicText(story.content),
      status: story.status,
      publicSlug,
      publicIndexing: story.publicIndexing ?? "noindex" as const,
    },
    // Person — display projection only. NOT `living`, `birth`/`death` notes,
    // tags, or research notes.
    person: person
      ? {
          _id: person._id,
          displayName: redactPublicText(formatPersonName(person)),
          lifespan: redactPublicText(getPersonLifespan(person)),
        }
      : null,
    // Evidence — source title + citation count only. NOT raw citation text,
    // confidence scores, page numbers, or repository links.
    evidence: sourceRecords.groupedSources.slice(0, 8).map((entry) => ({
      source: {
        _id: entry.source._id,
        title: redactPublicText(entry.source.title),
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
              original: redactPublicText(event.date.original),
              year: event.date.year,
            }
          : undefined,
        endDate: event.endDate
          ? {
              original: redactPublicText(event.endDate.original),
              year: event.endDate.year,
            }
          : undefined,
      })),
    // Places — display fields only. NOT temporal descriptions, parent IDs,
    // FamilySearch IDs, or notes.
    places: (operations?.relatedPlaces ?? [])
      .filter((place) => place.type !== "address")
      .slice(0, 8)
      .map((place) => ({
      _id: place._id,
      fullName: redactPublicText(place.fullName),
      name: redactPublicText(place.name),
      type: place.type,
    })),
    // Media — public-gated subset, title only. NOT URLs, descriptions,
    // FamilySearch URLs, attribution metadata, or privacy fields.
    media: sortByTimestampDesc(
      (operations?.relatedMedia ?? []).filter(isPublicStoryMedia)
    ).slice(0, 6).map((item) => ({
      _id: item._id,
      title: redactPublicText(item.title),
    })),
    // Relationships — `relatedName` only, no full `relatedPerson` Doc.
    // The public page only needs the display string.
    relationships: (operations?.relatedRelationships ?? []).map((relationship) => {
      if (!person) return null;
      const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
      const relatedPerson = snapshot.people.find((entry) => entry._id === relatedId);
      return relatedPerson && !relatedPerson.living
        ? {
            _id: relationship._id,
            type: relationship.type,
            relatedName: redactPublicText(formatPersonName(relatedPerson)),
          }
        : null;
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    // Historical context — strict public gate (publishableEntries), display
    // fields only. NOT review/privacy/AI flags, full categoryBlocks, or
    // sources arrays.
    historicalContext: (contextCoverage?.publishableEntries ?? []).slice(0, 8).map((entry) => ({
      _id: entry._id,
      title: redactPublicText(entry.title),
      topic: redactPublicText(entry.topic),
      timePeriod: entry.timePeriod,
      content: redactPublicText(entry.content),
    })),
  };
}

function buildPeopleRows(snapshot: VaultSnapshot) {
  // GEN-93: build the per-person bucket index ONCE for the whole snapshot, then
  // reuse it across every person row. Previously each row re-filtered every
  // snapshot array, making this O(people * total-rows).
  const index = buildSnapshotIndex(snapshot);
  return snapshot.people.map((person) => {
    const operations = buildPersonOperations(snapshot, index, person);
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

// GEN-92: the assembly body, decoupled from how the snapshot was loaded. It
// reads ONLY person-relevant subsets of each snapshot array (per-person Map
// lookups in buildPersonOperations, `.filter(... === person._id)` for tasks/
// log, `snapshot.people.find(relatedId)` for relationship counterparts). That
// is what makes the per-person loader (loadPersonScopedSnapshot) safe: a
// snapshot containing exactly this person's related rows produces byte-identical
// output to the full snapshot, as long as each array is in the same order the
// `by_owner` index would return (ascending `_creationTime`). The parity test
// (scripts/test-person-snapshot-parity.ts) proves this for both paths.
export function assemblePersonWorkspaceFromSnapshot(
  snapshot: VaultSnapshot,
  personIdentifier: string
) {
  const person = getPersonByIdentifier(snapshot, personIdentifier);
  if (!person) return null;

  const index = buildSnapshotIndex(snapshot);
  const operations = buildPersonOperations(snapshot, index, person);
  const contextCoverage = buildContextCoverage(snapshot, person, operations);
  const sourceRecords = getPersonSourceRecords(index, person, operations.relatedEvents);
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

// GEN-92: order each table the way `withIndex("by_owner").collect()` would —
// ascending `_creationTime` (the by_owner index is [vaultOwnerId, _creationTime]
// and all rows share the same owner). Several assembly steps are order-sensitive
// on equal timestamps (stable sortByTimestampDesc, citationLinkOrder, the
// per-person bucket Maps), so matching this order is what guarantees the scoped
// snapshot yields byte-identical output to the full snapshot.
function byCreationTime<T extends { _creationTime: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a._creationTime - b._creationTime);
}

async function findPersonByIdentifier(
  ctx: QueryCtx,
  vaultOwnerId: string,
  personIdentifier: string
): Promise<Doc<"persons"> | null> {
  // Mirror getPersonByIdentifier: match on fsId OR document _id, scoped to owner.
  const normalizedId = ctx.db.normalizeId("persons", personIdentifier);
  if (normalizedId) {
    const byId = await ctx.db.get(normalizedId);
    if (byId && matchesVaultOwner(byId.vaultOwnerId, vaultOwnerId)) return byId;
  }
  const byFsId = await ctx.db
    .query("persons")
    .withIndex("by_fsId", (q) => q.eq("fsId", personIdentifier))
    .collect();
  return (
    byFsId.find((person) => matchesVaultOwner(person.vaultOwnerId, vaultOwnerId)) ?? null
  );
}

// GEN-92: load ONLY the rows a single-person workspace consumes, instead of the
// whole vault (getVaultSnapshot collects all ~20 owner tables). Returns a
// VaultSnapshot whose arrays are restricted to this person's related rows but
// ordered identically to the full snapshot, so assemblePersonWorkspaceFromSnapshot
// produces the same output. media, contextItems, and historicalContext have no
// usable person-scoped index, so they are read owner-wide and narrowed in JS;
// every other (and larger) relational table is index-narrowed to this person.
export async function loadPersonScopedSnapshot(
  ctx: QueryCtx,
  vaultOwnerId: string,
  personIdentifier: string
): Promise<VaultSnapshot | null> {
  const owned = <T extends { vaultOwnerId?: string }>(rows: T[]) =>
    filterByVaultOwner(rows, vaultOwnerId);

  const person = await findPersonByIdentifier(ctx, vaultOwnerId, personIdentifier);
  if (!person) return null;

  const personId = person._id;
  const personIdStr = String(personId);
  const personKey = person.fsId || personIdStr; // documents.personId convention

  // Relationships where this person is person1 or person2 (by_person* indexes).
  const [relAsPerson1, relAsPerson2] = await Promise.all([
    ctx.db
      .query("relationships")
      .withIndex("by_person1", (q) => q.eq("person1", personId))
      .collect(),
    ctx.db
      .query("relationships")
      .withIndex("by_person2", (q) => q.eq("person2", personId))
      .collect(),
  ]);
  const relationshipSet = new Set<Doc<"relationships">>();
  for (const rel of [...relAsPerson1, ...relAsPerson2]) {
    if (matchesVaultOwner(rel.vaultOwnerId, vaultOwnerId)) relationshipSet.add(rel);
  }
  const relationships = owned(Array.from(relationshipSet));

  // personEvents for this person, then the referenced events by id.
  const personEvents = owned(
    await ctx.db
      .query("personEvents")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect()
  );
  const eventIds = Array.from(new Set(personEvents.map((link) => String(link.eventId))));
  const events = owned(
    (
      await Promise.all(
        eventIds.map((id) => {
          const eid = ctx.db.normalizeId("events", id);
          return eid ? ctx.db.get(eid) : Promise.resolve(null);
        })
      )
    ).filter(Boolean) as Doc<"events">[]
  );

  // citationLinks: this person (by_target person) + each related event (by_target event).
  const eventLinkResults = await Promise.all(
    events.map((event) =>
      ctx.db
        .query("citationLinks")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "event").eq("targetId", String(event._id))
        )
        .collect()
    )
  );
  const personLinks = await ctx.db
    .query("citationLinks")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "person").eq("targetId", personIdStr)
    )
    .collect();
  const linkSet = new Set<Doc<"citationLinks">>();
  for (const link of [personLinks, ...eventLinkResults].flat()) {
    if (matchesVaultOwner(link.vaultOwnerId, vaultOwnerId)) linkSet.add(link);
  }
  const citationLinks = owned(Array.from(linkSet));

  // citations referenced by those links, then their sources.
  const citationIds = Array.from(new Set(citationLinks.map((link) => String(link.citationId))));
  const citations = owned(
    (
      await Promise.all(
        citationIds.map((id) => {
          const cid = ctx.db.normalizeId("citations", id);
          return cid ? ctx.db.get(cid) : Promise.resolve(null);
        })
      )
    ).filter(Boolean) as Doc<"citations">[]
  );
  const sourceIds = Array.from(new Set(citations.map((citation) => String(citation.sourceId))));
  const sources = owned(
    (
      await Promise.all(
        sourceIds.map((id) => {
          const sid = ctx.db.normalizeId("sources", id);
          return sid ? ctx.db.get(sid) : Promise.resolve(null);
        })
      )
    ).filter(Boolean) as Doc<"sources">[]
  );

  // places resolved by id from the person's birth/death + the related events
  // (getPersonPlaces only ever looks these up).
  const placeIds = new Set<string>();
  if (person.birth?.place?.placeId) placeIds.add(String(person.birth.place.placeId));
  if (person.death?.place?.placeId) placeIds.add(String(person.death.place.placeId));
  for (const event of events) {
    if (event.place?.placeId) placeIds.add(String(event.place.placeId));
  }
  const places = owned(
    (
      await Promise.all(
        Array.from(placeIds).map((id) => {
          const pid = ctx.db.normalizeId("places", id);
          return pid ? ctx.db.get(pid) : Promise.resolve(null);
        })
      )
    ).filter(Boolean) as Doc<"places">[]
  );

  // Per-person index-narrowed tables.
  const [
    sourceFacts,
    stories,
    documents,
    importRunsByPerson,
    importRunsByFsId,
    researchTasks,
    researchLogByPerson,
    researchChecks,
    provisionalRelatives,
  ] = await Promise.all([
    ctx.db
      .query("sourceFacts")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("stories")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("documents")
      .withIndex("by_personId", (q) => q.eq("personId", personKey))
      .collect(),
    ctx.db
      .query("importRuns")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect(),
    person.fsId
      ? ctx.db
          .query("importRuns")
          .withIndex("by_person_fsId", (q) => q.eq("personFsId", person.fsId as string))
          .collect()
      : Promise.resolve([] as Doc<"importRuns">[]),
    ctx.db
      .query("researchTasks")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("researchLog")
      .withIndex("by_entity", (q) => q.eq("entityType", "person").eq("entityId", personId))
      .collect(),
    ctx.db
      .query("researchChecks")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("provisionalRelatives")
      .withIndex("by_anchor", (q) => q.eq("anchorPersonId", personId))
      .collect(),
  ]);

  const importRunSet = new Set<Doc<"importRuns">>();
  for (const run of [...importRunsByPerson, ...importRunsByFsId]) {
    if (matchesVaultOwner(run.vaultOwnerId, vaultOwnerId)) importRunSet.add(run);
  }
  const importRuns = owned(Array.from(importRunSet));

  // media, contextItems, historicalContext: read owner-wide, then narrow in JS
  // to keep the assembled output identical to the full snapshot.
  // IMPORTANT: media.personIds / contextItems.personIds are arrays, and Convex
  // standard `.index()` does NOT support array-element ("contains") matching —
  // array-typed indexes exist only for vector indexes. A `by_person` index on
  // `personIds` queried with `q.eq("personIds", oneId)` compares against the
  // whole serialized array and returns ZERO rows in production. So these two
  // tables CANNOT be index-narrowed by person without a join/link table; do not
  // re-attempt it. (The fake-ctx parity tests cannot catch that mismatch — it is
  // exactly the class of bug the GEN-95C convex-test follow-up would surface.)
  const [allMedia, allContextItems, historicalContextRows] = await Promise.all([
    ctx.db
      .query("media")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
      .collect(),
    ctx.db
      .query("contextItems")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
      .collect(),
    ctx.db
      .query("historicalContext")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
      .collect(),
  ]);
  const media = owned(allMedia).filter((item) =>
    item.personIds.some((id) => String(id) === personIdStr)
  );
  const contextItems = owned(allContextItems).filter((item) =>
    item.personIds.some((id) => String(id) === personIdStr)
  );
  const historicalContext = owned(historicalContextRows);

  // Related people: the relationship counterparts (relatedPeople + relationship
  // mapping look these up via snapshot.people.find). Include the target person.
  const relatedPersonIds = new Set<string>();
  for (const rel of relationships) {
    const otherId = rel.person1 === personId ? rel.person2 : rel.person1;
    relatedPersonIds.add(String(otherId));
  }
  relatedPersonIds.delete(personIdStr);
  const relatedPeopleDocs = (
    await Promise.all(
      Array.from(relatedPersonIds).map((id) => {
        const pid = ctx.db.normalizeId("persons", id);
        return pid ? ctx.db.get(pid) : Promise.resolve(null);
      })
    )
  ).filter(
    (doc): doc is Doc<"persons"> => doc !== null && matchesVaultOwner(doc.vaultOwnerId, vaultOwnerId)
  );
  const people = byCreationTime([person, ...relatedPeopleDocs]);

  return {
    people,
    relationships: byCreationTime(relationships),
    events: byCreationTime(events),
    personEvents: byCreationTime(personEvents),
    places: byCreationTime(places),
    sources: byCreationTime(sources),
    citations: byCreationTime(citations),
    citationLinks: byCreationTime(citationLinks),
    sourceFacts: byCreationTime(owned(sourceFacts)),
    media: byCreationTime(media),
    contextItems: byCreationTime(contextItems),
    importRuns: byCreationTime(importRuns),
    researchTasks: byCreationTime(owned(researchTasks)),
    researchLog: byCreationTime(owned(researchLogByPerson)),
    documents: byCreationTime(owned(documents)),
    stories: byCreationTime(owned(stories)),
    // storyReviewEvents is unused by the person workspace assembly (only the
    // story bundle reads it). Keep empty to preserve the snapshot shape.
    storyReviewEvents: [],
    historicalContext: byCreationTime(historicalContext),
    researchChecks: byCreationTime(owned(researchChecks)),
    provisionalRelatives: byCreationTime(owned(provisionalRelatives)),
  };
}

// GEN-92: per-person assembly entry point used by the single-person consumers.
async function assemblePersonWorkspaceScoped(
  ctx: QueryCtx,
  vaultOwnerId: string,
  personIdentifier: string
) {
  const snapshot = await loadPersonScopedSnapshot(ctx, vaultOwnerId, personIdentifier);
  if (!snapshot) return null;
  return assemblePersonWorkspaceFromSnapshot(snapshot, personIdentifier);
}

// GEN-92FU-COV: story-scoped loader for getStoryReview/buildStoryBundle.
// buildStoryBundle reads ONLY: (1) the story itself, (2) its person and that
// person's full operations pipeline (events, places, sources, media,
// historicalContext coverage, etc.), (3) relatedStories — OTHER stories of the
// SAME person, and (4) this story's storyReviewEvents (by_story). Everything in
// (2)+(3) is exactly what loadPersonScopedSnapshot already gathers for the
// person (it collects all of the person's stories via by_person, so
// relatedStories is covered). The only thing the person-scoped snapshot omits
// is storyReviewEvents (it sets []), so we overlay just this story's review
// events via the by_story index. A story with no personId has no person scope:
// we still need the bare story row present so snapshot.stories.find resolves it
// (buildStoryBundle then treats person as null and emits empty operations).
export async function loadStoryScopedSnapshot(
  ctx: QueryCtx,
  vaultOwnerId: string,
  storyId: Id<"stories">
): Promise<VaultSnapshot | null> {
  const story = await ctx.db.get(storyId);
  if (!story || !matchesVaultOwner(story.vaultOwnerId, vaultOwnerId)) return null;

  // storyReviewEvents for THIS story, owner-filtered (GEN-70 defense-in-depth),
  // ordered ascending _creationTime to match the full snapshot's by_owner order
  // before the bundle re-sorts with sortByTimestampDesc.
  const reviewEvents = byCreationTime(
    filterByVaultOwner(
      await ctx.db
        .query("storyReviewEvents")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect(),
      vaultOwnerId
    )
  );

  // Person-scoped snapshot supplies the person, operations, and relatedStories.
  // A person-less story gets a minimal snapshot carrying just the story row.
  let base: VaultSnapshot;
  if (story.personId) {
    const personScoped = await loadPersonScopedSnapshot(
      ctx,
      vaultOwnerId,
      String(story.personId)
    );
    // If the person can't be resolved (orphaned personId), fall back to the
    // minimal snapshot so the story is still reviewable.
    base = personScoped ?? makeEmptyVaultSnapshot();
  } else {
    base = makeEmptyVaultSnapshot();
  }

  // Ensure the story itself is present (it always is for a person-linked story
  // — by_person collects it — but be defensive for orphaned/person-less rows).
  const stories = base.stories.some((entry) => entry._id === story._id)
    ? base.stories
    : byCreationTime([...base.stories, story]);

  return {
    ...base,
    stories,
    storyReviewEvents: reviewEvents,
  };
}

function makeEmptyVaultSnapshot(): VaultSnapshot {
  return {
    people: [],
    relationships: [],
    events: [],
    personEvents: [],
    places: [],
    sources: [],
    citations: [],
    citationLinks: [],
    sourceFacts: [],
    media: [],
    contextItems: [],
    importRuns: [],
    researchTasks: [],
    researchLog: [],
    documents: [],
    stories: [],
    storyReviewEvents: [],
    historicalContext: [],
    researchChecks: [],
    provisionalRelatives: [],
  };
}

export const getPeopleExplorer = internalQuery({
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

export const getPersonWorkspace = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // GEN-92: per-person loader — fetches only this person's related rows.
    return assemblePersonWorkspaceScoped(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.personIdentifier
    );
  },
});

/**
 * Resolve a stored media file for its owner, as a short-lived signed URL the
 * *server* uses to stream the bytes.
 *
 * The signed URL never reaches a browser or a model: `/api/media/[mediaId]/file`
 * fetches it server-side and streams the result under the person's own session,
 * and the MCP transport reads the object directly. That keeps a raw storage
 * link on the never-exposed list while still letting the vault serve the scan
 * it holds.
 */
export const getOwnedMediaFile = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    mediaId: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = normalizeVaultOwnerId(args.vaultOwnerId);
    const id = ctx.db.normalizeId("media", args.mediaId);
    const row = id ? await ctx.db.get(id) : null;
    // One shape for "no such item" and "someone else's item" — a media route
    // must never work as an existence oracle for another person's vault.
    if (!row || !matchesVaultOwner(row.vaultOwnerId, owner) || !row.storageId) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    if (!url) return null;
    return {
      url,
      mimeType: row.mimeType ?? "application/octet-stream",
      title: row.title,
      sizeBytes: row.sizeBytes ?? null,
    };
  },
});

export const getStoriesIndex = internalQuery({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const index = buildSnapshotIndex(snapshot);
    return sortByTimestampDesc(snapshot.stories).map((story) => {
      const person = story.personId
        ? snapshot.people.find((entry) => entry._id === story.personId) ?? null
        : null;
      const publicSlug = story.publicSlug ?? buildStoryPublicSlug({
        storyId: String(story._id),
        title: story.title,
        personName: person ? formatPersonName(person) : undefined,
      });
      const operations = person ? buildPersonOperations(snapshot, index, person) : null;
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

export const getStoryReview = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    storyId: v.id("stories"),
  },
  handler: async (ctx, args) => {
    // GEN-92FU-COV: story-scoped loader instead of the whole vault.
    // buildStoryBundle only ever reads this story, its person's scoped data,
    // the person's other stories (relatedStories), and this story's
    // storyReviewEvents — all of which loadStoryScopedSnapshot provides.
    // scripts/test-context-coverage-parity.ts deep-equals this path against the
    // full-snapshot buildStoryBundle on the fixture vault.
    const snapshot = await loadStoryScopedSnapshot(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.storyId
    );
    if (!snapshot) return null;
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
    const person = ownedStory
      ? snapshot.people.find((entry) => entry._id === ownedStory.personId)
      : null;
    if (!ownedStory || !person || person.living) return null;
    // GEN-77: use buildPublicStoryBundle (explicit field allowlist) instead
    // of the older internal bundle, which only gated 2 of 12 fields and
    // returned reviewer-only data on the public query response.
    return buildPublicStoryBundle(snapshot, ownedStory);
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
    const person = ownedStory
      ? snapshot.people.find((entry) => entry._id === ownedStory.personId)
      : null;
    if (!ownedStory || !person || person.living) return null;

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

export const getPersonResearchChecks = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // GEN-92: per-person loader — fetches only this person's related rows.
    const workspace = await assemblePersonWorkspaceScoped(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.personIdentifier
    );
    return workspace?.researchChecks ?? [];
  },
});

export const getProvisionalRelatives = internalQuery({
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

export const getOperationsQueue = internalQuery({
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

export const getOperationsSummary = internalQuery({
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

export const getVaultAudit = internalQuery({
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

export const getContextCoverage = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // GEN-92FU-COV: per-person loader. getContextCoverage runs exactly the same
    // three-step pipeline (buildSnapshotIndex -> buildPersonOperations ->
    // buildContextCoverage) that assemblePersonWorkspaceFromSnapshot runs
    // internally to produce its `contextCoverage` field. Since that workspace
    // path is already proven byte-identical on the scoped snapshot
    // (scripts/test-person-snapshot-parity.ts) and the coverage result depends
    // only on this person's related rows (relatedPlaces + the owner-wide
    // historicalContext, both of which the scoped loader preserves), reading the
    // scoped snapshot here is behavior-identical to the full snapshot.
    // scripts/test-context-coverage-parity.ts deep-equals the two paths.
    const snapshot = await loadPersonScopedSnapshot(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.personIdentifier
    );
    if (!snapshot) return null;
    const person = getPersonByIdentifier(snapshot, args.personIdentifier);
    if (!person) return null;
    const index = buildSnapshotIndex(snapshot);
    const operations = buildPersonOperations(snapshot, index, person);
    return buildContextCoverage(snapshot, person, operations);
  },
});

export const getStoryReadinessCandidates = internalQuery({
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

export const getPlacesExplorer = internalQuery({
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

export const getPlaceWorkspace = internalQuery({
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

export const getDashboardSummary = internalQuery({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const peopleRows = buildPeopleRows(snapshot);
    const personById = new Map(snapshot.people.map((person) => [String(person._id), person]));
    const firstQueueItem = await ctx.db
      .query("queueItems")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", normalizeVaultOwnerId(args.vaultOwnerId)))
      .first();
    const firstStartEligible =
      !firstQueueItem &&
      snapshot.people.length === 0 &&
      snapshot.relationships.length === 0 &&
      snapshot.events.length === 0 &&
      snapshot.personEvents.length === 0 &&
      snapshot.places.length === 0 &&
      snapshot.sources.length === 0 &&
      snapshot.citations.length === 0 &&
      snapshot.citationLinks.length === 0 &&
      snapshot.sourceFacts.length === 0 &&
      snapshot.media.length === 0 &&
      snapshot.contextItems.length === 0 &&
      snapshot.importRuns.length === 0 &&
      snapshot.researchTasks.length === 0 &&
      snapshot.researchLog.length === 0 &&
      snapshot.documents.length === 0 &&
      snapshot.stories.length === 0 &&
      snapshot.storyReviewEvents.length === 0 &&
      snapshot.historicalContext.length === 0 &&
      snapshot.researchChecks.length === 0 &&
      snapshot.provisionalRelatives.length === 0;

    return {
      firstStartEligible,
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

export const getResearchOverview = internalQuery({
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

export const getContextPack = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // GEN-92: per-person loader — fetches only this person's related rows.
    const workspace = await assemblePersonWorkspaceScoped(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.personIdentifier
    );
    if (!workspace) return null;

    // The extracted builder owns the structured export, including the
    // reviewedContextItems projection gated by isContextPackEligibleContextItem.
    return buildContextPack(workspace, {
      isContextPackEligibleMedia,
      isContextPackEligibleContextItem,
      isPublicStoryMedia,
    });
  },
});
