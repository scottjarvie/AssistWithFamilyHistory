/**
 * Family History MCP product grants.
 *
 * OAuth proves *who* is calling. This module answers *what the person allowed*,
 * which is a different question and the one that actually protects a vault.
 *
 * The transport resolves a grant on EVERY HTTP request. That is deliberate:
 * the Streamable HTTP transport is stateless, so each JSON-RPC message is its
 * own request, and re-resolving per request is what makes revocation
 * immediate. An already-issued Clerk access token stops mattering the moment
 * the grant leaves `active` — we never wait for the JWT to expire.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { authorizeTenantAction, authorizeTenantMutation, type TrustBoundaryShadowEntry } from "./access";
import { internal } from "./_generated/api";
import {
  FAMILY_HISTORY_SCOPES,
  FAMILY_HISTORY_SCOPE_INFO,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
  clampToScopeCeiling,
  findTool,
  type FamilyHistoryScope,
} from "../lib/mcp/catalog";
import {
  decideToolAccess,
  isGrantExpired,
  type GrantResolution,
  type ResolvedGrant,
} from "../lib/mcp/authorize";

import { effectiveScopes, effectiveScopeChoice, effectiveExpiry, hasAutomaticLegacyExpiry, chosenExpiry } from "../lib/mcp/grantDefaults";

/** Skip the last-used write when the same tool ran again inside this window. */
const USE_TOUCH_THROTTLE_MS = 15_000;

const boundaryValidator = v.object({
  kind: v.union(
    v.literal("whole_workspace"),
    v.literal("selected_people"),
    v.literal("queue_only"),
  ),
  personIds: v.optional(v.array(v.string())),
  queueItemIds: v.optional(v.array(v.string())),
});

function machineError(code: string, message: string, recovery: string): never {
  throw new Error(`MCP_FAMILY_HISTORY_ERROR:${JSON.stringify({ code, message, recovery })}`);
}

