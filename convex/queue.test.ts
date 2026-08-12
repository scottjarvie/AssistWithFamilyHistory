import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const OWNER_A = "user_queueOwnerAAAAAAAAAAAA";
const OWNER_B = "user_queueOwnerBBBBBBBBBBBB";
const AI_A = "ai_queue_researcher_a";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function principal(ownerId = OWNER_A, actorId = AI_A, scopes = ["queue:read", "queue:claim", "queue:update", "queue:complete"]) {
  return {
    ownerId,
    actorId,
    actorKind: "chosen_ai" as const,
    scopes,
    credentialId: `credential:${actorId}`,
  };
}

async function createItem(
  t: ReturnType<typeof convexTest>,
  input: {
    owner?: string;
    chosenAiId?: string;
    handoffExpiresAt?: number;
    maxRetries?: number;
    idempotencyKey?: string;
  } = {},
) {
  const owner = input.owner ?? OWNER_A;
  return t.withIdentity({ subject: owner }).mutation(api.queue.createQueueItem, {
    vaultOwnerId: owner,
    directive: "Compare the two census records and explain which household is the stronger match.",
    chosenAiId: input.chosenAiId,
    handoffExpiresAt: input.handoffExpiresAt,
    maxRetries: input.maxRetries,
    idempotencyKey: input.idempotencyKey ?? `create:${owner}:${input.chosenAiId ?? "none"}`,
  });
}

