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
import { hashMcpInput } from "../lib/mcp/contract";
import { AI_SETTINGS_URL } from "../lib/mcp/accessCopy";
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
  FAMILY_HISTORY_TOOLS,
  FAMILY_HISTORY_CONTROL_TOOLS,
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

import { untouchedAutomaticGrant, effectiveWithheldScopes, effectiveScopes, effectiveScopeChoice, effectiveExpiry, hasAutomaticLegacyExpiry, chosenExpiry } from "../lib/mcp/grantDefaults";

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
    withheldScopes: effectiveWithheldScopes(row),
    pausedAt: row.pausedAt,
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

/* Legacy receipt dates are for display and deterministic import selection only.
 * Current authority comes from aliases/parents; releases require revisions.
 * Import retains every unresolved restriction regardless of receipt dates. */
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

/** Compatibility handlers receive only the current canonical authority. */
function refusedByHistory(rows: Doc<"mcpGrants">[], row: Doc<"mcpGrants">): Doc<"mcpGrants"> | undefined {
  return isRefusal(row) ? row : latestRefusal(rows);
}

/**
 * The current canonical approval, including an ended approval. Never fall back
 * from a refused or ended authority to an older historical grant.
 */
function governingApproval(rows: Doc<"mcpGrants">[]): Doc<"mcpGrants"> | undefined {
  if (latestRefusal(rows)) return undefined;
  return rows
    .filter((row) => row.status === "active" || row.status === "expired")
    .sort(newestApprovalFirst)[0];
}

/** Whether a governing approval authorizes right now. */
function authorizesNow(row: Doc<"mcpGrants">, now: number): boolean {
  return !row.pausedAt && (row.status === "active" ? !isGrantExpired(row, now) : isUsableExpired(row));
}

/** Consent date is informational; replacing authority is revision-checked. */
function explicitApprovalTime(rows: Doc<"mcpGrants">[], now: number): number {
  void rows;
  return now; // Display only. Authority replacement and releases use revisions.
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
    if (!owner || !clientId || !args.issuer.trim()) throw new Error("Verified owner, issuer and client id are required");
    const now = Date.now();

    // A validated, unexpired server-side registration wins over clientInfo.
    // The transport supplies clientInfo only on initialize, never on tool calls.
    const registration = await ctx.db.query("mcpClientRegistrations")
      .withIndex("by_clientId", q => q.eq("clientId", clientId)).unique();
    const registeredName = registration?.status === "valid" && registration.expiresAt > now
      ? trimmed(registration.clientName, 120) : undefined;
    const observedName = registeredName ?? trimmed(args.observedClientName, 120);
    const carried = await prepareCarriedRestrictions(ctx, owner);
    if (!carried.ready) return { state: "pending", at: Date.now(), reason: "Earlier connection limits are being prepared automatically. No new approval is required." };
    const aliased = await resolveClientAlias(ctx, owner, clientId, args.issuer, observedName, carried);
    const current = aliased;
    if (current) {
      if (observedName && current.observedClientName !== observedName && !current.linkedByName) {
        await ctx.db.patch(current._id, { observedClientName: observedName });
      }
      if (current.status === "revoked" || current.status === "denied") {
        if (current.hiddenAt !== undefined) await ctx.db.patch(current._id, { hiddenAt: undefined });
        return { state: current.status, at: refusalTime(current) };
      }
      if (current.status === "pending" && (current.scopeChoice === "chosen" || current.expiryChoice === "chosen" || current.scopes.length > 0)) return { state: "pending", at: current.requestedAt };
      if (current.status !== "pending") {
        if (untouchedAutomaticGrant(current)) {
          await ctx.db.patch(current._id, { scopeChoice: "full", withheldScopes: [], expiryChoice: "none", expiresAt: undefined, revision: (current.revision ?? 0) + 1, updatedAt: now });
          const after = (await ctx.db.get(current._id))!;
          await appendHistory(ctx, after, current, "system", "Updated an untouched automatic connection to full access with no end date.", `default-upgrade:${current._id}`, "default-upgrade");
          return after.pausedAt ? { state: "paused", at: after.pausedAt } : { state: "active", grant: toResolvedGrant(after) };
        }
        return current.pausedAt ? { state: "paused", at: current.pausedAt } : authorizesNow(current, now) ? { state: "active", grant: toResolvedGrant(current) } : { state: "expired", at: effectiveExpiry(current) };
      }
    }

    // Signing in grants every current and future tool, with no end date.
    // Existing explicit/ambiguous expiries are never renewed by signing in.
    const label = trimmed(observedName, 80) ?? "AI connection";
    // No refusal exists past this point, so nothing below can reopen one.
    // No approval exists either (expired rows were handled as governing above).
    const previous = current?.status === "pending" ? current : undefined;
    if (previous && (previous.scopeChoice === "chosen" || previous.expiryChoice === "chosen" || previous.scopes.length > 0)) return { state: "pending", at: previous.requestedAt };
    const scopes = [...FAMILY_HISTORY_SCOPES];
    const boundary: Doc<"mcpGrants">["boundary"] = { kind: "whole_workspace" };
    const fields = {
      scopes,
      boundary,
      status: "active" as const,
      consentedAt: now,
      issuedAt: now,
      expiresAt: undefined,
      withheldScopes: [],
      revision: 0,
      scopeChoice: "full" as const,
      expiryChoice: "none" as const,
      updatedAt: now,
      consentSnapshot: buildConsentSnapshot({
        scopes,
        boundary,
        label: previous?.label ?? label,
        observedClientName: observedName ?? previous?.observedClientName,
        clientId,
        clientProvenance: args.clientProvenance ?? previous?.clientProvenance ?? "manual",
        approvedBy: "sign_in",
      }),
    };
    if (previous) {
      await ctx.db.patch(previous._id, fields);
      const row = (await ctx.db.get(previous._id))!;
      await appendHistory(ctx, row, previous, "system", "Connected with full access and no end date.", `connect:${row._id}`, "connect");
      return { state: "active", grant: toResolvedGrant(row) };
    }
    const id = await ctx.db.insert("mcpGrants", {
      vaultOwnerId: owner,
      clientId,
      issuer: args.issuer,
      label,
      observedClientName: observedName,
      clientProvenance: args.clientProvenance ?? "manual",
      clientMetadataUrl: args.clientMetadataUrl,
      requestedAt: now,
      useCount: 0,
      ...fields,
    });
    await ctx.db.insert("mcpClientAliases", { vaultOwnerId: owner, issuer: args.issuer, clientId, grantId: id });
    if (observedName) await rememberClientName(ctx, owner, args.issuer, observedName, id);
    const created = (await ctx.db.get(id))!;
    await appendHistory(ctx, created, null, "system", "Connected with full access and no end date.", `connect:${id}`, "connect");
    return { state: "active", grant: toResolvedGrant(created) };
  },
});

