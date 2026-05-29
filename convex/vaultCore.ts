import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_LOCAL_VAULT_OWNER } from "../lib/vault/constants";

export const RESEARCH_CHECK_DEFINITIONS = [
  { key: "identity_review", label: "Identity and merge review", defaultApplicability: "required" },
  { key: "biography", label: "Biography or story draft", defaultApplicability: "required" },
  { key: "timeline", label: "Timeline coverage", defaultApplicability: "required" },
  { key: "relationships", label: "Relationships reviewed", defaultApplicability: "required" },
  { key: "birth_record", label: "Birth or baptism record", defaultApplicability: "required" },
  { key: "marriage_record", label: "Marriage record", defaultApplicability: "recommended" },
  { key: "death_record", label: "Death or burial record", defaultApplicability: "required" },
  { key: "census", label: "Census coverage", defaultApplicability: "recommended" },
  { key: "immigration", label: "Immigration or naturalization", defaultApplicability: "unknown" },
  { key: "military", label: "Military research", defaultApplicability: "unknown" },
  { key: "probate_land_newspaper", label: "Probate, land, or newspaper", defaultApplicability: "recommended" },
  { key: "church_records", label: "Church or religious records", defaultApplicability: "recommended" },
  { key: "memories", label: "Memories and photos", defaultApplicability: "recommended" },
  { key: "place_context", label: "Place stories and context", defaultApplicability: "recommended" },
] as const;

export type ResearchCheckKey = (typeof RESEARCH_CHECK_DEFINITIONS)[number]["key"];
export type ResearchCheckStatus = "missing" | "in_progress" | "complete" | "not_applicable" | "needs_review";
export type ResearchCheckApplicability = "required" | "recommended" | "not_applicable" | "unknown";
export type ResearchCheckSource = "inferred" | "user" | "ai_agent" | "import";

type CheckRecord = Doc<"researchChecks">;
type PersonRecord = Doc<"persons">;
type SourceRecord = Doc<"sources">;
type EventRecord = Doc<"events">;
type RelationshipRecord = Doc<"relationships">;
type MediaRecord = Doc<"media">;
type DocumentRecord = Doc<"documents">;
type StoryRecord = Doc<"stories">;
type PlaceRecord = Doc<"places">;
type ImportRunRecord = Doc<"importRuns">;

export function normalizeVaultOwnerId(vaultOwnerId?: string | null) {
  return vaultOwnerId || DEFAULT_LOCAL_VAULT_OWNER;
}

export function matchesVaultOwner(vaultOwnerId: string | undefined, currentVaultOwnerId: string) {
  return normalizeVaultOwnerId(vaultOwnerId) === normalizeVaultOwnerId(currentVaultOwnerId);
}

export function filterByVaultOwner<T extends { vaultOwnerId?: string }>(
  rows: T[],
  vaultOwnerId: string
) {
  return rows.filter((row) => matchesVaultOwner(row.vaultOwnerId, vaultOwnerId));
}

// ---------------------------------------------------------------------------
// GEN-87 Phase 1 (SHADOW). The owner chokepoint.
//
// CARDINAL RULE: shadow observes, it NEVER enforces. resolveOwner always
// returns the client-supplied owner (normalized). When a verified Clerk
// identity is present AND disagrees with the supplied owner, we LOG a single
// structured warning so we can measure how often the trusted-argument owner
// diverges from the verified identity before any later phase flips on
// enforcement. We do NOT throw, and we do NOT switch the owner. Switching or
// throwing here is a LATER phase.
// ---------------------------------------------------------------------------

/**
 * PURE owner comparison for the shadow phase. No ctx, fully unit-testable.
 *
 * - `owner` is ALWAYS normalizeVaultOwnerId(suppliedOwner). Shadow never
 *   switches the owner regardless of the identity.
 * - `mismatch` is true ONLY when an identity subject is actually present AND
 *   its normalized form disagrees with the normalized supplied owner. For a
 *   guest / Clerk-off caller (identitySubject null/undefined) there is nothing
 *   to compare against, so mismatch is always false.
 *
 * Normalization is delegated to normalizeVaultOwnerId so the comparison stays
 * consistent with matchesVaultOwner / the rest of the owner helpers.
 */
