/**
 * The one Family History MCP authorizer — PURE, no Convex imports.
 *
 * The same function decides `tools/list` (discovery filtering) and
 * `tools/call`. There is no `else { allowed: true }` path anywhere in this
 * file: every return is either an explicit permit for one named tool or a
 * refusal.
 *
 * Two rules this file exists to keep:
 *
 *   1. A call is allowed when ONE single active grant permits it entirely.
 *      Scopes are never summed across grants. `resolveGrantForRequest` in
 *      `convex/mcpGrants.ts` therefore hands this function exactly one grant.
 *   2. No refusal may reveal whether a record, a tool, or another owner
 *      exists. An unknown tool name and a tool the grant does not cover
 *      produce the identical message, and a boundary refusal is decided
 *      before any record lookup happens.
 */

import {
  FAMILY_HISTORY_TOOLS,
  findTool,
  type CatalogTool,
  type FamilyHistoryScope,
} from "./catalog";
import type { McpMachineErrorCode } from "./contract";

export type GrantBoundaryKind = "whole_workspace" | "selected_people" | "queue_only";

export type GrantBoundary = {
  kind: GrantBoundaryKind;
  personIds?: string[];
  queueItemIds?: string[];
};

export type GrantStatus = "pending" | "active" | "revoked" | "expired" | "denied";

/**
 * Everything the authorizer is allowed to know about a grant. Deliberately
 * plain data so the same decision can be replayed in a test or re-checked
 * inside a mutation.
 */
export type ResolvedGrant = {
  grantId: string;
  clientId: string;
  issuer: string;
  scopes: FamilyHistoryScope[];
  boundary: GrantBoundary;
  expiresAt?: number;
};

export type GrantResolution =
  | { state: "active"; grant: ResolvedGrant }
  | { state: "absent" }
  | { state: "pending" }
  | { state: "revoked" }
  | { state: "expired" }
  | { state: "denied" };

export type AccessRefusal = {
  allowed: false;
  code: McpMachineErrorCode;
  message: string;
  recovery: string;
};

export type AccessPermit = {
  allowed: true;
  tool: CatalogTool;
};

export type AccessDecision = AccessPermit | AccessRefusal;

/**
 * Where a person actually approves a connection. Every refusal points here, so
 * it has to be the real route: signed-in surfaces live under `/app` per the
 * app's navigation contract, and `/settings/ai` redirects here for anyone who
 * types the shorter form.
 */
export const CONNECTION_SETTINGS_URL = "https://assistwithfamilyhistory.com/app/settings/ai";

/**
 * One keyed refusal dictionary. Every entry says what happened AND what to do,
 * and none of them names a record, an owner, or a tool that may or may not
 * exist.
 */
export const GRANT_REFUSALS: Record<string, AccessRefusal> = {
  GRANT_REQUIRED: {
    allowed: false,
    code: "GRANT_REQUIRED",
    message:
      "This AI connection has not been approved for Assist With Family History yet. Signing in proved who the person is; it did not decide what this connection may do.",
    recovery: `Ask the person to open ${CONNECTION_SETTINGS_URL}, find this connection in the pending list, choose which parts of their research it may use, and approve it. Then retry. Do not retry in a loop while you wait.`,
  },
  GRANT_PENDING: {
    allowed: false,
    code: "GRANT_REQUIRED",
    message:
      "This AI connection is waiting for the person to approve it. A request is already recorded; a second one was not created.",
    recovery: `Ask the person to open ${CONNECTION_SETTINGS_URL} and approve or deny this connection, then retry once they say they have.`,
  },
  GRANT_REVOKED: {
    allowed: false,
    code: "GRANT_REVOKED",
    message: "The person turned this AI connection off.",
    recovery: `Stop calling Family History tools. If the person wants to reconnect, they can approve a new connection at ${CONNECTION_SETTINGS_URL}.`,
  },
  GRANT_DENIED: {
    allowed: false,
    code: "GRANT_REVOKED",
    message: "The person declined this AI connection.",
    recovery: `Stop calling Family History tools and do not create another request. The person can change their mind at ${CONNECTION_SETTINGS_URL}.`,
  },
  GRANT_EXPIRED: {
    allowed: false,
    code: "GRANT_EXPIRED",
    message: "This AI connection's approval has run out.",
    recovery: `Ask the person to renew or re-approve the connection at ${CONNECTION_SETTINGS_URL}, then retry.`,
  },
  SCOPE_NOT_GRANTED: {
    allowed: false,
    code: "SCOPE_NOT_GRANTED",
    message: "This connection is not permitted to use that Family History tool.",
    recovery: `Use only the tools returned by tools/list for this connection. If the work genuinely needs more, tell the person in plain language what you would do with it and ask them to widen the connection at ${CONNECTION_SETTINGS_URL}.`,
  },
  OUTSIDE_GRANT_BOUNDARY: {
    allowed: false,
    code: "OUTSIDE_GRANT_BOUNDARY",
    message:
      "That request is outside the part of the research this connection was approved for.",
    recovery: `Stay inside the records this connection already returned. If the person wants you to work somewhere else, ask them to widen the boundary at ${CONNECTION_SETTINGS_URL}.`,
  },
};

