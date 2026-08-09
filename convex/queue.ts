import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeTenantAction, authorizeTenantMutation } from "./access";
import { matchesVaultOwner } from "./vaultCore";
import {
  QUEUE_LIMITS,
  assertCommandAllowed,
  assertLeaseDuration,
  assertVersion,
  nextStateForFailure,
  normalizeOptionalText,
  normalizeRequiredText,
  summarizeDirective,
  type QueueActorKind,
  type QueueCommand,
  type QueueOperation,
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
type QueueContext = QueueItem["context"][number];

function actorForUser(owner: string): { kind: "user"; id: string } {
  return { kind: "user", id: owner };
}

function assertItemOwner(item: QueueItem | null, owner: string): asserts item is QueueItem {
  if (!item || !matchesVaultOwner(item.vaultOwnerId, owner)) throw new Error("Queue item not found");
}

function assertAgentAuthority(item: QueueItem, actor: { kind: QueueActorKind; id: string }, operation: QueueOperation) {
  if (item.authority.actorKind !== actor.kind || item.authority.actorId !== actor.id) {
    throw new Error("This AI is not assigned to the Queue item");
  }
  if (!item.authority.operations.includes(operation)) {
    throw new Error(`Queue item authority does not include ${operation}`);
  }
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
  return { item, deduplicated: true as const };
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
  assertCommandAllowed(input.command, item, input.actor, now);
  const fromState = item.state;
  await ctx.db.patch(item._id, {
    ...input.patch(item, now),
    version: item.version + 1,
    updatedAt: now,
  });
  const updated = await ctx.db.get(item._id);
  assertItemOwner(updated, input.owner);
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
  return { item: updated, deduplicated: false as const };
}

export const createQueueItem = mutation({
  args: {
    vaultOwnerId: v.string(),
    directive: v.string(),
    requestedOutcome: v.optional(v.string()),
    priority: v.optional(queuePriorityValidator),
    priorityReason: v.optional(v.string()),
    context: v.optional(v.array(contextValidator)),
    chosenAiId: v.optional(v.string()),
    handoffExpiresAt: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.createQueueItem", args.vaultOwnerId);
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
    const chosenAiId = normalizeOptionalText(args.chosenAiId, "Chosen AI id", 160);
    const maxRetries = args.maxRetries ?? 3;
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > QUEUE_LIMITS.maxRetries) {
      throw new Error(`maxRetries must be between 0 and ${QUEUE_LIMITS.maxRetries}`);
    }
    const now = Date.now();
    if (args.handoffExpiresAt !== undefined && args.handoffExpiresAt <= now) {
      throw new Error("handoffExpiresAt must be in the future");
    }
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
      createdByActorKind: "user",
      createdByActorId: owner,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const item = await ctx.db.get(queueItemId);
    assertItemOwner(item, owner);
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
    return { item, deduplicated: false as const };
  },
});

export const assignQueueItemToAi = mutation({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    chosenAiId: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "queue.assignQueueItemToAi", args.vaultOwnerId);
    const chosenAiId = normalizeRequiredText(args.chosenAiId, "Chosen AI id", 160);
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
      patch: () => ({
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
        leaseExpiresAt: undefined,
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
        leaseExpiresAt: undefined,
      }),
    });
  },
});

const listQueueArgs = {
  vaultOwnerId: v.string(),
  state: v.optional(queueStateValidator),
  priority: v.optional(queuePriorityValidator),
  paginationOpts: paginationOptsValidator,
};

