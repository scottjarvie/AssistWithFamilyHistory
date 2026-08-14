import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION,
  FAMILY_HISTORY_ACCEPTANCE_MARKER,
  FAMILY_HISTORY_ACCEPTANCE_PREFIX,
} from "./mcpAcceptanceFixture";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_3HqFpM96Ck1hTJZajDX893sWnPm";
const RUN_KEY = `${FAMILY_HISTORY_ACCEPTANCE_PREFIX}joined-workflow-test`;

function mcpPrincipal() {
  return {
    issuer: "https://clerk.assistwithfamilyhistory.com",
    subject: OWNER,
    clientId: "synthetic-acceptance-client",
    scopes: ["openid", "offline_access"],
  };
}

function queuePrincipal() {
  return {
    ownerId: OWNER,
    actorId: "oauth-chosen-ai",
    actorKind: "chosen_ai" as const,
    scopes: ["queue:read", "queue:claim", "queue:update", "queue:complete"],
    credentialId: "synthetic-acceptance-client",
  };
}

async function saveJoinedFixture(t: ReturnType<typeof convexTest>) {
  const queue = await t.withIdentity({ subject: OWNER }).mutation(api.queue.createQueueItem, {
    vaultOwnerId: OWNER,
    directive: `${FAMILY_HISTORY_ACCEPTANCE_MARKER} ${RUN_KEY} Check the marked census clue and preserve one sourced private result.`,
    requestedOutcome: "A sourced finding and private draft, linked back from Queue.",
    chosenAiId: "oauth-chosen-ai",
    idempotencyKey: `${RUN_KEY}:queue-create`,
  });
  const claimed = await t.mutation(internal.queue.agentClaimQueueItem, {
    principal: queuePrincipal(),
    queueItemId: queue.item._id,
    expectedVersion: queue.item.version,
    leaseMs: 120_000,
    nextStep: "Read owner-scoped context and save a marked sourced result.",
    idempotencyKey: `${RUN_KEY}:queue-claim`,
  });
  const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
    principal: mcpPrincipal(),
    operationId: `${RUN_KEY}:save-person`,
    requestHash: "fixture-person-hash",
    input: {
      mode: "create",
      createKey: `${RUN_KEY}:person`,
      name: { given: "Synthetic", surname: "Newcomer" },
      sex: "unknown",
      living: false,
      researchStatus: "in_progress",
      tags: [RUN_KEY, "synthetic-qa-delete-me"],
    },
  });
  const evidence = await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
    principal: mcpPrincipal(),
    operationId: `${RUN_KEY}:save-evidence`,
    requestHash: "fixture-evidence-hash",
    input: {
      source: {
        mode: "create",
        createKey: `${RUN_KEY}:source`,
        title: `${FAMILY_HISTORY_ACCEPTANCE_MARKER} Synthetic 1910 census extract`,
        type: "census",
        repository: "Synthetic acceptance repository",
      },
      citation: {
        mode: "create",
        createKey: `${RUN_KEY}:citation`,
        confidence: "high",
        page: "Synthetic sheet 4, line 12",
        extractedText: "Marked synthetic evidence only.",
      },
      links: [{ targetType: "person", targetId: person.person.id, field: "residence" }],
      facts: [{
        factKey: `${RUN_KEY}:fact`,
        personId: person.person.id,
        factType: "census_residence",
        label: "Synthetic 1910 residence",
        value: "Acceptance Township",
        confidence: "high",
        status: "candidate",
      }],
    },
  });
  const completedResult = await t.mutation(internal.mcpFamilyHistory.saveCompleteResult, {
    principal: mcpPrincipal(),
    operationId: `${RUN_KEY}:save-complete-result`,
    requestHash: "fixture-complete-hash",
    input: {
      personId: person.person.id,
      summary: "Saved one marked, sourced synthetic finding and private story draft.",
      events: [{
        mode: "create",
        createKey: `${RUN_KEY}:event`,
        type: "residence",
        date: { original: "1910" },
        place: { original: "Acceptance Township" },
        description: `${FAMILY_HISTORY_ACCEPTANCE_MARKER} Synthetic residence only.`,
        personRoles: [{ personId: person.person.id, role: "primary" }],
      }],
      research: {
        finding: {
          mode: "create",
          createKey: `${RUN_KEY}:finding`,
          entityType: "person",
          entityId: person.person.id,
          activityType: "tier3_deep_research",
          status: "done",
          summary: `${FAMILY_HISTORY_ACCEPTANCE_MARKER} Synthetic census supports the residence clue.`,
          outputRefs: [`/app/people/${person.person.id}`],
        },
      },
      stories: [{
        mode: "create",
        createKey: `${RUN_KEY}:story`,
        personId: person.person.id,
        type: "research_summary",
        title: `${FAMILY_HISTORY_ACCEPTANCE_MARKER} A synthetic 1910 clue`,
        content: "A private synthetic draft backed by the marked citation.",
        citationIds: [evidence.evidence.citationId],
        sourceFactIds: evidence.evidence.factIds,
        status: "review",
      }],
    },
  });
  const storyId = completedResult.saved.stories[0].id;
  await t.mutation(internal.queue.agentCompleteQueueItem, {
    principal: queuePrincipal(),
    queueItemId: queue.item._id,
    expectedVersion: claimed.item.version,
    resultSummary: "Saved a marked sourced finding and private story draft for review.",
    resultRefs: [`/app/people/${person.person.id}`, `/app/stories/${storyId}`],
    idempotencyKey: `${RUN_KEY}:queue-complete`,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("Family History joined MCP acceptance cleanup", () => {
  test("removes the exact marked Queue, MCP, evidence, research, and story graph", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://accomplished-dodo-308.convex.cloud");
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await saveJoinedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("persons", {
        vaultOwnerId: OWNER,
        name: { given: "Unrelated", surname: "Retained" },
        sex: "unknown",
        living: false,
        researchStatus: "not_started",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const before = await t.query(internal.mcpAcceptanceFixture.inspect, { runKey: RUN_KEY });
    expect(before).toMatchObject({
      exists: true,
      counts: {
        queueItems: 1,
        queueActivity: 3,
        queueReceipts: 3,
        persons: 1,
        events: 1,
        personEvents: 1,
        sources: 1,
        citations: 1,
        citationLinks: 1,
        sourceFacts: 1,
        researchLog: 1,
        stories: 1,
        mcpOperations: 3,
        mcpRecordKeys: 7,
        agentActivity: 3,
      },
    });
    await expect(t.mutation(internal.mcpAcceptanceFixture.clear, {
      runKey: RUN_KEY,
      confirmation: FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION,
    })).resolves.toMatchObject({ removed: true });
    await expect(t.query(internal.mcpAcceptanceFixture.inspect, { runKey: RUN_KEY }))
      .resolves.toMatchObject({ exists: false });
    await expect(t.run(async (ctx) => ({
      people: (await ctx.db.query("persons").collect()).map((row) => row.name.given),
      queue: (await ctx.db.query("queueItems").collect()).length,
      sources: (await ctx.db.query("sources").collect()).length,
      stories: (await ctx.db.query("stories").collect()).length,
      operations: (await ctx.db.query("mcpOperations").collect()).length,
    }))).resolves.toEqual({ people: ["Unrelated"], queue: 0, sources: 0, stories: 0, operations: 0 });
  });

  test("fails closed outside the exact deployment and without exact confirmation", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://somewhere-else.convex.cloud");
    const outside = convexTest(schema, modules);
    await expect(outside.query(internal.mcpAcceptanceFixture.inspect, { runKey: RUN_KEY }))
      .rejects.toThrow("not enabled on this Convex deployment");

    vi.stubEnv("CONVEX_CLOUD_URL", "https://accomplished-dodo-308.convex.cloud");
    const production = convexTest(schema, modules);
    await expect(production.mutation(internal.mcpAcceptanceFixture.clear, {
      runKey: RUN_KEY,
      confirmation: "delete everything",
    })).rejects.toThrow("Exact Family History joined-acceptance cleanup confirmation is required");
  });

  test("refuses cleanup when an unmarked record reuses the synthetic person", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://accomplished-dodo-308.convex.cloud");
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await saveJoinedFixture(t);
    await t.run(async (ctx) => {
      const mapping = await ctx.db
        .query("mcpRecordKeys")
        .withIndex("by_owner_type_key", (q) =>
          q.eq("vaultOwnerId", OWNER).eq("recordType", "person").eq("recordKey", `${RUN_KEY}:person`),
        )
        .unique();
      if (!mapping) throw new Error("Missing synthetic person mapping");
      const personId = ctx.db.normalizeId("persons", mapping.recordId);
      if (!personId) throw new Error("Invalid synthetic person mapping");
      const now = Date.now();
      await ctx.db.insert("researchTasks", {
        vaultOwnerId: OWNER,
        personId,
        type: "verification",
        title: "Unmarked work must prevent cleanup",
        status: "todo",
        priority: "low",
        aiSuggested: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.mutation(internal.mcpAcceptanceFixture.clear, {
      runKey: RUN_KEY,
      confirmation: FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION,
    })).rejects.toThrow("an unmarked record references the marked acceptance graph");
  });
});
