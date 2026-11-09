import {queueIdentity,suggestionWithinPeople} from "../lib/queue/identity";
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { action, internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  requireWebsitePerson,
  authorizeTenantAction,
  authorizeTenantMutation as authorizeTenantMutationBase,
  type TenantAccessDecision,
} from "./access";
import { matchesVaultOwner } from "./vaultCore";
import {
  QUEUE_LIMITS,
  assertCommandAllowed,
  assertLeaseDuration,
  assertVersion,
  leaseExpiresAtForActor,
  nextStateForFailure,
  normalizeOptionalText,
  normalizeRequiredText,
  queueExpiryDeadline,
  queueExpiryTransition,
  summarizeDirective,
  type QueueActorKind,
  type QueueCommand,
} from "../lib/queue/contract";
import {
  authorizeQueueAgentTool,
  type QueueAgentToolName,
  type VerifiedQueuePrincipal,
} from "../lib/queue/agentTools";

const queueStateValidator = v.union(
  v.literal("needs_you"),
  v.literal("working"),
  v.literal("waiting_for_your_ai"),
  v.literal("done"),
);

const queuePriorityValidator = v.union(v.literal("high"), v.literal("normal"), v.literal("low"));

const contextValidator = v.union(
  v.object({ kind: v.literal("person"), refId: v.id("persons") }),
  v.object({ kind: v.literal("relationship"), refId: v.id("relationships") }),
  v.object({ kind: v.literal("place"), refId: v.id("places") }),
  v.object({ kind: v.literal("event"), refId: v.id("events") }),
  v.object({ kind: v.literal("source"), refId: v.id("sources") }),
  v.object({ kind: v.literal("citation"), refId: v.id("citations") }),
  v.object({ kind: v.literal("media"), refId: v.id("media") }),
  v.object({ kind: v.literal("context_item"), refId: v.id("contextItems") }),
  v.object({ kind: v.literal("research_task"), refId: v.id("researchTasks") }),
  v.object({ kind: v.literal("research_check"), refId: v.id("researchChecks") }),
  v.object({ kind: v.literal("story"), refId: v.id("stories") }),
  v.object({ kind: v.literal("import_run"), refId: v.id("importRuns") }),
  v.object({ kind: v.literal("provisional_relative"), refId: v.id("provisionalRelatives") }),
);

const principalValidator = v.object({
  ownerId: v.string(),
  actorId: v.string(),
  actorKind: v.union(v.literal("chosen_ai"), v.literal("first_party_ai")),
  scopes: v.array(v.string()),
  credentialId: v.string(),
});

type QueueItem = Doc<"queueItems">;
async function queueForPerson(ctx: Pick<QueryCtx,"db">, item:QueueItem, includeTitle=true) {
 const projected=queueIdentity(item);
 if (!item.fromRecord) return projected;
 const tables={person:"persons",relationship:"relationships",place:"places",event:"events",source:"sources",citation:"citations",media:"media",context_item:"contextItems",research_task:"researchTasks",research_check:"researchChecks",story:"stories",import_run:"importRuns",provisional_relative:"provisionalRelatives"} as const;
 const table=tables[item.fromRecord.kind as keyof typeof tables];
 if(!table)return {...projected,fromRecord:undefined};
 const id=ctx.db.normalizeId(table,item.fromRecord.refId);
 const row=id?await ctx.db.get(id):null;
 if(!row || !("vaultOwnerId" in row) || !matchesVaultOwner(row.vaultOwnerId,item.vaultOwnerId)) return {...projected,fromRecord:undefined};
 if(!includeTitle)return projected; // Queue references never grant record-content reads.
 const data=row as unknown as {title?:string;label?:string;name?:string|{given?:string;surname?:string}};
 const name=typeof data.name==="string"?data.name:[data.name?.given,data.name?.surname].filter(Boolean).join(" ");
 return {...projected,fromRecordTitle:data.title||data.label||name||item.fromRecord.kind.replaceAll("_"," ")};
}
type QueueContext = QueueItem["context"][number];
type QueueExpiryReconciliation = { item: QueueItem | null; expired: boolean };

function assertQueueTenantAllowed(
  decision: TenantAccessDecision,
): asserts decision is TenantAccessDecision & { allowed: true } {
  if (!decision.allowed) {
    throw new Error(`Trust boundary denied: ${decision.reason ?? "missing_identity"}`);
  }
}

async function authorizeTenantMutation(ctx:MutationCtx,functionName:string,suppliedOwner?:string|null){
 await requireWebsitePerson(ctx);return authorizeTenantMutationBase(ctx,functionName,suppliedOwner);
}