describe("product Queue foundation", () => {
  test("directive-only creation is Waiting for your AI and honest about disconnection", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t);
    expect(created.item.state).toBe("waiting_for_your_ai");
    expect(created.item.condition).toBe("disconnected");
    expect(created.item.context).toEqual([]);
    expect(created.item.version).toBe(1);
    expect(created.item.authority.actorId).toBe("unassigned");

    const detail = await t.withIdentity({ subject: OWNER_A }).action(api.queue.getQueueItem, {
      vaultOwnerId: OWNER_A,
      queueItemId: created.item._id,
      activityPagination: { numItems: 20, cursor: null },
    });
    expect(detail?.activity.page).toHaveLength(1);
    expect(detail?.activity.page[0].eventType).toBe("created");
  });

  test("identity and owner scope are enforced before Queue reads or writes", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t, { chosenAiId: AI_A });

    await expect(
      t.withIdentity({ subject: OWNER_B }).action(api.queue.getQueueItem, {
        vaultOwnerId: OWNER_A,
        queueItemId: created.item._id,
        activityPagination: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow(/owner_mismatch/);

    await expect(
      t.withIdentity({ subject: OWNER_B }).mutation(api.queue.cancelQueueItem, {
        vaultOwnerId: OWNER_A,
        queueItemId: created.item._id,
        expectedVersion: 1,
        reason: "cross-owner attempt",
        idempotencyKey: "cross-owner-cancel",
      }),
    ).rejects.toThrow(/owner_mismatch/);
  });

  test("Queue tenancy stays fail-closed while the legacy trust boundary is in shadow mode", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.queue.createQueueItem, {
        vaultOwnerId: OWNER_A,
        directive: "An anonymous caller must not create Queue work.",
        idempotencyKey: "anonymous-create",
      }),
    ).rejects.toThrow(/missing_identity/);

    const created = await createItem(t, { chosenAiId: AI_A, idempotencyKey: "shadow-owner-create" });
    await expect(
      t.withIdentity({ subject: OWNER_B }).action(api.queue.listQueueItems, {
        vaultOwnerId: OWNER_A,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow(/owner_mismatch/);
    await expect(
      t.withIdentity({ subject: OWNER_B }).mutation(api.queue.cancelQueueItem, {
        vaultOwnerId: OWNER_A,
        queueItemId: created.item._id,
        expectedVersion: created.item.version,
        reason: "A foreign tenant must not mutate this item.",
        idempotencyKey: "shadow-cross-owner-cancel",
      }),
    ).rejects.toThrow(/owner_mismatch/);
    await expect(
      t.action(api.queue.getQueueItem, {
        vaultOwnerId: OWNER_A,
        queueItemId: created.item._id,
        activityPagination: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow(/missing_identity/);

    const unchanged = await t.run((ctx) => ctx.db.get(created.item._id));
    expect(unchanged?.version).toBe(1);
    expect(unchanged?.state).toBe("waiting_for_your_ai");
  });

  test("context adapters reject foreign genealogy records", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const foreignPersonId = await t.run((ctx) =>
      ctx.db.insert("persons", {
        vaultOwnerId: OWNER_B,
        name: { given: "Synthetic", surname: "Foreign" },
        sex: "unknown",
        living: false,
        researchStatus: "not_started",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity({ subject: OWNER_A }).mutation(api.queue.createQueueItem, {
        vaultOwnerId: OWNER_A,
        directive: "Review this person.",
        context: [{ kind: "person", refId: foreignPersonId }],
        idempotencyKey: "foreign-context",
      }),
    ).rejects.toThrow(/context reference not found/);
  });

  test("chosen AI claim is leased, idempotent, actor-bound, and concurrency-safe", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t, { chosenAiId: AI_A });

    const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(),
      queueItemId: created.item._id,
      expectedVersion: 1,
      leaseMs: 120_000,
      nextStep: "Compare names, ages, places, and linked citations.",
      idempotencyKey: "claim-1",
    });
    expect(claimed.item.state).toBe("working");
    expect(claimed.item.version).toBe(2);

    const replay = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(),
      queueItemId: created.item._id,
      expectedVersion: 1,
      leaseMs: 120_000,
      nextStep: "This input is ignored because the command is a replay.",
      idempotencyKey: "claim-1",
    });
    expect(replay.deduplicated).toBe(true);
    expect(replay.item.version).toBe(2);

    await expect(
      t.mutation(internal.queue.agentCheckpointQueueItem, {
        principal: principal(OWNER_A, "ai_other"),
        queueItemId: created.item._id,
        expectedVersion: 2,
        leaseMs: 120_000,
        nextStep: "Attempt another actor's checkpoint.",
        idempotencyKey: "other-checkpoint",
      }),
    ).rejects.toThrow(/not assigned/);

    await expect(
      t.mutation(internal.queue.agentCheckpointQueueItem, {
        principal: principal(),
        queueItemId: created.item._id,
        expectedVersion: 1,
        leaseMs: 120_000,
        nextStep: "Use a stale version.",
        idempotencyKey: "stale-checkpoint",
      }),
    ).rejects.toThrow(/changed from version/);
  });

  test("Needs You carries an exact question and only the user can resume it", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t, { chosenAiId: AI_A });
    const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: 1,
      leaseMs: 120_000, nextStep: "Inspect the source image.", idempotencyKey: "claim-needs-user",
    });
    const blocked = await t.mutation(internal.queue.agentRequestUserAction, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: claimed.item.version,
      requiredAction: "Upload page two of the record so the household can be compared.",
      idempotencyKey: "needs-user",
    });
    expect(blocked.item.state).toBe("needs_you");
    expect(blocked.item.requiredAction).toContain("Upload page two");

    const resumed = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.resumeQueueItem, {
      vaultOwnerId: OWNER_A, queueItemId: created.item._id, expectedVersion: blocked.item.version,
      answerSummary: "Page two is now attached to the source record.", idempotencyKey: "resume-1",
    });
    expect(resumed.item.state).toBe("waiting_for_your_ai");
    expect(resumed.item.requiredAction).toBeUndefined();
  });

  test("retryable failure releases work; exhausted failure becomes Needs You", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);
    const t = convexTest(schema, modules);
    const created = await createItem(t, { chosenAiId: AI_A, maxRetries: 1 });
    const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: 1,
      leaseMs: 120_000, nextStep: "Read the context pack.", idempotencyKey: "claim-retry",
    });
    const retry = await t.mutation(internal.queue.agentFailQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: claimed.item.version,
      failureCode: "temporary_backend", failureSummary: "The synthetic backend was temporarily unavailable.",
      retryable: true, nextRetryAt: baseTime + 60_000, idempotencyKey: "fail-retry",
    });
    expect(retry.item.state).toBe("waiting_for_your_ai");
    expect(retry.item.condition).toBe("retry_scheduled");
    expect(retry.item.activeActorId).toBeUndefined();

    vi.setSystemTime(baseTime + 60_001);
    const reclaimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: retry.item.version,
      leaseMs: 120_000, nextStep: "Retry the bounded read.", idempotencyKey: "claim-retry-2",
    });
    const exhausted = await t.mutation(internal.queue.agentFailQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: reclaimed.item.version,
      failureCode: "permission_required", failureSummary: "The source requires a permission only the user can grant.",
      retryable: true, nextRetryAt: Date.now() + 60_000, idempotencyKey: "fail-exhausted",
    });
    expect(exhausted.item.state).toBe("needs_you");
    expect(exhausted.item.condition).toBe("failed");
  });

  test("a chosen AI can complete only claimed work and leaves attributable history", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t, { chosenAiId: AI_A });
    const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: 1,
      leaseMs: 120_000, nextStep: "Compare the records.", idempotencyKey: "claim-complete",
    });
    const completed = await t.mutation(internal.queue.agentCompleteQueueItem, {
      principal: principal(), queueItemId: created.item._id, expectedVersion: claimed.item.version,
      resultSummary: "The 1910 household is the stronger match because age, spouse, and town align.",
      resultRefs: ["source:synthetic-census-1910"], idempotencyKey: "complete-1",
    });
    expect(completed.item.state).toBe("done");
    expect(completed.item.condition).toBe("completed");
    expect(completed.item.completedAt).toEqual(expect.any(Number));

    const detail = await t.withIdentity({ subject: OWNER_A }).action(api.queue.getQueueItem, {
      vaultOwnerId: OWNER_A, queueItemId: created.item._id,
      activityPagination: { numItems: 20, cursor: null },
    });
    expect(detail?.activity.page.map((row) => row.eventType)).toEqual(["completed", "claimed", "created"]);
    expect(detail?.activity.page[0].actorId).toBe(AI_A);
    expect(detail?.activity.page[0].detail).toContain("stronger match");
  });

  test("human-only use remains complete when no AI is connected", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t);
    const claimed = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.claimQueueItemAsUser, {
      vaultOwnerId: OWNER_A, queueItemId: created.item._id, expectedVersion: 1,
      leaseMs: 120_000, nextStep: "Review the records manually.", idempotencyKey: "user-claim",
    });
    const completed = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.completeQueueItemAsUser, {
      vaultOwnerId: OWNER_A, queueItemId: created.item._id, expectedVersion: claimed.item.version,
      resultSummary: "Reviewed manually; the evidence is not yet sufficient for a conclusion.",
      idempotencyKey: "user-complete",
    });
    expect(completed.item.state).toBe("done");
    expect(completed.item.activeActorId).toBeUndefined();
  });

  test("cancel and reopen remain inside Done and Waiting instead of inventing states", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t);
    const canceled = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.cancelQueueItem, {
      vaultOwnerId: OWNER_A, queueItemId: created.item._id, expectedVersion: 1,
      reason: "This comparison is no longer needed.", idempotencyKey: "cancel-1",
    });
    expect(canceled.item.state).toBe("done");
    expect(canceled.item.condition).toBe("canceled");
    expect(canceled.item.resultSummary).toContain("Canceled");

    const reopened = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.reopenQueueItem, {
      vaultOwnerId: OWNER_A, queueItemId: created.item._id, expectedVersion: canceled.item.version,
      reason: "New evidence made the comparison useful again.", idempotencyKey: "reopen-1",
    });
    expect(reopened.item.state).toBe("waiting_for_your_ai");
    expect(reopened.item.condition).toBe("disconnected");
  });

  test("an expired handoff is reconciled on read and can be resumed without a stale deadline", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);
    const t = convexTest(schema, modules);
    const created = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.createQueueItem, {
      vaultOwnerId: OWNER_A,
      directive: "Review the synthetic source after the handoff deadline.",
      chosenAiId: AI_A,
      handoffExpiresAt: baseTime + 60_000,
      idempotencyKey: "create-expiry",
    });
    vi.setSystemTime(baseTime + 60_001);
    const detail = await t.withIdentity({ subject: OWNER_A }).action(api.queue.getQueueItem, {
      vaultOwnerId: OWNER_A,
      queueItemId: created.item._id,
      activityPagination: { numItems: 20, cursor: null },
    });
    expect(detail?.item.state).toBe("needs_you");
    expect(detail?.item.condition).toBe("expired");
    expect(detail?.item.requiredAction).toMatch(/Reconnect or choose an AI/);
    expect(detail?.activity.page[0].eventType).toBe("expired");

    const resumed = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.resumeQueueItem, {
      vaultOwnerId: OWNER_A,
      queueItemId: created.item._id,
      expectedVersion: detail!.item.version,
      answerSummary: "The chosen AI connection is available again.",
      idempotencyKey: "resume-expired",
    });
    expect(resumed.item.state).toBe("waiting_for_your_ai");
    expect(resumed.item.condition).toBe("ready");
    expect(resumed.item.handoffExpiresAt).toBeUndefined();
  });

  test("scheduled expiry is automatic, idempotent, and recoverable by reassignment", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);
    const t = convexTest(schema, modules);
    const created = await createItem(t, {
      chosenAiId: AI_A,
      handoffExpiresAt: baseTime + 60_000,
      idempotencyKey: "scheduled-expiry-create",
    });

    vi.advanceTimersByTime(60_001);
    await t.finishInProgressScheduledFunctions();
    const expired = await t.run((ctx) => ctx.db.get(created.item._id));
    expect(expired?.state).toBe("needs_you");
    expect(expired?.condition).toBe("expired");
    expect(expired?.version).toBe(2);

    const assigned = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.assignQueueItemToAi, {
      vaultOwnerId: OWNER_A,
      queueItemId: created.item._id,
      chosenAiId: AI_A,
      expectedVersion: expired!.version,
      idempotencyKey: "recover-expired-assignment",
    });
    expect(assigned.item.state).toBe("waiting_for_your_ai");
    expect(assigned.item.condition).toBe("ready");
    expect(assigned.item.handoffExpiresAt).toBeUndefined();

    const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(),
      queueItemId: created.item._id,
      expectedVersion: assigned.item.version,
      leaseMs: 120_000,
      nextStep: "Continue after the explicit reassignment.",
      idempotencyKey: "claim-after-expiry-recovery",
    });
    expect(claimed.item.state).toBe("working");
  });

  test("AI leases cannot outlive handoff authority and continuation fails after expiry", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);
    const t = convexTest(schema, modules);
    const handoffExpiresAt = baseTime + 90_000;
    const created = await createItem(t, {
      chosenAiId: AI_A,
      handoffExpiresAt,
      idempotencyKey: "bounded-handoff-create",
    });
    const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
      principal: principal(),
      queueItemId: created.item._id,
      expectedVersion: created.item.version,
      leaseMs: 120_000,
      nextStep: "Work only inside the approved handoff window.",
      idempotencyKey: "bounded-handoff-claim",
    });
    expect(claimed.item.leaseExpiresAt).toBe(handoffExpiresAt);

    vi.setSystemTime(handoffExpiresAt + 1);
    await expect(
      t.mutation(internal.queue.agentCompleteQueueItem, {
        principal: principal(),
        queueItemId: created.item._id,
        expectedVersion: claimed.item.version,
        resultSummary: "This completion is too late for the approved handoff.",
        idempotencyKey: "late-handoff-complete",
      }),
    ).rejects.toThrow(/handoff expired/);

    const detail = await t.withIdentity({ subject: OWNER_A }).action(api.queue.getQueueItem, {
      vaultOwnerId: OWNER_A,
      queueItemId: created.item._id,
      activityPagination: { numItems: 20, cursor: null },
    });
    expect(detail?.item.state).toBe("needs_you");
    expect(detail?.item.condition).toBe("expired");
  });

  test("agent discovery is bounded, filtered, and scope-gated", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await createItem(t, { chosenAiId: AI_A, idempotencyKey: "agent-list-1" });
    await createItem(t, { chosenAiId: AI_A, idempotencyKey: "agent-list-2" });
    const page = await t.action(internal.queue.agentListQueueItems, {
      principal: principal(),
      state: "waiting_for_your_ai",
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].state).toBe("waiting_for_your_ai");
    expect(page.isDone).toBe(false);

    const detail = await t.action(internal.queue.agentGetQueueItem, {
      principal: principal(),
      queueItemId: page.page[0]._id,
      activityPagination: { numItems: 10, cursor: null },
    });
    expect(detail?.item.vaultOwnerId).toBe(OWNER_A);
    expect(detail?.activity.page[0].eventType).toBe("created");

    await expect(
      t.action(internal.queue.agentListQueueItems, {
        principal: principal(OWNER_A, AI_A, []),
        paginationOpts: { numItems: 1, cursor: null },
      }),
    ).rejects.toThrow(/queue:read/);
  });

  test("bounded list pagination keeps owners separate", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await createItem(t, { idempotencyKey: "a-1" });
    await createItem(t, { idempotencyKey: "a-2" });
    await createItem(t, { owner: OWNER_B, idempotencyKey: "b-1" });
    const page = await t.withIdentity({ subject: OWNER_A }).action(api.queue.listQueueItems, {
      vaultOwnerId: OWNER_A,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].vaultOwnerId).toBe(OWNER_A);
    expect(page.isDone).toBe(false);
  });

  test("user-confirmed deletion removes the item and its content-bearing history", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const created = await createItem(t);
    const deleted = await t.withIdentity({ subject: OWNER_A }).action(api.queue.deleteQueueItem, {
      vaultOwnerId: OWNER_A,
      queueItemId: created.item._id,
      confirmation: "delete_queue_item_and_history",
    });
    expect(deleted.deleted).toBe(true);
    const rows = await t.run(async (ctx) => ({
      item: await ctx.db.get(created.item._id),
      activity: await ctx.db.query("queueActivity").withIndex("by_item_created", (q) => q.eq("queueItemId", created.item._id)).collect(),
      receipts: await ctx.db.query("queueCommandReceipts").withIndex("by_item", (q) => q.eq("queueItemId", created.item._id)).collect(),
    }));
    expect(rows).toEqual({ item: null, activity: [], receipts: [] });
  });
});