function trimmed(value: string | undefined | null, max: number): string | undefined {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function toResolvedGrant(row: Doc<"mcpGrants">): ResolvedGrant {
  return {
    grantId: String(row._id),
    clientId: row.clientId,
    issuer: row.issuer,
    scopes: effectiveScopes(row),
    scopeChoice: effectiveScopeChoice(row),
    boundary: {
      kind: row.boundary.kind,
      personIds: row.boundary.personIds,
      queueItemIds: row.boundary.queueItemIds,
    },
    expiresAt: effectiveExpiry(row),
  };
}

/* ------------------------------------------------------------- consent copy */

/**
 * Exactly what the person is shown at approval, frozen onto the grant. A later
 * catalog edit must never be able to rewrite what somebody agreed to.
 */
export function buildConsentSnapshot(input: {
  scopes: FamilyHistoryScope[];
  boundary: Doc<"mcpGrants">["boundary"];
  expiresAt?: number;
  label: string;
  observedClientName?: string;
  clientId: string;
  clientProvenance: string;
  /** "sign_in" when signing in was the approval rather than the settings page. */
  approvedBy?: "settings" | "sign_in";
}) {
  return JSON.stringify({
    shownAt: Date.now(),
    approvedBy: input.approvedBy ?? "settings",
    connectionLabel: input.label,
    clientId: input.clientId,
    observedClientName: input.observedClientName ?? null,
    clientProvenance: input.clientProvenance,
    clientNameIsClientSupplied:
      "The name above is what the software called itself. It is a label, not proof of identity.",
    scopes: input.scopes.map((scope) => {
      const info = FAMILY_HISTORY_SCOPE_INFO.find((entry) => entry.scope === scope)!;
      return { scope, label: info.label, grants: info.grants, writes: info.writes, limit: info.limit };
    }),
    boundary: {
      kind: input.boundary.kind,
      personCount: input.boundary.personIds?.length ?? null,
      queueItemCount: input.boundary.queueItemIds?.length ?? null,
    },
    scopeChoice: FAMILY_HISTORY_SCOPES.every((scope) => input.scopes.includes(scope)) ? "full" : "chosen",
    fullAccessIncludesFutureTools: FAMILY_HISTORY_SCOPES.every((scope) => input.scopes.includes(scope)),
    expiryChoice: input.expiresAt === undefined ? "none" : "chosen",
    expiresAt: input.expiresAt ?? null,
    neverExposed: NEVER_EXPOSED,
    neverPermitted: NEVER_PERMITTED,
  });
}

/* ---------------------------------------------------- per-request resolution */

// Read the entire bounded owner/client/issuer history or refuse; a truncated
// history must never let an older approval escape revocation.
const MAX_CLIENT_GRANTS = 256;

async function grantsForClient(ctx: QueryCtx | MutationCtx, owner: string, clientId: string, issuer: string) {
  const rows = await ctx.db
    .query("mcpGrants")
    .withIndex("by_owner_client_issuer", (q) => q.eq("vaultOwnerId", owner).eq("clientId", clientId).eq("issuer", issuer))
    .take(MAX_CLIENT_GRANTS + 1);
  if (rows.length > MAX_CLIENT_GRANTS) {
    machineError("GRANT_REQUIRED", "This connection has too much approval history to safely authorize.",
      "Stop calling Family History tools. Ask the person to review this connection in Settings and contact support.");
  }
  return rows;
}

/*
 * Grant history is ordered by events, latest event wins:
 *  - an approval happens at its consent time (never `updatedAt`, which use
 *    tracking bumps — old usage must never make an old approval look new);
 *  - a refusal (revoked or denied) happens at its decision time.
 * A refusal is final for every approval at or before it. Only an explicit
 * approval strictly after it can govern again; ties go to the refusal.
 */
function approvalTime(row: Doc<"mcpGrants">): number {
  return row.consentedAt ?? row.issuedAt ?? row._creationTime;
}

function isRefusal(row: Doc<"mcpGrants">): boolean {
  return row.status === "revoked" || row.status === "denied";
}

function refusalTime(row: Doc<"mcpGrants">): number {
  return Math.max(row.revokedAt ?? row.updatedAt, approvalTime(row));
}

/** An expired-status row that still authorizes (legacy automatic or no end date). */
function isUsableExpired(row: Doc<"mcpGrants">): boolean {
  return row.status === "expired" && (hasAutomaticLegacyExpiry(row) || row.expiryChoice === "none");
}

// Consent order, then insertion order, then ID: resolution and revocation must
// choose exactly the same row, including legacy approvals with tied timestamps.
function newestApprovalFirst(a: Doc<"mcpGrants">, b: Doc<"mcpGrants">): number {
  return approvalTime(b) - approvalTime(a)
    || b._creationTime - a._creationTime
    || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0);
}

function latestRefusalFirst(a: Doc<"mcpGrants">, b: Doc<"mcpGrants">): number {
  return refusalTime(b) - refusalTime(a)
    || b._creationTime - a._creationTime
    || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0);
}

/** The most recent refusal in this owner/client/issuer history, if any. */
function latestRefusal(rows: Doc<"mcpGrants">[]): Doc<"mcpGrants"> | undefined {
  return rows.filter(isRefusal).sort(latestRefusalFirst)[0];
}

/** True when a refusal at or after this approval closes it, whatever its own status says. */
function refusedByHistory(rows: Doc<"mcpGrants">[], row: Doc<"mcpGrants">): Doc<"mcpGrants"> | undefined {
  if (isRefusal(row)) return row;
  const refusal = latestRefusal(rows.filter((other) => other._id !== row._id));
  return refusal && refusalTime(refusal) >= approvalTime(row) ? refusal : undefined;
}

/**
 * The one approval that governs this history: the newest approval (active or
 * expired, usable or ended) after the latest refusal. An ended newest approval
 * still governs — it means "expired", never a fall back to an older approval.
 */
function governingApproval(rows: Doc<"mcpGrants">[]): Doc<"mcpGrants"> | undefined {
  const refusal = latestRefusal(rows);
  const cutoff = refusal ? refusalTime(refusal) : -Infinity;
  return rows
    .filter((row) => (row.status === "active" || row.status === "expired") && approvalTime(row) > cutoff)
    .sort(newestApprovalFirst)[0];
}

