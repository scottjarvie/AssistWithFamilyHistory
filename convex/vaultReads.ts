"use node";
import {operationsArgs, readinessArgs} from "./personScores";
import type {OperationsPage,ReadinessPage} from "./personScoreModel";

import {placePageArgs,sectionValidator,type PlaceWorkspace,type SectionPage,type PlaceSection,type PlaceListPage,type PlaceMention} from "./placePages";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {requireWebsitePerson} from "./access";
import {validateAudioContainer, normalizeAudioMime, audioContainerError, invalidAudioFileError, checkVoiceNoteDuration, voiceNoteTooLongError} from "./lib/media/audio";
import {readRecords} from "./auditPages";
import {projectAuditSummary} from "../lib/audit/presentation";
import {auditMetrics} from "../lib/audit/contract";
import { researchPageArgs } from "./researchPages";
import type { TaskPage, LogPage } from "./researchPages";
import { pageArgs, type PeoplePageResult } from "./peopleExplorer";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { decideTenantAccess, authorizeTenantAction, type TrustBoundaryShadowEntry } from "./access";
import type * as vaultFunctions from "./vault";
import { EvidenceB2Store, loadEvidenceB2Config } from "../lib/media/evidenceB2";

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



type OwnedMediaFileResponse = {
  url: string;
  mimeType: string;
  title: string;
  sizeBytes: number | null;
} | null;

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

export const getPeopleExplorerPage = action({
  args: pageArgs,
  handler: async (ctx, args): Promise<PeoplePageResult> =>
    ctx.runQuery(internal.peopleExplorer.page, {...args, vaultOwnerId: await authorizedOwner(ctx, "vault.getPeopleExplorer", args.vaultOwnerId)}),
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
  handler: async (
    ctx,
    args,
  ): Promise<OwnedMediaFileResponse> => {
    const file = await ctx.runQuery(vaultInternal.getOwnedMediaFile, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getOwnedMediaFile", args.vaultOwnerId),
    });
    if (!file || !("b2" in file) || !file.b2) return file;
    const config = loadEvidenceB2Config("private");
    if (file.b2.bucketClass !== "private" || file.b2.bucketName !== config.bucket) {
      throw new Error("Evidence manifest does not match the configured private bucket.");
    }
    return {
      url: await new EvidenceB2Store(config).signGet(file.b2.objectKey, file.b2.versionId),
      mimeType: file.mimeType,
      title: file.title,
      sizeBytes: file.sizeBytes,
    };
  },
});

export type StoriesPage = {page: ReturnType<typeof vaultFunctions.buildStoryIndexRow>[]; isDone: boolean; continueCursor: string};
export const getStoriesIndex = action({
  args: {vaultOwnerId: v.string(), cursor: v.optional(v.union(v.string(), v.null()))},
  handler: async (ctx, args): Promise<StoriesPage> => {
    const vaultOwnerId = await authorizedOwner(ctx, "vault.getStoriesIndex", args.vaultOwnerId);
    const page = await ctx.runQuery(vaultInternal.getStoriesIndex, {...args, vaultOwnerId});
    const rows = await Promise.all(page.page.map(story => ctx.runQuery(vaultInternal.getStoryIndexRow, {vaultOwnerId, storyId: story._id})));
    return {...page, page: rows.filter((row): row is NonNullable<typeof row> => row !== null)};
  },
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
  args: { vaultOwnerId: v.string(), personIdentifier: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getProvisionalRelatives>> =>
    ctx.runQuery(vaultInternal.getProvisionalRelatives, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getProvisionalRelatives", args.vaultOwnerId),
    }),
});

/** One-query exact common case; bounded retries for a multi-page moving vault. */
export async function readScoreTotals(ctx: Pick<ActionCtx, "runQuery">, vaultOwnerId: string, now: number,
  backoff = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
): Promise<{counts: Record<string, number>; staleChecks: number; exact: boolean}> {
  for (let attempt = 0; ; attempt++) {
    const total = await ctx.runQuery(internal.personScores.totalsAndStale, {vaultOwnerId, now});
    let page = total.page, staleChecks = page.count;
    if (page.isDone) return {counts: total.counts, staleChecks, exact: true};
    while (!page.isDone) {
      page = await ctx.runQuery(internal.personScores.stalePage, {vaultOwnerId, now, cursor: page.continueCursor});
      staleChecks += page.count;
    }
    const after = await ctx.runQuery(internal.personScores.totals, {vaultOwnerId});
    if (after.revision === total.revision) return {counts: total.counts, staleChecks, exact: true};
    if (attempt === 2) return {counts: total.counts, staleChecks, exact: false};
    await backoff(50 * 2 ** attempt);
  }
}

