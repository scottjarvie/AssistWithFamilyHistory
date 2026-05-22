export type StoryStatus = "draft" | "review" | "published";

export type StoryPublishGateSeverity = "blocker" | "warning" | "passed";

export type StoryPublishGate = {
  key: string;
  label: string;
  severity: StoryPublishGateSeverity;
  detail: string;
  owner: "writer" | "reviewer" | "researcher" | "trusted_publisher";
};

export type StoryPublishSafetyInput = {
  story: {
    status: StoryStatus;
    title?: string;
    content?: string;
    citationIds?: unknown[];
  };
  person?: {
    displayName?: string;
    living?: boolean;
    birth?: { date?: { year?: number; original?: string } };
    death?: { date?: { year?: number; original?: string } };
    notes?: string;
    tags?: string[];
  } | null;
  readiness?: {
    completionPercent?: number;
    requiredMissingCount?: number;
    criticalMissing?: string[];
    nextActions?: string[];
  } | null;
  researchChecks?: Array<{
    checkKey: string;
    status: "missing" | "in_progress" | "complete" | "not_applicable" | "needs_review";
    applicability: "required" | "recommended" | "not_applicable" | "unknown";
    summary?: string;
    confidence?: number;
  }>;
  contextCoverage?: {
    count?: number;
    // Filtered subset cleared for AI-assisted writing (reviewed + non-private + aiUseAllowed).
    aiEligibleCount?: number;
    // Filtered subset cleared for public publication (publish_candidate or
    // public_source privacy, reviewed status). When provided, the publish
    // gate requires this rather than the raw `count`.
    publishableCount?: number;
    status?: string;
    relatedPlaceCount?: number;
    placeCountWithContext?: number;
    missingPlaces?: Array<{ name?: string }>;
  } | null;
  evidence?: Array<{
    source?: {
      title?: string;
      notes?: string;
      publicationDate?: string;
    };
    citations?: unknown[];
  }>;
  events?: Array<{ type?: string; date?: { year?: number; original?: string }; endDate?: { year?: number } }>;
  places?: unknown[];
  relationships?: Array<{
    type?: string;
    childRelationType?: string;
    relatedName?: string;
    relatedPerson?: {
      living?: boolean;
      birth?: { date?: { year?: number; original?: string } };
      death?: { date?: { year?: number; original?: string } };
      notes?: string;
      tags?: string[];
    };
  } | null>;
  provisionalRelatives?: Array<{
    displayName?: string;
    relationshipHint?: string;
    mergeState?: string;
  }>;
  publishWarnings?: Array<{
    key: string;
    label: string;
    status: string;
    detail: string;
  }>;
  nowYear?: number;
};

export type StoryPublishReadiness = {
  canPublish: boolean;
  status: "blocked" | "ready";
  score: number;
  summary: string;
  blockers: StoryPublishGate[];
  warnings: StoryPublishGate[];
  passed: StoryPublishGate[];
  checks: StoryPublishGate[];
  provenance: {
    evidenceGroups: number;
    citations: number;
    events: number;
    places: number;
    contextReports: number;
    relationships: number;
    provisionalRelatives: number;
  };
  privacyRisk: {
    isBlocked: boolean;
    reasons: string[];
  };
  recommendedNextActions: string[];
};

const minimumPublicStoryCharacters = 400;
const livingPrivacyAgeThreshold = 110;

function normalizeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cleanAction(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function totalCitationCount(input: StoryPublishSafetyInput) {
  const storyCitations = input.story.citationIds?.length ?? 0;
  const evidenceCitations = (input.evidence ?? []).reduce(
    (total, entry) => total + (entry.citations?.length ?? 0),
    0
  );
  return Math.max(storyCitations, evidenceCitations);
}

function includesPrivateSignal(value: string | undefined) {
  if (!value) return false;
  return /\b(private|living|do not publish|do-not-publish|sensitive|minor|confidential)\b/i.test(value);
}

function tagsIncludePrivateSignal(tags: string[] | undefined) {
  return (tags ?? []).some((tag) => includesPrivateSignal(tag));
}

function ageFromBirthYear(birthYear: number | undefined, nowYear: number) {
  return typeof birthYear === "number" ? nowYear - birthYear : null;
}

function getPersonLivingRiskReasons(
  label: string,
  person: StoryPublishSafetyInput["person"],
  nowYear: number
) {
  const reasons: string[] = [];
  if (!person) return reasons;

  if (person.living) {
    reasons.push(`${label} is marked living.`);
  }
  const birthYear = person.birth?.date?.year;
  const deathYear = person.death?.date?.year;
  const age = ageFromBirthYear(birthYear, nowYear);

  if (!deathYear && !birthYear) {
    reasons.push(`${label} has no birth or death year to clear living-person risk.`);
  } else if (!deathYear && age !== null && age < livingPrivacyAgeThreshold) {
    reasons.push(`${label} has no death year and would be about ${age}.`);
  }

  if (includesPrivateSignal(person.notes) || tagsIncludePrivateSignal(person.tags)) {
    reasons.push(`${label} has private or sensitive notes/tags.`);
  }

  return reasons;
}

export function assessStoryPrivacyRisk(input: StoryPublishSafetyInput) {
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const reasons = getPersonLivingRiskReasons("Source person", input.person, nowYear);

  for (const relationship of input.relationships ?? []) {
    if (!relationship) continue;
    const relatedPerson = relationship.relatedPerson;
    const label = relationship.relatedName ? `Related person ${relationship.relatedName}` : "A related person";
    const relationshipReasons = getPersonLivingRiskReasons(label, relatedPerson ?? null, nowYear);
    for (const reason of relationshipReasons) {
      reasons.push(reason);
    }
  }

  for (const event of input.events ?? []) {
    const year = event.endDate?.year ?? event.date?.year;
    if (year && nowYear - year < livingPrivacyAgeThreshold && event.type !== "death" && event.type !== "burial") {
      reasons.push(`A ${event.type || "life"} event is dated ${year}, which may involve living people.`);
    }
  }

  for (const entry of input.evidence ?? []) {
    if (includesPrivateSignal(entry.source?.title) || includesPrivateSignal(entry.source?.notes)) {
      reasons.push(`Source "${entry.source?.title || "Untitled source"}" carries private/sensitive wording.`);
    }
    const publicationYear = Number(entry.source?.publicationDate?.match(/\d{4}/)?.[0]);
    if (publicationYear && nowYear - publicationYear < 30) {
      reasons.push(`Source "${entry.source?.title || "Untitled source"}" has a modern publication date (${publicationYear}).`);
    }
  }

  return {
    isBlocked: reasons.length > 0,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
  };
}

function makeGate(
  key: string,
  label: string,
  severity: StoryPublishGateSeverity,
  detail: string,
  owner: StoryPublishGate["owner"]
): StoryPublishGate {
  return { key, label, severity, detail, owner };
}

export function assessStoryPublishReadiness(input: StoryPublishSafetyInput): StoryPublishReadiness {
  const contentLength = input.story.content?.trim().length ?? 0;
  const evidenceGroups = input.evidence?.length ?? 0;
  const citations = totalCitationCount(input);
  const requiredMissingCount = normalizeCount(input.readiness?.requiredMissingCount);
  const contextReports = normalizeCount(input.contextCoverage?.count);
  // When the caller can distinguish publishable from recorded context, gate
  // public publication on the publishable count. Falling back to `contextReports`
  // preserves behavior for callers that haven't been updated yet.
  const publishableContextReports =
    input.contextCoverage?.publishableCount !== undefined
      ? normalizeCount(input.contextCoverage.publishableCount)
      : contextReports;
  const provisionalRelatives = (input.provisionalRelatives ?? []).filter(
    (relative) => relative.mergeState === undefined || relative.mergeState === "provisional"
  ).length;
  const missingContextPlaces = input.contextCoverage?.missingPlaces?.length ?? 0;
  const requiredOpenChecks = (input.researchChecks ?? []).filter(
    (check) =>
      check.applicability === "required" &&
      (check.status === "missing" || check.status === "needs_review" || check.status === "in_progress")
  );
  const privacyRisk = assessStoryPrivacyRisk(input);
  const gates: StoryPublishGate[] = [];

  gates.push(
    input.person
      ? makeGate(
          "person_link",
          "Source person linked",
          "passed",
          "This story is tied to a vault person.",
          "writer"
        )
      : makeGate(
          "person_link",
          "Source person linked",
          "blocker",
          "Link the story to a vault person before publishing.",
          "writer"
        )
  );

  gates.push(
    evidenceGroups > 0 && citations > 0
      ? makeGate(
          "evidence",
          "Evidence attached",
          "passed",
          `${evidenceGroups} source group${evidenceGroups === 1 ? "" : "s"} and ${citations} citation${citations === 1 ? "" : "s"} support the draft.`,
          "researcher"
        )
      : makeGate(
          "evidence",
          "Evidence attached",
          "blocker",
          "Add source evidence or story citations before a public status change.",
          "researcher"
        )
  );

  gates.push(
    requiredMissingCount === 0 && requiredOpenChecks.length === 0
      ? makeGate(
          "required_research",
          "Required research checks",
          "passed",
          "Required research checks are complete or not applicable.",
          "reviewer"
        )
      : makeGate(
          "required_research",
          "Required research checks",
          "blocker",
          `${Math.max(requiredMissingCount, requiredOpenChecks.length)} required check${Math.max(requiredMissingCount, requiredOpenChecks.length) === 1 ? "" : "s"} still need work.`,
          "researcher"
        )
  );

  gates.push(
    publishableContextReports > 0
      ? makeGate(
          "context",
          "Historical context",
          missingContextPlaces > 0 ? "warning" : "passed",
          missingContextPlaces > 0
            ? `${missingContextPlaces} linked place${missingContextPlaces === 1 ? "" : "s"} still lack context reports.`
            : "Historical context is linked to the story's person and places.",
          missingContextPlaces > 0 ? "researcher" : "reviewer"
        )
      : contextReports > 0
        ? makeGate(
            "context",
            "Historical context",
            "blocker",
            `${contextReports} context report${contextReports === 1 ? "" : "s"} exist for this person but none are reviewed at publish-candidate or public-source privacy yet. Promote at least one before publishing.`,
            "researcher"
          )
        : makeGate(
            "context",
            "Historical context",
            "blocker",
            "Add at least one place, era, locality, church, building, or news context report before publishing.",
            "researcher"
          )
  );

  gates.push(
    privacyRisk.isBlocked
      ? makeGate(
          "privacy_living_status",
          "Private or living risk",
          "blocker",
          privacyRisk.reasons.join(" "),
          "trusted_publisher"
        )
      : makeGate(
          "privacy_living_status",
          "Private or living risk",
          "passed",
          "Living-person risk is not detected from the available dates.",
          "trusted_publisher"
        )
  );

  gates.push(
    provisionalRelatives === 0
      ? makeGate(
          "provisional_relatives",
          "Provisional relatives resolved",
          "passed",
          "No unresolved provisional relatives are attached to the source person.",
          "reviewer"
        )
      : makeGate(
          "provisional_relatives",
          "Provisional relatives resolved",
          "blocker",
          `${provisionalRelatives} provisional relative${provisionalRelatives === 1 ? "" : "s"} need merge, promotion, or dismissal first.`,
          "reviewer"
        )
  );

  gates.push(
    contentLength >= minimumPublicStoryCharacters
      ? makeGate(
          "story_context_strength",
          "Story context strength",
          "passed",
          "The draft has enough narrative substance for review.",
          "writer"
        )
      : makeGate(
          "story_context_strength",
          "Story context strength",
          "blocker",
          `Draft content is ${contentLength} characters; public stories need at least ${minimumPublicStoryCharacters} characters of grounded context.`,
          "writer"
        )
  );

  gates.push(
    input.story.status === "review" || input.story.status === "published"
      ? makeGate(
          "review_status",
          "Review workflow status",
          "passed",
          "The story has entered review before public publishing.",
          "reviewer"
        )
      : makeGate(
          "review_status",
          "Review workflow status",
          "blocker",
          "Move the story from draft to review before publishing.",
          "reviewer"
        )
  );

  for (const warning of input.publishWarnings ?? []) {
    if (gates.some((gate) => gate.key === warning.key)) continue;
    gates.push(
      makeGate(
        warning.key,
        warning.label,
        "warning",
        warning.detail,
        warning.key.includes("context") ? "researcher" : "reviewer"
      )
    );
  }

  const blockers = gates.filter((gate) => gate.severity === "blocker");
  const warnings = gates.filter((gate) => gate.severity === "warning");
  const passed = gates.filter((gate) => gate.severity === "passed");
  const score = Math.round((passed.length / gates.length) * 100);
  const canPublish = blockers.length === 0;
  const recommendedNextActions = [
    ...blockers.map((gate) => `${gate.owner}: ${gate.detail}`),
    ...(input.readiness?.nextActions ?? []).map(cleanAction),
  ]
    .filter(Boolean)
    .slice(0, 8);

  return {
    canPublish,
    status: canPublish ? "ready" : "blocked",
    score,
    summary: canPublish
      ? "Publish gates are clear. A trusted publisher still needs to confirm human review."
      : `${blockers.length} publish blocker${blockers.length === 1 ? "" : "s"} must be resolved before public status change.`,
    blockers,
    warnings,
    passed,
    checks: gates,
    provenance: {
      evidenceGroups,
      citations,
      events: input.events?.length ?? 0,
      places: input.places?.length ?? 0,
      contextReports,
      relationships: input.relationships?.length ?? 0,
      provisionalRelatives,
    },
    privacyRisk,
    recommendedNextActions,
  };
}