async function authorizeQueueTenantAction(
  ctx: ActionCtx,
  functionName: string,
  suppliedOwner?: string | null,
) {
  await requireWebsitePerson(ctx);
  const decision = await authorizeTenantAction(
    ctx,
    functionName,
    suppliedOwner,
    (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
  );
  assertQueueTenantAllowed(decision);
  return decision;
}

function actorForUser(owner: string): { kind: "user"; id: string } {
  return { kind: "user", id: owner };
}

function assertItemOwner(item: QueueItem | null, owner: string): asserts item is QueueItem {
  if (!item || !matchesVaultOwner(item.vaultOwnerId, owner)) throw new Error("Queue item not found");
}

function assertAgentAuthority(item: QueueItem, actor: { kind: QueueActorKind; id: string; credentialId?:string }, operation: "queue:read" | "queue:claim" | "queue:update" | "queue:complete") {
  if (item.archivedAt || item.suggestionStatus === "open") throw new Error("Unaccepted suggestions and archived items cannot be worked on");
  if (item.authority.actorKind !== actor.kind || item.authority.actorId !== actor.id) {
    throw new Error("This AI is not assigned to the Queue item");
  }
  if(operation!=="queue:claim"&&item.activeActorId){
    if(item.activeActorId!==actor.id||item.activeActorKind!==actor.kind)throw new Error("Another actor holds the Queue claim");
    if(item.activeCredentialId&&item.activeCredentialId!==actor.credentialId)throw new Error("Another AI connection holds the Queue claim");
    if(item.activeActorId==="oauth-chosen-ai"&&!item.activeCredentialId)throw new Error("Legacy claim ownership is ambiguous; let it expire or ask the person to release it");
  }
  if (!item.authority.operations.includes(operation)) {
    throw new Error(`Queue item authority does not include ${operation}`);
  }
}

/** Incremental person-private counters. Unknown historic totals never masquerade as zero. */
function contribution(item:QueueItem|null){
 const zero={suggestions:0,input:0,total:0,waiting:0,working:0,answered:0};
 if(!item)return zero;
 const current=queueIdentity(item),counts={...zero,total:1};
 if(item.archivedAt)return counts;
 counts.suggestions=item.suggestionStatus==="open"?1:0;
 counts.input=current.needsInput?1:0;
 if(item.suggestionStatus!=="open"){
  counts.waiting=current.state==="waiting_for_your_ai"?1:0;
  counts.working=current.state==="working"?1:0;
  counts.answered=current.state==="done"?1:0;
 }
 return counts;
}
async function ensureCounters(ctx:MutationCtx,owner:string){
 const existing=await ctx.db.query("queueCounters").withIndex("by_owner",q=>q.eq("vaultOwnerId",owner)).unique();
 if(existing)return existing;
 const historic=await ctx.db.query("queueItems").withIndex("by_owner",q=>q.eq("vaultOwnerId",owner)).first();
 const id=await ctx.db.insert("queueCounters",{vaultOwnerId:owner,openSuggestions:0,needsInput:0,totalRecords:0,waiting:0,working:0,answered:0,ready:!historic,updatedAt:Date.now()});
 return (await ctx.db.get(id))!;
}
async function updateCounters(ctx:MutationCtx,before:QueueItem|null,after:QueueItem|null){
 const owner=(after??before)!.vaultOwnerId,counter=await ensureCounters(ctx,owner);
 const previous=before?.counterIncluded?contribution(before):contribution(null),next=contribution(after);
 await ctx.db.patch(counter._id,{openSuggestions:counter.openSuggestions+next.suggestions-previous.suggestions,needsInput:counter.needsInput+next.input-previous.input,totalRecords:counter.totalRecords+next.total-previous.total,waiting:counter.waiting+next.waiting-previous.waiting,working:counter.working+next.working-previous.working,answered:counter.answered+next.answered-previous.answered,updatedAt:Date.now()});
 if(after&&!after.counterIncluded)await ctx.db.patch(after._id,{counterIncluded:true});
}

async function validateContext(ctx: MutationCtx, owner: string, context: QueueContext[]) {
  if (context.length > QUEUE_LIMITS.contextRefs) {
    throw new Error(`Queue context is limited to ${QUEUE_LIMITS.contextRefs} references`);
  }
  const seen = new Set<string>();
  for (const ref of context) {
    const key = `${ref.kind}:${ref.refId}`;
    if (seen.has(key)) throw new Error("Queue context contains a duplicate reference");
    seen.add(key);
    const row = await ctx.db.get(ref.refId);
    if (!row || !("vaultOwnerId" in row) || !matchesVaultOwner(row.vaultOwnerId, owner)) {
      throw new Error("Queue context reference not found");
    }
  }
}

async function existingReceipt(
  ctx: MutationCtx,
  input: {
    owner: string;
    idempotencyKey: string;
    command: string;
    actor: { kind: QueueActorKind; id: string };
  },
) {
  const receipt = await ctx.db
    .query("queueCommandReceipts")
    .withIndex("by_owner_key", (q) =>
      q.eq("vaultOwnerId", input.owner).eq("idempotencyKey", input.idempotencyKey),
    )
    .unique();
  if (!receipt) return null;
  if (
    receipt.command !== input.command ||
    receipt.actorKind !== input.actor.kind ||
    receipt.actorId !== input.actor.id
  ) {
    throw new Error("Idempotency key was already used for a different Queue command or actor");
  }
  const item = await ctx.db.get(receipt.queueItemId);
  assertItemOwner(item, input.owner);
  return { item:await queueForPerson(ctx,item,input.actor.kind==="user"), deduplicated: true as const };
}

async function recordCommand(
  ctx: MutationCtx,
  input: {
    owner: string;
    idempotencyKey: string;
    command: string;
    actor: { kind: QueueActorKind; id: string };
    item: QueueItem;
    eventType: Doc<"queueActivity">["eventType"];
    fromState?: string;
    summary: string;
    detail?: string;
    now: number;
  },
) {
  await ctx.db.insert("queueActivity", {
    vaultOwnerId: input.owner,
    queueItemId: input.item._id,
    eventType: input.eventType,
    fromState: input.fromState,
    toState: input.item.state,
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    summary: input.summary,
    detail: input.detail,
    commandId: input.idempotencyKey,
    itemVersion: input.item.version,
    createdAt: input.now,
  });
  await ctx.db.insert("queueCommandReceipts", {
    vaultOwnerId: input.owner,
    idempotencyKey: input.idempotencyKey,
    command: input.command,
    queueItemId: input.item._id,
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    resultVersion: input.item.version,
    createdAt: input.now,
  });
}

function cleanIdempotencyKey(value: string): string {
  return normalizeRequiredText(value, "Idempotency key", 160);
}

function assertFutureHandoffExpiration(value: number | undefined, now: number): void {
  if (value !== undefined && value <= now) {
    throw new Error("handoffExpiresAt must be in the future");
  }
}

async function scheduleQueueExpiry(ctx: MutationCtx, item: QueueItem): Promise<void> {
  const expiresAt = queueExpiryDeadline(queueIdentity(item));
  if (expiresAt === undefined || expiresAt <= Date.now()) return;
  await ctx.scheduler.runAt(expiresAt, internal.queue.reconcileQueueItemExpiry, {
    vaultOwnerId: item.vaultOwnerId,
    queueItemId: item._id,
  });
}

async function runCommand(
  ctx: MutationCtx,
  input: {
    owner: string;
    itemId: Id<"queueItems">;
    expectedVersion: number;
    idempotencyKey: string;
    command: QueueCommand;
    actor: { kind: QueueActorKind; id: string };
    eventType: Doc<"queueActivity">["eventType"];
    summary: string;
    detail?: string;
    patch: (item: QueueItem, now: number) => Partial<QueueItem>;
  },
) {
  const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);
  const replay = await existingReceipt(ctx, { ...input, idempotencyKey });
  if (replay) return replay;

  const item = await ctx.db.get(input.itemId);
  assertItemOwner(item, input.owner);
  assertVersion(item, input.expectedVersion);
  const now = Date.now();
  const projected = queueIdentity(item);
  assertCommandAllowed(input.command, projected, input.actor, now);
  const patch=input.patch(projected,now);
  if(input.actor.kind!=="user"&&projected.needsInput&&((Object.prototype.hasOwnProperty.call(patch,"needsInput")&&!patch.needsInput)||patch.archivedAt!==undefined))throw new Error('MCP_FAMILY_HISTORY_ERROR:'+JSON.stringify({code:"FORBIDDEN",message:"Only the person can clear Needs your input",recovery:"Ask the person to answer or clear the flag."}));
  const fromState = item.state;
  await ctx.db.patch(item._id, {
    state: projected.state,
    needsInput: projected.needsInput,
    ...(input.actor.kind==="user"?{personActedAt:item.personActedAt??now}:{}),
    ...patch,
    version: item.version + 1,
    updatedAt: now,
  });
  const updated = await ctx.db.get(item._id);
  assertItemOwner(updated, input.owner);
  await updateCounters(ctx,item,updated);
  await recordCommand(ctx, {
    owner: input.owner,
    idempotencyKey,
    command: input.command,
    actor: input.actor,
    item: updated,
    eventType: input.eventType,
    fromState,
    summary: input.summary,
    detail: input.detail,
    now,
  });
  await scheduleQueueExpiry(ctx, updated);
  return { item: await queueForPerson(ctx,updated,input.actor.kind==="user"), deduplicated: false as const };
}