export function compareOwnerForShadow(
  identitySubject: string | null | undefined,
  suppliedOwner?: string | null
): { owner: string; mismatch: boolean } {
  const owner = normalizeVaultOwnerId(suppliedOwner);
  if (identitySubject === null || identitySubject === undefined) {
    return { owner, mismatch: false };
  }
  const mismatch = normalizeVaultOwnerId(identitySubject) !== owner;
  return { owner, mismatch };
}

/**
 * Mask an owner/identity id for the shadow log. We only need to know a mismatch
 * is happening — not exactly whose. Emit at most an 8-char prefix + ellipsis, so
 * a full Clerk subject / vault-owner / guest id is never written to the logs
 * (real ids are long; this also covers short ones rather than printing them
 * whole). The signal that survives is "a mismatch occurred," which is the point.
 */
function truncateForShadowLog(value: string | null | undefined): string {
  if (!value) return "<none>";
  return value.length > 8 ? `${value.slice(0, 8)}…` : `${value}…`;
}

/**
 * The runtime owner chokepoint for Convex query/mutation handlers (SHADOW).
 *
 * Reads the verified identity via ctx.auth.getUserIdentity(), compares it to
 * the client-supplied owner with the pure compareOwnerForShadow, and — only on
 * a mismatch — emits ONE structured console.warn (truncated ids; Convex
 * captures console output). It then returns the SUPPLIED owner (normalized)
 * REGARDLESS. Shadow does not enforce: no throw, no owner switch.
 *
 * ctx is typed loosely so any QueryCtx / MutationCtx satisfies it.
 */
export async function resolveOwner(
  ctx: { auth: { getUserIdentity: () => Promise<{ subject?: string } | null> } },
  suppliedOwner?: string | null
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  const result = compareOwnerForShadow(identity?.subject, suppliedOwner);
  if (result.mismatch) {
    console.warn(
      `[shadow-owner-mismatch] identity=${truncateForShadowLog(identity?.subject)} supplied=${truncateForShadowLog(suppliedOwner)}`
    );
  }
  return result.owner;
}

