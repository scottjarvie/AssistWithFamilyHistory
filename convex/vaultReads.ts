import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { authorizeTenantAction, type TrustBoundaryShadowEntry } from "./access";
import type * as vaultFunctions from "./vault";

type VaultInternalApi = FilterApi<
  ApiFromModules<{ vault: typeof vaultFunctions }>,
  FunctionReference<"query", "internal">
>["vault"];

const vaultInternal: VaultInternalApi = (
  internal as unknown as { vault: VaultInternalApi }
).vault;
const shadowRecorder: FunctionReference<"mutation", "internal"> = (
  internal as unknown as {
    trustBoundary: {
      recordShadowDenial: FunctionReference<"mutation", "internal">;
    };
  }
).trustBoundary.recordShadowDenial;

const storyWorkflowValidator = v.union(
  v.literal("needs_genealogy_evidence"),
  v.literal("needs_context_research"),
  v.literal("ready_to_draft"),
  v.literal("ready_to_review"),
  v.literal("published"),
);

async function authorizedOwner(ctx: ActionCtx, functionName: string, suppliedOwner: string) {
  const decision = await authorizeTenantAction(
    ctx,
    functionName,
    suppliedOwner,
    (entry: TrustBoundaryShadowEntry) =>
      ctx.runMutation(shadowRecorder, entry),
  );
  return decision.owner;
}

export const getPeopleExplorer = action({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    researchStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("basic"),
        v.literal("in_progress"),
        v.literal("thorough"),
        v.literal("complete"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getPeopleExplorer>> =>
    ctx.runQuery(vaultInternal.getPeopleExplorer, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getPeopleExplorer", args.vaultOwnerId),
    }),
});

export const getPersonWorkspace = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getPersonWorkspace>> =>
    ctx.runQuery(vaultInternal.getPersonWorkspace, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getPersonWorkspace", args.vaultOwnerId),
    }),
});

export const getOwnedMediaFile = action({
  args: { vaultOwnerId: v.string(), mediaId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getOwnedMediaFile>> =>
    ctx.runQuery(vaultInternal.getOwnedMediaFile, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getOwnedMediaFile", args.vaultOwnerId),
    }),
});

export const getStoriesIndex = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getStoriesIndex>> =>
    ctx.runQuery(vaultInternal.getStoriesIndex, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getStoriesIndex", args.vaultOwnerId),
    }),
});

export const getStoryReview = action({
  args: { vaultOwnerId: v.string(), storyId: v.id("stories") },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getStoryReview>> =>
    ctx.runQuery(vaultInternal.getStoryReview, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getStoryReview", args.vaultOwnerId),
    }),
});

export const getPersonResearchChecks = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getPersonResearchChecks>> =>
    ctx.runQuery(vaultInternal.getPersonResearchChecks, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getPersonResearchChecks", args.vaultOwnerId),
    }),
});

export const getProvisionalRelatives = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.optional(v.string()) },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getProvisionalRelatives>> =>
    ctx.runQuery(vaultInternal.getProvisionalRelatives, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getProvisionalRelatives", args.vaultOwnerId),
    }),
});

export const getOperationsQueue = action({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    rowType: v.optional(v.union(v.literal("person"), v.literal("provisional"))),
    missingCheck: v.optional(v.string()),
    storyStatus: v.optional(v.union(v.literal("has_story"), v.literal("no_story"))),
    storyWorkflow: v.optional(storyWorkflowValidator),
    staleOnly: v.optional(v.boolean()),
    sortBy: v.optional(
      v.union(
        v.literal("missingCritical"),
        v.literal("completion"),
        v.literal("lastTouched"),
        v.literal("sourceCount"),
        v.literal("storyReadiness"),
        v.literal("newestImport"),
      ),
    ),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getOperationsQueue>> =>
    ctx.runQuery(vaultInternal.getOperationsQueue, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getOperationsQueue", args.vaultOwnerId),
    }),
});

export const getOperationsSummary = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getOperationsSummary>> =>
    ctx.runQuery(vaultInternal.getOperationsSummary, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getOperationsSummary", args.vaultOwnerId),
    }),
});

export const getVaultAudit = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getVaultAudit>> =>
    ctx.runQuery(vaultInternal.getVaultAudit, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getVaultAudit", args.vaultOwnerId),
    }),
});

export const getContextCoverage = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getContextCoverage>> =>
    ctx.runQuery(vaultInternal.getContextCoverage, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getContextCoverage", args.vaultOwnerId),
    }),
});

export const getStoryReadinessCandidates = action({
  args: {
    vaultOwnerId: v.string(),
    storyWorkflow: v.optional(storyWorkflowValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getStoryReadinessCandidates>> =>
    ctx.runQuery(vaultInternal.getStoryReadinessCandidates, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getStoryReadinessCandidates", args.vaultOwnerId),
    }),
});

export const getPlacesExplorer = action({
  args: { vaultOwnerId: v.string(), search: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getPlacesExplorer>> =>
    ctx.runQuery(vaultInternal.getPlacesExplorer, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getPlacesExplorer", args.vaultOwnerId),
    }),
});

export const getPlaceWorkspace = action({
  args: { vaultOwnerId: v.string(), placeId: v.id("places") },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getPlaceWorkspace>> =>
    ctx.runQuery(vaultInternal.getPlaceWorkspace, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getPlaceWorkspace", args.vaultOwnerId),
    }),
});

export const getDashboardSummary = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getDashboardSummary>> =>
    ctx.runQuery(vaultInternal.getDashboardSummary, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getDashboardSummary", args.vaultOwnerId),
    }),
});

export const getResearchOverview = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getResearchOverview>> =>
    ctx.runQuery(vaultInternal.getResearchOverview, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getResearchOverview", args.vaultOwnerId),
    }),
});

export const getContextPack = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getContextPack>> =>
    ctx.runQuery(vaultInternal.getContextPack, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getContextPack", args.vaultOwnerId),
    }),
});