/** Whether a governing approval authorizes right now. */
function authorizesNow(row: Doc<"mcpGrants">, now: number): boolean {
  return row.status === "active" ? !isGrantExpired(row, now) : isUsableExpired(row);
}

/** A new explicit approval must land strictly after every refusal it supersedes. */
function explicitApprovalTime(rows: Doc<"mcpGrants">[], now: number): number {
  const refusal = latestRefusal(rows);
  return refusal ? Math.max(now, refusalTime(refusal) + 1) : now;
}

/**
 * Resolve the single grant that governs this request. Never sums scopes across
 * grants: exactly one active grant is returned, or a refusal state.
 */
export const resolveForRequest = internalMutation({
  args: {
    issuer: v.string(),
    subject: v.string(),
    clientId: v.string(),
    observedClientName: v.optional(v.string()),
    clientProvenance: v.optional(
      v.union(v.literal("cimd"), v.literal("dcr"), v.literal("manual")),
    ),
    clientMetadataUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GrantResolution> => {
    const owner = args.subject.trim();
    const clientId = args.clientId.trim();
    if (!owner || !clientId || !args.issuer.trim()) return { state: "absent" };
    const now = Date.now();

    const rows = await grantsForClient(ctx, owner, clientId, args.issuer);

    // Latest event wins. A person's own "no" stands over every approval at or
    // before it — including older active duplicates left by legacy one-row
    // revocations. Only an explicit approval strictly after it governs again.
    const closed = latestRefusal(rows);

    // One approval governs the request: the newest one after that refusal,
    // whether active, legacy usable-expired, or ended. Older approvals never
    // take over from a newer one, and scopes are never combined.
    const governing = governingApproval(rows);
    if (governing) {
      return authorizesNow(governing, now) ? { state: "active", grant: toResolvedGrant(governing) } : { state: "expired" };
    }

    // A denied or turned-off connection is never reopened by signing in
    // again. They reconnect from settings.
    if (closed) {
      // A new attempt reveals the refusal in settings for explicit reapproval.
      // It never changes status, scopes, boundary, expiry, or the consent receipt.
      if (closed.hiddenAt !== undefined) await ctx.db.patch(closed._id, { hiddenAt: undefined });
      return { state: closed.status as "denied" | "revoked" };
    }

    // Signing in grants every current and future tool, with no end date.
    // Existing explicit/ambiguous expiries are never renewed by signing in.
    const label = trimmed(args.observedClientName, 80) ?? "AI connection";
    // No refusal exists past this point, so nothing below can reopen one.
    // No approval exists either (expired rows were handled as governing above).
    const previous = rows.filter((row) => row.status === "pending").sort(newestApprovalFirst)[0];
    if (previous && (previous.scopeChoice === "chosen" || previous.expiryChoice === "chosen" || previous.scopes.length > 0)) return { state: "pending" };
    const scopes = [...FAMILY_HISTORY_SCOPES];
    const boundary: Doc<"mcpGrants">["boundary"] = { kind: "whole_workspace" };
    const fields = {
      scopes,
      boundary,
      status: "active" as const,
      consentedAt: now,
      issuedAt: now,
      expiresAt: undefined,
      scopeChoice: "full" as const,
      expiryChoice: "none" as const,
      updatedAt: now,
      consentSnapshot: buildConsentSnapshot({
        scopes,
        boundary,
        label: previous?.label ?? label,
        observedClientName: trimmed(args.observedClientName, 120) ?? previous?.observedClientName,
        clientId,
        clientProvenance: args.clientProvenance ?? previous?.clientProvenance ?? "manual",
        approvedBy: "sign_in",
      }),
    };
    if (previous) {
      await ctx.db.patch(previous._id, fields);
      const row = (await ctx.db.get(previous._id))!;
      return { state: "active", grant: toResolvedGrant(row) };
    }
    const id = await ctx.db.insert("mcpGrants", {
      vaultOwnerId: owner,
      clientId,
      issuer: args.issuer,
      label,
      observedClientName: trimmed(args.observedClientName, 120),
      clientProvenance: args.clientProvenance ?? "manual",
      clientMetadataUrl: args.clientMetadataUrl,
      requestedAt: now,
      useCount: 0,
      ...fields,
    });
    return { state: "active", grant: toResolvedGrant((await ctx.db.get(id))!) };
  },
});

/**
 * Record real use. Listing tools is not use; only a tools/call is. Throttled so
 * a chatty agent does not turn the grant row into a write hotspot.
 */
export const touchGrantUse = internalMutation({
  args: { grantId: v.id("mcpGrants"), vaultOwnerId: v.string(), toolName: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.grantId);
    if (!row || row.vaultOwnerId !== args.vaultOwnerId) return;
    const now = Date.now();
    if (
      row.lastToolName === args.toolName &&
      typeof row.lastUsedAt === "number" &&
      now - row.lastUsedAt < USE_TOUCH_THROTTLE_MS
    ) {
      return;
    }
    await ctx.db.patch(args.grantId, {
      lastUsedAt: now,
      lastToolName: args.toolName.slice(0, 120),
      useCount: row.useCount + 1,
      updatedAt: now,
    });
  },
});

