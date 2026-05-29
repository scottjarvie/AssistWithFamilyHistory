/**
 * Agent API scope vocabulary (resource:action).
 *
 * A key's scopes decide what it may ATTEMPT. The existing domain gates
 * (publishSafety, requireHumanReviewConfirmation, the agent-quality gate, the
 * three-gate privacy predicates) still decide what SUCCEEDS — a scope is
 * necessary but never sufficient for an irreversible action.
 *
 * Pure module (no Node/Convex imports) so it can be used from the Next server,
 * Convex, tests, and the served capability manifest alike.
 */
export const SCOPES = [
  // reads
  "people:read",
  "context:read",
  "stats:read",
  "documents:read",
  "queue:read",
  "stories:read",
  // guarded writes
  "context:write",
  "checks:write",
  "tasks:write",
  "stories:draft",
  "stories:edit",
  "stories:request_review",
  "intake:validate",
  "intake:merge",
  "media:review",
  // trusted / irreversible (still gated by domain checks)
  "stories:publish",
  "provisional:resolve",
] as const;

export type Scope = (typeof SCOPES)[number];

export const READ_SCOPES: Scope[] = [
  "people:read",
  "context:read",
  "stats:read",
  "documents:read",
  "queue:read",
  "stories:read",
];

export const SCOPE_PRESETS = {
  read_only_assistant: [...READ_SCOPES],
  research_operator: [...READ_SCOPES, "context:write", "checks:write", "tasks:write"],
  story_writer: [...READ_SCOPES, "stories:draft", "stories:edit", "stories:request_review"],
  capture_agent: [...READ_SCOPES, "intake:validate", "intake:merge"],
  trusted_operator: [...SCOPES],
} satisfies Record<string, Scope[]>;

export type ScopePreset = keyof typeof SCOPE_PRESETS;

export const SCOPE_TIER: Record<ScopePreset, "free" | "standard" | "trusted"> = {
  read_only_assistant: "free",
  research_operator: "standard",
  story_writer: "standard",
  capture_agent: "standard",
  trusted_operator: "trusted",
};

export function isScopePreset(value: string): value is ScopePreset {
  return Object.prototype.hasOwnProperty.call(SCOPE_PRESETS, value);
}

export function presetScopes(preset: ScopePreset): Scope[] {
  return [...SCOPE_PRESETS[preset]];
}

export function isValidScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/** Keep only recognized scopes (drops anything unknown). */
export function sanitizeScopes(values: readonly string[]): Scope[] {
  return values.filter(isValidScope);
}

export function hasScope(granted: readonly string[], required: Scope): boolean {
  return granted.includes(required);
}