/**
 * Record real use. Listing tools is not use; only a tools/call is. Throttled so
 * a chatty agent does not turn the grant row into a write hotspot.
 */
export const touchGrantUse = internalMutation({
  args: { grantId: v.id("mcpGrants"), vaultOwnerId: v.string(), toolName: v.string() },
  handler: async (ctx, args) => {
    const row = await authorityForId(ctx, args.grantId);
    if (row.vaultOwnerId !== args.vaultOwnerId) return;
    const now = Date.now();
    if (
      row.lastToolName === args.toolName &&
      typeof row.lastUsedAt === "number" &&
      now - row.lastUsedAt < USE_TOUCH_THROTTLE_MS
    ) {
      return;
    }
    await ctx.db.patch(row._id, {
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
      "Ask the person to approve the connection at https://assistwithfamilyhistory.com/settings/ai, then retry.",
    );
  }
  const normalized = ctx.db.normalizeId("mcpGrants", params.grantId);
  const row = normalized ? await ctx.db.get(normalized) : null;
  if (!row || row.vaultOwnerId !== params.owner) {
    machineError(
      "GRANT_REQUIRED",
      "This AI connection has not been approved for Assist With Family History yet.",
      "Ask the person to approve the connection at https://assistwithfamilyhistory.com/settings/ai, then retry.",
    );
  }
  const alias = await ctx.db.query("mcpClientAliases").withIndex("by_owner_client_issuer", q => q.eq("vaultOwnerId", row.vaultOwnerId).eq("clientId", row.clientId).eq("issuer", row.issuer)).unique();
  if (alias && (await authorityForId(ctx, alias.grantId))._id !== row._id) machineError("GRANT_REVOKED", "This earlier connection has been superseded.", `Only the person can restore access at ${AI_SETTINGS_URL}.`);
  const carried = await carriedForOwner(ctx, params.owner);
  if (!carried?.ready) machineError("GRANT_REQUIRED", "Earlier connection limits are being prepared.", "Retry after the background preparation finishes; no sign-in or approval is needed.");
  const authority = await callingGrant(ctx, { subject: params.owner, issuer: row.issuer, clientId: row.clientId });
  if (!authority || authority._id !== row._id) machineError("GRANT_REVOKED", "This approval has been superseded.", `Only the person can restore access at ${AI_SETTINGS_URL}.`);
  const projected = projectCarriedAccess(row, carried);
  const resolution: GrantResolution = projected.status === "revoked" || projected.status === "denied" ? { state: projected.status, at: projected.revokedAt }
    : projected.status === "pending" ? { state: "pending" }
    : projected.pausedAt ? { state: "paused", at: projected.pausedAt }
    : isGrantExpired(projected, Date.now()) ? { state: "expired", at: effectiveExpiry(projected) }
    : { state: "active", grant: toResolvedGrant(projected) };
  const decision = decideToolAccess({
    toolName: params.toolName,
    resolution,
    now: Date.now(),
    input: params.input,
  });
  if (!decision.allowed) machineError(decision.code, decision.message, decision.recovery);
  return projected;
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
    scopeChoice: effectiveWithheldScopes(row).length ? "chosen" as const : "full" as const,
    linkedByName: row.linkedByName ?? false,
    withheldScopes: effectiveWithheldScopes(row), revision: row.revision ?? 0,
    pausedAt: row.pausedAt ?? null, limitedBy: row.limitedBy ?? null, limitedAt: row.limitedAt ?? null,
    boundary: row.boundary,
    // Expiry is decided in code at read time, so a row that has aged out
    // reads as expired even before anything rewrites its status.
    status: (row.status === "active" || isUsableExpired(row))
      ? (row.pausedAt ? "paused" : isGrantExpired(row, now) ? "expired" : "active") : row.status,
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

async function connectionsFromRows(ctx: QueryCtx, rows: Doc<"mcpGrants">[]) {
  const connections = [];
  const supersededConnections = [];
  const carried = rows[0] ? await carriedForOwner(ctx, rows[0].vaultOwnerId) : null;
  for (const row of rows) {
    const authority = await callingGrant(ctx, { subject: row.vaultOwnerId, issuer: row.issuer, clientId: row.clientId });
    if (row.hiddenAt === undefined && authority?._id === row._id) connections.push({ ...await connectionWithHistory(ctx, carried?.ready ? projectCarriedAccess(row, carried) : row), carriedRevision: carried?.revision ?? 0, inheritedLimits: carried?.entries.some(e => e.issuer === row.issuer && e.lineageGrantId !== row._id) ?? false });
    else if (authority && authority._id !== row._id) supersededConnections.push(await connectionWithHistory(ctx, row));
  }
  return { scopeInfo: FAMILY_HISTORY_SCOPE_INFO, neverExposed: NEVER_EXPOSED, neverPermitted: NEVER_PERMITTED, connections, supersededConnections, preparing: rows.length > 0 && !carried?.ready };
}
export async function readConnections(ctx: QueryCtx, vaultOwnerId: string) {
  return connectionsFromRows(ctx, await ctx.db.query("mcpGrants").withIndex("by_owner", q => q.eq("vaultOwnerId", vaultOwnerId)).collect());
}

/** Exactly what the connection centre is handed. */
export type ConnectionsView = Awaited<ReturnType<typeof readConnections>>;

export const listConnectionsInternal = internalQuery({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, { vaultOwnerId }) => await readConnections(ctx, vaultOwnerId),
});

async function readConnectionsPage(ctx: QueryCtx, vaultOwnerId: string, cursor: string | null) {
  const page = await ctx.db.query("mcpGrants").withIndex("by_owner", q => q.eq("vaultOwnerId", vaultOwnerId))
    .order("desc").paginate({ cursor, numItems: 100 });
  return { ...await connectionsFromRows(ctx, page.page), continueCursor: page.continueCursor, isDone: page.isDone };
}
export const listConnectionsPageInternal = internalQuery({
  args: { vaultOwnerId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => readConnectionsPage(ctx, args.vaultOwnerId, args.cursor),
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
  handler: async (ctx, args): Promise<ConnectionsView & { preparing: boolean }> => {
    const decision = await authorizeTenantAction(
      ctx,
      "mcpGrants.listConnections",
      args.vaultOwnerId,
      (entry: TrustBoundaryShadowEntry) =>
        ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    if (!decision.allowed) throw new Error("Connection not found");
    const preparation = await ctx.runMutation(internal.mcpGrants.prepareOwnerConnections, { vaultOwnerId: decision.owner });
    const listing: ConnectionsView = { scopeInfo: FAMILY_HISTORY_SCOPE_INFO, neverExposed: NEVER_EXPOSED, neverPermitted: NEVER_PERMITTED, connections: [], supersededConnections: [], preparing: !preparation.ready };
    let cursor: string | null = null;
    for (;;) {
      const page: Awaited<ReturnType<typeof readConnectionsPage>> = await ctx.runQuery(internal.mcpGrants.listConnectionsPageInternal, { vaultOwnerId: decision.owner, cursor });
      listing.connections.push(...page.connections); listing.supersededConnections.push(...page.supersededConnections);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { ...listing, preparing: !preparation.ready };
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

/** Compatibility entry points use the same current authority and revision as Settings. */
const versionArgs = { revision: v.optional(v.number()), carriedRevision: v.optional(v.number()), opId: v.optional(v.string()) };
export const approveGrant = mutation({
  args: { ...versionArgs,
    vaultOwnerId: v.string(),
    grantId: v.id("mcpGrants"),
    label: v.string(),
    scopes: v.array(v.string()),
    boundary: boundaryValidator,
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return revisionedLegacyChange(ctx, args, "approve", async () => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.approveGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    const history = await currentClientAuthority(ctx, decision.owner, row.clientId, row.issuer);
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
    });
  },
});

/** Explicit settings choice; independent of scopes and record boundary. */
export const updateGrantExpiry = mutation({
  args: { ...versionArgs, vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), expiresInDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return revisionedLegacyChange(ctx, args, "expiry", async () => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.updateGrantExpiry", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status !== "active" && row.status !== "expired") throw new Error("Only an approved connection can have an end date changed");
    // Only the governing approval can be extended; a closed or superseded one
    // would not govern requests even with a new date.
    if (governingApproval(await currentClientAuthority(ctx, decision.owner, row.clientId, row.issuer))?._id !== row._id) {
      throw new Error("Only an approved connection can have an end date changed");
    }
    const now = Date.now();
    const expiresAt = chosenExpiry(args.expiresInDays, now);
    await ctx.db.patch(row._id, { expiresAt, expiryChoice: expiresAt === undefined ? "none" : "chosen", status: "active", updatedAt: now });
    return { id: row._id, status: "active" as const, expiresAt: expiresAt ?? null };
    });
  },
});

export const denyGrant = mutation({
  args: { ...versionArgs, vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return revisionedLegacyChange(ctx, args, "deny", async () => {
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
    });
  },
});

export const reduceGrantScopes = mutation({
  args: { ...versionArgs, vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), scopes: v.array(v.string()) },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return revisionedLegacyChange(ctx, args, "reduce", async () => {
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
    });
  },
});

export const revokeGrant = mutation({
  args: { ...versionArgs, vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return revisionedLegacyChange(ctx, args, "revoke", async () => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.revokeGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    // Legacy usable-expired rows read as on in Settings, so they can be turned off.
    if ((row.status !== "active" && !isUsableExpired(row)) || row.hiddenAt !== undefined || isGrantExpired(row, Date.now())) {
      throw new Error("Only an active connection can be turned off. Reload to see its current approval.");
    }
    const history = await currentClientAuthority(ctx, decision.owner, row.clientId, row.issuer);
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
    });
  },
});

export const removeGrant = mutation({
  args: { ...versionArgs, vaultOwnerId: v.string(), grantId: v.id("mcpGrants") },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return revisionedLegacyChange(ctx, args, "remove", async () => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.removeGrant", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("Connection not found");
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    const now = Date.now();
    const history = await currentClientAuthority(ctx, decision.owner, row.clientId, row.issuer);
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
    });
  },
});