/** Append one short, masked activity row for the connection centre. */
export const recordGrantActivity = internalMutation({
  args: {
    vaultOwnerId: v.string(),
    requestId: v.string(),
    grantId: v.optional(v.id("mcpGrants")),
    clientId: v.string(),
    toolName: v.string(),
    outcome: v.union(
      v.literal("ok"),
      v.literal("denied"),
      v.literal("rate_limited"),
      v.literal("error"),
    ),
    statusCode: v.number(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentActivity", {
      vaultOwnerId: args.vaultOwnerId,
      requestId: args.requestId.slice(0, 200),
      principalKind: "mcp",
      route: "/mcp",
      method: "tools/call",
      scope: args.toolName.slice(0, 120),
      outcome: args.outcome,
      statusCode: args.statusCode,
      createdAt: Date.now(),
      // Short and masked, never raw vault content.
      detail: trimmed(args.detail, 300),
      grantId: args.grantId,
      clientId: args.clientId.slice(0, 160),
    });
  },
});

/* --------------------------------------------------- defense in depth (data) */

/**
 * Re-validate the resolved grant inside the mutation that is about to write.
 * The transport already decided; the data layer refuses independently, so a
 * bug or a future caller in the transport cannot become a write.
 */
export async function assertGrantPermits(
  ctx: QueryCtx | MutationCtx,
  params: { owner: string; grantId?: string; toolName: string; input: unknown },
): Promise<Doc<"mcpGrants"> | null> {
  // A grantId is required for every grant-governed write. Absence is a refusal,
  // not a bypass.
  if (!params.grantId) {
    machineError(
      "GRANT_REQUIRED",
      "This AI connection has not been approved for Assist With Family History yet.",
      "Ask the person to approve the connection at https://assistwithfamilyhistory.com/app/settings/ai, then retry.",
    );
  }
  const normalized = ctx.db.normalizeId("mcpGrants", params.grantId);
  const row = normalized ? await ctx.db.get(normalized) : null;
  if (!row || row.vaultOwnerId !== params.owner) {
    machineError(
      "GRANT_REQUIRED",
      "This AI connection has not been approved for Assist With Family History yet.",
      "Ask the person to approve the connection at https://assistwithfamilyhistory.com/app/settings/ai, then retry.",
    );
  }
  // The ID must be the approval request resolution would choose. A later
  // refusal closes it even if its own row still says active (legacy one-row
  // revocation or expired-row removal); a newer ended approval means expired;
  // a newer approval in force means this stale ID is no longer authority.
  // Any other status (pending, revoked, denied, ended) is refused as itself.
  let resolution: GrantResolution = { state: row.status as Exclude<Doc<"mcpGrants">["status"], "active"> };
  if (row.status === "active" || isUsableExpired(row)) {
    const history = await grantsForClient(ctx, row.vaultOwnerId, row.clientId, row.issuer);
    const refused = refusedByHistory(history, row);
    const governing = governingApproval(history);
    resolution = refused
      ? { state: refused.status as "denied" | "revoked" }
      : governing && governing._id !== row._id
        ? { state: authorizesNow(governing, Date.now()) ? "absent" : "expired" }
        : { state: "active", grant: toResolvedGrant(row) };
  }
  const decision = decideToolAccess({
    toolName: params.toolName,
    resolution,
    now: Date.now(),
    input: params.input,
  });
  if (!decision.allowed) machineError(decision.code, decision.message, decision.recovery);
  return row;
}

