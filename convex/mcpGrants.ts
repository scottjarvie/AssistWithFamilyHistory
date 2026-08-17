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

/** At most this many unanswered connection requests may pile up per person. */
export const MAX_PENDING_GRANTS_PER_OWNER = 5;

/** Skip the last-used write when the same tool ran again inside this window. */
const USE_TOUCH_THROTTLE_MS = 15_000;

const DEFAULT_GRANT_DAYS = 90;
const MAX_GRANT_DAYS = 365;

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
    scopes: clampToScopeCeiling(row.scopes),
    boundary: {
      kind: row.boundary.kind,
      personIds: row.boundary.personIds,
      queueItemIds: row.boundary.queueItemIds,
    },
    expiresAt: row.expiresAt,
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
}) {
  return JSON.stringify({
    shownAt: Date.now(),
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
    expiresAt: input.expiresAt ?? null,
    neverExposed: NEVER_EXPOSED,
    neverPermitted: NEVER_PERMITTED,
  });
}

/* ---------------------------------------------------- per-request resolution */

async function grantsForClient(ctx: QueryCtx | MutationCtx, owner: string, clientId: string) {
  return await ctx.db
    .query("mcpGrants")
    .withIndex("by_owner_client", (q) => q.eq("vaultOwnerId", owner).eq("clientId", clientId))
    .collect();
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

    const rows = (await grantsForClient(ctx, owner, clientId)).filter(
      (row) => row.issuer === args.issuer,
    );

    // One active grant governs the request. If several exist (a person
    // re-approved without revoking), the most recently consented one wins and
    // the others are left untouched — scopes are never combined.
    const active = rows
      .filter((row) => row.status === "active")
      .sort((a, b) => (b.consentedAt ?? b.updatedAt) - (a.consentedAt ?? a.updatedAt))[0];

    if (active) {
      if (isGrantExpired(active, now)) {
        await ctx.db.patch(active._id, { status: "expired", updatedAt: now });
        return { state: "expired" };
      }
      return { state: "active", grant: toResolvedGrant(active) };
    }

    if (rows.some((row) => row.status === "pending")) return { state: "pending" };
    if (rows.some((row) => row.status === "denied")) return { state: "denied" };
    if (rows.some((row) => row.status === "revoked")) return { state: "revoked" };
    if (rows.some((row) => row.status === "expired")) return { state: "expired" };

    // Nothing on record: raise exactly one bounded connection request so the
    // person can approve it in the product, where real scope language exists.
    const pending = await ctx.db
      .query("mcpGrants")
      .withIndex("by_owner_status", (q) => q.eq("vaultOwnerId", owner).eq("status", "pending"))
      .take(MAX_PENDING_GRANTS_PER_OWNER + 1);
    if (pending.length < MAX_PENDING_GRANTS_PER_OWNER) {
      await ctx.db.insert("mcpGrants", {
        vaultOwnerId: owner,
        clientId,
        issuer: args.issuer,
        label: trimmed(args.observedClientName, 80) ?? "New AI connection",
        observedClientName: trimmed(args.observedClientName, 120),
        clientProvenance: args.clientProvenance ?? "manual",
        clientMetadataUrl: args.clientMetadataUrl,
        scopes: [],
        boundary: { kind: "queue_only" },
        status: "pending",
        requestedAt: now,
        useCount: 0,
        updatedAt: now,
      });
    }
    return { state: "absent" };
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
  const resolution: GrantResolution =
    row.status === "active"
      ? { state: "active", grant: toResolvedGrant(row) }
      : { state: row.status };
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
async function readConnections(ctx: QueryCtx, vaultOwnerId: string) {
  const rows = await ctx.db
    .query("mcpGrants")
    .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
    .order("desc")
    .take(100);
  const now = Date.now();
  return {
    scopeInfo: FAMILY_HISTORY_SCOPE_INFO,
    neverExposed: NEVER_EXPOSED,
    neverPermitted: NEVER_PERMITTED,
    connections: rows.map((row) => ({
      id: row._id,
      label: row.label,
      observedClientName: row.observedClientName ?? null,
      clientId: row.clientId,
      issuer: row.issuer,
      clientProvenance: row.clientProvenance,
      clientMetadataUrl: row.clientMetadataUrl ?? null,
      scopes: clampToScopeCeiling(row.scopes),
      boundary: row.boundary,
      // Expiry is decided in code at read time, so a row that has aged out
      // reads as expired even before anything rewrites its status.
      status: row.status === "active" && isGrantExpired(row, now) ? "expired" : row.status,
      requestedAt: row.requestedAt,
      consentedAt: row.consentedAt ?? null,
      issuedAt: row.issuedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      lastToolName: row.lastToolName ?? null,
      revokedAt: row.revokedAt ?? null,
      revokedReason: row.revokedReason ?? null,
      useCount: row.useCount,
      consentSnapshot: row.consentSnapshot ?? null,
    })),
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
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status === "active") throw new Error("This connection is already approved");
    if (row.status === "revoked" || row.status === "denied") {
      throw new Error("Approve a fresh connection request instead of reviving a closed one");
    }
    // Anything above the ceiling is dropped here, not merely unused.
    const scopes = clampToScopeCeiling(args.scopes);
    if (scopes.length === 0) throw new Error("Choose at least one permission for this connection");
    const label = trimmed(args.label, 80) ?? row.label;
    const boundary = normalizeBoundary(args.boundary);
    const days = Math.max(1, Math.min(Math.floor(args.expiresInDays ?? DEFAULT_GRANT_DAYS), MAX_GRANT_DAYS));
    const now = Date.now();
    const expiresAt = now + days * 24 * 60 * 60 * 1000;
    await ctx.db.patch(row._id, {
      label,
      scopes,
      boundary,
      status: "active",
      consentedAt: now,
      issuedAt: now,
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
    });
    return { id: row._id, status: "active" as const, scopes, boundary, expiresAt };
  },
});

export const denyGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.denyGrant", args.vaultOwnerId);
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
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status !== "active") throw new Error("Only an active connection can be narrowed");
    const current = new Set(clampToScopeCeiling(row.scopes));
    const requested = clampToScopeCeiling(args.scopes);
    const next = requested.filter((scope) => current.has(scope));
    // This path only ever narrows. Widening requires a fresh approval so the
    // person sees the new consent screen.
    if (next.length !== requested.length) {
      throw new Error("Widening a connection requires a fresh approval");
    }
    if (next.length === 0) throw new Error("Revoke the connection instead of removing every permission");
    const now = Date.now();
    await ctx.db.patch(row._id, { scopes: next, updatedAt: now });
    return { id: row._id, scopes: next };
  },
});

export const revokeGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.revokeGrant", args.vaultOwnerId);
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    const now = Date.now();
    // Revocation takes effect on the very next request because the transport
    // re-resolves the grant every time; no token has to expire first.
    await ctx.db.patch(row._id, {
      status: "revoked",
      revokedAt: now,
      revokedReason: trimmed(args.reason, 300),
      updatedAt: now,
    });
    return { id: row._id, status: "revoked" as const };
  },
});

export const removeGrant = mutation({
  args: { vaultOwnerId: v.string(), grantId: v.id("mcpGrants") },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpGrants.removeGrant", args.vaultOwnerId);
    const row = await ownedGrant(ctx, decision.owner, args.grantId);
    if (row.status === "active") throw new Error("Revoke the connection before removing it");
    await ctx.db.delete(row._id);
    return { id: row._id, removed: true as const };
  },
});

/** Small helper the transport uses to name the tool in an activity row. */
export function activityToolLabel(name: string): string {
  return findTool(name)?.name ?? "unknown_tool";
}