/** Small helper the transport uses to name the tool in an activity row. */
export function activityToolLabel(name: string): string {
  return findTool(name)?.name ?? "unknown_tool";
}

/* AWL-0015: one revisioned control path for person and connection. */

function safeSentence(value: string): string {
  return value.replace(/bearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?|\b(?:sk|pk|api[_-]?key|token|secret)[_:= -]+[A-Za-z0-9_./+-]{8,}/gi, "[redacted]").slice(0, 300);
}
function accessSnapshot(row: Doc<"mcpGrants">) {
  return { status: row.status, withheldScopes: effectiveWithheldScopes(row), boundary: row.boundary,
    endsAt: effectiveExpiry(row) ?? null, pausedAt: row.pausedAt ?? null, revision: row.revision ?? 0 };
}
async function appendHistory(ctx: MutationCtx, after: Doc<"mcpGrants">, before: Doc<"mcpGrants"> | null,
  actor: "person" | "ai" | "system", sentence: string, opId: string, request: string) {
  await ctx.db.insert("mcpGrantHistory", { vaultOwnerId: after.vaultOwnerId, grantId: after._id, actor,
    before: JSON.stringify(before ? accessSnapshot(before) : null), after: JSON.stringify(accessSnapshot(after)),
    sentence: safeSentence(sentence), at: Date.now(), opId, request, revision: after.revision ?? 0 });
}

function normalizedClientName(name?: string): string | undefined {
  return name?.trim().replace(/\s+/g, " ").toLowerCase() || undefined;
}

/** A predecessor is unresolved only while its CURRENT authority is limited.
 * Grouping history by client and following aliases excludes old revokes that
 * the person has since restored or explicitly reapproved. Hidden rows count. */
function hasUnresolvedLimit(row: Doc<"mcpGrants">): boolean {
  if (row.status === "pending" && !row.scopeChoice && !row.expiryChoice && row.scopes.length === 0 && row.pausedAt === undefined) return false;
  return row.status === "revoked" || row.status === "denied" || row.status === "pending"
    || row.pausedAt !== undefined || effectiveWithheldScopes(row).length > 0
    || effectiveExpiry(row) !== undefined || row.boundary.kind !== "whole_workspace"
    || (row.boundary.queueItemIds?.length ?? 0) > 0;
}

/** Follow lineage pointers, never grant history. Cycles fail closed, with no depth cap. */
async function authorityForId(ctx: QueryCtx | MutationCtx, id: Id<"mcpGrants">): Promise<Doc<"mcpGrants">> {
  const initial = await ctx.db.get(id);
  if (!initial) throw new Error("Connection authority is missing");
  let row: Doc<"mcpGrants"> = initial;
  const owner = row.vaultOwnerId, issuer = row.issuer;
  const seen = new Set<string>();
  while (row.authorityGrantId) {
    if (seen.has(String(row._id))) throw new Error("Connection authority cycle");
    seen.add(String(row._id));
    const parent: Doc<"mcpGrants"> | null = await ctx.db.get(row.authorityGrantId);
    if (!parent || parent.vaultOwnerId !== owner || parent.issuer !== issuer) throw new Error("Invalid connection authority");
    row = parent;
  }
  return row;
}

