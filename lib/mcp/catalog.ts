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
  "family_history:research:write",
  "family_history:story:draft",
  "family_history:queue:read",
  "family_history:queue:work",
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
    scope: "family_history:research:write",
    label: "Save proposed research findings",
    grants:
      "Save people, relationships, events, sources, citations, candidate facts, and research tasks or findings as proposed work you can review.",
    writes: true,
    limit:
      "Proposals only. It cannot accept a conclusion for you, settle a conflict between two records, merge identities, publish, delete, or export anything.",
  },
  {
    scope: "family_history:story:draft",
    label: "Write private story drafts",
    grants:
      "Create and correct private story drafts and move a draft to your review queue.",
    writes: true,
    limit: "Draft and review only. It can never publish or edit a published story.",
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
  // AWF-0046: an AI may flag a conflict and propose an answer with evidence.
  // Deciding which record to believe is the researcher's judgment call, and is
  // enforced in convex/mcpFamilyHistory.ts via mayAiSetSourceFactStatus.
  "Settling a conflict between two records — flagging one and proposing an answer is allowed",
  "Archiving or restoring records",
  "Exporting the vault",
  "Permanently deleting anything",
  "Publishing a story or any other public action",
  "Merging or splitting person identities",
  "Granting, changing, or removing sharing and access",
  "Acting on FamilySearch or any other outside provider",
  "Billing, account, or subscription changes",
];

/* ------------------------------------------------------------------- tools */

export type ConditionalScope = {
  /** Top-level input key whose presence pulls in an extra required scope. */
  whenInputHas: string;
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
      "Search bounded owner-scoped summaries across people, sources, stories, research tasks/findings, and events. Hydrate a returned stable ID before editing.",
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
      "Hydrate one person, story, source, event, relationship, research task, or research finding. Living-person notes stay withheld and only reviewed AI-allowed loose context and media metadata are included.",
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
    name: "family_history_save_person",
    alias: "save_person",
    requiredScope: "family_history:research:write",
    writes: true,
    title: "Save person",
    description:
      "Replay-safely create one person or optimistically correct an existing one. For more than a couple of people, prefer family_history_save_records.",
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
      "Save a source plus one citation, target links, and candidate/accepted/conflicting source facts in one replay-safe call. Evidence never silently overwrites a person's canonical conclusions. You may FLAG a conflict by saving a fact with status \"conflict\", and you may keep working on a conflicting fact, but you may not take one out of conflict — deciding which record to believe is the person's call. Propose your answer, with the evidence on both sides, on the conflict_resolution research task via family_history_save_research_work.",
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
      "Create or correct a research task, a durable research finding, or both. Record blocked and uncertain outcomes honestly instead of omitting them.",
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
      "Create or optimistically correct a private draft, or move it to human review. This surface cannot publish or edit a published story.",
    humanSummary: "Writes or corrects a private story draft.",
    implementedBy: "convex/mcpFamilyHistory.saveStoryWork",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_save_records",
    requiredScope: "family_history:research:write",
    conditionalScopes: [
      {
        whenInputHas: "stories",
        scope: "family_history:story:draft",
        because: "the batch includes story drafts",
      },
    ],
    writes: true,
    title: "Save Family History records in one batch",
    description:
      "BATCH, PREFERRED FOR REAL SOURCES. One call, one approval, one transaction, per-item results. Use this when a single source touches several people at once — a census page, a family group sheet, a ship manifest. Relationship and event items may name a person created in the SAME call by its createKey (person1CreateKey, person2CreateKey, personRoles[].personCreateKey). A row that fails comes back as status \"failed\" with a reason; the rest of the pass is still saved. Use family_history_save_complete_result instead when the pass must be all-or-nothing.",
    humanSummary:
      "Saves a whole source's worth of proposed records at once, telling you exactly which rows worked.",
    implementedBy: "convex/mcpFamilyHistory.saveRecords",
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
      "ATOMIC ALTERNATIVE. Save one finished research pass all-or-nothing: optional person correction, relationships, events, source evidence, task/finding state, and private story work. Any single failure discards the whole call. Use family_history_save_records instead when you would rather keep the rows that succeeded and see exactly which ones did not.",
    humanSummary: "Saves one finished research pass, all of it or none of it.",
    implementedBy: "convex/mcpFamilyHistory.saveCompleteResult",
    sunsetNote: ALIAS_SUNSET,
  },
  {
    name: "family_history_get_queue",
    alias: "get_queue",
    requiredScope: "family_history:queue:read",
    writes: false,
    title: "Get Family History Queue",
    description:
      "List a bounded page of Queue directives assigned to a chosen AI, or hydrate one item and its attributable activity. Queue context does not grant domain-record authority.",
    humanSummary: "Reads the work you assigned to your AI.",
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
      "Claim, checkpoint, pause for the person, complete, or report failure for work assigned to the OAuth chosen-AI identity. Requires the exact current version and a replay-safe operation ID. When completing saved work, include signed-in product paths such as /app/people/{id} and /app/stories/{id} in resultRefs.",
    humanSummary: "Moves the work you assigned through its states.",
    implementedBy: "convex/queue.agentClaimQueueItem",
    sunsetNote: ALIAS_SUNSET,
  },
];

/** Canonical names, in catalog order. */
export const FAMILY_HISTORY_CANONICAL_TOOL_NAMES = FAMILY_HISTORY_TOOLS.map((tool) => tool.name);

/** Every name a client may legally call: canonical first, then aliases. */
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

/** The scope a name needs, or null when the name is not in the catalog at all. */
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
  const forbidden = /delete|publish|invite|export|merge|archive|restore|share/i;

  const seen = new Set<string>();
  for (const name of FAMILY_HISTORY_ALL_TOOL_NAMES) {
    if (seen.has(name)) throw new Error(`Duplicate Family History MCP tool name: ${name}`);
    seen.add(name);
  }

  for (const tool of FAMILY_HISTORY_TOOLS) {
    if (!tool.name.startsWith("family_history_")) {
      throw new Error(`Canonical tool must be Family History namespaced: ${tool.name}`);
    }
    if (forbidden.test(tool.name)) {
      throw new Error(`Tool name implies an action outside the scope ceiling: ${tool.name}`);
    }
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
    const usedBy = FAMILY_HISTORY_TOOLS.filter((tool) => tool.requiredScope === scope);
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
