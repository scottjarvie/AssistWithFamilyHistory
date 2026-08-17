import type { Doc } from "./_generated/dataModel";
import { canonicalReadingForFactType } from "../lib/vault/conflictResolution";

type ContextPackCitation = Pick<
  Doc<"citations">,
  | "_id"
  | "sourceId"
  | "confidence"
  | "isEvidence"
  | "page"
  | "editedText"
  | "extractedText"
  | "notes"
  // AWF-0046: `conflictsWith` has been declared on the schema and validated on
  // write since the citation model landed, and no surface has ever read it. It
  // is the one field that says "these two records disagree", so the conflict
  // export below reads it to carry the losing reading alongside the winning one.
  | "conflictsWith"
> & {
  field?: string;
};

type ContextPackResearchCheck = {
  checkKey: string;
  status: string;
  applicability: string;
  completionSource: string;
  lastReviewedAt?: number;
  summary?: string;
};

type ContextPackRelationship = Doc<"relationships"> & {
  relatedName: string;
  relatedPerson?: Doc<"persons">;
};

type ContextPackWorkspace = {
  person: Doc<"persons"> & {
    displayName: string;
    routeId: string;
  };
  documents: Doc<"documents">[];
  stories: Doc<"stories">[];
  researchTasks: Doc<"researchTasks">[];
  importRuns: Doc<"importRuns">[];
  sources: Array<{
    source: Doc<"sources">;
    citations: ContextPackCitation[];
  }>;
  sourceFacts: Doc<"sourceFacts">[];
  citations: ContextPackCitation[];
  timeline: Doc<"events">[];
  relationships: Array<ContextPackRelationship | null>;
  media: Doc<"media">[];
  contextItems: Doc<"contextItems">[];
  places: Doc<"places">[];
  contextCoverage: {
    aiEligibleEntries: Doc<"historicalContext">[];
    aiMissingPlaces: Array<{
      _id: Doc<"places">["_id"];
      name: string;
      type: Doc<"places">["type"];
    }>;
  };
  provisionalRelatives: Doc<"provisionalRelatives">[];
  researchChecks: ContextPackResearchCheck[];
  operations: {
    completionPercent: number;
    criticalMissing: string[];
    [key: string]: unknown;
  };
  stats: {
    documents: number;
    [key: string]: number;
  };
};

type ContextPackGates = {
  isContextPackEligibleMedia: (item: Doc<"media">) => boolean;
  isContextPackEligibleContextItem: (item: Doc<"contextItems">) => boolean;
  isPublicStoryMedia: (item: Doc<"media">) => boolean;
};