function narrowestAuthority(candidates: Doc<"mcpGrants">[]) {
  const anchor = candidates[0];
  const withheld = new Set(candidates.flatMap(effectiveWithheldScopes));
  let boundary = anchor.boundary;
  for (const row of candidates.slice(1)) {
    const queueA = boundary.queueItemIds ?? [], queueB = row.boundary.queueItemIds ?? [];
    if (boundary.kind === "whole_workspace") boundary = row.boundary;
    else if (row.boundary.kind !== "whole_workspace" && boundary.kind !== row.boundary.kind) {
      // Incompatible record boundaries intersect at no domain authority.
      for (const scope of FAMILY_HISTORY_SCOPES) withheld.add(scope);
    } else if (boundary.kind === "selected_people" && row.boundary.kind === "selected_people") {
      const personIds = (boundary.personIds ?? []).filter(id => row.boundary.personIds?.includes(id));
      if (!personIds.length) for (const scope of FAMILY_HISTORY_SCOPES.filter(s => !s.includes(":queue:"))) withheld.add(scope);
      boundary = { ...boundary, personIds };
    }
    const a = queueA, b = queueB;
    if (a.length || b.length) {
      const ids = !a.length ? b : !b.length ? a : a.filter(id => b.includes(id));
      if (!ids.length) for (const scope of FAMILY_HISTORY_SCOPES.filter(s => s.includes(":queue:"))) withheld.add(scope);
      boundary = { ...boundary, queueItemIds: ids };
    }
  }
  const ends = candidates.map(effectiveExpiry).filter((x): x is number => x !== undefined);
  const paused = candidates.map(r => r.pausedAt).filter((x): x is number => x !== undefined);
  const refusal = candidates.find(r => r.status === "revoked" || r.status === "denied");
  return { withheldScopes: [...withheld], scopes: FAMILY_HISTORY_SCOPES.filter(s => !withheld.has(s)),
    scopeChoice: withheld.size ? "chosen" as const : "full" as const, boundary,
    expiresAt: ends.length ? Math.min(...ends) : undefined, expiryChoice: ends.length ? "chosen" as const : "none" as const,
    pausedAt: paused.length ? Math.min(...paused) : undefined,
    status: refusal ? "revoked" as const : candidates.some(row => row.status === "pending") ? "pending" as const : anchor.status,
    revokedAt: refusal ? refusal.revokedAt ?? refusal.updatedAt : anchor.revokedAt };
}
function projectCarriedAccess(row: Doc<"mcpGrants">, carried: Doc<"mcpCarriedRestrictions">) {
  const entries = carried.entries.filter(e => e.issuer === row.issuer);
  if (!entries.length) return row;
  const policies = entries.map(e => ({ ...row, withheldScopes: e.withheld, boundary: e.boundary,
    scopeChoice: "chosen" as const, expiryChoice: e.endsAt === undefined ? "none" as const : "chosen" as const,
    expiresAt: e.endsAt, pausedAt: e.pausedAt, status: e.revoked ? "revoked" as const : e.pending ? "pending" as const : "active" as const }));
  return { ...row, ...narrowestAuthority([row, ...policies]) };
}

/** One carried-record read: unknown/new names cannot exclude a restriction. */
async function resolveClientAlias(ctx: MutationCtx, owner: string, clientId: string, issuer: string, name: string | undefined, carried: Doc<"mcpCarriedRestrictions">) {
  const alias = await ctx.db.query("mcpClientAliases").withIndex("by_owner_client_issuer", q => q.eq("vaultOwnerId", owner).eq("clientId", clientId).eq("issuer", issuer)).unique();
  const own = alias ? await authorityForId(ctx, alias.grantId) : null;
  const key = normalizedClientName(name);
  const named = key ? carried.names.find(n => n.issuer === issuer && n.name === key) : undefined;
  const namedAuthority = named ? await authorityForId(ctx, named.grantId) : null;
  const ids = new Set(carried.entries.filter(e => e.issuer === issuer).map(e => e.lineageGrantId));
  if (namedAuthority) ids.add(namedAuthority._id);
  if (own) ids.add(own._id);
  const candidates = [...new Map((await Promise.all([...ids].map(id => authorityForId(ctx, id)))).map(row => [String(row._id), row])).values()].sort((a,b) => a._creationTime - b._creationTime || (a._id < b._id ? -1 : 1));
  if (!candidates.length) return null;
  const anchor = candidates[0];
  const linkedByName = candidates.some(row => row.linkedByName) || (namedAuthority !== null && (!own || namedAuthority._id !== own._id));
  if (own && candidates.length === 1) {
    if (name) await rememberClientName(ctx, owner, issuer, name, own._id);
    return own;
  }
  const now = Date.now();
  await ctx.db.patch(anchor._id, { ...narrowestAuthority(candidates), linkedByName,
    revision: (anchor.revision ?? 0) + 1, updatedAt: now });
  const candidateIds = new Set(candidates.map(row => String(row._id)));
  for (const row of candidates.slice(1)) {
    await ctx.db.patch(row._id, { authorityGrantId: anchor._id, hiddenAt: now });
  }
  if (!alias) await ctx.db.insert("mcpClientAliases", { vaultOwnerId: owner, issuer, clientId, grantId: anchor._id });
  // Existing members keep their aliases: all gates and touches follow parent
  // pointers to this root. No alias/history scan and no independent old authority.
  await ctx.db.patch(carried._id, {
    entries: carried.entries.map(e => candidateIds.has(String(e.lineageGrantId)) ? { ...e, lineageGrantId: anchor._id } : e),
    names: carried.names.map(n => candidateIds.has(String(n.grantId)) ? { ...n, grantId: anchor._id } : n),
  });
  if (name) await rememberClientName(ctx, owner, issuer, name, anchor._id);
  const after = (await ctx.db.get(anchor._id))!;
  await syncCarriedRestrictions(ctx, after);
  await appendHistory(ctx, after, anchor, "system", linkedByName ? "Connections linked by name; separate installations share the narrowest limits." : "Unrecognised registration inherited unresolved earlier connection limits.", `alias:${clientId}`, "alias");
  return after;
}

