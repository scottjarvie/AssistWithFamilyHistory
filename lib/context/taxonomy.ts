/**
 * Context Store Taxonomy — the canonical "what type of thing goes where" map.
 *
 * This is the single source of truth an external AI agent reads (served read-only
 * at `/context-schema`) to learn which surface of the vault each kind of
 * family-history artifact belongs in, what fields it needs, what it can be
 * promoted into, and the privacy posture it lands with.
 *
 * INVARIANTS enforced here and asserted by scripts/check-context-taxonomy.ts:
 *   - Every target table is an owner-scoped table in convex/schema.ts.
 *   - Privacy-by-default: every kind lands private + unreviewed + aiUseAllowed:false.
 *     A human must review before anything becomes AI-eligible or publishable.
 *   - Evidence-vs-conclusion: raw material is captured as evidence and is promoted
 *     into conclusions/canonical facts only by a human ("agents propose, humans confirm").
 *
 * `available` is honest about the CURRENT write path: kinds whose landing mutation
 * already exists are `true`; kinds that need the universal-context-store work
 * (the contextItems `kind` field, binary _storage, promotion loop) are `false`
 * with a `plannedPhase` note so agents are never told they can do something they can't.
 */

export const TAXONOMY_VERSION = "2026-05-29";

/** Owner-scoped Convex tables an artifact can land in. Mirrors schema.ts by_owner tables. */
export type ContextTargetTable =
  | "persons"
  | "relationships"
  | "events"
  | "places"
  | "sources"
  | "citations"
  | "sourceFacts"
  | "media"
  | "contextItems"
  | "historicalContext"
  | "documents";

export type EvidenceRole =
  | "raw_material"
  | "researcher_conclusion"
  | "generated_summary"
  | "lead_or_hint"
  | "background_context";

export type LinkTarget = "person" | "place" | "event" | "source" | "story";

/**
 * The full vocabulary of artifact kinds an agent can classify material into.
 * The `ArtifactKind` type is derived from this array so the CI check can assert
 * the route table covers every kind exactly once.
 */