function truncateText(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3)}...`;
}

/**
 * AWF-0046: the resolution authority line, stated in the export itself.
 *
 * Deciding which record to believe is the researcher's judgment call, and the
 * `family_history:research:write` consent screen already promises the person
 * that a connected AI "cannot accept a conclusion for you"
 * (`lib/mcp/catalog.ts` FAMILY_HISTORY_SCOPE_INFO). A conflict therefore
 * travels to the AI with its authority attached rather than as a bare row an
 * AI might read as work to finish. The AI may gather, weigh, and propose; the
 * person confirms.
 */
const CONFLICT_RESOLUTION_AUTHORITY = {
  decidedBy: "person",
  aiMay: "propose a resolution with evidence, recorded on the conflict_resolution research task",
  aiMayNot: "accept, reject, or otherwise settle a conflicting source fact",
  losingReading:
    "A settled conflict keeps the reading that lost. Never delete the record you decided against.",
} as const;


export function buildContextPack(workspace: ContextPackWorkspace, gates: ContextPackGates) {
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
  const reviewedContextItems = workspace.contextItems.filter(
    gates.isContextPackEligibleContextItem
  );

  // AWF-0046: the actual unresolved conflicts.
  //
  // `unresolvedConflicts` used to be an alias for the import-warning strings,
  // so an AI asked to help resolve a conflict received a list that did not
  // contain any conflicts. These are the `sourceFacts` rows the vault really
  // marked `status: "conflict"`, each carried with both readings and the
  // citation behind them, so a proposal can cite what it weighed.
  //
  // No new privacy surface: every row here is already exported verbatim in
  // `structured.sourceFacts` and in the "Source-Backed Facts" markdown section.
  const citationById = new Map(
    workspace.citations.map((citation) => [String(citation._id), citation])
  );
  const sourceById = new Map(
    workspace.sources.map((entry) => [String(entry.source._id), entry.source])
  );
  const describeCitation = (citationId: string) => {
    const citation = citationById.get(citationId);
    if (!citation) return { citationId };
    const source = sourceById.get(String(citation.sourceId));
    return {
      citationId,
      sourceId: citation.sourceId,
      sourceTitle: source?.title,
      confidence: citation.confidence,
      isEvidence: citation.isEvidence,
      page: citation.page,
      text: truncateText(citation.editedText || citation.extractedText || citation.notes, 240),
    };
  };
  const unresolvedConflicts = workspace.sourceFacts
    .filter((fact) => fact.status === "conflict")
    .map((fact) => {
      const citation = citationById.get(String(fact.citationId));
      return {
        sourceFactId: fact._id,
        personId: fact.personId,
        factType: fact.factType,
        label: fact.label,
        // The reading the source carries — the side that disagrees.
        sourceReading: fact.value,
        date: fact.date,
        place: fact.place,
        confidence: fact.confidence,
        conflictReason: fact.conflictReason,
        // The reading the vault currently concludes — the side it disagrees with.
        canonicalReading: canonicalReadingForFactType(workspace.person, fact.factType),
        evidence: describeCitation(String(fact.citationId)),
        // The other citations this one was recorded as disagreeing with. A
        // resolution has to weigh these and must not delete them.
        conflictsWith: (citation?.conflictsWith ?? []).map((otherId) =>
          describeCitation(String(otherId))
        ),
        authority: CONFLICT_RESOLUTION_AUTHORITY,
      };
    });
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
      .filter((item) => !gates.isPublicStoryMedia(item) || item.aiUseAllowed !== true)
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
    memories: workspace.media.filter(gates.isContextPackEligibleMedia),
    sourceFacts: workspace.sourceFacts,
    reviewedContextItems,
    // Source-doc rows can contain raw extraction text, private notes,
    // contributor details, and local artifact paths, but the documents table
    // does not yet carry review/privacy/AI-eligibility fields. Keep the
    // document count in stats, and serve full documents through the dedicated
    // owner-scoped document APIs instead of exporting raw rows to AI context.
    // AI surface: only ship reviewed, non-private, AI-allowed packs to the
    // structured context bundle. Unreviewed/private rows stay visible on
    // human-facing surfaces (person workspace, audit) via `entries`.
    historicalContext: workspace.contextCoverage.aiEligibleEntries,
    stories: workspace.stories,
    evidenceTrace,
    storyClaimReadiness,
    openResearchTasks: workspace.researchTasks.filter((task) => task.status !== "done"),
    // AWF-0046: these two used to be the same list under two names. They are
    // different things: a conflict is two records disagreeing about a fact, an
    // import warning is a capture that needed a human look.
    unresolvedConflicts,
    unresolvedImportWarnings: storyClaimReadiness.unresolvedImportWarnings,
    conflictResolutionAuthority: CONFLICT_RESOLUTION_AUTHORITY,
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
            (claim) => `- ${claim.field}: ${claim.confidence}${claim.text ? ` - ${claim.text}` : ""}`
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
    ...(reviewedContextItems.length > 0
      ? reviewedContextItems.slice(0, 12).map(
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
    "## Unresolved Conflicts",
    "",
    `- Who decides: ${CONFLICT_RESOLUTION_AUTHORITY.decidedBy}. A connected AI may ${CONFLICT_RESOLUTION_AUTHORITY.aiMay}. It may not ${CONFLICT_RESOLUTION_AUTHORITY.aiMayNot}.`,
    `- ${CONFLICT_RESOLUTION_AUTHORITY.losingReading}`,
    "",
    ...(structured.unresolvedConflicts.length > 0
      ? structured.unresolvedConflicts.flatMap((conflict) => [
          `- ${conflict.factType} (${conflict.label}): source reads "${conflict.sourceReading}"${conflict.evidence.sourceTitle ? ` in ${conflict.evidence.sourceTitle}` : ""} [${conflict.confidence}] vs this vault's "${conflict.canonicalReading ?? "no recorded reading"}"`,
          ...(conflict.conflictReason ? [`  - Why flagged: ${conflict.conflictReason}`] : []),
          ...(conflict.evidence.text ? [`  - Cited text: ${conflict.evidence.text}`] : []),
          ...conflict.conflictsWith.map(
            (other) =>
              `  - Also disagrees with: ${other.sourceTitle ?? "a citation in this vault"}${other.text ? ` - ${other.text}` : ""}`
          ),
        ])
      : ["- No source-backed facts are currently flagged as conflicting."]),
    "",
    "## Unresolved Import Warnings",
    "",
    ...(structured.unresolvedImportWarnings.length > 0
      ? structured.unresolvedImportWarnings.map((warning) => `- ${warning}`)
      : ["- No unresolved import warnings recorded."]),
  ].join("\n");

  return {
    structured,
    markdown,
  };
}
