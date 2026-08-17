/**
 * Typed references to the owner-scoped grant lifecycle in `convex/mcpGrants.ts`.
 *
 * The checked-in `convex/_generated/api.d.ts` predates the MCP grant modules, so
 * `api.mcpGrants` does not type-exist yet. Rather than casting `api` to `any` at
 * every call site — which would lose the argument types the connection centre
 * depends on — this module declares the exact references and their shapes once.
 *
 * These are the ONLY functions the connection centre may call. Every one of them
 * is owner-scoped inside Convex by `authorizeTenantAction` /
 * `authorizeTenantMutation`; nothing here weakens that boundary, and the
 * `vaultOwnerId` passed from the app is re-derived and re-checked server side.
 */
import { makeFunctionReference } from "convex/server";

import type { FamilyHistoryScope, ScopeInfo } from "./catalog";
import type { GrantBoundaryKind, GrantStatus } from "./authorize";

export type ConnectionBoundary = {
  kind: GrantBoundaryKind;
  personIds?: string[];
  queueItemIds?: string[];
};

/** One row as the connection centre sees it. Never carries record content. */
export type ConnectionRow = {
  id: string;
  label: string;
  /** What the software called itself. A label the person can recognise, never authority. */
  observedClientName: string | null;
  clientId: string;
  issuer: string;
  clientProvenance: "cimd" | "dcr" | "manual";
  clientMetadataUrl: string | null;
  scopes: FamilyHistoryScope[];
  boundary: ConnectionBoundary;
  status: GrantStatus;
  requestedAt: number;
  consentedAt: number | null;
  issuedAt: number | null;
  expiresAt: number | null;
  lastUsedAt: number | null;
  lastToolName: string | null;
  revokedAt: number | null;
  revokedReason: string | null;
  useCount: number;
  /** JSON string of exactly what was shown at approval, or null before approval. */
  consentSnapshot: string | null;
};

export type ConnectionListing = {
  scopeInfo: readonly ScopeInfo[];
  neverExposed: readonly string[];
  neverPermitted: readonly string[];
  connections: ConnectionRow[];
};

/** One safe activity line. `tool` is a tool name; never record content. */
export type ConnectionActivityRow = {
  id: string;
  at: number;
  tool: string | null;
  outcome: "ok" | "denied" | "rate_limited" | "error";
  detail: string | null;
  grantId: string | null;
  clientId: string | null;
};

export const listConnectionsRef = makeFunctionReference<"action", { vaultOwnerId: string }, ConnectionListing>(
  "mcpGrants:listConnections",
);

export const recentConnectionActivityRef = makeFunctionReference<
  "action",
  { vaultOwnerId: string; grantId?: string; limit?: number },
  ConnectionActivityRow[]
>("mcpGrants:recentConnectionActivity");

export const approveGrantRef = makeFunctionReference<
  "mutation",
  {
    vaultOwnerId: string;
    grantId: string;
    label: string;
    scopes: string[];
    boundary: ConnectionBoundary;
    expiresInDays?: number;
  },
  { id: string; status: "active"; scopes: FamilyHistoryScope[]; boundary: ConnectionBoundary; expiresAt: number }
>("mcpGrants:approveGrant");

export const denyGrantRef = makeFunctionReference<
  "mutation",
  { vaultOwnerId: string; grantId: string; reason?: string },
  { id: string; status: "denied" }
>("mcpGrants:denyGrant");

export const reduceGrantScopesRef = makeFunctionReference<
  "mutation",
  { vaultOwnerId: string; grantId: string; scopes: string[] },
  { id: string; scopes: FamilyHistoryScope[] }
>("mcpGrants:reduceGrantScopes");

export const revokeGrantRef = makeFunctionReference<
  "mutation",
  { vaultOwnerId: string; grantId: string; reason?: string },
  { id: string; status: "revoked" }
>("mcpGrants:revokeGrant");

export const removeGrantRef = makeFunctionReference<
  "mutation",
  { vaultOwnerId: string; grantId: string },
  { id: string; removed: true }
>("mcpGrants:removeGrant");