const callingIdentityArgs = { subject: v.string(), issuer: v.string(), clientId: v.string() };
async function callingGrant(ctx: QueryCtx | MutationCtx, args: { subject: string; issuer: string; clientId: string }) {
  if (!args.subject.trim() || !args.issuer.trim() || !args.clientId.trim()) throw new Error("Verified connection identity required");
  const alias = await ctx.db.query("mcpClientAliases").withIndex("by_owner_client_issuer", q => q.eq("vaultOwnerId", args.subject).eq("clientId", args.clientId).eq("issuer", args.issuer)).unique();
  return alias ? authorityForId(ctx, alias.grantId) : null;
}
function describeConnection(row: Doc<"mcpGrants"> | null) {
  const state = !row ? "absent" : row.status === "revoked" || row.status === "denied" || row.status === "pending" ? row.status
    : row.pausedAt ? "paused" : isGrantExpired(row, Date.now()) ? "expired" : "active";
  const scopes = row ? effectiveScopes(row) : [];
  const heldBack = FAMILY_HISTORY_TOOLS.filter(t => state !== "active" || !scopes.includes(t.requiredScope) || (row?.boundary.kind === "queue_only" && !t.requiredScope.includes(":queue:")))
    .map(t => ({ tool: t.name, missingPower: t.requiredScope, reason: state === "active" ? "Power removed or outside the record boundary" : `Connection ${state}`, restore: `Only the person can restore access at ${AI_SETTINGS_URL}` }));
  return { state, revision: row?.revision ?? 0, powers: scopes, boundary: row?.boundary ?? null, withheldScopes: row ? effectiveWithheldScopes(row) : [],
    tools: [...FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name), ...FAMILY_HISTORY_TOOLS.filter(t => !heldBack.some(h => h.tool === t.name)).map(t => t.name)],
    heldBack, endsAt: row ? effectiveExpiry(row) ?? null : null, pausedAt: row?.pausedAt ?? null,
    changedAt: !row ? null : state === "revoked" || state === "denied" ? row.revokedAt ?? row.updatedAt : state === "paused" ? row.pausedAt : state === "expired" ? effectiveExpiry(row) : row.updatedAt,
    reason: !row ? "No connection record" : state === "revoked" || state === "denied" ? row.revokedReason ?? `Connection ${state}` : state === "paused" ? "Connection paused" : state === "expired" ? "The chosen end date has passed" : state === "pending" ? "An earlier connection has saved choices awaiting review" : "Connection active",
    settingsUrl: AI_SETTINGS_URL };
}
export const describeCallingConnection = internalQuery({
  args: callingIdentityArgs,
  handler: async (ctx, args) => {
    const carried = await carriedForOwner(ctx, args.subject);
    const row = await callingGrant(ctx, args);
    const result = describeConnection(row && carried?.ready ? projectCarriedAccess(row, carried) : row);
    return { ...(carried && !carried.ready ? { ...result, state: "pending", tools: FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name), reason: "Preparing earlier connection limits in the background" } : result), carriedRevision: carried?.revision ?? 0 };
  },
});

type Change = { action: string; revision?: number; carriedRevision?: number; opId?: string; scopes?: string[]; removeScopes?: string[];
  endsAt?: number; expiresInDays?: number; reason?: string; label?: string; boundary?: Doc<"mcpGrants">["boundary"] };