/* ------------------------------------------------ owner-scoped product reads */

/**
 * The connection-centre read, as a plain function.
 *
 * It sits outside the `internalQuery` wrapper deliberately. The action further
 * down has to declare its return type explicitly, because inferring it would
 * require the type of `internal`, which requires the type of this module, which
 * requires that action — the circle `convex deploy` reports as TS7022/TS7023
 * once real generated bindings exist. Deriving the annotation from this helper
 * keeps the declared type honest: it is literally what the query returns, so
 * the two cannot drift apart.
 */
type HistoryProjection =
  | { status: "revoked" | "denied"; at: number; reason: string | null }
  | { status: "expired" };

function historyRefusal(row: Doc<"mcpGrants">): HistoryProjection {
  return { status: row.status as "revoked" | "denied", at: refusalTime(row), reason: row.revokedReason ?? null };
}

function connectionRow(row: Doc<"mcpGrants">, now: number, projected?: HistoryProjection) {
  const base = storedConnectionRow(row, now);
  // An approval closed by a later refusal is shown as that refusal, so Settings
  // offers explicit reapproval instead of a switch that no longer governs. One
  // superseded by a newer ended approval is shown as expired, as requests are.
  if (!projected) return base;
  if (projected.status === "expired") return { ...base, status: "expired" as typeof base.status };
  return { ...base, status: projected.status as typeof base.status, revokedAt: projected.at as number | null, revokedReason: projected.reason };
}

function storedConnectionRow(row: Doc<"mcpGrants">, now: number) {
  return {
    id: row._id,
    label: row.label,
    observedClientName: row.observedClientName ?? null,
    clientId: row.clientId,
    issuer: row.issuer,
    clientProvenance: row.clientProvenance,
    clientMetadataUrl: row.clientMetadataUrl ?? null,
    scopes: effectiveScopes(row),
    scopeChoice: effectiveScopeChoice(row),
    boundary: row.boundary,
    // Expiry is decided in code at read time, so a row that has aged out
    // reads as expired even before anything rewrites its status.
    status: (row.status === "active" || isUsableExpired(row))
      ? (isGrantExpired(row, now) ? "expired" : "active") : row.status,
    requestedAt: row.requestedAt,
    consentedAt: row.consentedAt ?? null,
    issuedAt: row.issuedAt ?? null,
    expiresAt: effectiveExpiry(row) ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    lastToolName: row.lastToolName ?? null,
    revokedAt: row.revokedAt ?? null,
    revokedReason: row.revokedReason ?? null,
    useCount: row.useCount,
    consentSnapshot: row.consentSnapshot ?? null,
  };
}

async function readConnections(ctx: QueryCtx, vaultOwnerId: string) {
  const rows = await ctx.db
    .query("mcpGrants")
    .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
    .order("desc")
    .filter((q) => q.eq(q.field("hiddenAt"), undefined))
    .take(100);
  const now = Date.now();
  // Approvals are checked against their own bounded owner/client/issuer
  // history, read once per pair, so the list never shows a closed approval as on.
  const histories = new Map<string, Doc<"mcpGrants">[] | null>();
  const refusedBy = new Map<Id<"mcpGrants">, HistoryProjection>();
  for (const row of rows) {
    if (row.status !== "active" && !isUsableExpired(row)) continue;
    const key = JSON.stringify([row.clientId, row.issuer]);
    if (!histories.has(key)) {
      const history = await ctx.db
        .query("mcpGrants")
        .withIndex("by_owner_client_issuer", (q) => q.eq("vaultOwnerId", vaultOwnerId).eq("clientId", row.clientId).eq("issuer", row.issuer))
        .take(MAX_CLIENT_GRANTS + 1);
      histories.set(key, history.length > MAX_CLIENT_GRANTS ? null : history);
    }
    const history = histories.get(key);
    // Overflowing history refuses every request, so it never reads as on.
    if (history === null) {
      refusedBy.set(row._id, { status: "revoked", at: now, reason: "Too much approval history to safely authorize." });
      continue;
    }
    const refusal = refusedByHistory(history!, row);
    const governing = governingApproval(history!);
    if (refusal) refusedBy.set(row._id, historyRefusal(refusal));
    else if (governing && governing._id !== row._id && !authorizesNow(governing, now)) refusedBy.set(row._id, { status: "expired" });
  }
  return {
    scopeInfo: FAMILY_HISTORY_SCOPE_INFO,
    neverExposed: NEVER_EXPOSED,
    neverPermitted: NEVER_PERMITTED,
    connections: rows.map((row) => connectionRow(row, now, refusedBy.get(row._id))),
  };
}

