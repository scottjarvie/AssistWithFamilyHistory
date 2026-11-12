import {siteDefaults} from "../media/siteDefaults";
import { EVIDENCE_RELAY_BODY_BYTES,EVIDENCE_PART_BYTES } from "../media/evidenceStandard";
import { AI_STORAGE_NOTE, formatBytes } from "../../convex/lib/usageLimits/core";
/**
 * Family History MCP catalog — PURE DATA, no Convex imports.
 *
 * This module is the single source of truth consumed by:
 *   - the MCP transport (`convex/httpRoutes/mcp.ts`) for registration and
 *     scope-filtered discovery,
 *   - the grant/consent surface (`convex/mcpGrants.ts` and the connection
 *     centre UI) for plain-language scope labels,
 *   - `/ai.txt` for the published tool list, and
 *   - `scripts/check-mcp-contract.ts` plus the vitest suites for parity.
 *
 * It deliberately imports nothing from `convex/` so a person-facing surface can
 * read it without pulling the server runtime in.
 */

/* ------------------------------------------------------------------ scopes */

/**
 * The hard server-side ceiling. A grant may hold a subset of these and nothing
 * else; anything above them has no tool and no code path.
 */
export const FAMILY_HISTORY_SCOPES = [
  "family_history:context:read",
  "family_history:evidence:read",
  "family_history:evidence:write",
  "family_history:research:write",
  "family_history:story:draft",
  "family_history:queue:read",
  "family_history:queue:work",
  "family_history:records:archive",
  "family_history:queue:suggest",
] as const;

export type FamilyHistoryScope = (typeof FAMILY_HISTORY_SCOPES)[number];

export function isFamilyHistoryScope(value: string): value is FamilyHistoryScope {
  return (FAMILY_HISTORY_SCOPES as readonly string[]).includes(value);
}

/** Drop anything outside the ceiling and de-duplicate, preserving ceiling order. */
export function clampToScopeCeiling(scopes: readonly string[]): FamilyHistoryScope[] {
  const requested = new Set(scopes);
  return FAMILY_HISTORY_SCOPES.filter((scope) => requested.has(scope));
}

export type ScopeInfo = {
  scope: FamilyHistoryScope;
  /** Person-facing name shown on the consent screen. */
  label: string;
  /** What approving this actually lets the AI do, in plain language. */
  grants: string;
  /** Whether approving it lets the AI change anything. */
  writes: boolean;
  /** The boundary that still holds after approval. */
  limit: string;
};

