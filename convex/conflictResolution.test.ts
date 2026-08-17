/**
 * AWF-0046: real Convex-runtime tests for the closing move on a conflict.
 *
 * The vault could enter the `conflict` state and never leave it. These exercise
 * the actual `vaultMutations.resolveSourceFactConflict` handler through
 * convex-test, mirroring convex/researchTasks.test.ts, and assert the three
 * promises the feature makes: the reading that lost is kept, the reasoning is
 * durable, and the auto-opened task closes as a consequence of the resolution
 * rather than independently of it.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const OWNER_A = "user_conflictOwnerAAAAAAAAA";
const OWNER_B = "user_conflictOwnerBBBBBBBBB";
const now = Date.now();
const REASON =
  "The parish register is the original entry, written within days of the birth; the family bible was copied out decades later.";

/**
 * Seeds the branch the FamilySearch importer produces for a flagged fact: a
 * person whose recorded birth is 1888, a source and citation saying 1890, the
 * conflicting `sourceFact`, and the auto-opened `conflict_resolution` task.
 */
async function seedConflictedBranch(
  t: ReturnType<typeof convexTest>,
  owner: string,
  options: { extraConflict?: boolean } = {},
) {
  return t.run(async (ctx) => {
    const personId = await ctx.db.insert("persons", {
      vaultOwnerId: owner,
      fsId: "KWCJ-4XD",
      name: { given: "John", surname: "Jarvie" },
      sex: "male",
      living: false,
      birth: { date: { original: "1888", year: 1888 } },
      researchStatus: "in_progress",
      createdAt: now,
      updatedAt: now,
    });
    const sourceId = await ctx.db.insert("sources", {
      vaultOwnerId: owner,
      title: "Parish baptism register",
      type: "church_record",
      createdAt: now,
      updatedAt: now,
    });
    const citationId = await ctx.db.insert("citations", {
      vaultOwnerId: owner,
      sourceId,
      isEvidence: true,
      confidence: "high",
      extractedText: "Born 3 February 1890.",
      createdAt: now,
      updatedAt: now,
    });
    const sourceFactId = await ctx.db.insert("sourceFacts", {
      vaultOwnerId: owner,
      personId,
      sourceId,
      citationId,
      importKey: "fs-fact:KWCJ-4XD:birth",
      factType: "birth",
      label: "Birth Date",
      value: "3 February 1890",
      confidence: "low",
      status: "conflict",
      conflictReason: "Indexed source birth value differs from the capture header birth fact.",
      createdAt: now,
      updatedAt: now,
    });
    const secondFactId = options.extraConflict
      ? await ctx.db.insert("sourceFacts", {
          vaultOwnerId: owner,
          personId,
          sourceId,
          citationId,
          importKey: "fs-fact:KWCJ-4XD:name",
          factType: "name",
          label: "Name",
          value: "Jonathan Jarvie",
          confidence: "low",
          status: "conflict",
          conflictReason: "Indexed source name differs from the capture header name.",
          createdAt: now,
          updatedAt: now,
        })
      : null;
    const taskId = await ctx.db.insert("researchTasks", {
      vaultOwnerId: owner,
      personId,
      type: "conflict_resolution",
      title: "Review source-backed fact conflicts",
      status: "todo",
      priority: "high",
      aiSuggested: true,
      createdAt: now,
      updatedAt: now,
    });
    return { personId, sourceId, citationId, sourceFactId, secondFactId, taskId };
  });
}