/** Exactly what the connection centre is handed. */
export type ConnectionsView = Awaited<ReturnType<typeof readConnections>>;

export const listConnectionsInternal = internalQuery({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, { vaultOwnerId }) => await readConnections(ctx, vaultOwnerId),
});

/** The activity read, kept outside the wrapper for the same reason as above. */
async function readRecentActivity(
  ctx: QueryCtx,
  args: { vaultOwnerId: string; grantId?: Id<"mcpGrants">; limit?: number },
) {
  const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 200));
  const rows = args.grantId
    ? await ctx.db
        .query("agentActivity")
        .withIndex("by_owner_grant", (q) =>
          q.eq("vaultOwnerId", args.vaultOwnerId).eq("grantId", args.grantId),
        )
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("agentActivity")
        .withIndex("by_owner", (q) => q.eq("vaultOwnerId", args.vaultOwnerId))
        .order("desc")
        .take(limit);
  return rows
    .filter((row) => row.principalKind === "mcp")
    .map((row) => ({
      id: row._id,
      at: row.createdAt,
      tool: row.scope ?? null,
      outcome: row.outcome,
      detail: row.detail ?? null,
      grantId: row.grantId ?? null,
      clientId: row.clientId ?? null,
    }));
}

/** Exactly what the activity list is handed. */
export type ConnectionActivityView = Awaited<ReturnType<typeof readRecentActivity>>;