function refusal(key: keyof typeof GRANT_REFUSALS): AccessRefusal {
  return { ...GRANT_REFUSALS[key] };
}

/** Map a non-active grant resolution onto its refusal. */
export function refusalForResolution(resolution: GrantResolution): AccessRefusal | null {
  switch (resolution.state) {
    case "active":
      return null;
    case "pending":
      return refusal("GRANT_PENDING");
    case "revoked":
      return refusal("GRANT_REVOKED");
    case "denied":
      return refusal("GRANT_DENIED");
    case "expired":
      return refusal("GRANT_EXPIRED");
    case "absent":
    default:
      return refusal("GRANT_REQUIRED");
  }
}

/**
 * Expiry is decided here, in code, at read time. A token lifetime is never
 * trusted to end a grant.
 */
export function isGrantExpired(grant: { expiresAt?: number }, now: number): boolean {
  return typeof grant.expiresAt === "number" && grant.expiresAt <= now;
}

/* -------------------------------------------------------- record boundaries */

export type NamedRecords = {
  personIds: string[];
  queueItemIds: string[];
  /**
   * True when the call names records this layer cannot attribute to a person.
   * Under a `selected_people` boundary that is refused rather than guessed at.
   */
  unattributable: boolean;
};

function pushId(target: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) target.push(value.trim());
}

/**
 * Pull every record id a call names out of its own input. This is deliberately
 * shallow and literal: it reads the caller's arguments, never the database, so
 * a boundary refusal cannot double as an existence oracle.
 */
export function namedRecordsInInput(toolName: string, input: unknown): NamedRecords {
  const found: NamedRecords = { personIds: [], queueItemIds: [], unattributable: false };
  // Untyped by design: this reads whatever the caller sent, before validation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = (input ?? {}) as Record<string, any>;
  const tool = findTool(toolName);
  if (!tool) return found;

  switch (tool.name) {
    case "family_history_get_context": {
      if (args.kind === "person") pushId(found.personIds, args.id);
      else found.unattributable = true;
      break;
    }
    case "family_history_get_evidence": {
      // Item ids are media/document ids, which only the database can attribute
      // to a person. This layer therefore names nothing, and `convex/mcpEvidence.ts`
      // re-checks the boundary item by item, skipping each one it cannot place
      // inside the grant. Refusing the whole call here would make a batch
      // useless the moment one item was out of bounds.
      break;
    }
    case "family_history_save_person": {
      pushId(found.personIds, args.personId);
      break;
    }
    case "family_history_save_relationship": {
      pushId(found.personIds, args.person1);
      pushId(found.personIds, args.person2);
      if (args.mode === "update") found.unattributable = true;
      break;
    }
    case "family_history_save_event": {
      for (const role of Array.isArray(args.personRoles) ? args.personRoles : []) {
        pushId(found.personIds, role?.personId);
      }
      if (args.mode === "update") found.unattributable = true;
      break;
    }
    case "family_history_save_source_evidence": {
      for (const link of Array.isArray(args.links) ? args.links : []) {
        if (link?.targetType === "person") pushId(found.personIds, link?.targetId);
        else found.unattributable = true;
      }
      for (const fact of Array.isArray(args.facts) ? args.facts : []) {
        pushId(found.personIds, fact?.personId);
      }
      break;
    }
    case "family_history_save_research_work": {
      pushId(found.personIds, args.task?.personId);
      if (args.finding?.entityType === "person") pushId(found.personIds, args.finding?.entityId);
      else if (args.finding?.entityId) found.unattributable = true;
      break;
    }
    case "family_history_save_story_work": {
      pushId(found.personIds, args.personId);
      if (args.mode === "update") found.unattributable = true;
      break;
    }
    case "family_history_save_records":
    case "family_history_save_complete_result": {
      pushId(found.personIds, args.personId);
      pushId(found.personIds, args.person?.personId);
      for (const person of Array.isArray(args.people) ? args.people : []) {
        pushId(found.personIds, person?.personId);
      }
      for (const relationship of Array.isArray(args.relationships) ? args.relationships : []) {
        pushId(found.personIds, relationship?.person1);
        pushId(found.personIds, relationship?.person2);
        if (relationship?.mode === "update") found.unattributable = true;
      }
      for (const event of Array.isArray(args.events) ? args.events : []) {
        for (const role of Array.isArray(event?.personRoles) ? event.personRoles : []) {
          pushId(found.personIds, role?.personId);
        }
        if (event?.mode === "update") found.unattributable = true;
      }
      for (const evidence of Array.isArray(args.evidence) ? args.evidence : []) {
        for (const link of Array.isArray(evidence?.links) ? evidence.links : []) {
          if (link?.targetType === "person") pushId(found.personIds, link?.targetId);
          else found.unattributable = true;
        }
        for (const fact of Array.isArray(evidence?.facts) ? evidence.facts : []) {
          pushId(found.personIds, fact?.personId);
        }
      }
      for (const story of Array.isArray(args.stories) ? args.stories : []) {
        pushId(found.personIds, story?.personId);
        if (story?.mode === "update") found.unattributable = true;
      }
      if (args.research) {
        pushId(found.personIds, args.research?.task?.personId);
        if (args.research?.finding?.entityType === "person") {
          pushId(found.personIds, args.research.finding.entityId);
        } else if (args.research?.finding?.entityId) {
          found.unattributable = true;
        }
      }
      break;
    }
    case "family_history_get_queue":
    case "family_history_update_queue": {
      pushId(found.queueItemIds, args.queueItemId);
      break;
    }
    default:
      break;
  }
  return found;
}