function compatibilityFields(row: Doc<"mcpGrants">) {
  return { status: row.status, scopes: effectiveScopes(row), scopeChoice: effectiveWithheldScopes(row).length ? "chosen" as const : "full" as const,
    boundary: row.boundary, expiresAt: effectiveExpiry(row) ?? null };
}
async function changeConnection(ctx: MutationCtx, row: Doc<"mcpGrants">, change: Change, actor: "ai" | "person", expectedRevision = change.revision) {
  if (!change.opId || change.opId.length > 160 || safeSentence(change.opId) !== change.opId) throw new Error("A non-secret opId of at most 160 characters is required");
  const request = await hashMcpInput({ actor, ...change });
  const replay = await ctx.db.query("mcpGrantHistory").withIndex("by_grant_op", q => q.eq("grantId", row._id).eq("opId", change.opId!)).unique();
  if (replay) {
    if (replay.request !== request) throw new Error("IDEMPOTENCY_CONFLICT: opId was already used for a different change");
    return { id: row._id, connection: await connectionWithHistory(ctx, row), ...compatibilityFields(row), ...describeConnection(row), deduplicated: true };
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision !== (row.revision ?? 0)) throw new Error("STALE_VERSION: read the current connection revision before changing it");
  const patch: Partial<Doc<"mcpGrants">> = { revision: (row.revision ?? 0) + 1, updatedAt: Date.now(), withheldScopes: effectiveWithheldScopes(row) };
  const action = change.action;
  if (actor === "ai" && action !== "limit" && (change.removeScopes?.length || change.endsAt !== undefined)) throw new Error("Use the limit action to remove powers or set an end date before pausing or revoking");
  if (actor === "ai" && !["limit", "pause", "revoke"].includes(action)) throw new Error(`Only the person can restore access at ${AI_SETTINGS_URL}`);
  if (actor === "ai" && (change.scopes || change.boundary || change.expiresInDays !== undefined)) throw new Error("AI connection changes can only remove powers and shorten an end date");
  if (action === "limit" || action === "reduce") {
    const current = effectiveScopes(row);
    const removed = change.removeScopes ?? (action === "reduce" ? current.filter(s => !change.scopes?.includes(s)) : []);
    if (removed.some(s => !FAMILY_HISTORY_SCOPES.includes(s as FamilyHistoryScope))) throw new Error("Unknown power");
    if (action === "reduce" && change.scopes?.some(s => !current.includes(s as FamilyHistoryScope))) throw new Error("Widening requires the person to restore access on the website");
    patch.withheldScopes = [...new Set([...effectiveWithheldScopes(row), ...removed])];
    if (change.endsAt !== undefined) {
      const oldEnd = effectiveExpiry(row);
      if (!Number.isFinite(change.endsAt) || change.endsAt <= Date.now() || (oldEnd !== undefined && change.endsAt > oldEnd)) throw new Error("An end date must be in the future and may only be shortened");
      patch.expiresAt = change.endsAt; patch.expiryChoice = "chosen";
    }
    patch.limitedAt = Date.now(); patch.limitedBy = actor;
  } else if (action === "pause") {
    patch.pausedAt = row.pausedAt ?? Date.now(); patch.limitedAt = Date.now(); patch.limitedBy = actor;
  } else if (action === "revoke" || action === "deny") {
    patch.status = action === "deny" ? "denied" : "revoked";
    patch.revokedAt = Date.now(); patch.revokedReason = safeSentence(change.reason ?? "Connection turned off.");
    patch.limitedAt = Date.now(); patch.limitedBy = actor;
  } else if (action === "resume") {
    if (row.status === "revoked" || row.status === "denied") throw new Error("Restore the revoked connection first");
    patch.pausedAt = undefined;
  } else if (action === "restore") {
    if (row.status === "revoked" || row.status === "denied") {
      // Restore exactly the pre-revoke powers, boundary, pause and chosen date.
      patch.status = "active"; patch.revokedAt = undefined; patch.revokedReason = undefined;
      patch.consentedAt = Date.now();
    } else {
      patch.withheldScopes = []; patch.boundary = { kind: "whole_workspace" };
      if (!row.pausedAt && effectiveExpiry(row) === undefined) { patch.limitedBy = undefined; patch.limitedAt = undefined; }
    }
    patch.hiddenAt = undefined;
  } else if (action === "expiry") {
    patch.expiresAt = chosenExpiry(change.expiresInDays, Date.now());
    patch.expiryChoice = patch.expiresAt === undefined ? "none" : "chosen";
    if (row.status === "expired") patch.status = "active";
  } else if (action === "approve") {
    if (row.status === "active" && !isGrantExpired(row, Date.now())) throw new Error("This connection is already approved");
    if (!change.scopes || !change.boundary) throw new Error("Choose powers and a record boundary");
    patch.withheldScopes = FAMILY_HISTORY_SCOPES.filter(s => !change.scopes!.includes(s));
    patch.boundary = normalizeBoundary(change.boundary);
    patch.expiresAt = chosenExpiry(change.expiresInDays, Date.now()); patch.expiryChoice = patch.expiresAt === undefined ? "none" : "chosen";
    patch.label = trimmed(change.label, 80) ?? row.label;
    patch.status = "active"; patch.pausedAt = undefined; patch.revokedAt = undefined; patch.hiddenAt = undefined;
    patch.consentedAt = Date.now();
  } else if (action === "remove") {
    if (row.status === "active" && !isGrantExpired(row, Date.now())) throw new Error("Revoke the connection before removing it");
    patch.hiddenAt = Date.now(); patch.status = "revoked"; patch.revokedAt = row.revokedAt ?? Date.now();
  } else throw new Error("Unknown connection action");
  patch.scopes = FAMILY_HISTORY_SCOPES.filter(s => !patch.withheldScopes!.includes(s));
  patch.scopeChoice = patch.withheldScopes!.length ? "chosen" : "full";
  // Capture legacy automatic expiry as unlimited before storing a deliberate choice.
  if (!patch.expiryChoice && effectiveExpiry(row) === undefined) { patch.expiryChoice = "none"; patch.expiresAt = undefined; }
  await ctx.db.patch(row._id, patch);
  const after = (await ctx.db.get(row._id))!;
  await syncCarriedRestrictions(ctx, after, actor === "person" && ["restore", "resume", "expiry", "approve"].includes(action));
  await appendHistory(ctx, after, row, actor, `${actor === "ai" ? "Your AI" : "You"} ${({ limit: "narrowed", reduce: "narrowed", pause: "paused", revoke: "revoked", deny: "declined", resume: "resumed", restore: "restored", expiry: "changed the end date for", approve: "approved", remove: "hid" } as Record<string,string>)[action]} the connection.${change.reason ? ` ${change.reason}` : ""}`, change.opId, request);
  return { id: after._id, connection: await connectionWithHistory(ctx, after), ...compatibilityFields(after), ...describeConnection(after), removed: action === "remove" };
}
async function personChange(ctx: MutationCtx, args: Change & { vaultOwnerId: string; grantId: Id<"mcpGrants"> }) {
  const decision = await authorizeTenantMutation(ctx, "mcpGrants.controlGrant", args.vaultOwnerId);
  if (!decision.allowed) throw new Error("Connection not found");
  const identity = await ctx.auth.getUserIdentity();
  // A delegated OAuth access token is never a website authority token.
  if (identity?.client_id) throw new Error("Connection restoration requires the signed-in website session");
  const row = await ownedGrant(ctx, decision.owner, args.grantId);
  const governing = await callingGrant(ctx, { subject: decision.owner, issuer: row.issuer, clientId: row.clientId });
  if (governing && args.opId) {
    const replay = await ctx.db.query("mcpGrantHistory").withIndex("by_grant_op", q => q.eq("grantId", governing._id).eq("opId", args.opId!)).unique();
    if (replay) return changeConnection(ctx, governing, args, "person");
  }
  if (["restore", "approve", "resume", "expiry"].includes(args.action)) {
    const carried = await carriedForOwner(ctx, decision.owner);
    if (!carried?.ready) throw new Error("Earlier connection limits are being prepared; retry shortly");
    if (args.carriedRevision !== carried.revision) throw new Error("STALE_VERSION: earlier connection limits changed; refresh before restoring access");
  }
  if (governing?._id !== row._id && args.action !== "remove") {
    const replay = governing && args.opId ? await ctx.db.query("mcpGrantHistory").withIndex("by_grant_op", q => q.eq("grantId", governing._id).eq("opId", args.opId!)).unique() : null;
    if (replay) return changeConnection(ctx, governing!, args, "person");
    throw new Error("This approval has been superseded. Reload the connection list.");
  }
  if (["restore", "approve", "resume", "expiry"].includes(args.action)) {
    if (args.revision !== (row.revision ?? 0)) throw new Error("STALE_VERSION: read the current connection revision");
    const carried = await prepareCarriedRestrictions(ctx, decision.owner);
    if (!carried.ready) throw new Error("Earlier connection limits are being prepared; retry when preparation finishes");
    const joined = await resolveClientAlias(ctx, decision.owner, row.clientId, row.issuer, row.observedClientName, carried);
    if (joined) return changeConnection(ctx, joined, args, "person", joined.revision ?? 0);
  }
  return changeConnection(ctx, row, args, "person");
}
export const controlGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), action: v.string(), revision: v.number(), carriedRevision: v.optional(v.number()), opId: v.string(),
    scopes: v.optional(v.array(v.string())), removeScopes: v.optional(v.array(v.string())), endsAt: v.optional(v.number()),
    expiresInDays: v.optional(v.number()), reason: v.optional(v.string()), label: v.optional(v.string()), boundary: v.optional(boundaryValidator) },
  handler: async (ctx, args) => {
    const guard = await authorizeTenantMutation(ctx, "mcpGrants.controlGrant", args.vaultOwnerId);
    if (!guard.allowed) throw new Error("Connection not found");
    return personChange(ctx, args);
  },
});
export const touchCallingConnection = internalMutation({
  args: { ...callingIdentityArgs, toolName: v.string() },
  handler: async (ctx, args) => {
    if (!FAMILY_HISTORY_CONTROL_TOOLS.some(tool => tool.name === args.toolName)) return;
    const row = await callingGrant(ctx, args);
    if (!row) return;
    const now = Date.now();
    if (row.lastToolName === args.toolName && row.lastUsedAt && now - row.lastUsedAt < USE_TOUCH_THROTTLE_MS) return;
    await ctx.db.patch(row._id, { lastUsedAt: now, lastToolName: args.toolName, useCount: row.useCount + 1 });
  },
});
export const limitCallingConnection = internalMutation({
  args: { ...callingIdentityArgs, action: v.union(v.literal("limit"), v.literal("pause"), v.literal("revoke")),
    revision: v.number(), opId: v.string(), removeScopes: v.optional(v.array(v.string())), endsAt: v.optional(v.number()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await callingGrant(ctx, args);
    if (!row) throw new Error("Connection not found");
    try { return await changeConnection(ctx, row, args, "ai"); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Connection change refused";
      const code = message.startsWith("STALE_VERSION") ? "STALE_VERSION" : message.startsWith("IDEMPOTENCY_CONFLICT") ? "IDEMPOTENCY_CONFLICT" : "VALIDATION_ERROR";
      machineError(code, safeSentence(message), `Read family_history_connection before retrying a limit. Only the person can restore access at ${AI_SETTINGS_URL}.`);
    }
  },
});

async function connectionWithHistory(ctx: QueryCtx | MutationCtx, row: Doc<"mcpGrants">) {
  const history = await ctx.db.query("mcpGrantHistory").withIndex("by_grant", q => q.eq("grantId", row._id)).order("desc").take(50);
  return { ...connectionRow(row, Date.now()), history: history.map(h => ({ actor: h.actor, at: h.at, sentence: h.sentence, revision: h.revision })) };
}

/** Read-only operational audit. It returns ONLY an owner count, never rows or
 * identifiers. Deliberately internal: no MCP or website-facing invocation. */
export const countOwnersWithUnaliasedSuccessors = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const grants = await ctx.db.query("mcpGrants").collect();
    const aliases = await ctx.db.query("mcpClientAliases").collect();
    const records = await ctx.db.query("mcpCarriedRestrictions").collect();
    const owners = new Set<string>();
    for (const carried of records) {
      if (!carried.ready) continue;
      const ownerAliases = aliases.filter(a => a.vaultOwnerId === carried.vaultOwnerId);
      for (const later of grants.filter(g => g.vaultOwnerId === carried.vaultOwnerId)) {
        if (ownerAliases.some(a => a.issuer === later.issuer && a.clientId === later.clientId)) continue;
        for (const entry of carried.entries.filter(e => e.issuer === later.issuer)) {
          const earlier = await ctx.db.get(entry.sourceGrantId);
          if (earlier && earlier.clientId !== later.clientId && earlier._creationTime < later._creationTime) owners.add(carried.vaultOwnerId);
        }
      }
    }
    // An untouched legacy owner may not have connected since deployment yet.
    // Audit their history read-only too, without dropping any owner or row.
    for (const owner of new Set(grants.map(g => g.vaultOwnerId))) {
      if (records.some(r => r.vaultOwnerId === owner && r.ready)) continue;
      const rows = grants.filter(g => g.vaultOwnerId === owner);
      const groups = new Map<string, Doc<"mcpGrants">[]>();
      for (const row of rows) {
        const key = JSON.stringify([row.issuer, row.clientId]);
        const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
      }
      const current = [];
      for (const group of groups.values()) {
        const first = group[0];
        const alias = aliases.find(a => a.vaultOwnerId === owner && a.issuer === first.issuer && a.clientId === first.clientId);
        const authorities = alias ? [await authorityForId(ctx, alias.grantId)] : await Promise.all(group.map(row => authorityForId(ctx, row._id)));
        current.push(...authorities.filter(hasUnresolvedLimit));
      }
      for (const earlier of current) {
        if (rows.some(later => later.issuer === earlier.issuer && later.clientId !== earlier.clientId && later._creationTime > earlier._creationTime && !aliases.some(a => a.vaultOwnerId === owner && a.issuer === later.issuer && a.clientId === later.clientId))) owners.add(owner);
      }
    }

    return owners.size;
  },
});

