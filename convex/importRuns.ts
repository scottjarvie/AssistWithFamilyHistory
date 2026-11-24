import { v } from "convex/values";
import { action, internalQuery, mutation } from "./searchServer";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  authorizeOwnedReferenceMutation,
  authorizeTenantAction,
  authorizeTenantMutation,
} from "./access";
import { DEFAULT_LOCAL_VAULT_OWNER } from "../lib/vault/constants";
import { filterByVaultOwner, normalizeVaultOwnerId } from "./vaultCore";

const pageTypeValidator = v.union(
  v.literal("sources"),
  v.literal("memories"),
  v.literal("person")
);

const mergeStatusValidator = v.union(
  v.literal("created"),
  v.literal("merged"),
  v.literal("updated"),
  v.literal("partial")
);

export const record = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.optional(v.id("persons")),
    personFsId: v.string(),
    personName: v.string(),
    captureId: v.string(),
    captureVersion: v.string(),
    pageTypes: v.array(pageTypeValidator),
    sourceUrls: v.array(v.string()),
    capturedAt: v.number(),
    compatibilityMode: v.boolean(),
    mergeStatus: mergeStatusValidator,
    counts: v.object({
      sources: v.number(),
      citations: v.number(),
      memories: v.number(),
      relationships: v.number(),
      places: v.number(),
      events: v.number(),
      warnings: v.number(),
    }),
    warnings: v.array(v.string()),
    artifactPaths: v.object({
      capturePackagePath: v.optional(v.string()),
      evidencePackPath: v.optional(v.string()),
      rawDocumentPath: v.optional(v.string()),
      contextualizedPath: v.optional(v.string()),
    }),
    metadata: v.optional(
      v.object({
        extractorVersion: v.optional(v.string()),
        mode: v.optional(v.union(v.literal("standard"), v.literal("admin"))),
        pageTitle: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "importRuns.record", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    if (args.personId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        "importRuns.record",
        vaultOwnerId,
        await ctx.db.get(args.personId),
        "Person",
      );
    }
    return await ctx.db.insert("importRuns", {
      ...args,
      vaultOwnerId,
      importedAt: Date.now(),
    });
  },
});

const listRecentArgs = {
  vaultOwnerId: v.string(),
  limit: v.optional(v.number()),
  personIdentifier: v.optional(v.string()),
};

export const listRecentInternal = internalQuery({
  args: listRecentArgs,
  handler: async (ctx, args) => {
    const owner = normalizeVaultOwnerId(args.vaultOwnerId);
    const owners = owner === DEFAULT_LOCAL_VAULT_OWNER ? [owner, undefined, ""] : [owner];
    const identifier = args.personIdentifier;
    const personId = identifier ? ctx.db.normalizeId("persons", identifier) : null;
    const limit = args.limit;
    const indexedLimit = limit && limit > 0 && Number.isSafeInteger(Math.trunc(limit))
      ? Math.trunc(limit)
      : undefined;
    if (indexedLimit === 0) return [];
    const queries = owners.flatMap(vaultOwnerId => {
      const table = () => ctx.db.query("importRuns");
      if (!identifier) {
        return [table().withIndex("by_owner_imported_at", q => q.eq("vaultOwnerId", vaultOwnerId))];
      }
      const byFsId = table().withIndex("by_owner_fs_imported_at", q =>
        q.eq("vaultOwnerId", vaultOwnerId).eq("personFsId", identifier));
      return personId ? [byFsId, table().withIndex("by_owner_person_imported_at", q =>
        q.eq("vaultOwnerId", vaultOwnerId).eq("personId", personId))] : [byFsId];
    });
    const batches = await Promise.all(queries.map(query => {
      const descending = query.order("desc");
      return indexedLimit === undefined ? descending.collect() : descending.take(indexedLimit);
    }));
    const rows = [...new Map(batches.flat().map(row => [row._id, row])).values()].sort((a, b) =>
      b.importedAt - a.importedAt || b._creationTime - a._creationTime);
    return limit ? rows.slice(0, limit) : rows;
  },
});

export const listRecent = action({
  args: listRecentArgs,
  handler: async (ctx, args): Promise<Doc<"importRuns">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "importRuns.listRecent",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.importRuns.listRecentInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

const getByCaptureIdArgs = { captureId: v.string(), vaultOwnerId: v.string() };

export const getByCaptureIdInternal = internalQuery({
  args: getByCaptureIdArgs,
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("importRuns")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .collect();
    return filterByVaultOwner(rows, args.vaultOwnerId)[0] ?? null;
  },
});

export const getByCaptureId = action({
  args: getByCaptureIdArgs,
  handler: async (ctx, args): Promise<Doc<"importRuns"> | null> => {
    const decision = await authorizeTenantAction(
      ctx,
      "importRuns.getByCaptureId",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.importRuns.getByCaptureIdInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

export const attachArtifactPaths = mutation({
  args: {
    vaultOwnerId: v.string(),
    importRunId: v.id("importRuns"),
    artifactPaths: v.object({
      capturePackagePath: v.optional(v.string()),
      evidencePackPath: v.optional(v.string()),
      rawDocumentPath: v.optional(v.string()),
      contextualizedPath: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "importRuns.attachArtifactPaths", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const existing = await authorizeOwnedReferenceMutation(
      ctx,
      "importRuns.attachArtifactPaths",
      vaultOwnerId,
      await ctx.db.get(args.importRunId),
      "Import run",
    );

    await ctx.db.patch(args.importRunId, {
      artifactPaths: {
        ...existing.artifactPaths,
        ...Object.fromEntries(
          Object.entries(args.artifactPaths).filter(([, value]) => typeof value === "string" && value.length > 0)
        ),
      },
    });

    return args.importRunId;
  },
});
