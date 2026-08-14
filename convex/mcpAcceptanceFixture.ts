/* eslint-disable @typescript-eslint/no-explicit-any -- The fixture guard normalizes mapped IDs across a fixed table allowlist. */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authorizeTenantAction, authorizeTenantMutation, type TenantAccessDecision } from "./access";

const acceptanceInternal = (internal as any).mcpAcceptanceFixture;

export const FAMILY_HISTORY_ACCEPTANCE_PREFIX = "codex-test:awf-joined:";
export const FAMILY_HISTORY_ACCEPTANCE_MARKER = "[SYNTHETIC QA - DELETE ME]";
export const FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION = "clear_marked_family_history_joined_acceptance";

const PRODUCTION_DEPLOYMENT = "accomplished-dodo-308";
const RETAINED_TEST_SUBJECT = "user_3HqFpM96Ck1hTJZajDX893sWnPm";
const MAX_ROWS_PER_TABLE = 100;

type FixtureCtx = MutationCtx | QueryCtx;

function assertAcceptanceOwner(
  decision: TenantAccessDecision,
): asserts decision is TenantAccessDecision & { allowed: true; owner: string } {
  if (!decision.allowed || decision.owner !== RETAINED_TEST_SUBJECT) {
    throw new Error("Family History joined-acceptance cleanup requires the exact authenticated synthetic test identity.");
  }
}