function boundaryPermits(
  tool: CatalogTool,
  boundary: GrantBoundary,
  named: NamedRecords,
): boolean {
  const isQueueTool = tool.requiredScope.startsWith("family_history:queue:");

  if (boundary.kind === "queue_only") {
    if (!isQueueTool) return false;
    const allowed = boundary.queueItemIds ?? [];
    if (allowed.length === 0) return true;
    return named.queueItemIds.every((id) => allowed.includes(id));
  }

  if (boundary.kind === "selected_people") {
    if (isQueueTool) {
      const allowed = boundary.queueItemIds ?? [];
      if (allowed.length === 0) return true;
      return named.queueItemIds.every((id) => allowed.includes(id));
    }
    // Refuse anything this layer cannot attribute to an approved person rather
    // than letting a selected-people grant be walked sideways into the rest of
    // the vault. `whole_workspace` is the grant for broad reading.
    if (named.unattributable) return false;
    const allowed = boundary.personIds ?? [];
    if (named.personIds.length === 0) return true;
    return named.personIds.every((id) => allowed.includes(id));
  }

  // whole_workspace: still bounded by scope, still bounded by owner, and still
  // subject to every never-list. Queue item ids may narrow it further.
  if (isQueueTool && (boundary.queueItemIds?.length ?? 0) > 0) {
    return named.queueItemIds.every((id) => boundary.queueItemIds!.includes(id));
  }
  return true;
}

/* ------------------------------------------------------------- the decision */

/**
 * Decide one tool interaction. `input` is omitted for discovery and supplied
 * for a call, so the same predicate answers both questions.
 */
export function decideToolAccess(params: {
  toolName: string;
  resolution: GrantResolution;
  now: number;
  input?: unknown;
}): AccessDecision {
  const { toolName, resolution, now, input } = params;

  const grantRefusal = refusalForResolution(resolution);
  if (grantRefusal) return grantRefusal;

  const grant = (resolution as { state: "active"; grant: ResolvedGrant }).grant;

  // Expiry is filtered here at read time, never inferred from token lifetime.
  if (isGrantExpired(grant, now)) return refusal("GRANT_EXPIRED");

  const tool = findTool(toolName);
  // An unknown tool name and a known tool this grant does not cover are the
  // same refusal on purpose: a caller must not be able to probe the catalog.
  if (!tool) return refusal("SCOPE_NOT_GRANTED");
  if (!grant.scopes.includes(tool.requiredScope)) return refusal("SCOPE_NOT_GRANTED");

  if (input !== undefined) {
    const args = (input ?? {}) as Record<string, unknown>;
    for (const conditional of tool.conditionalScopes ?? []) {
      const value = args[conditional.whenInputHas];
      const present = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
      if (present && !grant.scopes.includes(conditional.scope)) return refusal("SCOPE_NOT_GRANTED");
    }
    if (!boundaryPermits(tool, grant.boundary, namedRecordsInInput(tool.name, input))) {
      return refusal("OUTSIDE_GRANT_BOUNDARY");
    }
  } else if (
    grant.boundary.kind === "queue_only" &&
    !tool.requiredScope.startsWith("family_history:queue:")
  ) {
    // Discovery must not advertise a tool this boundary can never satisfy.
    return refusal("OUTSIDE_GRANT_BOUNDARY");
  }

  return { allowed: true, tool };
}

/** The tools one grant may see. Used verbatim for `tools/list`. */
export function permittedTools(resolution: GrantResolution, now: number): CatalogTool[] {
  if (resolution.state !== "active") return [];
  const permitted: CatalogTool[] = [];
  for (const tool of FAMILY_HISTORY_TOOLS) {
    const decision = decideToolAccess({ toolName: tool.name, resolution, now });
    if (decision.allowed) permitted.push(decision.tool);
  }
  return permitted;
}

/**
 * The Queue principal scopes a grant produces. Replaces the previously
 * hard-coded full Queue scope set: read-only grants get a read-only principal.
 */
export function queueScopesForGrant(scopes: readonly FamilyHistoryScope[]): string[] {
  const queueScopes: string[] = [];
  if (scopes.includes("family_history:queue:read") || scopes.includes("family_history:queue:work")) {
    queueScopes.push("queue:read");
  }
  if (scopes.includes("family_history:queue:work")) {
    queueScopes.push("queue:claim", "queue:update", "queue:complete");
  }
  return queueScopes;
}
