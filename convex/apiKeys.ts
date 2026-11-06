/**
 * Agent API-key management mutations/queries.
 *
 * Owner-scoped lifecycle for the credentials that let an external AI agent act
 * as one vault owner. The raw secret is generated + hashed in the Next server
 * (lib/auth/apiKey.ts); this layer only ever stores/returns the SHA-256 hash and
 * never the raw secret. Mutations authorize in-place; reads enter through an
 * authorized public action before reaching their internal query.
 *
 * NOTE: resolution of an incoming key -> owner (the read/auth path) is a
 * separate, internal-only function added when the agent-auth middleware lands;
 * it is intentionally NOT a public query here (no public lookup-by-keyId).
 */
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { authorizeTenantAction, authorizeTenantMutation, requirePersonSession } from "./access";
import { filterByVaultOwner, matchesVaultOwner } from "./vaultCore";

import { isAdminUser } from "../lib/auth/admin";
import { effectiveApiKeyScopes, fullOwnDataScopes, sanitizeScopes, scopesRequireAdmin } from "../lib/auth/scopes";

const tierValidator = v.union(v.literal("trial"), v.literal("standard"), v.literal("trusted"));

export const mintKey = mutation({
  args: {
    vaultOwnerId: v.string(),
    keyId: v.string(),
    hashedSecret: v.string(),
    label: v.string(),
    scopes: v.optional(v.array(v.string())),
    scopeChoice: v.optional(v.union(v.literal("full"), v.literal("chosen"))),
    tier: v.optional(tierValidator),
    expiresAt: v.optional(v.number()),
    createdByUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePersonSession(ctx);
    const decision = await authorizeTenantMutation(ctx, "apiKeys.mintKey", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("API key not found");
    const vaultOwnerId = decision.owner;
    if (!args.keyId.startsWith("dts_")) {
      throw new Error("Invalid API key id prefix");
    }
    if (args.label.trim().length === 0) {
      throw new Error("API key label is required");
    }
    if (await ctx.db.query("apiKeys").withIndex("by_keyId", (q) => q.eq("keyId", args.keyId)).first()) throw new Error("API key id already exists");
    const scopeChoice = args.scopeChoice ?? (args.scopes === undefined ? "full" : "chosen");
    const scopes = scopeChoice === "full" ? fullOwnDataScopes() : sanitizeScopes(args.scopes ?? []);
    if (scopesRequireAdmin(scopes) && !isAdminUser(decision.caller)) throw new Error("Admin scopes require an operator role");
    if (scopeChoice === "full" && args.scopes !== undefined && !fullOwnDataScopes().every((scope) => args.scopes!.includes(scope))) throw new Error("Full access requires all private-data permissions");
    const now = Date.now();
    const id = await ctx.db.insert("apiKeys", {
      vaultOwnerId,
      keyId: args.keyId,
      hashedSecret: args.hashedSecret,
      label: args.label.trim(),
      scopes,
      scopeChoice,
      version: 0,
      tier: args.tier ?? "standard",
      status: "active",
      createdAt: now,
      expiresAt: args.expiresAt,
      createdByUserId:
        decision.callerKind === "authenticated"
          ? decision.caller
          : args.createdByUserId,
    });
    return { _id: id, keyId: args.keyId };
  },
});

export const revokeKey = mutation({
  args: { vaultOwnerId: v.string(), keyId: v.string() },
  handler: async (ctx, args) => {
    await requirePersonSession(ctx);
    const decision = await authorizeTenantMutation(ctx, "apiKeys.revokeKey", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("API key not found");
    const vaultOwnerId = decision.owner;
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", args.keyId))
      .first();
    if (!row || !matchesVaultOwner(row.vaultOwnerId, vaultOwnerId)) {
      throw new Error("API key not found");
    }
    if (row.status !== "revoked") {
      await ctx.db.patch(row._id, { status: "revoked", revokedAt: Date.now(), version: (row.version ?? 0) + 1 });
      await auditKey(ctx, row, "revoke");
    }
    return { keyId: args.keyId, status: "revoked" as const };
  },
});

/** Suspend or reactivate a key (operator tooling). Revoked keys are terminal. */
export const setKeyStatus = mutation({
  args: {
    vaultOwnerId: v.string(),
    keyId: v.string(),
    status: v.union(v.literal("active"), v.literal("suspended")),
    expectedVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePersonSession(ctx);
    const decision = await authorizeTenantMutation(ctx, "apiKeys.setKeyStatus", args.vaultOwnerId);
    if (!decision.allowed) throw new Error("API key not found");
    const vaultOwnerId = decision.owner;
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", args.keyId))
      .first();
    if (!row || !matchesVaultOwner(row.vaultOwnerId, vaultOwnerId)) {
      throw new Error("API key not found");
    }
    if (row.status === "revoked") {
      throw new Error("Revoked keys cannot be reactivated");
    }
    if (args.status === "active" && args.expectedVersion !== (row.version ?? 0)) throw new Error("Connection changed. Reload the API Center before restoring access");
    await ctx.db.patch(row._id, { status: args.status, version: (row.version ?? 0) + 1 });
    await auditKey(ctx, row, args.status);
    return { keyId: args.keyId, status: args.status };
  },
});

/** Owner's keys, newest first. NEVER returns hashedSecret. */
const listKeysArgs = { vaultOwnerId: v.string() };

type ListedApiKey = Pick<
  Doc<"apiKeys">,
  "keyId" | "label" | "scopes" | "tier" | "status" | "createdAt" | "lastUsedAt" | "revokedAt" | "expiresAt"
>;

export const listKeysInternal = internalQuery({
  args: listKeysArgs,
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", args.vaultOwnerId))
      .collect();
    return filterByVaultOwner(rows, args.vaultOwnerId)
      .map((row) => ({
        keyId: row.keyId,
        label: row.label,
        scopes: effectiveApiKeyScopes(row),
        version: row.version ?? 0,
        scopeChoice: row.scopeChoice,
        tier: row.tier,
        status: row.status,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
        expiresAt: row.expiresAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listKeys = action({
  args: listKeysArgs,
  handler: async (ctx, args): Promise<ListedApiKey[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "apiKeys.listKeys",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.apiKeys.listKeysInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

async function auditKey(ctx: import("./_generated/server").MutationCtx, row: Doc<"apiKeys">, action: string, detail?: string) {
  return ctx.db.insert("agentActivity", { vaultOwnerId: row.vaultOwnerId, keyId: row.keyId,
    requestId: `authority:${row._id}:${(row.version ?? 0) + 1}`, principalKind: "api_key", route: "/api-key/access", method: action,
    outcome: "ok", statusCode: 200, createdAt: Date.now(), detail: detail ?? JSON.stringify({ action, version: (row.version ?? 0) + 1 }) });
}

/** Hash derived by the HTTP transport. Never reachable as a public Convex function. */
export const reduceOwnKey = internalMutation({
  args: { keyId: v.string(), hashedSecret: v.string(), action: v.union(v.literal("inspect"), v.literal("reduce"), v.literal("pause"), v.literal("revoke")),
    expectedVersion: v.optional(v.number()), scopes: v.optional(v.array(v.string())), expiresAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("apiKeys").withIndex("by_keyId", (q) => q.eq("keyId", args.keyId)).unique();
    if (!row || row.hashedSecret !== args.hashedSecret || row.status !== "active" || (row.expiresAt !== undefined && row.expiresAt <= Date.now())) throw new Error("Invalid or inactive connection. Only the person can restore access in Settings > API Center.");
    const before = { keyId: row.keyId, version: row.version ?? 0, scopes: effectiveApiKeyScopes(row), expiresAt: row.expiresAt ?? null, status: row.status };
    if (args.action === "inspect") return before;
    if (args.expectedVersion !== (row.version ?? 0)) throw new Error("Connection changed. Inspect your own connection again before reducing it.");
    if (args.scopes?.some((scope) => !effectiveApiKeyScopes(row).includes(scope as never)) || (args.expiresAt !== undefined && (!Number.isFinite(args.expiresAt) || (row.expiresAt !== undefined && args.expiresAt > row.expiresAt)))) throw new Error("AI cannot increase access. The person can change it in Settings > API Center.");
    const patch = { scopes: args.scopes ?? row.scopes, scopeChoice: args.scopes === undefined ? row.scopeChoice : "chosen" as const,
      expiresAt: args.expiresAt ?? row.expiresAt, status: args.action === "revoke" ? "revoked" as const : args.action === "pause" ? "suspended" as const : row.status,
      version: (row.version ?? 0) + 1, ...(args.action === "revoke" ? { revokedAt: Date.now() } : {}) };
    await ctx.db.patch(row._id, patch);
    const after = { keyId: row.keyId, version: patch.version, scopes: effectiveApiKeyScopes({ ...row, ...patch }), expiresAt: patch.expiresAt ?? null, status: patch.status };
    const receiptId = await auditKey(ctx, row, args.action, JSON.stringify({ before, after, action: args.action }));
    return { ...after, receiptId };
  },
});