export const createQueueItem = mutation({
  args: {
    vaultOwnerId: v.string(),
    directive: v.string(),
    requestedOutcome: v.optional(v.string()),
    priority: v.optional(queuePriorityValidator),
    priorityReason: v.optional(v.string()),
    context: v.optional(v.array(contextValidator)),
    fromRecord: v.optional(contextValidator),
    chosenAiId: v.optional(v.string()),
    handoffExpiresAt: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.createQueueItem", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    const owner = decision.owner;
    const actor = actorForUser(owner);
    const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);
    const replay = await existingReceipt(ctx, { owner, idempotencyKey, command: "create", actor });
    if (replay) return replay;

    const directive = normalizeRequiredText(args.directive, "Directive", QUEUE_LIMITS.directive);
    const requestedOutcome = normalizeOptionalText(
      args.requestedOutcome,
      "Requested outcome",
      QUEUE_LIMITS.requestedOutcome,
    );
    const priorityReason = normalizeOptionalText(args.priorityReason, "Priority reason", 500);
    if (args.priority === "high" && !priorityReason) throw new Error("High priority requires a reason");
    const context = args.context ?? [];
    await validateContext(ctx, owner, context);
    if(args.fromRecord)await validateContext(ctx,owner,[args.fromRecord]);
    const chosenAiId = normalizeOptionalText(args.chosenAiId, "Chosen AI id", 160);
    const maxRetries = args.maxRetries ?? 3;
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > QUEUE_LIMITS.maxRetries) {
      throw new Error(`maxRetries must be between 0 and ${QUEUE_LIMITS.maxRetries}`);
    }
    const now = Date.now();
    assertFutureHandoffExpiration(args.handoffExpiresAt, now);
    await ensureCounters(ctx,owner);
    const queueItemId = await ctx.db.insert("queueItems", {
      vaultOwnerId: owner,
      directive,
      summary: summarizeDirective(directive),
      requestedOutcome,
      state: "waiting_for_your_ai",
      condition: chosenAiId ? "ready" : "disconnected",
      priority: args.priority ?? "normal",
      priorityReason,
      context,
      fromRecord:args.fromRecord,
      authority: {
        actorKind: "chosen_ai",
        actorId: chosenAiId ?? "unassigned",
        operations: ["queue:read", "queue:claim", "queue:update", "queue:complete"],
        scopeNote: "Queue continuity only; attached record references do not grant domain mutation authority.",
      },
      leftForActorKind: "chosen_ai",
      leftForActorId: chosenAiId,
      handoffExpiresAt: args.handoffExpiresAt,
      retryCount: 0,
      maxRetries,
      submittedAt: now,
      addedBy: "person",
      createdByActorKind: "user",
      createdByActorId: owner,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const item = await ctx.db.get(queueItemId);
    assertItemOwner(item, owner);
    await updateCounters(ctx,null,item);
    await recordCommand(ctx, {
      owner,
      idempotencyKey,
      command: "create",
      actor,
      item,
      eventType: "created",
      summary: chosenAiId ? "Directive left for the chosen AI." : "Directive saved; no AI is connected.",
      now,
    });
    await scheduleQueueExpiry(ctx, item);
    return { item, deduplicated: false as const };
  },
});

export const assignQueueItemToAi = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    chosenAiId: v.string(),
    handoffExpiresAt: v.optional(v.number()),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.assignQueueItemToAi", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    const chosenAiId = normalizeRequiredText(args.chosenAiId, "Chosen AI id", 160);
    assertFutureHandoffExpiration(args.handoffExpiresAt, Date.now());
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "assign",
      actor: actorForUser(decision.owner),
      eventType: "released",
      summary: "Queue handoff assigned to a chosen AI.",
      detail: chosenAiId,
      patch: (_current, now) => ({
        state: "waiting_for_your_ai",
        condition: "ready",
        authority: {
          actorKind: "chosen_ai",
          actorId: chosenAiId,
          operations: ["queue:read", "queue:claim", "queue:update", "queue:complete"],
          scopeNote: "Queue continuity only; attached record references do not grant domain mutation authority.",
        },
        leftForActorKind: "chosen_ai",
        leftForActorId: chosenAiId,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        handoffExpiresAt: args.handoffExpiresAt,
        requiredAction: undefined,
        nextStep: undefined,
        failureCode: undefined,
        failureSummary: undefined,
        nextRetryAt: undefined,
        retryCount: 0,
        submittedAt: now,
      }),
    });
  },
});

export const claimQueueItemAsUser = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    leaseMs: v.number(),
    nextStep: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.claimQueueItemAsUser", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    assertLeaseDuration(args.leaseMs);
    const nextStep = normalizeRequiredText(args.nextStep, "Next step", QUEUE_LIMITS.nextStep);
    const actor = actorForUser(decision.owner);
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "claim",
      actor,
      eventType: "claimed",
      summary: "User picked up the Queue directive.",
      detail: nextStep,
      patch: (_current, now) => ({
        state: "working",
        condition: "active",
        activeActorKind: "user",
        activeActorId: decision.owner,
        activeCredentialId:undefined,
        pickedUpAt: now,
        leaseExpiresAt: now + args.leaseMs,
        nextStep,
        requiredAction: undefined,
      }),
    });
  },
});

export const checkpointQueueItemAsUser = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    leaseMs: v.number(),
    nextStep: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.checkpointQueueItemAsUser", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    assertLeaseDuration(args.leaseMs);
    const nextStep = normalizeRequiredText(args.nextStep, "Next step", QUEUE_LIMITS.nextStep);
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "checkpoint",
      actor: actorForUser(decision.owner),
      eventType: "checkpointed",
      summary: "User recorded the current Queue step.",
      detail: nextStep,
      patch: (_current, now) => ({ nextStep, leaseExpiresAt: now + args.leaseMs }),
    });
  },
});

export const completeQueueItemAsUser = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    resultSummary: v.string(),
    resultRefs: v.optional(v.array(v.string())),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.completeQueueItemAsUser", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    const resultSummary = normalizeRequiredText(args.resultSummary, "Result", QUEUE_LIMITS.resultSummary);
    const resultRefs = (args.resultRefs ?? []).map((ref) => normalizeRequiredText(ref, "Result reference", 500));
    if (resultRefs.length > QUEUE_LIMITS.resultRefs) {
      throw new Error(`Result references are limited to ${QUEUE_LIMITS.resultRefs}`);
    }
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "complete",
      actor: actorForUser(decision.owner),
      eventType: "completed",
      summary: "User attached a result and completed the Queue handoff.",
      detail: resultSummary,
      patch: (_current, now) => ({
        state: "done",
        condition: "completed",
        resultSummary,
        resultRefs,
        completedAt: now,
        nextStep: undefined,
        requiredAction: undefined,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        handoffExpiresAt: undefined,
      }),
    });
  },
});

const listQueueArgs = {
  vaultOwnerId: v.string(),
  state: v.optional(queueStateValidator),
  priority: v.optional(queuePriorityValidator),
  suggestions: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
  suggestionCredentialId: v.optional(v.string()),
  suggestionPersonIds:v.optional(v.array(v.string())),
  originTitles:v.optional(v.boolean()),
  actionable:v.optional(v.boolean()),
  paginationOpts: paginationOptsValidator,
};

export const listQueueItemsInternal = internalQuery({
  args: listQueueArgs,
  handler: async (ctx, args) => {
    let query=ctx.db.query("queueItems").withIndex("by_owner_updated",q=>q.eq("vaultOwnerId",args.vaultOwnerId)).order("desc");
    query=query.filter(q=>args.archived&&args.state!=="needs_you"?q.neq(q.field("archivedAt"),undefined):q.eq(q.field("archivedAt"),undefined));
    query=query.filter(q=>args.state==="needs_you"?true:args.suggestions?q.or(q.eq(q.field("suggestionStatus"),"open"),args.archived?q.or(q.eq(q.field("suggestionStatus"),"dismissed"),q.eq(q.field("suggestionStatus"),"withdrawn")):false):args.archived?true:q.neq(q.field("suggestionStatus"),"open"));
    if(args.suggestionCredentialId)query=query.filter(q=>q.eq(q.field("raisedByCredentialId"),args.suggestionCredentialId));
    if(args.suggestionPersonIds!==undefined)query=query.filter(q=>q.or(q.and(q.neq(q.field("addedBy"),"ai_suggestion"),q.eq(q.field("suggestionStatus"),undefined)),...args.suggestionPersonIds!.map(id=>q.and(q.eq(q.field("fromRecord.kind"),"person"),q.eq(q.field("fromRecord.refId"),id)))));
    if(args.actionable)query=query.filter(q=>q.and(q.eq(q.field("needsInput"),undefined),q.neq(q.field("state"),"needs_you")));
    if(args.priority)query=query.filter(q=>q.eq(q.field("priority"),args.priority));
    if(args.state)query=query.filter(q=>{
      if(args.state==="needs_you")return q.or(q.neq(q.field("needsInput"),undefined),q.eq(q.field("state"),"needs_you"));
      const hasResult=q.and(q.neq(q.field("resultSummary"),undefined),q.neq(q.field("resultSummary"),""));
      const legacy=args.state==="done"?hasResult:args.state==="working"?q.and(q.not(hasResult),q.neq(q.field("pickedUpAt"),undefined)):q.and(q.not(hasResult),q.eq(q.field("pickedUpAt"),undefined));
      return q.or(q.eq(q.field("state"),args.state),q.and(q.eq(q.field("state"),"needs_you"),legacy));
    });
    const page=await query.paginate({...args.paginationOpts,numItems:Math.min(args.paginationOpts.numItems,QUEUE_LIMITS.itemPage)});
    return {...page,page:await Promise.all(page.page.map(item=>queueForPerson(ctx,item,!!args.originTitles)))};
  },
});

