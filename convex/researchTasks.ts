/**
 * Research-task lifecycle mutations.
 *
 * Brings the previously-dead `researchTasks.status` enum to life: claim a task,
 * advance it through guarded transitions, and read the owner's tasks. All route
 * through the `resolveOwner` chokepoint and the `matchesVaultOwner` guard, so
 * they inherit owner isolation exactly like every other vault function and the
 * planned shadow→enforce flip protects them for free.
 *
 * Transition legality lives in the pure, unit-tested lib/operations/taskLifecycle.ts.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { filterByVaultOwner, matchesVaultOwner, resolveOwner } from "./vaultCore";
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
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
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
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
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
export const listResearchTasks = query({
  args: {
    vaultOwnerId: v.string(),
    status: v.optional(taskStatusValidator),
    personId: v.optional(v.id("persons")),
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const rows = args.personId
      ? await ctx.db
          .query("researchTasks")
          .withIndex("by_person", (q) => q.eq("personId", args.personId))
          .collect()
      : await ctx.db
          .query("researchTasks")
          .withIndex("by_owner", (q) => q.eq("vaultOwnerId", vaultOwnerId))
          .collect();
    const owned = filterByVaultOwner(rows, vaultOwnerId);
    const filtered = args.status ? owned.filter((task) => task.status === args.status) : owned;
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