export const FAMILY_HISTORY_SCOPE_INFO: readonly ScopeInfo[] = [
 {scope:"family_history:queue:suggest",label:"Propose suggestions",grants:"Propose work ideas in the person’s private Queue.",writes:true,limit:"Only the person accepts or dismisses. The AI may withdraw its own suggestion before the person acts."},
  {
    scope: "family_history:context:read",
    label: "Read your research context",
    grants:
      "Read bounded briefs, search summaries, and the details of people, sources, events, stories, and research notes inside the boundary you choose.",
    writes: false,
    limit:
      "No files or images, no changes, no living-person private notes, and nothing outside the record boundary you choose.",
  },
  {
    scope: "family_history:evidence:read",
    label: "Open your reviewed evidence files",
    grants:
      "Receive the contents of source files, images, and person documents that you have already marked reviewed and allowed for AI use.",
    writes: false,
    limit:
      "Only reviewed, AI-allowed, unrestricted items inside your boundary. Delivered through this connection — the AI never receives a storage link it could share or scrape.",
  },
  {
    scope: "family_history:evidence:write",
    label: "Place new evidence in your private review queue",
    grants:
      "Upload an attributed image into private evidence storage and leave it unreviewed for you to inspect.",
    writes: true,
    limit:
      "Upload only. It cannot review rights, approve AI use, accept extracted dates or locations, change conclusions, share, or publish. Provider URLs are never returned.",
  },
  {
    scope: "family_history:research:write",
    label: "Save proposed research findings",
    grants:
      "Save people, relationships, events, sources, citations, candidate facts, and research tasks or findings as proposed work you can review.",
    writes: true,
    limit:
      "Proposals only. It cannot accept a conclusion for you, merge identities, publish, delete, or export anything.",
  },
  {
    scope: "family_history:story:draft",
    label: "Write and publish stories",
    grants:
      "Create, correct, publish or unpublish stories, including unlisted links.",
    writes: true,
    limit: "Draft, edit, publish or unpublish stories. Scrub sensitive information before publishing; secrets are refused and contact details get one count summary and one batch acknowledgement, accepted on the first call. Remove only the person’s own private details; business contacts are expected. Unpublishing needs only an active connection.",
  },
  {
    scope: "family_history:queue:read",
    label: "See the work you assigned",
    grants: "List and open the Queue directives you assigned to a chosen AI.",
    writes: false,
    limit:
      "Reading Queue work does not grant any permission over the records that work mentions.",
  },
  {
    scope: "family_history:queue:work",
    label: "Work the Queue items you assigned",
    grants:
      "Claim assigned Queue work, checkpoint progress, ask you a question, complete it, or report an honest failure.",
    writes: true,
    limit:
      "Only items you explicitly assigned to a chosen AI. Changing records still needs its own permission above.",
  },
  { scope: "family_history:records:archive", label: "Archive and restore research records", writes: true,
    grants: "Move records into Archive and recover them, preserving their evidence and AI attribution.",
    limit: "Reversible only. Never permanently deletes or purges records or files; public restoration repeats publishing checks; restoreAsPrivate recovers without public exposure." },
];

/* ---------------------------------------------------------- the never lists */

/**
 * Capabilities that have no tool in this surface at all. Nothing in the catalog
 * may implement them, and no grant can turn them on.
 */
export const NEVER_EXPOSED: readonly string[] = [
  "Raw storage URLs or signed file links for private media",
  "Another vault owner's records, in any form, including their existence",
  "Living-person private notes in broad discovery",
  "Whole-vault export or bulk download",
  "Provider sessions, cookies, credentials, or access tokens",
  "Internal record tables, schema dumps, or raw database access",
];

export const NEVER_PERMITTED: readonly string[] = [
  "Exporting the vault",
  "Permanently deleting anything",
  "Merging or splitting person identities",
  "Inviting new people or changing another person’s access",
  "Acting on FamilySearch or any other outside provider",
  "Billing, account, or subscription changes",
];

/* ------------------------------------------------------------------- tools */

export type ConditionalScope = {
  /** Top-level input key whose presence pulls in an extra required scope. */
  whenInputHas: string;
  whenInputEquals?: string;
  scope: FamilyHistoryScope;
  /** Why the extra permission is needed, for the refusal message. */
  because: string;
};

export type CatalogTool = {
  /** Canonical, product-namespaced name. */
  name: string;
  /**
   * Pre-namespace name kept registered on the SAME handler so a client that
   * connected before the rename keeps working. Deprecated, never removed
   * without a real sunset decision.
   */
  alias?: string;
  requiredScope: FamilyHistoryScope;
  /** Exposure reduction only: active grant and ownership suffice. */
  activeGrantOnly?: boolean;
  /** Extra scopes required only when the call carries certain input. */
  conditionalScopes?: readonly ConditionalScope[];
  writes: boolean;
  title: string;
  /** Model-facing description. Says what it does and when to reach for it. */
  description: string;
  /** Person-facing one-liner for the connection centre. */
  humanSummary: string;
  /** "module.function" so a reader can check the claim against real code. */
  implementedBy: string;
  deprecatedAlias?: boolean;
  sunsetNote?: string;
};

const ALIAS_SUNSET =
  "Deprecated alias kept for clients that connected before Family History namespacing. It resolves to the same handler and the same scope. Prefer the family_history_* name; the alias will be sunset only after connected clients are observed to have refreshed.";