/**
 * A connection narrowed to named Queue items lists exactly those items, never
 * the owner's whole Queue. Read by id (the list is small and person-chosen),
 * newest creation first. The immutable creation-time/ID cursor survives expiry
 * reconciliation changing updatedAt or removing rows from a state filter.
 */
export const listAllowedQueueItemsInternal = internalQuery({
  args: { ...listQueueArgs, queueItemIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<PaginationResult<QueueItem>> => {
    const rows: QueueItem[] = [];
    for (const raw of new Set(args.queueItemIds)) {
      const id = ctx.db.normalizeId("queueItems", raw);
      const item = id ? await ctx.db.get(id) : null;
      if (!item || !matchesVaultOwner(item.vaultOwnerId, args.vaultOwnerId)) continue;
      if(!!item.archivedAt!==(args.state==="needs_you"?false:!!args.archived))continue;
      if(args.suggestions){if(item.suggestionStatus!=="open"&&!(args.archived&&["dismissed","withdrawn"].includes(item.suggestionStatus??"")))continue;}
      else if(!args.archived&&args.state!=="needs_you"&&item.suggestionStatus==="open")continue;
      if(args.suggestionCredentialId&&item.raisedByCredentialId!==args.suggestionCredentialId)continue;
      if(!suggestionWithinPeople(item,args.suggestionPersonIds))continue;
      if(args.actionable&&queueIdentity(item).needsInput)continue;
      if (args.state && (args.state === "needs_you" ? !queueIdentity(item).needsInput : queueIdentity(item).state !== args.state)) continue;
      if (args.priority && item.priority !== args.priority) continue;
      rows.push(item);
    }
    rows.sort((a, b) => b._creationTime - a._creationTime || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0));
    let remaining = rows;
    const cursor = args.paginationOpts.cursor;
    if (cursor !== null) {
      let key: unknown;
      try {
        key = JSON.parse(cursor);
      } catch {
        throw new Error("Invalid Queue continuation cursor; restart pagination.");
      }
      if (!Array.isArray(key) || key.length !== 2 || typeof key[0] !== "number" ||
          !Number.isFinite(key[0]) || typeof key[1] !== "string" || !ctx.db.normalizeId("queueItems", key[1])) {
        throw new Error("Invalid Queue continuation cursor; restart pagination.");
      }
      const [createdAt, id] = key as [number, string];
      remaining = rows.filter((item) => item._creationTime < createdAt ||
        (item._creationTime === createdAt && item._id < id));
    }
    const page = remaining.slice(0, Math.min(args.paginationOpts.numItems, QUEUE_LIMITS.itemPage));
    const last = page.at(-1);
    return {
      page,
      isDone: page.length >= remaining.length,
      continueCursor: last ? JSON.stringify([last._creationTime, last._id]) : cursor ?? "",
    };
  },
});

export const listQueueItems = action({
  args: listQueueArgs,
  handler: async (ctx, args): Promise<PaginationResult<QueueItem>> => {
    const decision = await authorizeQueueTenantAction(ctx, "queue.listQueueItems", args.vaultOwnerId);
    const result = await ctx.runQuery(internal.queue.listQueueItemsInternal, {
      ...args,
      originTitles:true,
      vaultOwnerId: decision.owner,
    });
    const page: QueueItem[] = [];
    for (const item of result.page) {
      const transition = queueExpiryTransition(queueIdentity(item), Date.now());
      if (!transition) {
        page.push(item);
        continue;
      }
      const reconciled = await ctx.runMutation(internal.queue.reconcileQueueItemExpiry, {
        vaultOwnerId: decision.owner,
        queueItemId: item._id,
      });
      if (reconciled.item && (!args.state || reconciled.item.state === args.state)) {
        page.push(reconciled.item);
      }
    }
    return { ...result, page: page.map(queueIdentity) };
  },
});

export const getQueueItemInternal = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    activityPagination: paginationOptsValidator,
    originTitles:v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.queueItemId);
    if (!item || !matchesVaultOwner(item.vaultOwnerId, args.vaultOwnerId)) return null;
    const activity = await ctx.db
      .query("queueActivity")
      .withIndex("by_item_created", (q) => q.eq("queueItemId", args.queueItemId))
      .order("desc")
      .paginate({
        ...args.activityPagination,
        numItems: Math.min(args.activityPagination.numItems, QUEUE_LIMITS.activityPage),
      });
    return { item: await queueForPerson(ctx,item,!!args.originTitles), activity };
  },
});

export const getQueueItem = action({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    activityPagination: paginationOptsValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ item: QueueItem; activity: PaginationResult<Doc<"queueActivity">> } | null> => {
    const decision = await authorizeQueueTenantAction(ctx, "queue.getQueueItem", args.vaultOwnerId);
    await ctx.runMutation(internal.queue.reconcileQueueItemExpiry, {
      vaultOwnerId: decision.owner,
      queueItemId: args.queueItemId,
    });
    return ctx.runQuery(internal.queue.getQueueItemInternal, { ...args, originTitles:true, vaultOwnerId: decision.owner });
  },
});

function verifyPrincipal(principal: VerifiedQueuePrincipal, toolName: QueueAgentToolName) {
  return authorizeQueueAgentTool(principal, toolName);
}

export const agentListQueueItems = internalAction({
  args: {
    principal: principalValidator,
    state: v.optional(queueStateValidator),
    priority: v.optional(queuePriorityValidator),
    suggestions: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
    suggestionPersonIds:v.optional(v.array(v.string())),
    // The grant's named Queue items, when the person narrowed the connection
    // to them. Absent or empty means the grant names no Queue boundary.
    queueItemIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<PaginationResult<QueueItem>> => {
    const actor = verifyPrincipal(args.principal, "list_queue_items");
    const listArgs = {
      vaultOwnerId: actor.ownerId,
      state: args.state,
      priority: args.priority,
      suggestions: args.suggestions,
      archived: args.archived,
      suggestionCredentialId: args.suggestions ? args.principal.credentialId : undefined,
      originTitles:false,
      suggestionPersonIds:args.suggestionPersonIds,
      actionable:!args.suggestions&&!args.archived&&args.state!=="needs_you"&&args.state!=="done",
      paginationOpts: args.paginationOpts,
    };
    const result = args.queueItemIds && args.queueItemIds.length > 0
      ? await ctx.runQuery(internal.queue.listAllowedQueueItemsInternal, { ...listArgs, queueItemIds: args.queueItemIds })
      : await ctx.runQuery(internal.queue.listQueueItemsInternal, listArgs);
    const page: QueueItem[] = [];
    for (const item of result.page) {
      if(listArgs.actionable&&queueIdentity(item).needsInput)continue;
      if (args.suggestions && item.raisedByCredentialId !== args.principal.credentialId) continue;
      const transition = queueExpiryTransition(queueIdentity(item), Date.now());
      if (!transition) {
        page.push(item);
        continue;
      }
      const reconciled = await ctx.runMutation(internal.queue.reconcileQueueItemExpiry, {
        vaultOwnerId: actor.ownerId,
        queueItemId: item._id,
      });
      if (reconciled.item && !(listArgs.actionable&&queueIdentity(reconciled.item).needsInput) && (!args.state || reconciled.item.state === args.state)) {
        page.push(reconciled.item);
      }
    }
    return { ...result, page: page.map(queueIdentity) };
  },
});

export const agentGetQueueItem = internalAction({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    activityPagination: paginationOptsValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ item: QueueItem; activity: PaginationResult<Doc<"queueActivity">> } | null> => {
    const actor = verifyPrincipal(args.principal, "get_queue_item");
    await ctx.runMutation(internal.queue.reconcileQueueItemExpiry, {
      vaultOwnerId: actor.ownerId,
      queueItemId: args.queueItemId,
    });
    return ctx.runQuery(internal.queue.getQueueItemInternal, {
      vaultOwnerId: actor.ownerId,
      queueItemId: args.queueItemId,
      activityPagination: args.activityPagination,
    });
  },
});