export const ARTIFACT_KINDS = [
  // structured genealogy
  "person",
  "relationship",
  "event",
  "place",
  // source evidence (raw) vs conclusion (researcher synthesis)
  "source_evidence",
  "source_conclusion",
  // media / binary
  "photo",
  "scan",
  "document_file",
  "audio",
  "video",
  // reusable research context packs
  "place_research",
  "era_research",
  // loose / unstructured -> contextItems
  "note",
  "journal_excerpt",
  "oral_history",
  "transcript",
  "newspaper_clipping",
  "image_note",
  "research_snippet",
  "research_question",
  "conflict_note",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface ArtifactRoute {
  kind: ArtifactKind;
  label: string;
  /** Agent-facing "use this when…" guidance. */
  description: string;
  targetTable: ContextTargetTable;
  /** Intended landing mutation/endpoint. */
  writeTool: string;
  /** Is the write path live TODAY? false = needs roadmap work (see plannedPhase). */
  available: boolean;
  plannedPhase?: string;
  defaultEvidenceRole: EvidenceRole;
  /** Privacy-by-default invariant — always these three values. */
  privacyDefault: "private";
  reviewDefault: "unreviewed";
  aiUseDefault: false;
  requiredFields: string[];
  linkTargets: LinkTarget[];
  /** Loose material can be promoted (by a human) into these structured kinds. */
  promotesTo: ArtifactKind[];
  /** Carries a binary blob (file/image/audio) — needs _storage upload (Phase 3). */
  hasBinary: boolean;
}

function route(r: ArtifactRoute): ArtifactRoute {
  return r;
}

export const ARTIFACT_ROUTES: Record<ArtifactKind, ArtifactRoute> = {
  person: route({
    kind: "person",
    label: "Person",
    description: "A human (ancestor or relative). Names, sex, living status, embedded birth/death.",
    targetTable: "persons",
    writeTool: "vaultMutations.upsertPerson",
    available: true,
    defaultEvidenceRole: "researcher_conclusion",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["name"],
    linkTargets: ["place"],
    promotesTo: [],
    hasBinary: false,
  }),
  relationship: route({
    kind: "relationship",
    label: "Relationship",
    description: "A Person↔Person link (Couple, ParentChild, etc.) with optional marriage/divorce facts.",
    targetTable: "relationships",
    writeTool: "vaultMutations.upsertRelationship",
    available: true,
    defaultEvidenceRole: "researcher_conclusion",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["type", "person1", "person2"],
    linkTargets: ["person", "place"],
    promotesTo: [],
    hasBinary: false,
  }),
  event: route({
    kind: "event",
    label: "Event",
    description: "A life or record event (census, baptism, residence, occupation, military, etc.).",
    targetTable: "events",
    writeTool: "vaultMutations.upsertEvent",
    available: true,
    defaultEvidenceRole: "researcher_conclusion",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["type"],
    linkTargets: ["person", "place"],
    promotesTo: [],
    hasBinary: false,
  }),
  place: route({
    kind: "place",
    label: "Place",
    description: "A hierarchical, temporally-aware place (country/state/county/city/parish/address).",
    targetTable: "places",
    writeTool: "vaultMutations.upsertPlace",
    available: true,
    defaultEvidenceRole: "researcher_conclusion",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["name", "type"],
    linkTargets: ["place"],
    promotesTo: [],
    hasBinary: false,
  }),
  source_evidence: route({
    kind: "source_evidence",
    label: "Source evidence (raw)",
    description:
      "Raw data extracted from a record (census line, certificate, obituary). Lands as a source + citation(isEvidence:true) + candidate sourceFacts that NEVER overwrite canonical facts.",
    targetTable: "citations",
    writeTool: "vaultMutations.upsertSourceWithCitation",
    available: true,
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["sourceTitle", "sourceType", "extractedText"],
    linkTargets: ["person", "event", "place"],
    promotesTo: [],
    hasBinary: false,
  }),
  source_conclusion: route({
    kind: "source_conclusion",
    label: "Source conclusion",
    description: "A researcher's interpretation that combines multiple sources (citation isEvidence:false).",
    targetTable: "citations",
    writeTool: "vaultMutations.upsertSourceWithCitation",
    available: true,
    defaultEvidenceRole: "researcher_conclusion",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["sourceTitle"],
    linkTargets: ["person", "event", "place"],
    promotesTo: [],
    hasBinary: false,
  }),
  photo: route({
    kind: "photo",
    label: "Photo",
    description: "A photograph of a person, group, place, or artifact.",
    targetTable: "media",
    writeTool: "vaultMutations.upsertMedia",
    available: true,
    plannedPhase: "Binary file upload (Convex _storage) lands in Phase 3; metadata rows are writable now.",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title"],
    linkTargets: ["person", "source"],
    promotesTo: [],
    hasBinary: true,
  }),
  scan: route({
    kind: "scan",
    label: "Scanned document",
    description: "A scan/photo of a record document (certificate, register page, letter).",
    targetTable: "media",
    writeTool: "vaultMutations.upsertMedia",
    available: true,
    plannedPhase: "Binary file upload (Convex _storage) lands in Phase 3; metadata rows are writable now.",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title"],
    linkTargets: ["person", "source"],
    promotesTo: ["source_evidence"],
    hasBinary: true,
  }),
  document_file: route({
    kind: "document_file",
    label: "Document file",
    description: "An uploaded document file (PDF/scan) kept as media.",
    targetTable: "media",
    writeTool: "vaultMutations.upsertMedia",
    available: true,
    plannedPhase: "Binary file upload (Convex _storage) lands in Phase 3; metadata rows are writable now.",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title"],
    linkTargets: ["person", "source"],
    promotesTo: ["source_evidence"],
    hasBinary: true,
  }),
  audio: route({
    kind: "audio",
    label: "Audio",
    description: "An audio recording (oral history interview, voice memo).",
    targetTable: "media",
    writeTool: "vaultMutations.upsertMedia",
    available: true,
    plannedPhase: "Binary file upload (Convex _storage) lands in Phase 3; metadata rows are writable now.",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title"],
    linkTargets: ["person"],
    promotesTo: ["oral_history"],
    hasBinary: true,
  }),
  video: route({
    kind: "video",
    label: "Video",
    description: "A video recording.",
    targetTable: "media",
    writeTool: "vaultMutations.upsertMedia",
    available: true,
    plannedPhase: "Binary file upload (Convex _storage) lands in Phase 3; metadata rows are writable now.",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title"],
    linkTargets: ["person"],
    promotesTo: [],
    hasBinary: true,
  }),
  place_research: route({
    kind: "place_research",
    label: "Place research pack",
    description: "Reusable researched context about a locality (daily life, institutions, migration).",
    targetTable: "historicalContext",
    writeTool: "vaultMutations.upsertHistoricalContext",
    available: true,
    defaultEvidenceRole: "background_context",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "timePeriod", "topic"],
    linkTargets: ["place"],
    promotesTo: [],
    hasBinary: false,
  }),
  era_research: route({
    kind: "era_research",
    label: "Era research pack",
    description: "Reusable researched context about a time period/region (war, economy, customs).",
    targetTable: "historicalContext",
    writeTool: "vaultMutations.upsertHistoricalContext",
    available: true,
    defaultEvidenceRole: "background_context",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "timePeriod", "topic"],
    linkTargets: ["place"],
    promotesTo: [],
    hasBinary: false,
  }),
  note: route({
    kind: "note",
    label: "Note",
    description: "A free-form research note or family memory tied to a person.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItemForPerson",
    available: true,
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "place", "event"],
    promotesTo: ["source_evidence"],
    hasBinary: false,
  }),
  journal_excerpt: route({
    kind: "journal_excerpt",
    label: "Journal / diary excerpt",
    description: "An excerpt from a personal journal or diary, with who wrote it and when it happened.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` field + upsertContextItem (Phase 3).",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "place", "event"],
    promotesTo: ["source_evidence"],
    hasBinary: false,
  }),
  oral_history: route({
    kind: "oral_history",
    label: "Oral history",
    description: "A transcribed oral history / interview, attributed to a narrator.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` field + upsertContextItem (Phase 3).",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "place"],
    promotesTo: ["source_evidence"],
    hasBinary: false,
  }),
  transcript: route({
    kind: "transcript",
    label: "Transcript",
    description: "A verbatim transcript of a document or recording.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` field + upsertContextItem (Phase 3).",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "source"],
    promotesTo: ["source_evidence"],
    hasBinary: false,
  }),
  newspaper_clipping: route({
    kind: "newspaper_clipping",
    label: "Newspaper clipping",
    description: "A newspaper article or obituary (transcribed text + optional clipping image).",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` field + binary _storage (Phase 3).",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "place", "source"],
    promotesTo: ["source_evidence"],
    hasBinary: true,
  }),
  image_note: route({
    kind: "image_note",
    label: "Image annotation",
    description: "A caption/annotation for a photo or scan, linked to its media row.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` + mediaId link field (Phase 3).",
    defaultEvidenceRole: "raw_material",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person"],
    promotesTo: [],
    hasBinary: false,
  }),
  research_snippet: route({
    kind: "research_snippet",
    label: "Research snippet",
    description: "A short research clue or finding to follow up on.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItemForPerson",
    available: true,
    defaultEvidenceRole: "lead_or_hint",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "place"],
    promotesTo: ["source_evidence"],
    hasBinary: false,
  }),
  research_question: route({
    kind: "research_question",
    label: "Research question",
    description: "An open question to investigate for a person or family line.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` field (Phase 3).",
    defaultEvidenceRole: "lead_or_hint",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "place"],
    promotesTo: [],
    hasBinary: false,
  }),
  conflict_note: route({
    kind: "conflict_note",
    label: "Conflict note",
    description: "A note describing conflicting evidence between sources, to resolve.",
    targetTable: "contextItems",
    writeTool: "vaultMutations.upsertContextItem",
    available: false,
    plannedPhase: "Needs the contextItems `kind` field (Phase 3).",
    defaultEvidenceRole: "lead_or_hint",
    privacyDefault: "private",
    reviewDefault: "unreviewed",
    aiUseDefault: false,
    requiredFields: ["title", "content"],
    linkTargets: ["person", "source"],
    promotesTo: [],
    hasBinary: false,
  }),
};

export function getArtifactRoute(kind: ArtifactKind): ArtifactRoute {
  return ARTIFACT_ROUTES[kind];
}

export function listArtifactRoutes(): ArtifactRoute[] {
  return ARTIFACT_KINDS.map((kind) => ARTIFACT_ROUTES[kind]);
}

/**
 * The machine-readable document served at `/context-schema`. This is the
 * "what type of thing goes where" contract an external AI agent reads before
 * storing anything.
 */
export function buildContextSchemaDocument() {
  return {
    name: "Assist With Family History — Context Store Taxonomy",
    version: TAXONOMY_VERSION,
    audience: "ai-agents",
    summary:
      "Classify each piece of family-history material into one of these kinds and store it in the named target surface. You (the agent) acquire data from external sites and own those access decisions; this platform stores, organizes, and helps you tell the story.",
    invariants: [
      "Privacy by default: everything you store lands private + unreviewed + not-AI-usable until a human reviews it.",
      "Evidence vs conclusion: store raw record data as source_evidence; it becomes a confirmed fact only when a human promotes it.",
      "Living people and private notes are protected and withheld from AI/public surfaces.",
      "Sign-in required: all writes are scoped to exactly one owner's vault.",
    ],
    kinds: listArtifactRoutes(),
  };
}