export const FAMILY_HISTORY_TOOLS: readonly CatalogTool[] = [
  { name: "family_history_archive_record", requiredScope: "family_history:records:archive", writes: true,
    title: "Archive or restore a record", description: "Move a record into Archive or restore it. This is a reversible soft delete; never purges records, files or evidence. Use context to read updatedAt first. Restoring a public item repeats publishing checks, including current publish power. Use restoreAsPrivate: true to recover without exposing it.",
    humanSummary: "Archives or restores a research record without permanently deleting it.", implementedBy: "convex/mcpFamilyHistory.archiveRecord" },
  {
    name: "family_history_get_brief",
    alias: "get_family_history_brief",
    requiredScope: "family_history:context:read",
    writes: false,
    title: "Get Family History brief",
    description:
      "FIRST CALL. Return a bounded map of recent people, stories, open research, findings, and Queue work inside the boundary this connection was granted.",
    humanSummary: "Reads a short summary of your recent research.",
    implementedBy: "convex/mcpFamilyHistory.getBrief",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_search",
    alias: "search_family_history",
    requiredScope: "family_history:context:read",
    writes: false,
    title: "Search Family History",
    description:
      "Search bounded owner-scoped summaries across people, sources, places, topics, stories, research tasks/findings, and events. Hydrate a returned stable ID before editing.",
    humanSummary: "Searches your research for matching people, sources, and notes.",
    implementedBy: "convex/mcpFamilyHistory.search",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_get_context",
    alias: "get_family_history_context",
    requiredScope: "family_history:context:read",
    writes: false,
    title: "Get Family History context",
    description:
      "Hydrate one person, story, source, source_content, place, topic, event, relationship, research task, or research finding. A source comes back with its original content (each labelled with who made it), the people as the record names them, its claims and connections; a long text is cut and can be read whole as kind source_content. Living-person notes stay withheld and only reviewed AI-allowed loose context and media metadata are included.",
    humanSummary: "Opens the full detail of one record you allowed.",
    implementedBy: "convex/mcpFamilyHistory.getRecordContext",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_get_evidence",
    requiredScope: "family_history:evidence:read",
    writes: false,
    title: "Get Family History evidence",
    description:
      "BATCH. Ask for up to 10 evidence items at once by {kind,id} and receive the reviewed, AI-allowed ones as content blocks. Anything not delivered comes back in `skipped` with an exact reason and what to do. Never ask the person for a storage link; this is the only supported way to see a private file.",
    humanSummary: "Receives the contents of files you marked reviewed and AI-allowed.",
    implementedBy: "convex/mcpEvidence.getEvidenceBatch",
  },
  {
    name: "family_history_begin_evidence_upload",
    requiredScope: "family_history:evidence:write",
    writes: true,
    title: "Begin a private evidence upload",
    description:
      "Authorize one replay-safe upload for a person inside this connection's boundary: a JPEG, PNG or WebP photo up to " + formatBytes(siteDefaults.image) + " by default (display copies are made; read uploadFileCaps.image from family_history_get_brief for the current limit), or an original kept exact with no copies up to " + formatBytes(siteDefaults.original) + " by default (read uploadFileCaps.original from family_history_get_brief for the current limit; PDF such as a scanned book, TIFF scan, HEIC/HEIF photo, MP3/M4A/WAV recording, or plain-text transcription). Pass sourceId to file it inside the Source it belongs to. Returns a short-lived PUT capability on the Family History upload relay, never a private storage URL; a file over " + formatBytes(EVIDENCE_RELAY_BODY_BYTES) + " comes back with upload.mode \"parts\" and one URL per " + formatBytes(EVIDENCE_PART_BYTES) + " part, which you PUT in any order and may re-send. Supply the exact byte length and SHA-256 of the whole file, then call family_history_finish_evidence_upload with the same operationId and uploadRef. A single-file PUT URL is one attempt: after a failed transfer, repeat begin with exactly the same operationId and content in the original connection for a fresh URL; the old URL stays consumed. If upload.alreadyUploaded is true, skip PUT and finish. An active attempt cannot be replaced. If a storage response is uncertain, retry adopts an already-stored original without writing another version; if it has not appeared, keep the original and wait for the existing upload to expire before beginning a new operation. Multipart parts may still be re-sent while open; wait for part requests to return before finishing. Only the original connection may retry or finish, and its current permission is checked again. " + AI_STORAGE_NOTE,
    humanSummary: "Starts a private, checksum-bound evidence upload for your review.",
    implementedBy: "convex/mediaEvidenceStorage.beginMcpEvidenceUpload",
  },
  {
    name: "family_history_finish_evidence_upload",
    requiredScope: "family_history:evidence:write",
    writes: true,
    title: "Finish a private evidence upload",
    description:
      "Join any uploaded parts, verify the exact bytes against the declared length and SHA-256, create metadata-clean viewing copies for photos, extract camera date and GPS only as reversible private proposals, and leave the result Private, unreviewed, rights-unknown, and unavailable to future AI reads until the person approves it. " + AI_STORAGE_NOTE,
    humanSummary: "Verifies an upload and places it in your private review queue.",
    implementedBy: "convex/mediaEvidenceStorage.finishMcpEvidenceUpload",
  },
  {
    name: "family_history_save_person",
    alias: "save_person",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Save person",
    description:
      "Replay-safely create one person or optimistically correct an existing one. Name, sex, living and dates can be corrected only on a person an AI created; for a person the owner entered or imported, propose the change as a candidate source fact. For more than a couple of people, prefer family_history_save_records.",
    humanSummary: "Adds or corrects one person.",
    implementedBy: "convex/mcpFamilyHistory.savePerson",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_save_relationship",
    alias: "save_relationship",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Save relationship",
    description:
      "Replay-safely create or optimistically correct one direct person-to-person relationship with optional dated facts. Both people must already belong to this vault.",
    humanSummary: "Adds or corrects one relationship between two people.",
    implementedBy: "convex/mcpFamilyHistory.saveRelationship",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_save_event",
    alias: "save_event",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Save event",
    description:
      "Replay-safely create or optimistically correct one event and add or update its person roles. Omitted roles are not removed.",
    humanSummary: "Adds or corrects one event and who took part in it.",
    implementedBy: "convex/mcpFamilyHistory.saveEvent",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_save_source_evidence",
    alias: "save_source_evidence",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Save source evidence",
    description:
      "Save a source plus one citation, target links, and candidate or conflicting source facts in one replay-safe call. Only the person accepts a fact, and evidence never overwrites a person's canonical conclusions.",
    humanSummary: "Records a source, a citation, and the facts it supports.",
    implementedBy: "convex/mcpFamilyHistory.saveSourceEvidence",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_save_research_work",
    alias: "save_research_work",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Save research work",
    description:
      "Create or correct a research task, a durable research finding, or both. Record blocked and uncertain outcomes honestly instead of omitting them. Research tasks are record-level research steps, not Queue suggestions. Put your own ideas for new work in family_history_add_queue with addedBy ai_suggestion.",
    humanSummary: "Records a research task or a finding, including dead ends.",
    implementedBy: "convex/mcpFamilyHistory.saveResearchWork",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_save_story_work",
    alias: "save_story_work",
    requiredScope: "family_history:story:draft",
    writes: true,
    title: "Save story work",
    description:
      "Create or edit a story; move a draft into review before publishing. Publishing and edits to public stories repeat the living-person/readiness and second-review gates. Unpublish with family_history_unpublish_story, which needs only an active grant. Set status published and publicIndexing noindex for unlisted, or index for public. Remove the person’s own private details first; business contacts are expected. Contact details get one batch count summary; acknowledgeContactDetails: { emails, phones, addresses } covers the whole batch, also accepted on the first call. Secrets cannot be overridden. All changes are attributed to your AI and recorded in history.",
    humanSummary: "Writes, publishes or unpublishes a story.",
    implementedBy: "convex/mcpFamilyHistory.saveStoryWork",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_unpublish_story",
    requiredScope: "family_history:story:draft",
    activeGrantOnly: true,
    writes: true,
    title: "Unpublish a story",
    description: "Unpublish one of this person's stories by setting it to a private draft. Requires only an active connection, not the story or publish power. Pass the storyId and current expectedUpdatedAt. Cannot edit content or publish anything.",
    humanSummary: "Takes a story out of public view without changing its content.",
    implementedBy: "convex/mcpFamilyHistory.unpublishStory",
  },
  {
    name: "family_history_save_records",
    requiredScope: "family_history:research:write",
    conditionalScopes: [
      {
        whenInputHas: "stories",
        scope: "family_history:story:draft",
        because: "the batch includes story writing or publishing",
      },
    ],
    writes: true,
    title: "Save Family History records in one batch",
    description:
      "BATCH, PREFERRED FOR REAL SOURCES. One call, one approval, one transaction, per-item results. Store the ORIGINAL first: each evidence item can carry the record's own content (contents: indexed fields, transcription, extract, full text, translation; each says who made it) and the people exactly as the record names them (personas, with role and every field as written). Claims (facts) quote originalText and may name the personaKey they were read from. Save places (countries down to a church, cemetery, farm or house; nest them with parentCreateKey), topics (a religion, ceremony, custom, occupation, migration, war, community) and typed connections in the same call. Any place reference may use placeCreateKey; relationship, event, persona and connection items may name records created earlier in the SAME call by createKey. Your own interpretation goes in a content of kind ai_reading or in family_history_save_research_work, never in place of the original. Links you propose (persona to person, connections) stay proposed until the person accepts them. A row that fails comes back as status \"failed\" with a reason; the rest of the pass is still saved. For publishing stories, remove the person’s own private details; business contacts are expected. Secrets refuse. One top-level acknowledgeContactDetails count object covers the whole publishing batch and may be sent on the first call.",
    humanSummary:
      "Saves a whole source's worth of proposed records at once, telling you exactly which rows worked.",
    implementedBy: "convex/mcpFamilyHistory.saveRecords",
  },
  {
    name: "family_history_add_source_content",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Add original content to a source",
    description:
      "Append a transcription, translation, extract, full text, indexed fields, or your own ai_reading to a source that already exists. Append-only: earlier content is never changed. To correct one, add a new content with supersedesId; both stay readable so any later AI can compare.",
    humanSummary: "Adds a transcription, translation, or AI reading beside a source's original, never over it.",
    implementedBy: "convex/mcpFamilyHistory.addSourceContent",
  },
  {
    name: "family_history_save_complete_result",
    alias: "save_complete_result",
    requiredScope: "family_history:research:write",
    conditionalScopes: [
      {
        whenInputHas: "stories",
        scope: "family_history:story:draft",
        because: "the result includes story drafts",
      },
    ],
    writes: true,
    title: "Save one complete Family History result",
    description:
      "ATOMIC ALTERNATIVE. Save one finished research pass all-or-nothing: optional person correction, relationships, events, source evidence, task/finding state, and story work including publication or unpublication. Remove the person’s own private details before publishing; business contacts are expected. Secrets refuse. One top-level acknowledgeContactDetails exact count object covers the whole batch and is accepted on the first call. Any single failure discards the whole call. Use family_history_save_records instead when you would rather keep the rows that succeeded and see exactly which ones did not.",
    humanSummary: "Saves one finished research pass, all of it or none of it.",
    implementedBy: "convex/mcpFamilyHistory.saveCompleteResult",
    sunsetNote: ALIAS_SUNSET,
  },
  {name:"family_history_add_queue",alias:"add_queue",requiredScope:"family_history:queue:work",conditionalScopes:[{whenInputHas:"addedBy",whenInputEquals:"ai_suggestion",scope:"family_history:queue:suggest",because:"the AI is raising its own idea"}],writes:true,title:"Add to Queue",description:"Add work the person requested with addedBy ai_on_request, or your own idea with addedBy ai_suggestion and a reason. Missing addedBy is refused. Suggestions need Propose suggestions power and cannot be worked until the person accepts. Optional options, evidence and fromRecord preserve context.",humanSummary:"Adds requested work or a private AI suggestion.",implementedBy:"convex/queue.agentAddQueueItem",sunsetNote:ALIAS_SUNSET},
  {name:"family_history_withdraw_suggestion",alias:"withdraw_suggestion",requiredScope:"family_history:queue:work",writes:true,title:"Withdraw your own suggestion",description:"Withdraw only your own open suggestion before the person has acted. Never accept, dismiss or edit-accept.",humanSummary:"Withdraws an untouched suggestion raised by this connection.",implementedBy:"convex/queue.agentWithdrawSuggestion",sunsetNote:ALIAS_SUNSET},
  {
    name: "family_history_get_queue",
    alias: "get_queue",
    requiredScope: "family_history:queue:read",
    writes: false,
    title: "Get Family History Queue",
    description:
      "List a bounded page of Queue directives assigned to a chosen AI, or hydrate one item and its attributable activity. Queue context does not grant domain-record authority.",
    humanSummary: "Reads Queue work and this connection’s own suggestions.",
    implementedBy: "convex/queue.agentListQueueItems",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_update_queue",
    alias: "update_queue",
    requiredScope: "family_history:queue:work",
    writes: true,
    title: "Update Family History Queue",
    description:
      "Claim, checkpoint, pause for the person, complete, or report failure for work assigned to the OAuth chosen-AI identity. Needs your input is a flag: asking keeps the state and releases your claim and lease; only the person can answer or clear it, including after Answered. Archive/restore also require the existing archive power; you cannot archive any flagged item. Requires the exact current version and a replay-safe operation ID. When completing saved work, include signed-in product paths such as /app/people/{id} and /app/stories/{id} in resultRefs.",
    humanSummary: "Moves the work you assigned through its states.",
    implementedBy: "convex/queue.agentClaimQueueItem",
    sunsetNote: ALIAS_SUNSET,
  },
];