export const agentClaimQueueItem = internalMutation({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    leaseMs: v.number(),
    nextStep: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "claim_queue_item");
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, actor.ownerId);
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId,credentialId:args.principal.credentialId }, "queue:claim");
    assertLeaseDuration(args.leaseMs);
    const nextStep = normalizeRequiredText(args.nextStep, "Next step", QUEUE_LIMITS.nextStep);
    return runCommand(ctx, {
      owner: actor.ownerId,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "claim",
      actor: { kind: actor.actorKind, id: actor.actorId },
      eventType: "claimed",
      summary: "Chosen AI picked up the Queue directive.",
      detail: nextStep,
      patch: (current, now) => ({
        state: "working",
        condition: "active",
        activeActorKind: actor.actorKind,
        activeActorId: actor.actorId,
        activeCredentialId:args.principal.credentialId,
        pickedUpAt: now,
        leaseExpiresAt: leaseExpiresAtForActor(current, { kind: actor.actorKind, id: actor.actorId }, now, args.leaseMs),
        nextStep,
        requiredAction: undefined,
        nextRetryAt: undefined,
      }),
    });
  },
});

export const agentCheckpointQueueItem = internalMutation({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    leaseMs: v.number(),
    nextStep: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "checkpoint_queue_item");
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, actor.ownerId);
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId,credentialId:args.principal.credentialId }, "queue:update");
    assertLeaseDuration(args.leaseMs);
    const nextStep = normalizeRequiredText(args.nextStep, "Next step", QUEUE_LIMITS.nextStep);
    return runCommand(ctx, {
      owner: actor.ownerId,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "checkpoint",
      actor: { kind: actor.actorKind, id: actor.actorId },
      eventType: "checkpointed",
      summary: "Chosen AI recorded the current Queue step.",
      detail: nextStep,
      patch: (current, now) => ({
        nextStep,
        leaseExpiresAt: leaseExpiresAtForActor(
          current,
          { kind: actor.actorKind, id: actor.actorId },
          now,
          args.leaseMs,
        ),
      }),
    });
  },
});

export const agentRequestUserAction = internalMutation({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    requiredAction: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "request_user_action");
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, actor.ownerId);
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId,credentialId:args.principal.credentialId }, "queue:update");
    if(item.condition==="canceled")throw new Error("Canceled work cannot be flagged");
    if(item.handoffExpiresAt!==undefined&&item.handoffExpiresAt<=Date.now())throw new Error("Queue handoff expired; ask the person to reconnect or reassign it");
    const requiredAction = normalizeRequiredText(
      args.requiredAction,
      "Required action",
      QUEUE_LIMITS.requiredAction,
    );
    return runCommand(ctx, {
      owner: actor.ownerId,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "request_user_action",
      actor: { kind: actor.actorKind, id: actor.actorId },
      eventType: "needs_you",
      summary: "Chosen AI paused for a specific user action.",
      detail: requiredAction,
      patch: (_current, now) => ({
        needsInput: {question:requiredAction,raisedAt:now,actorId:args.principal.credentialId},
        activeActorKind:undefined,activeActorId:undefined,activeCredentialId:undefined,leaseExpiresAt:undefined,
        requiredAction,
      }),
    });
  },
});

export const agentCompleteQueueItem = internalMutation({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    resultSummary: v.string(),
    resultRefs: v.optional(v.array(v.string())),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "complete_queue_item");
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, actor.ownerId);
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId,credentialId:args.principal.credentialId }, "queue:complete");
    const resultSummary = normalizeRequiredText(args.resultSummary, "Result", QUEUE_LIMITS.resultSummary);
    const resultRefs = (args.resultRefs ?? []).map((ref) => normalizeRequiredText(ref, "Result reference", 500));
    if (resultRefs.length > QUEUE_LIMITS.resultRefs) {
      throw new Error(`Result references are limited to ${QUEUE_LIMITS.resultRefs}`);
    }
    return runCommand(ctx, {
      owner: actor.ownerId,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "complete",
      actor: { kind: actor.actorKind, id: actor.actorId },
      eventType: "completed",
      summary: "Chosen AI attached a result and completed the Queue handoff.",
      detail: resultSummary,
      patch: (_current, now) => ({
        state: "done",
        condition: "completed",
        resultSummary,
        resultRefs,
        completedAt: now,
        nextStep: undefined,
        requiredAction: undefined,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        handoffExpiresAt: undefined,
      }),
    });
  },
});

export const resumeQueueItem = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    answerSummary: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.resumeQueueItem", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    const answerSummary = normalizeRequiredText(args.answerSummary, "Answer summary", 1_000);
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "resume",
      actor: actorForUser(decision.owner),
      eventType: "resumed",
      summary: "User answered the blocker and returned the directive to the chosen AI.",
      detail: answerSummary,
      patch: (current, now) => ({
        needsInput: undefined,
        condition: current.state==="waiting_for_your_ai"?(current.authority.actorId==="unassigned"?"disconnected":"ready"):current.state==="working"?((current.leaseExpiresAt??0)>now?"active":"expired"):current.condition,
        requiredAction: undefined,
        failureCode: undefined,
        failureSummary: undefined,
        nextRetryAt: undefined,
        handoffExpiresAt:
          current.handoffExpiresAt !== undefined && current.handoffExpiresAt > now
            ? current.handoffExpiresAt
            : undefined,
        lastUserResponse: answerSummary,
      }),
    });
  },
});

export const cancelQueueItem = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.cancelQueueItem", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    const reason = normalizeRequiredText(args.reason, "Cancellation reason", 1_000);
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "cancel",
      actor: actorForUser(decision.owner),
      eventType: "canceled",
      summary: "User canceled the Queue handoff; the reason remains traceable.",
      detail: reason,
      patch: (_current, now) => ({
        state: "done",
        condition: "canceled",
        canceledReason: reason,
        resultSummary: `Canceled: ${reason}`,
        canceledAt: now,
        completedAt: now,
        nextStep: undefined,
        requiredAction: undefined,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        handoffExpiresAt: undefined,
      }),
    });
  },
});

export const reopenQueueItem = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.reopenQueueItem", args.vaultOwnerId);
    assertQueueTenantAllowed(decision);
    const reason = normalizeRequiredText(args.reason, "Reopen reason", 1_000);
    return runCommand(ctx, {
      owner: decision.owner,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "reopen",
      actor: actorForUser(decision.owner),
      eventType: "reopened",
      summary: "User reopened completed Queue work.",
      detail: reason,
      patch: (current) => ({
        state: "waiting_for_your_ai",
        condition: current.authority.actorId === "unassigned" ? "disconnected" : "ready",
        resultSummary: undefined,
        resultRefs: undefined,
        completedAt: undefined,
        canceledAt: undefined,
        canceledReason: undefined,
        retryCount: 0,
        handoffExpiresAt: undefined,
        lastReopenReason: reason,
      }),
    });
  },
});