/* Durable owner-level restriction carry. Grant history is read only once, in
 * background pages, when converting pre-ledger owners. Connect never scans it. */
type Carried = Doc<"mcpCarriedRestrictions">;
async function carriedForOwner(ctx: QueryCtx | MutationCtx, owner: string) {
  return ctx.db.query("mcpCarriedRestrictions").withIndex("by_owner", q => q.eq("vaultOwnerId", owner)).unique();
}
async function prepareCarriedRestrictions(ctx: MutationCtx, owner: string): Promise<Carried> {
  const existing = await carriedForOwner(ctx, owner);
  if (existing) return existing;
  const legacy = await ctx.db.query("mcpGrants").withIndex("by_owner", q => q.eq("vaultOwnerId", owner)).first();
  const id = await ctx.db.insert("mcpCarriedRestrictions", { vaultOwnerId: owner, ready: !legacy, revision: 0, entries: [], names: [],
    ...(legacy ? { bootstrapPhase: "scan" as const, bootstrapCursor: null, bootstrapClients: "{}", bootstrapIndex: 0 } : {}) });
  if (legacy) await ctx.scheduler.runAfter(0, internal.mcpGrants.bootstrapOwnerConnections, { vaultOwnerId: owner });
  return (await ctx.db.get(id))!;
}
export const prepareOwnerConnections = internalMutation({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<{ ready: boolean }> => ({ ready: (await prepareCarriedRestrictions(ctx, args.vaultOwnerId)).ready }),
});

type LegacyClientSummary = { restricted?: Id<"mcpGrants">[]; approval?: { id: Id<"mcpGrants">; at: number; created: number }; refusal?: { id: Id<"mcpGrants">; at: number; created: number }; pending?: { id: Id<"mcpGrants">; at: number; created: number } };
function laterLegacyEvent(a: { id: Id<"mcpGrants">; at: number; created: number } | undefined, b: { id: Id<"mcpGrants">; at: number; created: number }) {
  return !a || b.at > a.at || (b.at === a.at && (b.created > a.created || (b.created === a.created && b.id > a.id)));
}
function carriedEntry(row: Doc<"mcpGrants">): Carried["entries"][number] {
  return { issuer: row.issuer, sourceGrantId: row._id, sourceRevision: row.revision ?? 0, lineageGrantId: row._id,
    withheld: effectiveWithheldScopes(row), pausedAt: row.pausedAt,
    revoked: row.status === "revoked" || row.status === "denied", pending: row.status === "pending",
    endsAt: effectiveExpiry(row), boundary: row.boundary };
}

/** Resumable conversion, not authorization: every page is processed; no cap or
 * recent-history window. Until completion every connection fails closed. */
