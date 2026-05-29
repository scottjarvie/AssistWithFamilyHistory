/**
 * Real Convex-runtime tests for the research-task lifecycle mutations
 * (convex-test), mirroring convex/ownerScoping.test.ts. Exercises the actual
 * claim/advance/list handlers plus owner isolation and the done-notes gate.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const OWNER_A = "user_taskOwnerAAAAAAAAAAAAA";
const OWNER_B = "user_taskOwnerBBBBBBBBBBBBB";
const now = Date.now();

function taskFields(owner: string, title: string) {
  return {
    vaultOwnerId: owner,
    type: "record_search" as const,
    title,
    status: "todo" as const,
    priority: "medium" as const,
    aiSuggested: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe("research task lifecycle", () => {
  test("claim then complete advances status and stamps completedAt", async () => {
    const t = convexTest(schema, modules);
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("researchTasks", taskFields(OWNER_A, "Find the 1900 census")),
    );

    await t.mutation(api.researchTasks.claimResearchTask, {
      vaultOwnerId: OWNER_A,
      taskId,
      assignedTo: "agent:test",
    });
    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("in_progress");
    expect(task?.assignedTo).toBe("agent:test");

    await t.mutation(api.researchTasks.advanceResearchTask, {
      vaultOwnerId: OWNER_A,
      taskId,
      status: "done",
      notes: "Located the 1900 census household entry for the family.",
    });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("done");
    expect(typeof task?.completedAt).toBe("number");
  });

  test("illegal transition is rejected", async () => {
    const t = convexTest(schema, modules);
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("researchTasks", { ...taskFields(OWNER_A, "x"), status: "done" as const }),
    );
    await expect(
      t.mutation(api.researchTasks.advanceResearchTask, {
        vaultOwnerId: OWNER_A,
        taskId,
        status: "blocked",
      }),
    ).rejects.toThrow();
  });

  test("completing without a notes summary is rejected", async () => {
    const t = convexTest(schema, modules);
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("researchTasks", taskFields(OWNER_A, "y")),
    );
    await t.mutation(api.researchTasks.claimResearchTask, { vaultOwnerId: OWNER_A, taskId });
    await expect(
      t.mutation(api.researchTasks.advanceResearchTask, {
        vaultOwnerId: OWNER_A,
        taskId,
        status: "done",
        notes: "too short",
      }),
    ).rejects.toThrow();
  });

  test("cannot touch another owner's task", async () => {
    const t = convexTest(schema, modules);
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("researchTasks", taskFields(OWNER_A, "private")),
    );
    await expect(
      t.mutation(api.researchTasks.claimResearchTask, { vaultOwnerId: OWNER_B, taskId }),
    ).rejects.toThrow(/not found/);
  });

  test("listResearchTasks returns only the owner's tasks", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("researchTasks", taskFields(OWNER_A, "a1"));
      await ctx.db.insert("researchTasks", taskFields(OWNER_B, "b1"));
    });
    const list = await t.query(api.researchTasks.listResearchTasks, { vaultOwnerId: OWNER_A });
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("a1");
  });
});