export const agentFailQueueItem = internalMutation({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    failureCode: v.string(),
    failureSummary: v.string(),
    retryable: v.boolean(),
    nextRetryAt: v.optional(v.number()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "report_queue_failure");
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, actor.ownerId);
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId,credentialId:args.principal.credentialId }, "queue:update");
    const failureCode = normalizeRequiredText(args.failureCode, "Failure code", 120);
    const failureSummary = normalizeRequiredText(args.failureSummary, "Failure summary", 1_000);
    const result = nextStateForFailure(item, args.retryable);
    if (result.condition === "retry_scheduled" && (!args.nextRetryAt || args.nextRetryAt <= Date.now())) {
      throw new Error("A retryable failure requires a future nextRetryAt");
    }
    return runCommand(ctx, {
      owner: actor.ownerId,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "fail",
      actor: { kind: actor.actorKind, id: actor.actorId },
      eventType: result.condition === "retry_scheduled" ? "retry_scheduled" : "failed",
      summary:
        result.condition === "retry_scheduled"
          ? "Chosen AI recorded a retryable failure; nothing is running until the next pickup."
          : "Chosen AI stopped after a failure and needs a user decision.",
      detail: failureSummary,
      patch: () => ({
        state: result.state,
        needsInput: result.condition === "failed" ? {question:`Choose how to continue after ${failureCode}: ${failureSummary}`,raisedAt:Date.now(),actorId:args.principal.credentialId} : queueIdentity(item).needsInput,
        condition: result.condition,
        failureCode,
        failureSummary,
        retryCount: item.retryCount + 1,
        nextRetryAt: result.condition === "retry_scheduled" ? args.nextRetryAt : undefined,
        requiredAction:
          result.condition === "failed"
            ? `Choose how to continue after ${failureCode}: ${failureSummary}`
            : item.requiredAction,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        nextStep: undefined,
      }),
    });
  },
});

export const expireQueueHandoff = internalMutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, args.vaultOwnerId);
    const transition = queueExpiryTransition(queueIdentity(item), Date.now());
    if (!transition) throw new Error("Queue handoff has not expired");
    return runCommand(ctx, {
      owner: args.vaultOwnerId,
      itemId: args.queueItemId,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      command: "expire",
      actor: { kind: "system", id: "queue-expiry" },
      eventType: "expired",
      summary: "Queue handoff expired and now needs the user to reconnect or reassign it.",
      detail: "Reconnect or choose an AI for this directive, then return it to Waiting for your AI.",
      patch: () => ({
        state: transition.state,
        needsInput: {question:transition.requiredAction,raisedAt:Date.now(),actorId:"queue-expiry"},
        condition: transition.condition,
        requiredAction: transition.requiredAction,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        nextStep: undefined,
      }),
    });
  },
});

export const reconcileQueueItemExpiry = internalMutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
  },
  handler: async (ctx, args): Promise<QueueExpiryReconciliation> => {
    const item = await ctx.db.get(args.queueItemId);
    if (!item) return { item: null, expired: false };
    assertItemOwner(item, args.vaultOwnerId);
    const transition = queueExpiryTransition(queueIdentity(item), Date.now());
    if (!transition) return { item, expired: false as const };
    const result = await runCommand(ctx, {
      owner: args.vaultOwnerId,
      itemId: args.queueItemId,
      expectedVersion: item.version,
      idempotencyKey: `queue-expiry:${item._id}:${transition.expiresAt}`,
      command: "expire",
      actor: { kind: "system", id: "queue-expiry" },
      eventType: "expired",
      summary: "Queue handoff expired and now needs the user to reconnect or reassign it.",
      detail: transition.requiredAction,
      patch: () => ({
        state: transition.state,
        needsInput: {question:transition.requiredAction,raisedAt:Date.now(),actorId:"queue-expiry"},
        condition: transition.condition,
        requiredAction: transition.requiredAction,
        activeActorKind: undefined,
        activeActorId: undefined,
        activeCredentialId:undefined,
        leaseExpiresAt: undefined,
        nextStep: undefined,
      }),
    });
    return { item: result.item, expired: true as const };
  },
});

export const deleteQueueItemBatch = internalMutation({
  args: { vaultOwnerId: v.string(), queueItemId: v.id("queueItems"), batchSize: v.number() },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.queueItemId);
    assertItemOwner(item, args.vaultOwnerId);
    const batchSize = Math.max(1, Math.min(Math.floor(args.batchSize), 100));
    const activity = await ctx.db
      .query("queueActivity")
      .withIndex("by_item_created", (q) => q.eq("queueItemId", args.queueItemId))
      .take(batchSize);
    for (const row of activity) await ctx.db.delete(row._id);
    const remaining = batchSize - activity.length;
    if (remaining > 0) {
      const receipts = await ctx.db
        .query("queueCommandReceipts")
        .withIndex("by_item", (q) => q.eq("queueItemId", args.queueItemId))
        .take(remaining);
      for (const row of receipts) await ctx.db.delete(row._id);
      if (activity.length === 0 && receipts.length === 0) {
        await updateCounters(ctx,item,null);
        await ctx.db.delete(item._id);
        return { done: true, deleted: 1 };
      }
      return { done: false, deleted: activity.length + receipts.length };
    }
    return { done: false, deleted: activity.length };
  },
});

export const deleteQueueItem = action({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    confirmation: v.literal("delete_queue_item_and_history"),
  },
  handler: async (ctx, args): Promise<{ deleted: true; rowsDeleted: number }> => {
    const decision = await authorizeQueueTenantAction(ctx, "queue.deleteQueueItem", args.vaultOwnerId);
    let rowsDeleted = 0;
    for (let page = 0; page < 1_000; page += 1) {
      const result: { done: boolean; deleted: number } = await ctx.runMutation(
        internal.queue.deleteQueueItemBatch,
        { vaultOwnerId: decision.owner, queueItemId: args.queueItemId, batchSize: 100 },
      );
      rowsDeleted += result.deleted;
      if (result.done) return { deleted: true, rowsDeleted };
    }
    throw new Error("Queue deletion exceeded its bounded batch limit");
  },
});

/** AWL-0016: person-private suggestions share the Queue but are never actionable. */
export const queueCounts = mutation({
  args:{vaultOwnerId:v.string()},
  handler:async(ctx,args)=>{
    const decision=await authorizeTenantMutation(ctx,"queue.queueCounts",args.vaultOwnerId);assertQueueTenantAllowed(decision);
    const counter=await ctx.db.query("queueCounters").withIndex("by_owner",q=>q.eq("vaultOwnerId",decision.owner)).unique();
    if(counter)return counter.ready?{available:true,suggestions:counter.openSuggestions,needsInput:counter.needsInput}:{available:false,suggestions:null,needsInput:null};
    const item=await ctx.db.query("queueItems").withIndex("by_owner",q=>q.eq("vaultOwnerId",decision.owner)).first();
    return item?{available:false,suggestions:null,needsInput:null}:{available:true,suggestions:0,needsInput:0};
  },
});