export const listQueueItemsInternal = internalQuery({
  args: listQueueArgs,
  handler: async (ctx, args) => {
    const requested = Math.min(args.paginationOpts.numItems, QUEUE_LIMITS.itemPage);
    const paginationOpts = { ...args.paginationOpts, numItems: requested };
    if (args.state) {
      return ctx.db
        .query("queueItems")
        .withIndex("by_owner_state_updated", (q) =>
          q.eq("vaultOwnerId", args.vaultOwnerId).eq("state", args.state!),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    if (args.priority) {
      return ctx.db
        .query("queueItems")
        .withIndex("by_owner_priority_updated", (q) =>
          q.eq("vaultOwnerId", args.vaultOwnerId).eq("priority", args.priority!),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    return ctx.db
      .query("queueItems")
      .withIndex("by_owner_updated", (q) => q.eq("vaultOwnerId", args.vaultOwnerId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const listQueueItems = action({
  args: listQueueArgs,
  handler: async (ctx, args): Promise<PaginationResult<QueueItem>> => {
    const decision = await authorizeTenantAction(
      ctx,
      "queue.listQueueItems",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.queue.listQueueItemsInternal, { ...args, vaultOwnerId: decision.owner });
  },
});

export const getQueueItemInternal = internalQuery({
  args: {
    vaultOwnerId: v.string(),
    queueItemId: v.id("queueItems"),
    activityPagination: paginationOptsValidator,
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
    return { item, activity };
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
    const decision = await authorizeTenantAction(
      ctx,
      "queue.getQueueItem",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.queue.getQueueItemInternal, { ...args, vaultOwnerId: decision.owner });
  },
});

function verifyPrincipal(principal: VerifiedQueuePrincipal, toolName: QueueAgentToolName) {
  return authorizeQueueAgentTool(principal, toolName);
}

export const agentListQueueItems = internalQuery({
  args: {
    principal: principalValidator,
    state: v.optional(queueStateValidator),
    priority: v.optional(queuePriorityValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "list_queue_items");
    const requested = Math.min(args.paginationOpts.numItems, QUEUE_LIMITS.itemPage);
    const paginationOpts = { ...args.paginationOpts, numItems: requested };
    if (args.state) {
      return ctx.db
        .query("queueItems")
        .withIndex("by_owner_state_updated", (q) =>
          q.eq("vaultOwnerId", actor.ownerId).eq("state", args.state!),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    if (args.priority) {
      return ctx.db
        .query("queueItems")
        .withIndex("by_owner_priority_updated", (q) =>
          q.eq("vaultOwnerId", actor.ownerId).eq("priority", args.priority!),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    return ctx.db
      .query("queueItems")
      .withIndex("by_owner_updated", (q) => q.eq("vaultOwnerId", actor.ownerId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const agentGetQueueItem = internalQuery({
  args: {
    principal: principalValidator,
    queueItemId: v.id("queueItems"),
    activityPagination: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = verifyPrincipal(args.principal, "get_queue_item");
    const item = await ctx.db.get(args.queueItemId);
    if (!item || !matchesVaultOwner(item.vaultOwnerId, actor.ownerId)) return null;
    const activity = await ctx.db
      .query("queueActivity")
      .withIndex("by_item_created", (q) => q.eq("queueItemId", args.queueItemId))
      .order("desc")
      .paginate({
        ...args.activityPagination,
        numItems: Math.min(args.activityPagination.numItems, QUEUE_LIMITS.activityPage),
      });
    return { item, activity };
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
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId }, "queue:claim");
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
      patch: (_current, now) => ({
        state: "working",
        condition: "active",
        activeActorKind: actor.actorKind,
        activeActorId: actor.actorId,
        pickedUpAt: now,
        leaseExpiresAt: now + args.leaseMs,
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
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId }, "queue:update");
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
      patch: (_current, now) => ({ nextStep, leaseExpiresAt: now + args.leaseMs }),
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
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId }, "queue:update");
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
      patch: () => ({
        state: "needs_you",
        condition: "awaiting_user",
        requiredAction,
        nextStep: undefined,
        activeActorKind: undefined,
        activeActorId: undefined,
        leaseExpiresAt: undefined,
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
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId }, "queue:complete");
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
        leaseExpiresAt: undefined,
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
      patch: () => ({
        state: "waiting_for_your_ai",
        condition: "ready",
        requiredAction: undefined,
        failureCode: undefined,
        failureSummary: undefined,
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
        leaseExpiresAt: undefined,
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
      patch: () => ({
        state: "waiting_for_your_ai",
        condition: "ready",
        resultSummary: undefined,
        resultRefs: undefined,
        completedAt: undefined,
        canceledAt: undefined,
        canceledReason: undefined,
        retryCount: 0,
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
    assertAgentAuthority(item, { kind: actor.actorKind, id: actor.actorId }, "queue:update");
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
        condition: result.condition,
        failureCode,
        failureSummary,
        retryCount: item.retryCount + 1,
        nextRetryAt: result.condition === "retry_scheduled" ? args.nextRetryAt : undefined,
        requiredAction:
          result.state === "needs_you"
            ? `Choose how to continue after ${failureCode}: ${failureSummary}`
            : undefined,
        activeActorKind: undefined,
        activeActorId: undefined,
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
    const now = Date.now();
    const expired =
      (item.handoffExpiresAt !== undefined && item.handoffExpiresAt <= now) ||
      (item.leaseExpiresAt !== undefined && item.leaseExpiresAt <= now);
    if (!expired) throw new Error("Queue handoff has not expired");
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
        state: "needs_you",
        condition: "expired",
        requiredAction: "Reconnect or choose an AI for this directive, then return it to Waiting for your AI.",
        activeActorKind: undefined,
        activeActorId: undefined,
        leaseExpiresAt: undefined,
        nextStep: undefined,
      }),
    });
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
    const decision = await authorizeTenantAction(
      ctx,
      "queue.deleteQueueItem",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
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
