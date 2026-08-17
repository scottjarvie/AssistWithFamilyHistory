/**
 * Client trust for the Family History MCP surface.
 *
 * Preferred path: a Client ID Metadata Document. When the verified `client_id`
 * is an HTTPS URL we fetch it once, validate it strictly, and cache the verdict
 * for 24 hours. Nothing here grants a permission — the grant in
 * `convex/mcpGrants.ts` is always the permission. This only decides whether we
 * can honestly tell a person where a connection came from.
 *
 * Fallback path: Dynamic Client Registration records, kept as a bounded
 * compatibility shim. There is deliberately NO public registration endpoint in
 * this repository; enabling DCR is a provider decision recorded in
 * `docs/operations/bring-your-ai-provider-actions.md`.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

// The checked-in convex/_generated/api.d.ts predates this module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trust = (internal as any).mcpClientTrust;
import { FAMILY_HISTORY_MCP_LIMITS, hashMcpInput } from "../lib/mcp/contract";
import {
  evaluateMetadataResponse,
  validateClientIdUrl,
  type ClientMetadataResult,
} from "../lib/mcp/clientMetadata";

/** Re-fetch rather than trust a cached document after this long. */
export const CLIENT_METADATA_TTL_MS = 24 * 60 * 60 * 1000;

/** Bounded compatibility fallback: never an unaudited client factory. */
export const MAX_DCR_REGISTRATIONS = 50;
export const DCR_REGISTRATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ClientTrust = {
  clientId: string;
  provenance: "cimd" | "dcr" | "manual";
  clientName?: string;
  metadataUrl?: string;
  trusted: boolean;
  reason?: string;
};

export const getRegistration = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) =>
    await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .unique(),
});

export const saveRegistration = internalMutation({
  args: {
    clientId: v.string(),
    metadataUrl: v.optional(v.string()),
    metadataHash: v.optional(v.string()),
    clientName: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    tokenEndpointAuthMethod: v.optional(v.string()),
    provenance: v.union(v.literal("cimd"), v.literal("dcr"), v.literal("manual")),
    status: v.union(v.literal("valid"), v.literal("rejected"), v.literal("stale")),
    rejectionReason: v.optional(v.string()),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ttl = args.ttlMs ?? CLIENT_METADATA_TTL_MS;
    const existing = await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();
    const row = {
      clientId: args.clientId.slice(0, 400),
      metadataUrl: args.metadataUrl,
      metadataHash: args.metadataHash,
      clientName: args.clientName,
      redirectUris: args.redirectUris.slice(0, 20),
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      provenance: args.provenance,
      validatedAt: now,
      lastFetchedAt: now,
      expiresAt: now + ttl,
      status: args.status,
      rejectionReason: args.rejectionReason?.slice(0, 300),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    if (args.provenance === "dcr") {
      const count = (
        await ctx.db
          .query("mcpClientRegistrations")
          .withIndex("by_provenance_validated", (q) => q.eq("provenance", "dcr"))
          .take(MAX_DCR_REGISTRATIONS + 1)
      ).length;
      if (count >= MAX_DCR_REGISTRATIONS) {
        throw new Error("Dynamic client registration cap reached");
      }
    }
    return await ctx.db.insert("mcpClientRegistrations", row);
  },
});

/** Drop aged-out DCR records so the fallback cannot accumulate quietly. */
export const cleanupExpiredRegistrations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_provenance_validated", (q) => q.eq("provenance", "dcr"))
      .take(MAX_DCR_REGISTRATIONS + 1);
    let removed = 0;
    for (const row of rows) {
      if (row.validatedAt + DCR_REGISTRATION_TTL_MS <= now) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return { removed };
  },
});

/**
 * Validate (or re-use a cached validation of) a client identifier.
 *
 * Only HTTPS-URL client identifiers are CIMD candidates. An opaque identifier
 * — what a provider issues today — comes back as `manual` provenance with
 * `trusted: false`, which is honest: we know the token was issued to it, and
 * nothing more.
 */
export const validateClient = internalAction({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }): Promise<ClientTrust> => {
    const cached = await ctx.runQuery(trust.getRegistration, { clientId });
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return {
        clientId,
        provenance: cached.provenance,
        clientName: cached.clientName,
        metadataUrl: cached.metadataUrl,
        trusted: cached.status === "valid",
        reason: cached.rejectionReason,
      };
    }

    if (!clientId.startsWith("https://")) {
      return {
        clientId,
        provenance: cached?.provenance ?? "manual",
        clientName: cached?.clientName,
        trusted: false,
        reason: "The client identifier is not a Client ID Metadata Document URL.",
      };
    }

    const urlCheck = validateClientIdUrl(clientId);
    if (!urlCheck.ok) {
      await ctx.runMutation(trust.saveRegistration, {
        clientId,
        redirectUris: [],
        provenance: "cimd",
        status: "rejected",
        rejectionReason: `${urlCheck.reason}: ${urlCheck.detail}`,
      });
      return { clientId, provenance: "cimd", trusted: false, reason: urlCheck.reason };
    }
    const url = urlCheck.url;

    let result: ClientMetadataResult;
    let bodyText = "";
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        // A redirect is a rejection, never a hop. See lib/mcp/clientMetadata.ts
        // for why, and for the DNS-level SSRF limit we cannot close here.
        redirect: "manual",
        headers: { accept: "application/json" },
      });
      bodyText = (await response.text()).slice(0, FAMILY_HISTORY_MCP_LIMITS.clientMetadataBytes + 1);
      result = evaluateMetadataResponse(url.toString(), response, bodyText);
    } catch {
      result = { ok: false, reason: "BAD_STATUS", detail: "The metadata URL could not be reached." };
    }

    if (!result.ok) {
      await ctx.runMutation(trust.saveRegistration, {
        clientId,
        metadataUrl: url.toString(),
        redirectUris: [],
        provenance: "cimd",
        status: "rejected",
        rejectionReason: `${result.reason}: ${result.detail}`,
      });
      return { clientId, provenance: "cimd", metadataUrl: url.toString(), trusted: false, reason: result.reason };
    }

    await ctx.runMutation(trust.saveRegistration, {
      clientId,
      metadataUrl: url.toString(),
      metadataHash: await hashMcpInput(bodyText),
      clientName: result.clientName,
      redirectUris: result.redirectUris,
      tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
      provenance: "cimd",
      status: "valid",
    });
    return {
      clientId,
      provenance: "cimd",
      clientName: result.clientName,
      metadataUrl: url.toString(),
      trusted: true,
    };
  },
});