export const recentActivityInternal = internalQuery({
  args: { vaultOwnerId: v.string(), grantId: v.optional(v.id("mcpGrants")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => await readRecentActivity(ctx, args),
});

export const listConnections = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<ConnectionsView> => {
    const decision = await authorizeTenantAction(
      ctx,
      "mcpGrants.listConnections",
      args.vaultOwnerId,
      (entry: TrustBoundaryShadowEntry) =>
        ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    if (!decision.allowed) throw new Error("Connection not found");
    return await ctx.runQuery(internal.mcpGrants.listConnectionsInternal, {
      vaultOwnerId: decision.owner,
    });
  },
});

export const recentConnectionActivity = action({
  args: {
    vaultOwnerId: v.string(),
    grantId: v.optional(v.id("mcpGrants")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConnectionActivityView> => {
    const decision = await authorizeTenantAction(
      ctx,
      "mcpGrants.recentConnectionActivity",
      args.vaultOwnerId,
      (entry: TrustBoundaryShadowEntry) =>
        ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    if (!decision.allowed) throw new Error("Connection not found");
    return await ctx.runQuery(internal.mcpGrants.recentActivityInternal, {
      vaultOwnerId: decision.owner,
      grantId: args.grantId,
      limit: args.limit,
    });
  },
});

/* ---------------------------------------------- owner-scoped grant lifecycle */

async function ownedGrant(
  ctx: MutationCtx,
  owner: string,
  grantId: Id<"mcpGrants">,
): Promise<Doc<"mcpGrants">> {
  const row = await ctx.db.get(grantId);
  // A grant belonging to somebody else and a grant that does not exist are the
  // same not-found, so this cannot be used to probe other owners.
  if (!row || row.vaultOwnerId !== owner) throw new Error("Connection not found");
  return row;
}

function normalizeBoundary(boundary: Doc<"mcpGrants">["boundary"]): Doc<"mcpGrants">["boundary"] {
  const personIds = [...new Set(boundary.personIds ?? [])].slice(0, 500);
  const queueItemIds = [...new Set(boundary.queueItemIds ?? [])].slice(0, 500);
  if (boundary.kind === "selected_people" && personIds.length === 0) {
    throw new Error("Choose at least one person for a selected-people connection");
  }
  return {
    kind: boundary.kind,
    personIds: personIds.length ? personIds : undefined,
    queueItemIds: queueItemIds.length ? queueItemIds : undefined,
  };
}

export const approveGrant = mutation({
  args: {
    vaultOwnerId: v.string(),
    grantId: v.id("mcpGrants"),
    label: v.string(),
    scopes: v.array(v.string()),
    boundary: boundaryValidator,
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.approveGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    const history = await grantsForClient(ctx, decision.owner, row.clientId, row.issuer);
    // An active row that no longer governs (closed by a later refusal, or
    // superseded) is reapproved under a new ID like a closed one. A governing
    // approval still in force means already approved.
    const governing = governingApproval(history);
    const closedByHistory = row.status === "active" && governing?._id !== row._id;
    if (row.status === "active" && !closedByHistory) throw new Error("This connection is already approved");
    if (governing && authorizesNow(governing, Date.now())) throw new Error("This connection is already approved");
    // Anything above the ceiling is dropped here, not merely unused.
    const scopes = clampToScopeCeiling(args.scopes);
    if (scopes.length === 0) throw new Error("Choose at least one permission for this connection");
    const label = trimmed(args.label, 80) ?? row.label;
    const boundary = normalizeBoundary(args.boundary);
    const now = Date.now();
    const expiresAt = chosenExpiry(args.expiresInDays, now);
    // The explicit approval is an event strictly after every earlier refusal.
    const approvedAt = explicitApprovalTime(history, now);
    const scopeChoice = FAMILY_HISTORY_SCOPES.every((scope) => scopes.includes(scope)) ? "full" as const : "chosen" as const;
    const fields = {
      label,
      scopes,
      scopeChoice,
      expiryChoice: expiresAt === undefined ? "none" as const : "chosen" as const,
      boundary,
      status: "active" as const,
      consentedAt: approvedAt,
      issuedAt: approvedAt,
      expiresAt,
      updatedAt: now,
      consentSnapshot: buildConsentSnapshot({
        scopes,
        boundary,
        expiresAt,
        label,
        observedClientName: row.observedClientName,
        clientId: row.clientId,
        clientProvenance: row.clientProvenance,
      }),
    };
    // Reapproval is an authenticated, explicit settings act. Keep the closed
    // row as the durable revocation/consent history rather than overwrite it.
    let id = row._id;
    if (row.status === "revoked" || row.status === "denied" || closedByHistory) {
      id = await ctx.db.insert("mcpGrants", {
        vaultOwnerId: decision.owner,
        clientId: row.clientId,
        issuer: row.issuer,
        observedClientName: row.observedClientName,
        clientProvenance: row.clientProvenance,
        clientMetadataUrl: row.clientMetadataUrl,
        requestedAt: now,
        useCount: 0,
        ...fields,
      });
      await ctx.db.patch(row._id, { hiddenAt: now });
    } else {
      await ctx.db.patch(row._id, { ...fields, hiddenAt: undefined });
    }
    return { id, status: "active" as const, scopes, boundary, expiresAt: expiresAt ?? null, scopeChoice, connection: connectionRow((await ctx.db.get(id))!, now) };
  },
});

/** Explicit settings choice; independent of scopes and record boundary. */
export const updateGrantExpiry = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), expiresInDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.updateGrantExpiry", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status !== "active" && row.status !== "expired") throw new Error("Only an approved connection can have an end date changed");
    // Only the governing approval can be extended; a closed or superseded one
    // would not govern requests even with a new date.
    if (governingApproval(await grantsForClient(ctx, decision.owner, row.clientId, row.issuer))?._id !== row._id) {
      throw new Error("Only an approved connection can have an end date changed");
    }
    const now = Date.now();
    const expiresAt = chosenExpiry(args.expiresInDays, now);
    await ctx.db.patch(row._id, { expiresAt, expiryChoice: expiresAt === undefined ? "none" : "chosen", status: "active", updatedAt: now });
    return { id: row._id, status: "active" as const, expiresAt: expiresAt ?? null };
  },
});

