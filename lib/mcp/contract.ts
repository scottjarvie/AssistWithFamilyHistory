export const FAMILY_HISTORY_MCP_TOOL_NAMES = [
  "get_family_history_brief",
  "search_family_history",
  "get_family_history_context",
  "save_person",
  "save_relationship",
  "save_event",
  "save_source_evidence",
  "save_research_work",
  "save_story_work",
  "save_complete_result",
  "get_queue",
  "update_queue",
] as const;

export type FamilyHistoryMcpToolName = (typeof FAMILY_HISTORY_MCP_TOOL_NAMES)[number];

export const FAMILY_HISTORY_MCP_LIMITS = {
  requestBytes: 256 * 1024,
  searchLimit: 50,
  searchScanPerType: 250,
  briefRows: 12,
  contextRows: 50,
  completeResultRowsPerKind: 10,
  /** family_history_save_records — one source page's worth of work, per kind. */
  batchPeople: 50,
  batchRelationships: 50,
  batchEvents: 50,
  batchEvidence: 20,
  batchStories: 10,
  /** family_history_get_evidence — protected delivery budget. */
  evidenceItems: 10,
  evidencePerItemBytes: 2 * 1024 * 1024,
  evidenceTotalBytes: 6 * 1024 * 1024,
  /** Client ID Metadata Document fetch ceiling. */
  clientMetadataBytes: 32 * 1024,
  operationId: 160,
  recordKey: 128,
  shortText: 500,
  notes: 4_000,
  story: 60_000,
  resultJson: 100_000,
} as const;

export type McpMachineErrorCode =
  | "AUTH_REQUIRED"
  // Product-grant codes. OAuth identity is not product authority: these say so
  // in machine-readable form and each carries a `recovery` that tells the AI to
  // ask the person, not to retry harder.
  | "GRANT_REQUIRED"
  | "GRANT_REVOKED"
  | "GRANT_EXPIRED"
  | "SCOPE_NOT_GRANTED"
  | "OUTSIDE_GRANT_BOUNDARY"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "STALE_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "RESULT_TOO_LARGE"
  | "INTERNAL_ERROR";

export class FamilyHistoryMcpError extends Error {
  constructor(
    public readonly code: McpMachineErrorCode,
    message: string,
    public readonly recovery: string,
  ) {
    super(message);
    this.name = "FamilyHistoryMcpError";
  }

  serialize() {
    return { code: this.code, message: this.message, recovery: this.recovery };
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashMcpInput(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function assertMcpToolContract(): void {
  if (new Set(FAMILY_HISTORY_MCP_TOOL_NAMES).size !== FAMILY_HISTORY_MCP_TOOL_NAMES.length) {
    throw new Error("Family History MCP tool names must be unique");
  }
  if (!FAMILY_HISTORY_MCP_TOOL_NAMES.includes("save_complete_result")) {
    throw new Error("Family History MCP requires a one-call complete-result save");
  }
  if (FAMILY_HISTORY_MCP_TOOL_NAMES.some((name) => /delete|publish|invite|export/.test(name))) {
    throw new Error("The first Family History MCP surface must not expose destructive or public actions");
  }
}
