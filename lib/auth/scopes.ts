/**
 * Agent API scope vocabulary (resource:action) + presets + tiers.
 *
 * Aligned to the Jarvie cross-project "Shared Agent API Operating Model":
 *   - Shared public tier names: Trial, Standard, Trusted (+ Admin/Operator as a
 *     ROLE, not a self-serve tier — see lib/auth/admin.ts).
 *   - Presets are product-JOBS first ("Read-only assistant", "Story writer", …);
 *     raw scopes are the advanced view.
 *
 * A key's scopes decide what it may ATTEMPT. The existing domain gates
 * (publishSafety, requireHumanReviewConfirmation, the agent-quality gate, the
 * three-gate privacy predicates) still decide what SUCCEEDS.
 *
 * Pure module (no Node/Convex imports) — usable from Next, Convex, tests, and
 * the served capability manifest alike.
 */
export const SCOPES = [
  // reads
  "people:read",
  "context:read",
  "stats:read",
  "documents:read",
  "queue:read",
  "stories:read",
  // Queue handoff commands. These mutate only Queue continuity state; they do
  // not grant permission to change genealogy records, publish, merge, or delete.
  "queue:claim",
  "queue:update",
  "queue:complete",
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
  // admin / operator (also requires the admin role — lib/auth/admin.ts)
  "admin:keys",
  "admin:usage",
] as const;

export type Scope = (typeof SCOPES)[number];

export const API_KEY_TIERS = ["trial", "standard", "trusted"] as const;
export type ApiKeyTier = (typeof API_KEY_TIERS)[number];

export const READ_SCOPES: Scope[] = [
  "people:read",
  "context:read",
  "stats:read",
  "documents:read",
  "queue:read",
  "stories:read",
];

const NON_ADMIN_SCOPES: Scope[] = SCOPES.filter((scope) => !scope.startsWith("admin:"));

/**
 * Product-job presets (the shared-model "API Center" vocabulary). `key` is the
 * stable id stored/queried; `label`/`description` are the user-facing copy.
 * `admin: true` presets additionally require the admin role to actually use.
 */
export interface ScopePresetDef {
  key: string;
  label: string;
  description: string;
  scopes: Scope[];
  tier: ApiKeyTier;
  admin?: boolean;
}

export const SCOPE_PRESETS_META: ScopePresetDef[] = [
  {
    key: "read_only_assistant",
    label: "Read-only assistant",
    description: "Read your people, context packs, stories, and research queue. Makes no changes.",
    scopes: [...READ_SCOPES],
    tier: "trial",
  },
  {
    key: "research_operator",
    label: "Research operator",
    description: "Reads, plus work a bounded Queue handoff, add research notes, update research checks, and create tasks (review-gated).",
    scopes: [
      ...READ_SCOPES,
      "queue:claim",
      "queue:update",
      "queue:complete",
      "context:write",
      "checks:write",
      "tasks:write",
    ],
    tier: "standard",
  },
  {
    key: "story_writer",
    label: "Story writer",
    description: "Reads, plus draft/edit stories and request review. Cannot publish public stories.",
    scopes: [...READ_SCOPES, "stories:draft", "stories:edit", "stories:request_review"],
    tier: "standard",
  },
  {
    key: "import_agent",
    label: "Import agent",
    description: "Reads, plus validate and merge capture packages you provide. No provider crawling.",
    scopes: [...READ_SCOPES, "intake:validate", "intake:merge"],
    tier: "standard",
  },
  {
    key: "trusted_operator",
    label: "Trusted operator",
    description: "Everything above, plus publish and identity-graph merges — still human-confirmed at the gate.",
    scopes: [...NON_ADMIN_SCOPES],
    tier: "trusted",
  },
  {
    key: "admin_security",
    label: "Admin / security tool",
    description: "Operator key management and usage/abuse review. Requires the admin role on your account.",
    scopes: [...SCOPES],
    tier: "trusted",
    admin: true,
  },
];

const PRESET_BY_KEY: Record<string, ScopePresetDef> = Object.fromEntries(
  SCOPE_PRESETS_META.map((preset) => [preset.key, preset]),
);

export type ScopePreset = string;

export function isScopePreset(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRESET_BY_KEY, value);
}

export function presetScopes(preset: string): Scope[] {
  return PRESET_BY_KEY[preset] ? [...PRESET_BY_KEY[preset].scopes] : [];
}

export function presetTier(preset: string): ApiKeyTier {
  return PRESET_BY_KEY[preset]?.tier ?? "standard";
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

const TRUSTED_SCOPES = new Set<string>(["stories:publish", "provisional:resolve"]);

/** Derive the tier implied by a raw scope set (used when scopes are custom). */
export function tierForScopes(scopes: readonly string[]): ApiKeyTier {
  if (scopes.some((scope) => TRUSTED_SCOPES.has(scope))) return "trusted";
  if (scopes.some((scope) => scope.includes(":") && !scope.endsWith(":read"))) return "standard";
  return "trial";
}

export function scopesRequireAdmin(scopes: readonly string[]): boolean {
  return scopes.some((scope) => scope.startsWith("admin:"));
}