/** Up to 2,000 candidates per user request, at most 50 per database query. */
async function scanOperations(ctx:Pick<ActionCtx,"runQuery">,args:import("convex/server").FunctionArgs<typeof internal.personScores.operationsPage>) {
 let cursor=args.cursor??null;const rows:OperationsPage["rows"]=[];let isDone=false;
 for(let calls=0;calls<40&&rows.length<50;calls++) {
  const page=await ctx.runQuery(internal.personScores.operationsPage,{...args,cursor,candidateLimit:50-rows.length});
  rows.push(...page.rows);cursor=page.continueCursor;isDone=page.isDone;
  if(isDone)break;
 }
 return {rows,continueCursor:cursor??"",isDone};
}

/** Totals describe the entire vault; arbitrary substring/facet combinations are paged. */
export const getOperationsQueue = action({
 args:operationsArgs,
 handler:async(ctx,args):Promise<OperationsPage>=>{
  const vaultOwnerId=await authorizedOwner(ctx,"vault.getOperationsQueue",args.vaultOwnerId);
  if(!await ctx.runQuery(internal.personScores.status,{})) {
   const offset=args.cursor?.startsWith("legacy:")?Number(args.cursor.slice(7)):0;
   if(!Number.isSafeInteger(offset)||offset<0)throw new Error("Invalid cursor");
   const {cursor:ignored,...legacyArgs}=args;void ignored;
   const old=await ctx.runQuery(vaultInternal.getOperationsQueue,{...legacyArgs,storyWorkflow:legacyArgs.storyWorkflow,vaultOwnerId,limit:offset+51});
   const rows=old.rows.slice(offset,offset+50),people=rows.filter(r=>r.rowType==="person");
   const summary={visibleRows:rows.length,provisionalRows:rows.length-people.length,missingRequired:rows.reduce((n,r)=>n+r.missingCritical.length,0),missingRecommended:people.reduce((n,r)=>n+r.researchChecks.filter(c=>c.applicability==="recommended"&&(c.status==="missing"||c.status==="needs_review")).length,0),staleChecks:rows.reduce((n,r)=>n+r.staleChecksCount,0),averageCompletion:people.length?Math.round(people.reduce((n,r)=>n+r.completionPercent,0)/people.length):0};
   return {summary,exact:true,summaryScope:"loaded",rows,continueCursor:`legacy:${offset+50}`,isDone:old.rows.length<=offset+50};
  }
  const now=Date.now();
  const [page,{counts,staleChecks,exact}]=await Promise.all([
   scanOperations(ctx,{...args,cursor:args.cursor?.startsWith("legacy:")?null:args.cursor,vaultOwnerId,now}),
   readScoreTotals(ctx,vaultOwnerId,now),
  ]);
  return {...page,exact,summaryScope:"vault",summary:{visibleRows:counts.rows??0,provisionalRows:counts.provisional??0,missingRequired:counts.required??0,missingRecommended:counts.recommended??0,staleChecks,averageCompletion:counts.people?Math.round((counts.completion??0)/counts.people):0}};
 }
});
export const getOperationsSummary = action({
 args:{vaultOwnerId:v.string()},
 handler:async(ctx,args):Promise<{people:number;provisional:number;avgCompletion:number;missingRequired:number;staleChecks:number;exact:boolean}>=>{
  const vaultOwnerId=await authorizedOwner(ctx,"vault.getOperationsSummary",args.vaultOwnerId);
  if(!await ctx.runQuery(internal.personScores.status,{}))return {...await ctx.runQuery(vaultInternal.getOperationsSummary,{vaultOwnerId}),exact:true};
  const {counts,staleChecks,exact}=await readScoreTotals(ctx,vaultOwnerId,Date.now());
  return {exact,people:counts.people??0,provisional:counts.provisional??0,avgCompletion:counts.people?Math.round((counts.completion??0)/counts.people):0,missingRequired:(counts.required??0)-2*(counts.provisional??0),staleChecks};
 }
});