export const denyGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.denyGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status !== "pending") throw new Error("Only a pending connection request can be declined");
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "denied",
      revokedAt: now,
      revokedReason: trimmed(args.reason, 300),
      updatedAt: now,
    });
    return { id: row._id, status: "denied" as const };
  },
});

export const reduceGrantScopes = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), scopes: v.array(v.string()) },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.reduceGrantScopes", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status !== "active") throw new Error("Only an active connection can be narrowed");
    const current = new Set(effectiveScopes(row));
    const requested = clampToScopeCeiling(args.scopes);
    const next = requested.filter((scope) => current.has(scope));
    // This path only ever narrows. Widening requires a fresh approval so the
    // person sees the new consent screen.
    if (next.length !== requested.length) {
      throw new Error("Widening a connection requires a fresh approval");
    }
    if (next.length === 0) throw new Error("Revoke the connection instead of removing every permission");
    const now = Date.now();
    const scopeChoice = FAMILY_HISTORY_SCOPES.every((scope) => next.includes(scope)) ? "full" as const : "chosen" as const;
    await ctx.db.patch(row._id, { scopes: next, scopeChoice, updatedAt: now });
    return { id: row._id, scopes: next, scopeChoice };
  },
});

export const revokeGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.revokeGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    // Legacy usable-expired rows read as on in Settings, so they can be turned off.
    if ((row.status !== "active" && !isUsableExpired(row)) || row.hiddenAt !== undefined || isGrantExpired(row, Date.now())) {
      throw new Error("Only an active connection can be turned off. Reload to see its current approval.");
    }
    const history = await grantsForClient(ctx, decision.owner, row.clientId, row.issuer);
    if (refusedByHistory(history, row)) {
      throw new Error("Only an active connection can be turned off. Reload to see its current approval.");
    }
    const duplicates = history.filter((grant) => grant.status === "active" || isUsableExpired(grant));
    const governing = governingApproval(history);
    if (governing?._id !== row._id) {
      throw new Error("This approval has been superseded. Reload to turn off the current connection.");
    }
    const now = Date.now();
    // Close every legacy approval atomically, including expired rows that are
    // effectively unlimited. Neither the next request nor an old grant ID may
    // fall back to one of them, even after explicit reapproval creates a new ID.
    // Preserve consent, chosen limits and hiddenAt on every historical row.
    for (const duplicate of duplicates) {
      await ctx.db.patch(duplicate._id, {
        status: "revoked",
        revokedAt: now,
        revokedReason: trimmed(args.reason, 300),
        updatedAt: now,
      });
    }
    return { id: row._id, status: "revoked" as const };
  },
});

export const removeGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants") },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.removeGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    const now = Date.now();
    const history = await grantsForClient(ctx, decision.owner, row.clientId, row.issuer);
    // Settings projects elapsed active rows as expired without rewriting them.
    // Use the same effective expiry, including explicit and legacy choices.
    // An active row that no longer governs (closed or superseded) can be tidied.
    const governing = governingApproval(history);
    if (row.status === "active" && !isGrantExpired(row, now) && governing?._id === row._id) {
      throw new Error("Revoke the connection before removing it");
    }
    // Removing the governing (expired) approval, or a request while nothing is
    // approved, is a durable refusal at removal time: older active duplicates
    // must not resurface and pending/expired rows never become eligible for
    // automatic sign-in. Tidying any other row while a different approval
    // governs only hides it, so housekeeping never turns that approval off.
    const hideOnly = governing !== undefined && governing._id !== row._id;
    await ctx.db.patch(row._id, {
      hiddenAt: now,
      ...(row.status === "revoked" || row.status === "denied" || hideOnly ? {} : {
        status: "revoked" as const, revokedAt: now, updatedAt: now,
      }),
    });
    return { id: row._id, removed: true as const };
  },
});

/** Small helper the transport uses to name the tool in an activity row. */
export function activityToolLabel(name: string): string {
  return findTool(name)?.name ?? "unknown_tool";
}