function hasSourceKeyword(sources: SourceRecord[], keywords: string[]) {
  return sources.some((source) => {
    const haystack = `${source.title} ${source.type} ${source.notes || ""}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

function getCountryHints(places: Array<Pick<PlaceRecord, "fullName" | "name">>) {
  const countries = new Set<string>();
  for (const place of places) {
    const full = (place.fullName || place.name || "").split(",").map((part) => part.trim()).filter(Boolean);
    const country = full.at(-1);
    if (country) countries.add(country.toLowerCase());
  }
  return countries;
}

export function formatPersonName(person: {
  name: { given: string; surname: string; suffix?: string; prefix?: string };
}) {
  return [person.name.prefix, person.name.given, person.name.surname, person.name.suffix]
    .filter(Boolean)
    .join(" ");
}

export function buildOperationSummary(checks: Array<{
  checkKey: string;
  status: ResearchCheckStatus;
  applicability: ResearchCheckApplicability;
  lastReviewedAt?: number;
  summary?: string;
}>) {
  const applicable = checks.filter((check) => check.applicability !== "not_applicable");
  const completable = applicable.filter((check) => check.status !== "not_applicable");
  const complete = completable.filter((check) => check.status === "complete").length;
  const requiredMissing = applicable.filter(
    (check) =>
      check.applicability === "required" &&
      (check.status === "missing" || check.status === "needs_review")
  );
  const recommendedMissing = applicable.filter(
    (check) =>
      check.applicability === "recommended" &&
      (check.status === "missing" || check.status === "needs_review")
  );
  const staleCutoff = Date.now() - 1000 * 60 * 60 * 24 * 45;
  const staleChecks = applicable.filter(
    (check) => (check.lastReviewedAt ?? 0) > 0 && (check.lastReviewedAt ?? 0) < staleCutoff
  );
  const completionPercent =
    completable.length === 0 ? 0 : Math.round((complete / completable.length) * 100);

  return {
    completionPercent,
    applicableCount: applicable.length,
    requiredMissingCount: requiredMissing.length,
    recommendedMissingCount: recommendedMissing.length,
    staleChecksCount: staleChecks.length,
    criticalMissing: requiredMissing.map((check) => check.checkKey),
    nextActions: [...requiredMissing, ...recommendedMissing]
      .slice(0, 4)
      .map((check) => check.summary || check.checkKey),
  };
}

export function inferResearchChecks(input: {
  person: PersonRecord;
  sources: SourceRecord[];
  events: EventRecord[];
  relationships: RelationshipRecord[];
  media: MediaRecord[];
  documents: DocumentRecord[];
  stories: StoryRecord[];
  places: PlaceRecord[];
  importRuns: ImportRunRecord[];
  provisionalRelatives: Doc<"provisionalRelatives">[];
  existingChecks?: CheckRecord[];
}) {
  const person = input.person;
  const birthYear = person.birth?.date?.year;
  const deathYear = person.death?.date?.year;
  const sourceCount = input.sources.length;
  const placeHints = input.places;
  const countryHints = getCountryHints(placeHints);
  const hasBiographyOutput =
    input.stories.some((story) => ["biography", "family_narrative"].includes(story.type)) ||
    input.documents.some((document) => document.type === "PS");
  const hasTimeline = input.events.length >= 3;
  const hasRelationships = input.relationships.length > 0 || input.provisionalRelatives.length > 0;
  const hasBirthEvidence =
    Boolean(person.birth?.date?.original) ||
    hasSourceKeyword(input.sources, ["birth", "bapt", "christen", "new york, marriages", "vital"]);
  const hasMarriageEvidence =
    input.relationships.some((relationship) => relationship.type === "Couple") ||
    hasSourceKeyword(input.sources, ["marriage", "wedding"]);
  const hasDeathEvidence =
    Boolean(person.death?.date?.original) ||
    hasSourceKeyword(input.sources, ["death", "burial", "grave", "obituary"]);
  const hasCensusEvidence =
    input.events.some((event) => event.type === "census") ||
    hasSourceKeyword(input.sources, ["census", "state census"]);
  const hasImmigrationEvidence =
    input.events.some((event) => ["immigration", "emigration", "naturalization"].includes(event.type)) ||
    hasSourceKeyword(input.sources, ["immigration", "emigration", "naturalization", "passenger"]);
  const hasMilitaryEvidence =
    input.events.some((event) => event.type === "military") ||
    hasSourceKeyword(input.sources, ["military", "draft", "service", "war"]);
  const hasChurchEvidence =
    hasSourceKeyword(input.sources, ["church", "parish", "bapt", "christen"]);
  const hasProbateEvidence =
    hasSourceKeyword(input.sources, ["probate", "land", "deed", "newspaper", "will"]);
  const hasMemories = input.media.length > 0;
  const hasPlaceContext =
    input.places.length > 0 &&
    (input.documents.some((document) => document.type === "PS") || input.importRuns.length > 0);

  const censusApplicable =
    birthYear !== undefined || deathYear !== undefined
      ? (birthYear ?? deathYear ?? 0) <= 1950 && (deathYear ?? birthYear ?? 9999) >= 1790
      : false;
  const deathApplicable = !person.living || Boolean(deathYear);
  const immigrationApplicable = countryHints.size > 1 || hasImmigrationEvidence;
  const militaryApplicable =
    person.sex === "male" && ((birthYear ?? 0) <= 1930 || hasMilitaryEvidence);
  const churchApplicable =
    hasChurchEvidence || (birthYear !== undefined && birthYear <= 1910) || hasMarriageEvidence;
  const probateApplicable = deathApplicable;

  const inferredChecks = new Map<string, {
    checkKey: ResearchCheckKey;
    status: ResearchCheckStatus;
    applicability: ResearchCheckApplicability;
    completionSource: ResearchCheckSource;
    confidence: number;
    summary?: string;
  }>();

  const setCheck = (
    checkKey: ResearchCheckKey,
    status: ResearchCheckStatus,
    applicability: ResearchCheckApplicability,
    confidence: number,
    summary: string
  ) => {
    inferredChecks.set(checkKey, {
      checkKey,
      status,
      applicability,
      completionSource: "inferred",
      confidence,
      summary,
    });
  };

  setCheck(
    "identity_review",
    sourceCount > 0 && input.importRuns.every((run) => run.warnings.length === 0) ? "complete" : "needs_review",
    "required",
    sourceCount > 0 ? 0.74 : 0.3,
    sourceCount > 0 ? "Review identity confidence and import warnings." : "Import evidence to establish identity."
  );
  setCheck(
    "biography",
    hasBiographyOutput ? "complete" : sourceCount >= 4 ? "in_progress" : "missing",
    "required",
    hasBiographyOutput ? 0.9 : sourceCount >= 4 ? 0.6 : 0.35,
    hasBiographyOutput ? "Biography output exists." : "Draft a biography or narrative from the current evidence."
  );
  setCheck(
    "timeline",
    hasTimeline ? "complete" : input.events.length > 0 ? "in_progress" : "missing",
    "required",
    hasTimeline ? 0.88 : input.events.length > 0 ? 0.57 : 0.28,
    hasTimeline ? "Timeline coverage looks usable." : "Add more dated events from source evidence."
  );
  setCheck(
    "relationships",
    hasRelationships ? "complete" : "missing",
    "required",
    hasRelationships ? 0.81 : 0.33,
    hasRelationships ? "Relationships or provisional relatives are linked." : "Review spouse, children, and parent relationships."
  );
  setCheck(
    "birth_record",
    hasBirthEvidence ? "complete" : "missing",
    "required",
    hasBirthEvidence ? 0.86 : 0.25,
    hasBirthEvidence ? "Birth evidence is attached." : "Search for birth or baptism coverage."
  );
  setCheck(
    "marriage_record",
    hasMarriageEvidence ? "complete" : sourceCount > 0 ? "missing" : "missing",
    hasRelationships ? "required" : "recommended",
    hasMarriageEvidence ? 0.8 : 0.32,
    hasMarriageEvidence ? "Marriage evidence is attached." : "Search for a marriage record if a spouse is known."
  );
  setCheck(
    "death_record",
    deathApplicable ? (hasDeathEvidence ? "complete" : "missing") : "not_applicable",
    deathApplicable ? "required" : "not_applicable",
    hasDeathEvidence ? 0.84 : 0.24,
    hasDeathEvidence ? "Death evidence is attached." : "Search for death, burial, or grave coverage."
  );
  setCheck(
    "census",
    censusApplicable ? (hasCensusEvidence ? "complete" : "missing") : "not_applicable",
    censusApplicable ? "recommended" : "not_applicable",
    hasCensusEvidence ? 0.82 : 0.27,
    hasCensusEvidence ? "Census evidence is attached." : "Check census coverage for this lifespan and geography."
  );
  setCheck(
    "immigration",
    immigrationApplicable ? (hasImmigrationEvidence ? "complete" : "missing") : "not_applicable",
    immigrationApplicable ? "recommended" : "unknown",
    hasImmigrationEvidence ? 0.75 : 0.22,
    hasImmigrationEvidence ? "Immigration-related evidence is attached." : "Review whether migration or naturalization applies."
  );
  setCheck(
    "military",
    militaryApplicable ? (hasMilitaryEvidence ? "complete" : "missing") : "not_applicable",
    militaryApplicable ? "recommended" : "unknown",
    hasMilitaryEvidence ? 0.72 : 0.2,
    hasMilitaryEvidence ? "Military evidence is attached." : "Review likely military-age years for applicable service records."
  );
  setCheck(
    "probate_land_newspaper",
    probateApplicable ? (hasProbateEvidence ? "complete" : "missing") : "not_applicable",
    probateApplicable ? "recommended" : "unknown",
    hasProbateEvidence ? 0.7 : 0.22,
    hasProbateEvidence ? "Probate, land, or newspaper evidence is attached." : "Check probate, land, and newspaper collections."
  );
  setCheck(
    "church_records",
    churchApplicable ? (hasChurchEvidence ? "complete" : "missing") : "not_applicable",
    churchApplicable ? "recommended" : "unknown",
    hasChurchEvidence ? 0.76 : 0.2,
    hasChurchEvidence ? "Church or religious evidence is attached." : "Review church and parish records tied to known places."
  );
  setCheck(
    "memories",
    hasMemories ? "complete" : "missing",
    "recommended",
    hasMemories ? 0.82 : 0.22,
    hasMemories ? "Memories or photos are attached." : "Look for memories, photos, scans, or letters."
  );
  setCheck(
    "place_context",
    hasPlaceContext ? "complete" : input.places.length > 0 ? "in_progress" : "missing",
    input.places.length > 0 ? "recommended" : "unknown",
    hasPlaceContext ? 0.7 : input.places.length > 0 ? 0.48 : 0.18,
    hasPlaceContext ? "Place context is represented in current outputs." : "Build place and locality context around the known locations."
  );

  return RESEARCH_CHECK_DEFINITIONS.map((definition) => {
    const inferred = inferredChecks.get(definition.key) ?? {
      checkKey: definition.key,
      status: "missing" as ResearchCheckStatus,
      applicability: definition.defaultApplicability,
      completionSource: "inferred" as ResearchCheckSource,
      confidence: 0.2,
      summary: definition.label,
    };
    const existing = input.existingChecks?.find((check) => check.checkKey === definition.key);
    if (existing && existing.completionSource !== "inferred" && existing.completionSource !== "import") {
      return existing;
    }

    return existing
      ? {
          ...existing,
          status: inferred.status,
          applicability: inferred.applicability,
          completionSource: existing.completionSource === "import" ? "import" : "inferred",
          confidence: inferred.confidence,
          summary: existing.notes || inferred.summary,
          updatedAt: existing.updatedAt,
          lastReviewedAt: existing.lastReviewedAt,
        }
      : {
          personId: person._id,
          personFsId: person.fsId,
          checkKey: definition.key,
          status: inferred.status,
          applicability: inferred.applicability,
          completionSource: inferred.completionSource,
          confidence: inferred.confidence,
          summary: inferred.summary,
          notes: undefined,
          linkedSourceIds: [],
          linkedPlaceIds: [],
          linkedPersonIds: [],
          lastReviewedAt: undefined,
        };
  });
}

export function buildProvisionalDedupeKey(params: {
  vaultOwnerId: string;
  anchorPersonId: Id<"persons">;
  displayName: string;
  relationshipHint?: string;
}) {
  return [
    normalizeVaultOwnerId(params.vaultOwnerId),
    String(params.anchorPersonId),
    params.displayName.trim().toLowerCase(),
    (params.relationshipHint || "").trim().toLowerCase(),
  ].join("::");
}

export function sortByTimestampDesc<T extends { importedAt?: number; updatedAt?: number; createdAt?: number }>(
  rows: T[]
) {
  return [...rows].sort(
    (a, b) =>
      (b.importedAt ?? b.updatedAt ?? b.createdAt ?? 0) -
      (a.importedAt ?? a.updatedAt ?? a.createdAt ?? 0)
  );
}