export const getVaultAudit = action({
  args: {
    vaultOwnerId: v.string(),
    metric: v.optional(v.union(...auditMetrics.map(metric => v.literal(metric)))),
    offset: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(),v.null())),
  },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getVaultAudit>> => {
    // New record drilldowns always require the matched authenticated owner,
    // including during the legacy shadow rollout. Ordinary summary callers
    // retain their existing authorization and response behavior.
    if (args.metric) {
      const identity = await ctx.auth.getUserIdentity();
      const decision = decideTenantAccess({identitySubject: identity?.subject, suppliedOwner: args.vaultOwnerId, mode: "enforce"});
      if (!decision.allowed) throw new Error(`Trust boundary denied: ${decision.reason}`);
      if (!Number.isSafeInteger(args.offset ?? 0) || (args.offset ?? 0) < 0) throw new Error("Invalid Audit offset");
    }
    const vaultOwnerId=await authorizedOwner(ctx, "vault.getVaultAudit", args.vaultOwnerId);
    if(await ctx.runQuery(internal.auditPages.status,{})) {
      // A pre-v7 offset restarts at page one; the client deduplicates IDs.
      const summary=await ctx.runQuery(internal.auditPages.summary,{vaultOwnerId});
      const records=args.metric?await readRecords(ctx,vaultOwnerId,args.metric,args.cursor??null,projectAuditSummary(summary).metrics[args.metric],summary.counts.people):null;
      return {...summary,records};
    }
    return ctx.runQuery(vaultInternal.getVaultAudit, {
      metric:args.metric, offset:args.offset,
      vaultOwnerId,
    });
  },
});

export const getContextCoverage = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getContextCoverage>> =>
    ctx.runQuery(vaultInternal.getContextCoverage, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getContextCoverage", args.vaultOwnerId),
    }),
});

export const getStoryReadinessPage = action({
 args:readinessArgs,
 handler:async(ctx,args):Promise<ReadinessPage>=>{
  const vaultOwnerId=await authorizedOwner(ctx,"vault.getStoryReadinessCandidates",args.vaultOwnerId);
  if(!await ctx.runQuery(internal.personScores.status,{})) {
   const offset=args.cursor?.startsWith("legacy:")?Number(args.cursor.slice(7)):0;
   if(!Number.isSafeInteger(offset)||offset<0)throw new Error("Invalid cursor");
   const page=await ctx.runQuery(vaultInternal.getStoryReadinessCandidates,{vaultOwnerId,storyWorkflow:args.storyWorkflow,limit:offset+25});
   return {page:page.slice(offset,offset+24),continueCursor:`legacy:${offset+24}`,isDone:page.length<=offset+24};
  }
  return ctx.runQuery(internal.personScores.readinessPage,{...args,cursor:args.cursor?.startsWith("legacy:")?null:args.cursor,vaultOwnerId});
 }
});

export const getPlacesPage = action({
  args:{...placePageArgs,search:v.optional(v.string())},
  handler:async(ctx,args):Promise<PlaceListPage>=>ctx.runQuery(internal.placePages.list,{...args,vaultOwnerId:await authorizedOwner(ctx,"vault.getPlacesExplorer",args.vaultOwnerId)}),
});
export const getPlaceSection = action({
  args:{...placePageArgs,placeId:v.id("places"),section:sectionValidator},
  handler:async(ctx,args):Promise<SectionPage>=>ctx.runQuery(internal.placePages.section,{...args,vaultOwnerId:await authorizedOwner(ctx,"vault.getPlaceWorkspace",args.vaultOwnerId)}),
});
export const getPlaceMentions = action({
  args:{vaultOwnerId:v.string(),placeId:v.id("places")},
  handler:async(ctx,args):Promise<PlaceMention[]>=>ctx.runQuery(internal.placePages.mentions,{...args,vaultOwnerId:await authorizedOwner(ctx,"vault.getPlaceWorkspace",args.vaultOwnerId)}),
});
export const getPlaceWorkspace = action({
  args:{vaultOwnerId:v.string(),placeId:v.id("places")},
  handler:async(ctx,args):Promise<PlaceWorkspace|null>=>{
    const vaultOwnerId=await authorizedOwner(ctx,"vault.getPlaceWorkspace",args.vaultOwnerId);
    const initial=await ctx.runQuery(internal.placePages.initial,{vaultOwnerId,placeId:args.placeId});
    if (!initial) return null;
    return initial.mode === "legacy" ? initial.workspace : { header: initial.header, pages: {} };
  },
});