/** Canonical names, in catalog order. */
export const FAMILY_HISTORY_CANONICAL_TOOL_NAMES = FAMILY_HISTORY_TOOLS.map((tool) => tool.name);

/** Grant-governed workflow names, canonical then aliases. Permission-free connection controls are listed separately below. */
export const FAMILY_HISTORY_ALL_TOOL_NAMES = [
  ...FAMILY_HISTORY_CANONICAL_TOOL_NAMES,
  ...FAMILY_HISTORY_TOOLS.flatMap((tool) => (tool.alias ? [tool.alias] : [])),
];

const BY_NAME = new Map<string, CatalogTool>();
for (const tool of FAMILY_HISTORY_TOOLS) {
  BY_NAME.set(tool.name, tool);
  if (tool.alias) BY_NAME.set(tool.alias, tool);
}

/** Resolve a canonical name or a compatibility alias to the same catalog entry. */
export function findTool(name: string): CatalogTool | undefined {
  return BY_NAME.get(name);
}

/** Power grouping for a known tool. activeGrantOnly tools do not require it. */
export function scopeForTool(name: string): FamilyHistoryScope | null {
  return BY_NAME.get(name)?.requiredScope ?? null;
}

export function isAlias(name: string): boolean {
  const tool = BY_NAME.get(name);
  return Boolean(tool && tool.alias === name);
}