export const agentAddQueueItem = internalMutation({
 args:{principal:principalValidator,connectionId:v.optional(v.id("mcpGrants")),directive:v.string(),addedBy:v.optional(v.union(v.literal("ai_on_request"),v.literal("ai_suggestion"))),reason:v.optional(v.string()),options:v.optional(v.array(v.string())),evidence:v.optional(v.array(v.string())),fromRecord:v.optional(contextValidator),idempotencyKey:v.string()},
 handler:async(ctx,args)=>{
  const actor=verifyPrincipal(args.principal,"add_queue_item");
  if(!args.addedBy) throw new Error("AI adds require addedBy: ai_on_request or ai_suggestion");
  if(args.addedBy==="ai_suggestion"&&!args.principal.scopes.includes("queue:suggest"))throw new Error("Propose suggestions power is off");
  const replay=await existingReceipt(ctx,{owner:actor.ownerId,idempotencyKey:args.idempotencyKey,command:"add",actor:{kind:actor.actorKind,id:args.principal.credentialId}});if(replay)return replay;
  if(args.fromRecord)await validateContext(ctx,actor.ownerId,[args.fromRecord]);
  const directive=normalizeRequiredText(args.directive,"Directive",QUEUE_LIMITS.directive);
  const reason=args.addedBy==="ai_suggestion"?normalizeRequiredText(args.reason??"","Suggestion reason",4000):args.reason;
  const ideaKey=args.addedBy==="ai_suggestion"?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([directive,reason]))))).map(byte=>byte.toString(16).padStart(2,"0")).join(""):undefined;
  const options=args.options?.map(o=>normalizeRequiredText(o,"Option",1000));if((options?.length??0)>26)throw new Error("At most 26 options");
  const evidence=args.evidence?.map(e=>normalizeRequiredText(e,"Evidence",1000));if((evidence?.length??0)>20)throw new Error("At most 20 evidence entries");
  // A dismissed idea requires a materially new explanation, not a retry under a new key.
  if(args.addedBy==="ai_suggestion"){
   const previous=await ctx.db.query("queueItems").withIndex("by_owner_idea",q=>q.eq("vaultOwnerId",actor.ownerId).eq("suggestionIdeaKey",ideaKey).eq("wasDismissed",true)).first();
   if(previous)throw new Error("This idea was dismissed; provide a new reason");
  }
  // Display attribution only: names never participate in grant authority.
  const connection=args.connectionId?await ctx.db.get(args.connectionId):null;
  const aiName=connection&&matchesVaultOwner(connection.vaultOwnerId,actor.ownerId)&&`${connection.issuer}#${connection.clientId}`===args.principal.credentialId?connection.label:"Your AI";
  const now=Date.now();
  await ensureCounters(ctx,actor.ownerId);
  const id=await ctx.db.insert("queueItems",{vaultOwnerId:actor.ownerId,directive,summary:summarizeDirective(directive),addedBy:args.addedBy,suggestionIdeaKey:ideaKey,suggestionStatus:args.addedBy==="ai_suggestion"?"open":undefined,suggestionReason:reason,suggestionOptions:options,suggestionEvidence:evidence,fromRecord:args.fromRecord,raisedByCredentialId:args.principal.credentialId,aiName,state:"waiting_for_your_ai",condition:"ready",priority:"normal",context:[],authority:{actorKind:actor.actorKind,actorId:actor.actorId,operations:["queue:read","queue:claim","queue:update","queue:complete"],scopeNote:"Queue work only; no domain authority."},leftForActorKind:"chosen_ai",leftForActorId:actor.actorId,retryCount:0,maxRetries:3,submittedAt:now,createdByActorKind:actor.actorKind,createdByActorId:args.principal.credentialId,version:1,createdAt:now,updatedAt:now});
  const item=await ctx.db.get(id);assertItemOwner(item,actor.ownerId);
  await updateCounters(ctx,null,item);
  await recordCommand(ctx,{owner:actor.ownerId,idempotencyKey:args.idempotencyKey,command:"add",actor:{kind:actor.actorKind,id:args.principal.credentialId},item,eventType:"created",detail:directive,summary:args.addedBy==="ai_suggestion"?"AI suggestion awaiting the person's decision.":"Added by your AI on request.",now});return {item,deduplicated:false};
 }
});

const reviewAction=v.union(v.literal("accept"),v.literal("dismiss"),v.literal("archive"),v.literal("restore"),v.literal("clear_input"),v.literal("edit"));
export const reviewQueueItem = mutation({
 args:{vaultOwnerId:v.string(),queueItemId:v.id("queueItems"),expectedVersion:v.number(),idempotencyKey:v.string(),action:reviewAction,directive:v.optional(v.string()),reason:v.optional(v.string()),optionIndex:v.optional(v.number())},
 handler:async(ctx,args)=>{
  const decision=await authorizeTenantMutation(ctx,"queue.reviewQueueItem",args.vaultOwnerId);assertQueueTenantAllowed(decision);
  const actor=actorForUser(decision.owner),command=`review:${args.action}`;
  const replay=await existingReceipt(ctx,{owner:decision.owner,idempotencyKey:args.idempotencyKey,command,actor});if(replay)return replay;
  const raw=await ctx.db.get(args.queueItemId);assertItemOwner(raw,decision.owner);assertVersion(raw,args.expectedVersion);const item=queueIdentity(raw),now=Date.now();
  const patch:Partial<QueueItem>={state:item.state,needsInput:item.needsInput,version:item.version+1,updatedAt:now,personActedAt:item.personActedAt??now};
  if(args.action==="accept"){
   if(item.suggestionStatus!=="open"||item.archivedAt)throw new Error("Only open suggestions can be accepted");
   let directive=args.directive??item.directive;
   if(args.optionIndex!==undefined){if(!Number.isInteger(args.optionIndex)||!item.suggestionOptions?.[args.optionIndex])throw new Error("Choose an available option");directive=args.directive??`${item.directive}\nChosen option: ${item.suggestionOptions[args.optionIndex]}`;}
   directive=normalizeRequiredText(directive,"Directive",QUEUE_LIMITS.directive);
   Object.assign(patch,{directive,summary:summarizeDirective(directive),suggestionStatus:"accepted",state:"waiting_for_your_ai",condition:"ready"});
  }else if(args.action==="dismiss"){
   if(item.suggestionStatus!=="open"||item.archivedAt)throw new Error("Only open suggestions can be dismissed");
   if((args.reason?.length??0)>4000)throw new Error("Dismiss reason too long");
   Object.assign(patch,{wasDismissed:true,suggestionStatus:"dismissed",archivedAt:now,archivedBy:decision.owner,dismissReason:args.reason});
  }else if(args.action==="archive")Object.assign(patch,{...(item.suggestionStatus==="open"?{suggestionStatus:"dismissed",wasDismissed:true}:{}),archivedAt:now,archivedBy:decision.owner,activeActorId:undefined,activeActorKind:undefined,activeCredentialId:undefined,leaseExpiresAt:undefined});
  else if(args.action==="restore"){
   if(!item.archivedAt)throw new Error("Item is not archived");
   Object.assign(patch,{archivedAt:undefined,archivedBy:undefined,suggestionStatus:["dismissed","withdrawn"].includes(item.suggestionStatus??"")?"open":item.suggestionStatus});
  }else if(args.action==="clear_input")Object.assign(patch,{needsInput:undefined,requiredAction:undefined});
  await ctx.db.patch(item._id,patch);const updated=await ctx.db.get(item._id);assertItemOwner(updated,decision.owner);
  await updateCounters(ctx,raw,updated);
  await recordCommand(ctx,{owner:decision.owner,idempotencyKey:args.idempotencyKey,command,actor,item:updated,eventType:"reviewed",summary:`Person: ${args.action}`,detail:args.reason,now});return {item:await queueForPerson(ctx,updated),deduplicated:false};
 }
});