export const bootstrapOwnerConnections = internalMutation({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, { vaultOwnerId }): Promise<void> => {
    const carried = await carriedForOwner(ctx, vaultOwnerId);
    if (!carried || carried.ready) return;
    const clients = JSON.parse(carried.bootstrapClients ?? "{}") as Record<string, LegacyClientSummary>;
    if (carried.bootstrapPhase === "scan") {
      const page = await ctx.db.query("mcpGrants").withIndex("by_owner", q => q.eq("vaultOwnerId", vaultOwnerId))
        .paginate({ cursor: carried.bootstrapCursor ?? null, numItems: 100 });
      for (const row of page.page) {
        const key = JSON.stringify([row.issuer, row.clientId]);
        const summary = clients[key] ?? {};
        const kind = isRefusal(row) ? "refusal" : row.status === "pending" ? "pending" : "approval";
        const event = { id: row._id, at: kind === "refusal" ? refusalTime(row) : approvalTime(row), created: row._creationTime };
        if (laterLegacyEvent(summary[kind], event)) summary[kind] = event;
        if (hasUnresolvedLimit(row)) summary.restricted = [...(summary.restricted ?? []), row._id];
        clients[key] = summary;
      }
      await ctx.db.patch(carried._id, { bootstrapClients: JSON.stringify(clients), bootstrapCursor: page.continueCursor,
        ...(page.isDone ? { bootstrapPhase: "index" as const, bootstrapIndex: 0 } : {}) });
    } else {
      const keys = Object.keys(clients), start = carried.bootstrapIndex ?? 0;
      const entries = [...carried.entries], names = [...carried.names];
      for (const key of keys.slice(start, start + 50)) {
        const [issuer, clientId] = JSON.parse(key) as [string, string];
        const s = clients[key];
        // Unmarked legacy timestamps never prove that the person released an
        // earlier restriction. Only a durable alias/parent authority does.
        const chosen = s.refusal ?? s.approval ?? s.pending;
        if (!chosen) continue;
        const alias = await ctx.db.query("mcpClientAliases").withIndex("by_owner_client_issuer", q => q.eq("vaultOwnerId", vaultOwnerId).eq("clientId", clientId).eq("issuer", issuer)).unique();
        const row = await authorityForId(ctx, alias?.grantId ?? chosen.id);
        if (!alias) for (const sourceId of s.restricted ?? []) {
          const source = await authorityForId(ctx, sourceId);
          if (hasUnresolvedLimit(source) && !entries.some(e => e.sourceGrantId === source._id)) entries.push(carriedEntry(source));
        }
        if (!alias) await ctx.db.insert("mcpClientAliases", { vaultOwnerId, clientId, issuer, grantId: row._id });
        if (hasUnresolvedLimit(row) && !entries.some(e => e.sourceGrantId === row._id)) entries.push(carriedEntry(row));
        const name = normalizedClientName(row.observedClientName);
        if (name && name !== normalizedClientName(clientId) && !names.some(n => n.issuer === issuer && n.name === name)) names.push({ issuer, name, grantId: row._id });
      }
      const done = start + 50 >= keys.length;
      await ctx.db.patch(carried._id, { entries, names, revision: carried.revision + 1, bootstrapIndex: start + 50,
        ...(done ? { ready: true, bootstrapPhase: undefined, bootstrapCursor: undefined, bootstrapClients: undefined, bootstrapIndex: undefined } : {}) });
    }
    if (!(await ctx.db.get(carried._id))!.ready) await ctx.scheduler.runAfter(0, internal.mcpGrants.bootstrapOwnerConnections, { vaultOwnerId });
  },
});

async function rememberClientName(ctx: MutationCtx, owner: string, issuer: string, name: string, id: Id<"mcpGrants">) {
  const carried = (await carriedForOwner(ctx, owner))!;
  const key = normalizedClientName(name);
  if (!key || carried.names.some(n => n.issuer === issuer && n.name === key)) return;
  await ctx.db.patch(carried._id, { names: [...carried.names, { issuer, name: key, grantId: id }] });
}

/** Clearing a lineage's entries is allowed ONLY in the same transaction as a
 * revision-checked person change. No permanent release flag: a later restriction
 * always writes a new source revision, even immediately after Restore. */
async function syncCarriedRestrictions(ctx: MutationCtx, row: Doc<"mcpGrants">, personRelease = false) {
  const carried = await prepareCarriedRestrictions(ctx, row.vaultOwnerId);
  if (personRelease && !carried.ready) throw new Error("Earlier connection limits are being prepared; retry when preparation finishes");
  let entries = personRelease ? carried.entries.filter(e => e.lineageGrantId !== row._id) : [...carried.entries];
  if (hasUnresolvedLimit(row)) {
    entries = entries.filter(e => e.sourceGrantId !== row._id);
    entries.push(carriedEntry(row));
  }
  await ctx.db.patch(carried._id, { entries, revision: carried.revision + 1 });
}

/** Compatibility APIs resolve the same indexed lineage as MCP. No grant-history
 * scan: the pre-ledger ordering was converted once by the background bootstrap. */
async function currentClientAuthority(ctx: QueryCtx | MutationCtx, owner: string, clientId: string, issuer: string) {
  const row = await callingGrant(ctx, { subject: owner, issuer, clientId });
  return row ? [row] : [];
}
async function revisionedLegacyChange<T extends { id: Id<"mcpGrants"> }>(ctx: MutationCtx,
  args: { vaultOwnerId: string; grantId: Id<"mcpGrants">; revision?: number; carriedRevision?: number; opId?: string }, kind: string, work: () => Promise<T>): Promise<T> {
  const decision = await authorizeTenantMutation(ctx, "mcpGrants.legacyControl", args.vaultOwnerId);
  if (!decision.allowed) throw new Error("Connection not found");
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.client_id) throw new Error("Website session required");
  const before = await ownedGrant(ctx, decision.owner, args.grantId);
  const root = await callingGrant(ctx, { subject: decision.owner, clientId: before.clientId, issuer: before.issuer });
  if (!root) throw new Error("Earlier connection limits are being prepared; retry shortly");
  if (root._id !== before._id && kind !== "remove") throw new Error("This approval has been superseded. Reload the current connection.");
  if (!args.opId || args.opId.length > 160 || safeSentence(args.opId) !== args.opId) throw new Error("A non-secret opId is required");
  if (args.revision !== (before.revision ?? 0)) throw new Error("STALE_VERSION: read the current connection revision");
  const carried = await prepareCarriedRestrictions(ctx, decision.owner);
  if (!carried.ready) throw new Error("Earlier connection limits are being prepared; retry shortly");
  if (["approve", "expiry"].includes(kind) && args.carriedRevision !== carried.revision) throw new Error("STALE_VERSION: earlier connection limits changed; refresh before restoring access");
  const result = await work();
  const after = (await ctx.db.get(result.id))!;
  const changedScopes = JSON.stringify(before.scopes) !== JSON.stringify(after.scopes) || before._id !== after._id;
  const withheldScopes = changedScopes ? FAMILY_HISTORY_SCOPES.filter(s => !after.scopes.includes(s)) : effectiveWithheldScopes(after);
  await ctx.db.patch(after._id, { revision: (before.revision ?? 0) + 1, withheldScopes });
  if (result.id !== before._id) {
    await ctx.db.patch(before._id, { authorityGrantId: result.id });
    await ctx.db.patch(carried._id, {
      entries: carried.entries.map(e => e.lineageGrantId === before._id ? { ...e, lineageGrantId: result.id } : e),
      names: carried.names.map(n => n.grantId === before._id ? { ...n, grantId: result.id } : n),
    });
  }
  const updated = (await ctx.db.get(result.id))!;
  if (root._id === before._id) await syncCarriedRestrictions(ctx, updated, ["approve", "expiry"].includes(kind));
  await appendHistory(ctx, updated, before, "person", `You ${kind === "reduce" ? "narrowed" : kind === "revoke" ? "revoked" : "changed"} this connection in Settings.`, args.opId, await hashMcpInput(args));
  return result;
}
