/**
 * Research-task lifecycle mutations.
 *
 * Brings the previously-dead `researchTasks.status` enum to life: claim a task,
 * advance it through guarded transitions, and read the owner's tasks. All route
 * through the trust-boundary authorizers and the `matchesVaultOwner` guard, so
 * they inherit the guarded shadow→enforce rollout used by the rest of the vault.
 *
 * Transition legality lives in the pure, unit-tested lib/operations/taskLifecycle.ts.
 */
import { v } from "convex/values";
import { action, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { authorizeTenantAction, authorizeTenantMutation } from "./access";
import { filterByVaultOwner, matchesVaultOwner } from "./vaultCore";
import { TASK_DONE_NOTES_MIN, isValidTaskTransition } from "../lib/operations/taskLifecycle";

const taskStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

/** todo|blocked -> in_progress, stamping who/what claimed it. */
export const claimResearchTask = mutation({
  args: {
    vaultOwnerId: v.string(),
    taskId: v.id("researchTasks"),
    assignedTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "researchTasks.claimResearchTask", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const task = await ctx.db.get(args.taskId);
    if (!task || !matchesVaultOwner(task.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Research task not found");
    }
    if (!isValidTaskTransition(task.status, "in_progress")) {
      throw new Error(`Cannot claim a task in status "${task.status}"`);
    }
    await ctx.db.patch(args.taskId, {
      status: "in_progress",
      assignedTo: args.assignedTo ?? task.assignedTo,
      updatedAt: Date.now(),
    });
    return { taskId: args.taskId, status: "in_progress" as const };
  },
});

/**
 * Generic guarded transition. Marking a task `done` requires a notes summary of
 * at least TASK_DONE_NOTES_MIN chars and stamps `completedAt`. Use this for
 * complete / block / release / reopen.
 */
export const advanceResearchTask = mutation({
  args: {
    vaultOwnerId: v.string(),
    taskId: v.id("researchTasks"),
    status: taskStatusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "researchTasks.advanceResearchTask", args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    const task = await ctx.db.get(args.taskId);
    if (!task || !matchesVaultOwner(task.vaultOwnerId, vaultOwnerId)) {
      throw new Error("Research task not found");
    }
    if (!isValidTaskTransition(task.status, args.status)) {
      throw new Error(`Invalid research-task transition: ${task.status} -> ${args.status}`);
    }
    if (args.status === "done" && (args.notes?.trim().length ?? 0) < TASK_DONE_NOTES_MIN) {
      throw new Error(
        `Completing a task requires a notes summary of at least ${TASK_DONE_NOTES_MIN} characters`,
      );
    }
    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: now,
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.status === "done" ? { completedAt: now } : {}),
    });
    return { taskId: args.taskId, status: args.status };
  },
});

/** Owner-scoped task list, optionally filtered by status and/or person. */
const listResearchTasksArgs = {
  vaultOwnerId: v.string(),
  status: v.optional(taskStatusValidator),
  personId: v.optional(v.id("persons")),
};

export const listResearchTasksInternal = internalQuery({
  args: listResearchTasksArgs,
  handler: async (ctx, args) => {
    if (args.personId) {
      const person = await ctx.db.get(args.personId);
      if (!person || !matchesVaultOwner(person.vaultOwnerId, args.vaultOwnerId)) {
        return [];
      }
    }
    const rows = args.personId
      ? await ctx.db
          .query("researchTasks")
          .withIndex("by_person", (q) => q.eq("personId", args.personId))
          .collect()
      : await ctx.db
          .query("researchTasks")
          .withIndex("by_owner", (q) => q.eq("vaultOwnerId", args.vaultOwnerId))
          .collect();
    const owned = filterByVaultOwner(rows, args.vaultOwnerId);
    const filtered = args.status ? owned.filter((task) => task.status === args.status) : owned;
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listResearchTasks = action({
  args: listResearchTasksArgs,
  handler: async (ctx, args): Promise<Doc<"researchTasks">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "researchTasks.listResearchTasks",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.researchTasks.listResearchTasksInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});