async function authorizeAcceptanceAction(ctx: ActionCtx, suppliedOwner: string) {
  const decision = await authorizeTenantAction(
    ctx,
    "mcpAcceptanceFixture.inspect",
    suppliedOwner,
    (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
  );
  assertAcceptanceOwner(decision);
  return decision.owner;
}

function assertAcceptanceDeployment() {
  const cloudUrl = process.env.CONVEX_CLOUD_URL?.trim() || process.env.CONVEX_URL?.trim() || "";
  let deployment = "";
  try {
    deployment = new URL(cloudUrl).hostname.split(".")[0] || "";
  } catch {
    deployment = "";
  }
  if (deployment !== PRODUCTION_DEPLOYMENT) {
    throw new Error("Family History joined-acceptance cleanup is not enabled on this Convex deployment.");
  }
  return RETAINED_TEST_SUBJECT;
}

function assertRunKey(value: string) {
  const runKey = value.trim().toLowerCase();
  if (!/^codex-test:awf-joined:[a-z0-9][a-z0-9-]{5,79}$/.test(runKey)) {
    throw new Error(`runKey must be a unique key beginning with ${FAMILY_HISTORY_ACCEPTANCE_PREFIX}`);
  }
  return runKey;
}

async function boundedOwnerRows<T extends "persons" | "relationships" | "events" | "personEvents" | "sources" | "citations" | "citationLinks" | "sourceFacts" | "researchTasks" | "researchLog" | "queueItems" | "stories" | "storyReviewEvents" | "agentActivity" | "mcpOperations" | "mcpRecordKeys" | "media" | "documents">(
  ctx: FixtureCtx,
  table: T,
  owner: string,
) {
  const rows = await ctx.db.query(table).withIndex("by_owner", (q: any) => q.eq("vaultOwnerId", owner)).take(MAX_ROWS_PER_TABLE + 1);
  if (rows.length > MAX_ROWS_PER_TABLE) {
    throw new Error(`Refusing acceptance cleanup because ${table} exceeded its bounded scan ceiling.`);
  }
  return rows as Array<Doc<T>>;
}

async function mappedRows(ctx: FixtureCtx, runKey: string, owner: string) {
  const mappings = (await boundedOwnerRows(ctx, "mcpRecordKeys", owner))
    .filter((row) => row.recordKey.startsWith(`${runKey}:`));
  const getRows = async <T extends "persons" | "relationships" | "events" | "sources" | "citations" | "sourceFacts" | "researchTasks" | "researchLog" | "stories">(
    table: T,
    recordType: Doc<"mcpRecordKeys">["recordType"],
  ) => {
    const result: Array<Doc<T>> = [];
    for (const mapping of mappings.filter((row) => row.recordType === recordType)) {
      const id = ctx.db.normalizeId(table, mapping.recordId);
      const row = id ? await ctx.db.get(id as Id<T>) : null;
      if (!row || row.vaultOwnerId !== owner) {
        throw new Error(`Refusing cleanup because a mapped ${recordType} is missing or outside the exact test vault.`);
      }
      result.push(row as Doc<T>);
    }
    return result;
  };

  return {
    mappings,
    persons: await getRows("persons", "person"),
    relationships: await getRows("relationships", "relationship"),
    events: await getRows("events", "event"),
    sources: await getRows("sources", "source"),
    citations: await getRows("citations", "citation"),
    sourceFacts: await getRows("sourceFacts", "source_fact"),
    researchTasks: await getRows("researchTasks", "research_task"),
    researchLog: await getRows("researchLog", "research_log"),
    stories: await getRows("stories", "story"),
  };
}

function idSet(rows: Array<{ _id: string }>) {
  return new Set(rows.map((row) => String(row._id)));
}

async function fixtureGraph(ctx: FixtureCtx, runKeyInput: string) {
  const owner = assertAcceptanceDeployment();
  const runKey = assertRunKey(runKeyInput);
  const graph = await mappedRows(ctx, runKey, owner);
  const [queueRows, operations, activity, personEvents, citationLinks, reviewEvents, allRelationships, allSourceFacts, allResearchTasks, allResearchLog, allStories, allMedia, allDocuments] = await Promise.all([
    boundedOwnerRows(ctx, "queueItems", owner),
    boundedOwnerRows(ctx, "mcpOperations", owner),
    boundedOwnerRows(ctx, "agentActivity", owner),
    boundedOwnerRows(ctx, "personEvents", owner),
    boundedOwnerRows(ctx, "citationLinks", owner),
    boundedOwnerRows(ctx, "storyReviewEvents", owner),
    boundedOwnerRows(ctx, "relationships", owner),
    boundedOwnerRows(ctx, "sourceFacts", owner),
    boundedOwnerRows(ctx, "researchTasks", owner),
    boundedOwnerRows(ctx, "researchLog", owner),
    boundedOwnerRows(ctx, "stories", owner),
    boundedOwnerRows(ctx, "media", owner),
    boundedOwnerRows(ctx, "documents", owner),
  ]);
  if (graph.mappings.length > 20) {
    throw new Error("Refusing cleanup because the marked MCP record graph exceeded its safety ceiling.");
  }
  const carriesRunKey = (value?: string) => value?.includes(runKey) ?? false;
  const graphIsMarked =
    graph.persons.every((row) => row.tags?.includes(runKey)) &&
    graph.relationships.every((row) => carriesRunKey(row.importKey)) &&
    graph.events.every((row) => carriesRunKey(row.importKey)) &&
    graph.sources.every((row) => carriesRunKey(row.importKey) && row.title.startsWith(FAMILY_HISTORY_ACCEPTANCE_MARKER)) &&
    graph.citations.every((row) => carriesRunKey(row.importKey)) &&
    graph.sourceFacts.every((row) => carriesRunKey(row.importKey)) &&
    graph.researchTasks.every((row) => row.title.startsWith(FAMILY_HISTORY_ACCEPTANCE_MARKER)) &&
    graph.researchLog.every((row) => row.summary.startsWith(FAMILY_HISTORY_ACCEPTANCE_MARKER)) &&
    graph.stories.every((row) => row.title.startsWith(FAMILY_HISTORY_ACCEPTANCE_MARKER));
  if (!graphIsMarked) {
    throw new Error("Refusing cleanup because a mapped record lacks its visible synthetic acceptance marker.");
  }
  const queueItems = queueRows.filter((row) => row.directive.includes(`${FAMILY_HISTORY_ACCEPTANCE_MARKER} ${runKey}`));
  if (queueItems.length > 1) {
    throw new Error("Refusing cleanup because the run key matched more than one Queue item.");
  }
  if (queueItems.some((row) => row.authority.actorId !== "oauth-chosen-ai" || row.createdByActorId !== owner)) {
    throw new Error("Refusing cleanup because a marked Queue item has an unexpected actor boundary.");
  }
  const queueIds = idSet(queueItems);
  const queueActivity = (await Promise.all(queueItems.map((item) =>
    ctx.db.query("queueActivity").withIndex("by_item_created", (q) => q.eq("queueItemId", item._id)).collect(),
  ))).flat();
  const queueReceipts = (await Promise.all(queueItems.map((item) =>
    ctx.db.query("queueCommandReceipts").withIndex("by_item", (q) => q.eq("queueItemId", item._id)).collect(),
  ))).flat();
  if (queueActivity.length > 20 || queueReceipts.length > 20) {
    throw new Error("Refusing cleanup because the marked Queue graph exceeded its safety ceiling.");
  }

  const personIds = idSet(graph.persons);
  const relationshipIds = idSet(graph.relationships);
  const eventIds = idSet(graph.events);
  const sourceIds = idSet(graph.sources);
  const citationIds = idSet(graph.citations);
  const sourceFactIds = idSet(graph.sourceFacts);
  const researchTaskIds = idSet(graph.researchTasks);
  const researchLogIds = idSet(graph.researchLog);
  const storyIds = idSet(graph.stories);
  const fixtureIds = new Set([...personIds, ...relationshipIds, ...eventIds, ...sourceIds, ...citationIds, ...sourceFactIds, ...researchTaskIds, ...researchLogIds, ...storyIds]);

  const relatedPersonEvents = personEvents.filter((row) => personIds.has(String(row.personId)) || eventIds.has(String(row.eventId)));
  const relatedCitationLinks = citationLinks.filter((row) => citationIds.has(String(row.citationId)) || fixtureIds.has(row.targetId));
  const relatedReviewEvents = reviewEvents.filter((row) => storyIds.has(String(row.storyId)) || (row.personId ? personIds.has(String(row.personId)) : false));
  const externalReference =
    allRelationships.some((row) => (personIds.has(String(row.person1)) || personIds.has(String(row.person2))) && !relationshipIds.has(String(row._id))) ||
    allSourceFacts.some((row) => (personIds.has(String(row.personId)) || sourceIds.has(String(row.sourceId)) || citationIds.has(String(row.citationId))) && !sourceFactIds.has(String(row._id))) ||
    allResearchTasks.some((row) => row.personId && personIds.has(String(row.personId)) && !researchTaskIds.has(String(row._id))) ||
    allResearchLog.some((row) => row.entityId && fixtureIds.has(String(row.entityId)) && !researchLogIds.has(String(row._id))) ||
    allStories.some((row) => (
      (row.personId && personIds.has(String(row.personId))) ||
      (row.relationshipId && relationshipIds.has(String(row.relationshipId))) ||
      row.citationIds.some((id) => citationIds.has(String(id))) ||
      (row.sourceFactIds ?? []).some((id) => sourceFactIds.has(String(id)))
    ) && !storyIds.has(String(row._id))) ||
    allMedia.some((row) => row.personIds.some((id) => personIds.has(String(id))) || (row.sourceId ? sourceIds.has(String(row.sourceId)) : false)) ||
    allDocuments.some((row) => personIds.has(String(row.personId))) ||
    queueRows.some((row) => !queueIds.has(String(row._id)) && row.context.some((ref) => fixtureIds.has(String(ref.refId))));
  if (externalReference) {
    throw new Error("Refusing cleanup because an unmarked record references the marked acceptance graph.");
  }
  if (relatedPersonEvents.some((row) => !personIds.has(String(row.personId)) || !eventIds.has(String(row.eventId)))) {
    throw new Error("Refusing cleanup because a marked event link crosses outside the acceptance graph.");
  }
  if (relatedCitationLinks.some((row) => !citationIds.has(String(row.citationId)) || !fixtureIds.has(row.targetId))) {
    throw new Error("Refusing cleanup because a marked evidence link crosses outside the acceptance graph.");
  }
  if (relatedReviewEvents.some((row) => !storyIds.has(String(row.storyId)) || (row.personId ? !personIds.has(String(row.personId)) : false))) {
    throw new Error("Refusing cleanup because a marked story-review event crosses outside the acceptance graph.");
  }

  const fixtureOperations = operations.filter((row) => row.operationId.startsWith(`${runKey}:`));
  const fixtureActivity = activity.filter((row) => row.requestId.startsWith(`${runKey}:`));
  if (fixtureOperations.length > 20 || fixtureActivity.length > 20) {
    throw new Error("Refusing cleanup because the marked MCP receipt graph exceeded its safety ceiling.");
  }
  const exists = queueItems.length + graph.mappings.length + fixtureOperations.length + fixtureActivity.length > 0;
  return {
    exists,
    owner,
    runKey,
    ...graph,
    queueItems,
    queueActivity,
    queueReceipts,
    operations: fixtureOperations,
    activity: fixtureActivity,
    personEvents: relatedPersonEvents,
    citationLinks: relatedCitationLinks,
    storyReviewEvents: relatedReviewEvents,
  };
}

function counts(graph: Awaited<ReturnType<typeof fixtureGraph>>) {
  return {
    queueItems: graph.queueItems.length,
    queueActivity: graph.queueActivity.length,
    queueReceipts: graph.queueReceipts.length,
    persons: graph.persons.length,
    relationships: graph.relationships.length,
    events: graph.events.length,
    personEvents: graph.personEvents.length,
    sources: graph.sources.length,
    citations: graph.citations.length,
    citationLinks: graph.citationLinks.length,
    sourceFacts: graph.sourceFacts.length,
    researchTasks: graph.researchTasks.length,
    researchLog: graph.researchLog.length,
    stories: graph.stories.length,
    storyReviewEvents: graph.storyReviewEvents.length,
    mcpOperations: graph.operations.length,
    mcpRecordKeys: graph.mappings.length,
    agentActivity: graph.activity.length,
  };
}

export const inspectInternal = internalQuery({
  args: { runKey: v.string() },
  handler: async (ctx, args) => {
    const graph = await fixtureGraph(ctx, args.runKey);
    return { exists: graph.exists, runKey: graph.runKey, counts: counts(graph) };
  },
});

export const inspect = action({
  args: { vaultOwnerId: v.string(), runKey: v.string() },
  handler: async (ctx, args) => {
    await authorizeAcceptanceAction(ctx, args.vaultOwnerId);
    return await ctx.runQuery(acceptanceInternal.inspectInternal, { runKey: args.runKey });
  },
});

export const clear = mutation({
  args: { vaultOwnerId: v.string(), runKey: v.string(), confirmation: v.string() },
  handler: async (ctx, args) => {
    const decision = await authorizeTenantMutation(ctx, "mcpAcceptanceFixture.clear", args.vaultOwnerId);
    assertAcceptanceOwner(decision);
    if (args.confirmation !== FAMILY_HISTORY_ACCEPTANCE_CONFIRMATION) {
      throw new Error("Exact Family History joined-acceptance cleanup confirmation is required.");
    }
    const graph = await fixtureGraph(ctx, args.runKey);
    if (!graph.exists) return { removed: false as const, runKey: graph.runKey, counts: counts(graph) };
    const removed = counts(graph);
    for (const row of graph.queueActivity) await ctx.db.delete(row._id);
    for (const row of graph.queueReceipts) await ctx.db.delete(row._id);
    for (const row of graph.queueItems) await ctx.db.delete(row._id);
    for (const row of graph.storyReviewEvents) await ctx.db.delete(row._id);
    for (const row of graph.stories) await ctx.db.delete(row._id);
    for (const row of graph.researchLog) await ctx.db.delete(row._id);
    for (const row of graph.researchTasks) await ctx.db.delete(row._id);
    for (const row of graph.sourceFacts) await ctx.db.delete(row._id);
    for (const row of graph.citationLinks) await ctx.db.delete(row._id);
    for (const row of graph.citations) await ctx.db.delete(row._id);
    for (const row of graph.sources) await ctx.db.delete(row._id);
    for (const row of graph.personEvents) await ctx.db.delete(row._id);
    for (const row of graph.events) await ctx.db.delete(row._id);
    for (const row of graph.relationships) await ctx.db.delete(row._id);
    for (const row of graph.persons) await ctx.db.delete(row._id);
    for (const row of graph.operations) await ctx.db.delete(row._id);
    for (const row of graph.activity) await ctx.db.delete(row._id);
    for (const row of graph.mappings) await ctx.db.delete(row._id);
    return { removed: true as const, runKey: graph.runKey, counts: removed };
  },
});