describe("resolving a source-fact conflict", () => {
  test("accepting the source records the judgment and keeps the losing reading", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedConflictedBranch(t, OWNER_A);

    const result = await t.mutation(api.vaultMutations.resolveSourceFactConflict, {
      vaultOwnerId: OWNER_A,
      sourceFactId: seeded.sourceFactId,
      resolution: "accepted",
      reason: REASON,
    });
    expect(result).toMatchObject({ status: "accepted", remainingConflicts: 0 });

    const state = await t.run(async (ctx) => ({
      fact: await ctx.db.get(seeded.sourceFactId),
      // The record decided against must still be there in full.
      citation: await ctx.db.get(seeded.citationId),
      source: await ctx.db.get(seeded.sourceId),
      person: await ctx.db.get(seeded.personId),
      log: await ctx.db.query("researchLog").collect(),
      task: await ctx.db.get(seeded.taskId),
    }));

    expect(state.fact?.status).toBe("accepted");
    // The disagreement itself stays legible after it is settled.
    expect(state.fact?.conflictReason).toBeTruthy();
    expect(state.citation).not.toBeNull();
    expect(state.source).not.toBeNull();

    // Accepting a source reading is a statement about the evidence, not an
    // edit to the person record. The canonical birth must be untouched.
    expect(state.person?.birth?.date?.original).toBe("1888");

    expect(state.log).toHaveLength(1);
    expect(state.log[0].summary).toContain("3 February 1890");
    expect(state.log[0].details).toContain(REASON);
    expect(state.log[0].details).toContain("The reading decided against is kept, not deleted.");
    expect(state.log[0].outputRefs).toContain(`sourceFact:${String(seeded.sourceFactId)}`);

    // The auto-opened task closes because the conflict was settled.
    expect(state.task?.status).toBe("done");
    expect(typeof state.task?.completedAt).toBe("number");
  });

  test("rejecting the source is a recorded judgment, not a deletion", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedConflictedBranch(t, OWNER_A);

    await t.mutation(api.vaultMutations.resolveSourceFactConflict, {
      vaultOwnerId: OWNER_A,
      sourceFactId: seeded.sourceFactId,
      resolution: "rejected",
      reason: REASON,
    });

    const state = await t.run(async (ctx) => ({
      fact: await ctx.db.get(seeded.sourceFactId),
      log: await ctx.db.query("researchLog").collect(),
    }));
    expect(state.fact?.status).toBe("rejected");
    expect(state.fact?.value).toBe("3 February 1890");
    expect(state.log[0].summary).toContain("1888");
  });

  test("the task stays open while another conflict is still unsettled", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedConflictedBranch(t, OWNER_A, { extraConflict: true });

    const first = await t.mutation(api.vaultMutations.resolveSourceFactConflict, {
      vaultOwnerId: OWNER_A,
      sourceFactId: seeded.sourceFactId,
      resolution: "accepted",
      reason: REASON,
    });
    expect(first).toMatchObject({ remainingConflicts: 1, closedTaskId: null });
    expect(await t.run(async (ctx) => (await ctx.db.get(seeded.taskId))?.status)).toBe("todo");

    const second = await t.mutation(api.vaultMutations.resolveSourceFactConflict, {
      vaultOwnerId: OWNER_A,
      sourceFactId: seeded.secondFactId!,
      resolution: "rejected",
      reason: REASON,
    });
    expect(second).toMatchObject({ remainingConflicts: 0 });
    expect(await t.run(async (ctx) => (await ctx.db.get(seeded.taskId))?.status)).toBe("done");
  });

  test("a thin reason is refused, so a settled conflict always says why", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedConflictedBranch(t, OWNER_A);
    await expect(
      t.mutation(api.vaultMutations.resolveSourceFactConflict, {
        vaultOwnerId: OWNER_A,
        sourceFactId: seeded.sourceFactId,
        resolution: "accepted",
        reason: "looks right",
      }),
    ).rejects.toThrow(/at least 20 characters/);
    expect(await t.run(async (ctx) => (await ctx.db.get(seeded.sourceFactId))?.status)).toBe("conflict");
  });

  test("a fact that is not in conflict cannot be resolved", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedConflictedBranch(t, OWNER_A);
    await t.mutation(api.vaultMutations.resolveSourceFactConflict, {
      vaultOwnerId: OWNER_A,
      sourceFactId: seeded.sourceFactId,
      resolution: "accepted",
      reason: REASON,
    });
    await expect(
      t.mutation(api.vaultMutations.resolveSourceFactConflict, {
        vaultOwnerId: OWNER_A,
        sourceFactId: seeded.sourceFactId,
        resolution: "rejected",
        reason: REASON,
      }),
    ).rejects.toThrow(/currently flagged as a conflict/);
  });

  test("another vault's conflict is not visible or resolvable", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedConflictedBranch(t, OWNER_A);
    await expect(
      t.mutation(api.vaultMutations.resolveSourceFactConflict, {
        vaultOwnerId: OWNER_B,
        sourceFactId: seeded.sourceFactId,
        resolution: "accepted",
        reason: REASON,
      }),
    ).rejects.toThrow();
    expect(await t.run(async (ctx) => (await ctx.db.get(seeded.sourceFactId))?.status)).toBe("conflict");
  });
});