/** The People pages' small question: may the private first start be offered? */
export const getFirstStartEligibility = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getFirstStartEligibility>> =>
    ctx.runQuery(vaultInternal.getFirstStartEligibility, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getFirstStartEligibility", args.vaultOwnerId),
    }),
});

export const getDashboardSummary = action({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getDashboardSummary>> =>
    ctx.runQuery(vaultInternal.getDashboardSummary, {
      vaultOwnerId: await authorizedOwner(ctx, "vault.getDashboardSummary", args.vaultOwnerId),
    }),
});

export const getResearchTasksPage = action({
  args: {...researchPageArgs, search: v.optional(v.string()), status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("blocked"), v.literal("done")))},
  handler: async (ctx, args): Promise<TaskPage> => ctx.runQuery(internal.researchPages.tasks, {...args, vaultOwnerId: await authorizedOwner(ctx, "vault.getResearchOverview", args.vaultOwnerId)}),
});
export const getResearchLogPage = action({
  args: researchPageArgs,
  handler: async (ctx, args): Promise<LogPage> => ctx.runQuery(internal.researchPages.log, {...args, vaultOwnerId: await authorizedOwner(ctx, "vault.getResearchOverview", args.vaultOwnerId)}),
});

export const getContextPack = action({
  args: { vaultOwnerId: v.string(), personIdentifier: v.string() },
  handler: async (ctx, args): Promise<FunctionReturnType<typeof vaultInternal.getContextPack>> =>
    ctx.runQuery(vaultInternal.getContextPack, {
      ...args,
      vaultOwnerId: await authorizedOwner(ctx, "vault.getContextPack", args.vaultOwnerId),
    }),
});

/** Validate the immutable Convex object before its public attachment mutation. */
export const validateMediaUpload = action({
  args:{vaultOwnerId:v.string(),operationId:v.string(),storageId:v.id("_storage"),mimeType:v.string(),audioKind:v.optional(v.union(v.literal("audio"),v.literal("voicenote")))},
  handler:async(ctx,args):Promise<{validated:true}>=>{
    const person=await requireWebsitePerson(ctx);
    if(person.subject!==args.vaultOwnerId) throw new Error("Owner mismatch");
    await authorizedOwner(ctx,"vaultMutations.attachMediaFile",args.vaultOwnerId);
    const target={vaultOwnerId:args.vaultOwnerId,operationId:args.operationId,storageId:args.storageId};
    const metadata=await ctx.runQuery(internal.vaultMutations.audioUploadForValidation,target);
    const blob=await ctx.storage.get(args.storageId);
    if(!blob || blob.size!==metadata.sizeBytes) throw new ConvexError(invalidAudioFileError());
    const result=await validateAudioContainer({size:blob.size,read:async(offset,length)=>new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer())},args.mimeType);
    if(!result.valid) throw new ConvexError(audioContainerError(result.reason));
    const storedType=metadata.contentType && !metadata.contentType.startsWith("video/") ? normalizeAudioMime(metadata.contentType):null;
    if(storedType && storedType!==result.type) throw new ConvexError(invalidAudioFileError());
    const audioKind=args.audioKind ?? "audio";
    if(audioKind==="voicenote" && result.durationSeconds!==null && checkVoiceNoteDuration(result.durationSeconds,metadata.maxVoiceNoteSeconds)) throw new ConvexError(voiceNoteTooLongError(result.durationSeconds,metadata.maxVoiceNoteSeconds));
    await ctx.runMutation(internal.vaultMutations.recordAudioValidation,{...target,sizeBytes:blob.size,sha256:metadata.sha256,contentType:result.type,audioKind,durationSeconds:result.durationSeconds});
    return {validated:true};
  },
});