/* ------------------------------------------------------- contract assertion */

/**
 * Structural invariants of the catalog. Called by `scripts/check-mcp-contract.ts`
 * (wired into `pnpm verify`) and by the vitest parity suite.
 */
export function assertFamilyHistoryCatalogContract(): void {
  const forbidden = /delete|publish|invite|export|merge|share/i;

  const seen = new Set<string>();
  for (const name of FAMILY_HISTORY_ALL_TOOL_NAMES) {
    if (seen.has(name)) throw new Error(`Duplicate Family History MCP tool name: ${name}`);
    seen.add(name);
  }

  for (const tool of FAMILY_HISTORY_TOOLS) {
    if (!tool.name.startsWith("family_history_")) {
      throw new Error(`Canonical tool must be Family History namespaced: ${tool.name}`);
    }
    if (tool.name !== "family_history_unpublish_story" && forbidden.test(tool.name)) {
      throw new Error(`Tool name implies an action outside the scope ceiling: ${tool.name}`);
    }
    if (tool.activeGrantOnly && tool.name !== "family_history_unpublish_story") throw new Error("Only unpublishing may bypass removed powers");
    if (!isFamilyHistoryScope(tool.requiredScope)) {
      throw new Error(`Tool ${tool.name} requires a scope outside the ceiling`);
    }
    // A read scope must never be able to change anything.
    if (tool.writes && tool.requiredScope.endsWith(":read")) {
      throw new Error(`Tool ${tool.name} writes but only requires a read scope`);
    }
    if (!tool.writes && tool.conditionalScopes?.length) {
      throw new Error(`Read-only tool ${tool.name} must not carry conditional write scopes`);
    }
    for (const conditional of tool.conditionalScopes ?? []) {
      if (!isFamilyHistoryScope(conditional.scope)) {
        throw new Error(`Tool ${tool.name} names a conditional scope outside the ceiling`);
      }
    }
    if (!/^[a-zA-Z0-9_/.]+\.[a-zA-Z0-9_]+$/.test(tool.implementedBy)) {
      throw new Error(`Tool ${tool.name} must name its implementation as module.function`);
    }
    if (tool.alias && !tool.sunsetNote) {
      throw new Error(`Alias ${tool.alias} must carry a sunset note`);
    }
  }

  // Every scope in the ceiling must be reachable and explained.
  for (const scope of FAMILY_HISTORY_SCOPES) {
    if (!FAMILY_HISTORY_SCOPE_INFO.some((info) => info.scope === scope)) {
      throw new Error(`Scope ${scope} has no person-facing consent copy`);
    }
    const usedBy = FAMILY_HISTORY_TOOLS.filter((tool) => tool.requiredScope === scope || tool.conditionalScopes?.some(conditional=>conditional.scope===scope));
    if (usedBy.length === 0) throw new Error(`Scope ${scope} grants no tool and must not exist`);
    const info = FAMILY_HISTORY_SCOPE_INFO.find((entry) => entry.scope === scope)!;
    if (info.writes !== usedBy.some((tool) => tool.writes)) {
      throw new Error(`Scope ${scope} mislabels whether it lets an AI change anything`);
    }
  }

  if (FAMILY_HISTORY_SCOPE_INFO.length !== FAMILY_HISTORY_SCOPES.length) {
    throw new Error("Scope consent copy must cover the ceiling exactly");
  }

  if (!BY_NAME.has("family_history_save_records")) {
    throw new Error("Family History MCP requires a batch-first save");
  }
  if (!BY_NAME.has("family_history_save_complete_result")) {
    throw new Error("Family History MCP requires an atomic complete-result save");
  }
  if (NEVER_EXPOSED.length === 0 || NEVER_PERMITTED.length === 0) {
    throw new Error("The never-lists must stay published");
  }
}

/** Connection controls have no domain permission and remain available after shutdown. */
export const FAMILY_HISTORY_CONTROL_TOOLS = [
  { name: "family_history_connection", title: "Inspect this AI connection", humanSummary: "Shows this connection's state, revision, tools, withheld powers, end date and Settings link." },
  { name: "family_history_limit_connection", title: "Limit this AI connection", humanSummary: "Removes powers, shortens an end date, pauses or revokes this connection. Never widens; requires revision and opId." },
] as const;