export const agentWithdrawSuggestion = internalMutation({
 args:{principal:principalValidator,queueItemId:v.id("queueItems"),expectedVersion:v.number(),idempotencyKey:v.string()},
 handler:async(ctx,args)=>{
  const actor=verifyPrincipal(args.principal,"withdraw_suggestion"),command="withdraw";
  const receiptActor={kind:actor.actorKind,id:args.principal.credentialId};
  const item=await ctx.db.get(args.queueItemId);assertItemOwner(item,actor.ownerId);
  if(queueIdentity(item).needsInput)throw new Error('MCP_FAMILY_HISTORY_ERROR:'+JSON.stringify({code:"FORBIDDEN",message:"Only the person can clear Needs your input",recovery:"Ask the person to answer or clear the flag."}));
  if(item.personActedAt!==undefined)throw new Error("Only your own suggestion, before the person acts, can be withdrawn");
  const replay=await existingReceipt(ctx,{owner:actor.ownerId,idempotencyKey:args.idempotencyKey,command,actor:receiptActor});if(replay)return replay;
  assertVersion(item,args.expectedVersion);
  if(item.suggestionStatus!=="open"||item.personActedAt||item.archivedAt||item.raisedByCredentialId!==args.principal.credentialId)throw new Error("Only your own suggestion, before the person acts, can be withdrawn");
  const now=Date.now();await ctx.db.patch(item._id,{suggestionStatus:"withdrawn",archivedAt:now,archivedBy:args.principal.credentialId,updatedAt:now,version:item.version+1});
  const updated=await ctx.db.get(item._id);assertItemOwner(updated,actor.ownerId);
  await updateCounters(ctx,item,updated);
  await recordCommand(ctx,{owner:actor.ownerId,idempotencyKey:args.idempotencyKey,command,actor:receiptActor,item:updated,eventType:"reviewed",summary:"AI withdrew its own suggestion.",now});return {item:await queueForPerson(ctx,updated,false),deduplicated:false};
 }
});

/** Person-only origin read. Some FH building blocks have no standalone record route. */
export const getQueueOrigin = mutation({
 args:{vaultOwnerId:v.string(),queueItemId:v.id("queueItems")},
 handler:async(ctx,args)=>{
  const decision=await authorizeTenantMutation(ctx,"queue.getQueueOrigin",args.vaultOwnerId);assertQueueTenantAllowed(decision);
  const item=await ctx.db.get(args.queueItemId);assertItemOwner(item,decision.owner);
  if(!item.fromRecord)return null;
  const tables={person:"persons",relationship:"relationships",place:"places",event:"events",source:"sources",citation:"citations",media:"media",context_item:"contextItems",research_task:"researchTasks",research_check:"researchChecks",story:"stories",import_run:"importRuns",provisional_relative:"provisionalRelatives"} as const;
  const table=tables[item.fromRecord.kind as keyof typeof tables];
  const id=table?ctx.db.normalizeId(table,item.fromRecord.refId):null;const row=id?await ctx.db.get(id):null;
  if(!row || !("vaultOwnerId" in row) || !matchesVaultOwner(row.vaultOwnerId,decision.owner))return null;
  const projected=await queueForPerson(ctx,item);
  const text=row as unknown as {description?:string;summary?:string;label?:string;value?:string;status?:string;updatedAt?:number;personId?:string};
  const direct={person:"people",place:"places",story:"stories"} as Record<string,string>;
  const href=direct[item.fromRecord.kind]?`/app/${direct[item.fromRecord.kind]}/${encodeURIComponent(item.fromRecord.refId)}`:text.personId?`/app/people/${encodeURIComponent(text.personId)}`:null;
  return {title:"fromRecordTitle" in projected?String(projected.fromRecordTitle):item.fromRecord.kind,kind:item.fromRecord.kind,description:text.description||text.summary||text.label||null,value:text.value??null,status:text.status??null,updatedAt:text.updatedAt??null,href};
 }
});

/** Ship-time only, person by person. Dry runs report counts; live runs add counters only.
 * Marker writes make retries and concurrent ordinary Queue edits idempotent. Never maps state in storage. */
export const backfillQueueCounters = internalMutation({
 args:{vaultOwnerId:v.string(),cursor:v.union(v.string(),v.null()),dryRun:v.boolean()},
 handler:async(ctx,args)=>{
  const counter=args.dryRun?null:await ensureCounters(ctx,args.vaultOwnerId);
  if(counter?.lastBackfillResult&&counter.lastBackfillCursor===args.cursor)return counter.lastBackfillResult;
  if(counter&&args.cursor!==(counter.backfillCursor??null))throw new Error("Resume counter backfill from its recorded cursor, or restart at null after completion");
  const page=await ctx.db.query("queueItems").withIndex("by_owner",q=>q.eq("vaultOwnerId",args.vaultOwnerId)).paginate({numItems:100,cursor:args.cursor});
  let suggestions=0,needsInput=0,changed=0;
  for(const item of page.page){const value=contribution(item);suggestions+=value.suggestions;needsInput+=value.input;if(!item.counterIncluded){changed++;if(!args.dryRun)await updateCounters(ctx,null,item);}}
  const result={scanned:page.page.length,changed,suggestions,needsInput,isDone:page.isDone,continueCursor:page.continueCursor};
  if(counter)await ctx.db.patch(counter._id,{ready:page.isDone||counter.ready,backfillCursor:page.isDone?null:page.continueCursor,lastBackfillCursor:args.cursor,lastBackfillResult:result});
  return result;
 }
});

/** Reversible Queue archive uses the existing archive power, never a flag-clearing escape. */
export const agentArchiveQueueItem = internalMutation({
 args:{principal:principalValidator,queueItemId:v.id("queueItems"),expectedVersion:v.number(),idempotencyKey:v.string(),restore:v.optional(v.boolean())},
 handler:async(ctx,args)=>{
  const actor=verifyPrincipal(args.principal,"get_queue_item");
  const item=await ctx.db.get(args.queueItemId);assertItemOwner(item,actor.ownerId);
  if(!args.restore&&queueIdentity(item).needsInput)throw new Error('MCP_FAMILY_HISTORY_ERROR:'+JSON.stringify({code:"FORBIDDEN",message:"Only the person can clear Needs your input",recovery:"Ask the person to answer or clear the flag."}));
  verifyPrincipal(args.principal,"archive_queue_item");
  if(item.suggestionStatus==="open"||["dismissed","withdrawn"].includes(item.suggestionStatus??""))throw new Error("Only the person can review suggestions; withdraw only your own untouched suggestion");
  if(item.authority.actorId!==actor.actorId||item.authority.actorKind!==actor.actorKind)throw new Error("This AI is not assigned to the Queue item");
  if(!item.authority.operations.includes("queue:update"))throw new Error("Queue item authority does not include queue:update");
  if(!args.restore)assertAgentAuthority(item,{kind:actor.actorKind,id:actor.actorId,credentialId:args.principal.credentialId},"queue:update");
  const command=args.restore?"ai-restore":"ai-archive",receiptActor={kind:actor.actorKind,id:args.principal.credentialId};
  const replay=await existingReceipt(ctx,{owner:actor.ownerId,idempotencyKey:args.idempotencyKey,command,actor:receiptActor});if(replay)return replay;
  assertVersion(item,args.expectedVersion);const now=Date.now();
  await ctx.db.patch(item._id,{archivedAt:args.restore?undefined:now,archivedBy:args.restore?undefined:args.principal.credentialId,...(!args.restore?{activeActorId:undefined,activeActorKind:undefined,activeCredentialId:undefined,leaseExpiresAt:undefined}:{}),version:item.version+1,updatedAt:now});
  const updated=await ctx.db.get(item._id);assertItemOwner(updated,actor.ownerId);await updateCounters(ctx,item,updated);
  await recordCommand(ctx,{owner:actor.ownerId,idempotencyKey:args.idempotencyKey,command,actor:receiptActor,item:updated,eventType:"reviewed",summary:args.restore?"AI restored the Queue item.":"AI archived the Queue item.",now});
  return {item:await queueForPerson(ctx,updated,false),deduplicated:false};
 }
});

/** Read/write preflight for new suggestion rows only; ordinary AWL-0015 Queue reach is unchanged. */
export const suggestionReachInternal=internalQuery({
 args:{vaultOwnerId:v.string(),queueItemId:v.id("queueItems"),personIds:v.array(v.string())},
 handler:async(ctx,args)=>{const item=await ctx.db.get(args.queueItemId);return !!item&&matchesVaultOwner(item.vaultOwnerId,args.vaultOwnerId)&&suggestionWithinPeople(item,args.personIds);}
});
