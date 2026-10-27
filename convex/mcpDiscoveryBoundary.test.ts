import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_synthetic_boundary_owner";
const OTHER = "user_synthetic_boundary_other";
const principal = (subject = OWNER) => ({ issuer: "https://identity.example.test", subject, clientId: "synthetic-mcp-client", scopes: [] });
type Test = ReturnType<typeof convexTest>;

afterEach(() => vi.unstubAllEnvs());

async function person(t: Test, name: string, owner = OWNER) {
  return t.run((ctx) => ctx.db.insert("persons", { vaultOwnerId: owner, name: { given: name, surname: "Synthetic" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 }));
}

async function records(t: Test, personId: Id<"persons">, name: string) {
  return t.run(async (ctx) => {
    const story = await ctx.db.insert("stories", { vaultOwnerId: OWNER, personId, type: "biography", title: `${name} story`, content: "Synthetic", citationIds: [], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 });
    const task = await ctx.db.insert("researchTasks", { vaultOwnerId: OWNER, personId, type: "record_search", title: `${name} task`, status: "todo", priority: "medium", aiSuggested: false, createdAt: 1, updatedAt: 1 });
    const finding = await ctx.db.insert("researchLog", { vaultOwnerId: OWNER, entityType: "person", entityId: personId, activityType: "other", summary: `${name} finding`, status: "done", createdAt: 1, updatedAt: 1 });
    return { story, task, finding };
  });
}

async function queueItem(t: Test, label: string, owner = OWNER) {
  const result = await t.withIdentity({ subject: owner }).mutation(api.queue.createQueueItem, { vaultOwnerId: owner, directive: label, chosenAiId: "oauth-chosen-ai", idempotencyKey: label });
  return result.item._id;
}

function brief(t: Test, grantId?: string, subject = OWNER) {
  return t.query(internal.mcpFamilyHistory.getBrief, { principal: principal(subject), grantId });
}

function search(t: Test, grantId?: string, subject = OWNER) {
  return t.query(internal.mcpFamilyHistory.search, { principal: principal(subject), grantId, query: "Allowed", kinds: ["story", "research_task", "research_finding"] });
}

describe("grant-bound discovery rechecks", () => {
  test.each(["pending", "revoked", "denied", "expired"] as const)("both queries refuse a %s grant", async (status) => {
    const t = convexTest(schema, modules);
    const id = await seedGrant(t, { vaultOwnerId: OWNER, status });
    await expect(brief(t, id)).rejects.toThrow(/GRANT_/);
    await expect(search(t, id)).rejects.toThrow(/GRANT_/);
  });

  test("missing, wrong-owner and ended chosen terms are refused", async () => {
    const t = convexTest(schema, modules);
    await expect(brief(t)).rejects.toThrow(/GRANT_REQUIRED/);
    await expect(search(t)).rejects.toThrow(/GRANT_REQUIRED/);
    const foreign = await seedGrant(t, { vaultOwnerId: OTHER });
    await expect(brief(t, foreign)).rejects.toThrow(/GRANT_REQUIRED/);
    await expect(search(t, foreign)).rejects.toThrow(/GRANT_REQUIRED/);
    const ended = await seedGrant(t, { vaultOwnerId: OWNER, expiresAt: Date.now() - 1000 });
    await t.run((ctx) => ctx.db.patch(ended as Id<"mcpGrants">, { expiryChoice: "chosen" }));
    await expect(brief(t, ended)).rejects.toThrow(/GRANT_EXPIRED/);
    await expect(search(t, ended)).rejects.toThrow(/GRANT_EXPIRED/);
  });

  test("scope and record narrowing are effective on the next data query", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const id = await seedGrant(t, { vaultOwnerId: OWNER });
    expect((await brief(t, id)).recentPeople).toHaveLength(2);
    await t.run((ctx) => ctx.db.patch(id as Id<"mcpGrants">, { scopeChoice: "chosen", scopes: ["family_history:context:read"], boundary: { kind: "selected_people", personIds: [String(inside)] } }));
    const narrowed = await brief(t, id);
    expect(narrowed.recentPeople.map((row) => row.id)).toEqual([inside]);
    expect(JSON.stringify(narrowed)).not.toContain(String(outside));
    expect(narrowed.queue).toEqual([]);
    await t.run((ctx) => ctx.db.patch(id as Id<"mcpGrants">, { scopes: ["family_history:research:write"] }));
    await expect(brief(t, id)).rejects.toThrow(/SCOPE_NOT_GRANTED/);
    await expect(search(t, id)).rejects.toThrow(/SCOPE_NOT_GRANTED/);
  });

  test("full markers use effective Queue scopes; chosen scopes stay narrow", async () => {
    const t = convexTest(schema, modules);
    const item = await queueItem(t, "Allowed queue");
    const id = await seedGrant(t, { vaultOwnerId: OWNER });
    await t.run((ctx) => ctx.db.patch(id as Id<"mcpGrants">, { scopeChoice: "full", scopes: [] }));
    expect((await brief(t, id)).queue.map((row) => row.id)).toContain(item);
    await t.run((ctx) => ctx.db.patch(id as Id<"mcpGrants">, { scopeChoice: "chosen", scopes: ["family_history:context:read"] }));
    expect((await brief(t, id)).queue).toEqual([]);
  });

  test("older authorized records survive newer unselected owner rows", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    await records(t, inside, "Allowed");
    await t.run(async (ctx) => {
      for (let index = 0; index <= FAMILY_HISTORY_MCP_LIMITS.searchScanPerType; index++) {
        await ctx.db.insert("stories", { vaultOwnerId: OWNER, personId: outside, type: "biography", title: "Outside", content: "Synthetic", citationIds: [], status: "draft", generatedBy: "human", createdAt: 2, updatedAt: 2 });
        await ctx.db.insert("researchTasks", { vaultOwnerId: OWNER, personId: outside, type: "record_search", title: "Outside", status: "todo", priority: "medium", aiSuggested: false, createdAt: 2, updatedAt: 2 });
        await ctx.db.insert("researchLog", { vaultOwnerId: OWNER, entityType: "person", entityId: outside, activityType: "other", summary: "Outside", status: "done", createdAt: 2, updatedAt: 2 });
      }
    });
    const id = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    const result = await brief(t, id);
    expect(result.recentStories.map((row) => row.title)).toEqual(["Allowed story"]);
    expect(result.openResearchTasks.map((row) => row.title)).toEqual(["Allowed task"]);
    expect(result.recentFindings.map((row) => row.summary)).toEqual(["Allowed finding"]);
    expect(result.truncated).toBe(false);
    const found = await search(t, id);
    expect(found.results).toHaveLength(3);
    expect(JSON.stringify(found)).not.toContain("Outside");
  });

  test("explicit Queue IDs are read directly and foreign IDs remain hidden", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const item = await queueItem(t, "Allowed old item");
    const foreign = await queueItem(t, "Foreign item", OTHER);
    for (let index = 0; index < 6; index++) await queueItem(t, `Outside newer item ${index}`);
    const id = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)], queueItemIds: [String(item), String(foreign)] } });
    const result = await brief(t, id);
    expect(result.queue.map((row) => row.id)).toEqual([item]);
    expect(JSON.stringify(result)).not.toContain("Outside newer");
    expect(JSON.stringify(result)).not.toContain("Foreign");
  });

  test("Queue overflow is honestly marked truncated", async () => {
    const t = convexTest(schema, modules);
    const ids = [];
    for (let index = 0; index <= FAMILY_HISTORY_MCP_LIMITS.briefRows; index++) ids.push(String(await queueItem(t, `Allowed queue ${index}`)));
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "whole_workspace", queueItemIds: ids } });
    const result = await brief(t, grantId);
    expect(result.queue).toHaveLength(FAMILY_HISTORY_MCP_LIMITS.briefRows);
    expect(result.truncated).toBe(true);
  });
});

describe("updates after a grant narrows", () => {
  test("existing research attribution cannot be omitted or replaced to cross the boundary", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const own = await records(t, inside, "Allowed");
    const other = await records(t, outside, "Outside");
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    let sequence = 0;
    const save = (input: unknown) => t.mutation(internal.mcpFamilyHistory.saveResearchWork, { principal: principal(), grantId, operationId: `research-boundary-${++sequence}`, requestHash: `research-hash-${sequence}`, input });
    for (const personId of [undefined, inside]) {
      await expect(save({ task: { mode: "update", taskId: other.task, expectedUpdatedAt: 1, title: "Bad update", personId } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
      await expect(save({ finding: { mode: "update", findingId: other.finding, expectedUpdatedAt: 1, summary: "Bad update", ...(personId ? { entityType: "person", entityId: personId } : {}) } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    }
    await expect(save({ task: { mode: "update", taskId: own.task, expectedUpdatedAt: 1, title: "Allowed updated" } })).resolves.toBeDefined();
    await expect(save({ finding: { mode: "update", findingId: own.finding, expectedUpdatedAt: 1, summary: "Allowed updated" } })).resolves.toBeDefined();
    expect(await t.run((ctx) => ctx.db.get(other.task))).toMatchObject({ title: "Outside task", personId: outside });
    expect(await t.run((ctx) => ctx.db.get(other.finding))).toMatchObject({ summary: "Outside finding", entityId: outside });
  });

  test("unattributable source/citation updates are refused; whole workspace still works", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const sourceId = await t.run((ctx) => ctx.db.insert("sources", { vaultOwnerId: OWNER, title: "Outside source", type: "other", createdAt: 1, updatedAt: 1 }));
    const citationId = await t.run((ctx) => ctx.db.insert("citations", { vaultOwnerId: OWNER, sourceId, isEvidence: true, confidence: "high", createdAt: 1, updatedAt: 1 }));
    const selected = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    const input = { source: { mode: "update", sourceId, expectedUpdatedAt: 1, title: "Bad source update" }, citation: { mode: "update", citationId, expectedUpdatedAt: 1, notes: "Bad citation update" }, personas: [{ personaKey: "inside-replacement", nameAsWritten: "Allowed", personId: inside }] };
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, { principal: principal(), grantId: selected, operationId: "source-selected", requestHash: "source-selected", input })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    expect(await t.run((ctx) => ctx.db.get(sourceId))).toMatchObject({ title: "Outside source", updatedAt: 1 });
    expect(await t.run((ctx) => ctx.db.get(citationId))).toMatchObject({ updatedAt: 1 });
    const whole = await seedGrant(t, { vaultOwnerId: OWNER, clientId: "whole-workspace-positive" });
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, { principal: { ...principal(), clientId: "whole-workspace-positive" }, grantId: whole, operationId: "source-whole", requestHash: "source-whole", input })).resolves.toBeDefined();
  });
});

describe("stored targets behind create keys and receipts", () => {
  async function mapping(t: Test, recordType: "research_task" | "research_log", recordKey: string, recordId: string) {
    await t.run((ctx) => ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType, recordKey, recordId, createdAt: 1, updatedAt: 1 }));
  }

  test("known research keys use stored attribution, with inside reuse and wrong-owner negatives", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const own = await records(t, inside, "Allowed");
    const other = await records(t, outside, "Outside");
    await mapping(t, "research_task", "task-outside", other.task);
    await mapping(t, "research_log", "finding-outside", other.finding);
    await mapping(t, "research_task", "task-inside", own.task);
    await mapping(t, "research_log", "finding-inside", own.finding);
    const foreign = await t.run((ctx) => ctx.db.insert("researchTasks", { vaultOwnerId: OTHER, personId: inside, type: "record_search", title: "Foreign", status: "todo", priority: "medium", aiSuggested: false, createdAt: 1, updatedAt: 1 }));
    const unattributed = await t.run((ctx) => ctx.db.insert("researchTasks", { vaultOwnerId: OWNER, type: "record_search", title: "Unattributed", status: "todo", priority: "medium", aiSuggested: false, createdAt: 1, updatedAt: 1 }));
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    let sequence = 0;
    const save = (input: unknown) => t.mutation(internal.mcpFamilyHistory.saveResearchWork, { principal: principal(), grantId, input, operationId: `known-key-${++sequence}`, requestHash: `known-key-${sequence}` });
    await expect(save({ task: { mode: "create", createKey: "task-outside", personId: inside } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await expect(save({ finding: { mode: "create", createKey: "finding-outside", entityType: "person", entityId: inside } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    for (const taskId of [foreign, unattributed, "unrecognized-id"]) await expect(save({ task: { mode: "update", taskId, expectedUpdatedAt: 1, title: "Bad" } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await expect(save({ task: { mode: "create", createKey: "task-inside", personId: inside }, finding: { mode: "create", createKey: "finding-inside", entityType: "person", entityId: inside } })).resolves.toBeDefined();
  });

  test("old omitted-person research receipts are rechecked after narrowing; inside exact replay remains valid", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const own = await records(t, inside, "Allowed");
    const other = await records(t, outside, "Outside");
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const args = { principal: principal(), grantId, operationId: "outside-old-receipt", requestHash: "outside-old-receipt", input: { task: { mode: "update", taskId: other.task, expectedUpdatedAt: 1, title: "Original outside update" } } };
    await t.mutation(internal.mcpFamilyHistory.saveResearchWork, args);
    await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { boundary: { kind: "selected_people", personIds: [String(inside)] } }));
    await expect(t.mutation(internal.mcpFamilyHistory.saveResearchWork, args)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    const ownArgs = { ...args, operationId: "inside-receipt", requestHash: "inside-receipt", input: { task: { mode: "update", taskId: own.task, expectedUpdatedAt: 1, title: "Allowed updated" } } };
    await t.mutation(internal.mcpFamilyHistory.saveResearchWork, ownArgs);
    expect(await t.mutation(internal.mcpFamilyHistory.saveResearchWork, ownArgs)).toMatchObject({ deduplicated: true });
  });

  test("source, citation and fact keys cannot move outside evidence into a selected person", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const input = (key: string, personId: Id<"persons">, factKey = `${key}-fact`) => ({ source: { mode: "create", createKey: `${key}-source`, title: "Synthetic source", type: "other" }, citation: { mode: "create", createKey: `${key}-citation`, confidence: "high" }, personas: [{ personaKey: `${key}-persona`, nameAsWritten: "Synthetic", personId }, { personaKey: `${key}-unresolved`, nameAsWritten: "Unresolved" }], facts: [{ factKey, personId, factType: "name", label: "Synthetic name", value: "Synthetic", confidence: "high" }] });
    let sequence = 0;
    const save = (value: unknown, op = `evidence-key-${++sequence}`) => t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, { principal: principal(), grantId, operationId: op, requestHash: op, input: value });
    const outsideInput = input("outside", outside);
    const original = await save(outsideInput, "outside-evidence-original");
    const before = await t.run((ctx) => ctx.db.get(original.evidence.factIds[0] as Id<"sourceFacts">));
    await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { boundary: { kind: "selected_people", personIds: [String(inside)] } }));
    await expect(save(input("outside", inside))).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await expect(save({ ...input("fresh", inside), citation: outsideInput.citation })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    await expect(save(input("fresh", inside, "outside-fact"))).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    expect(await t.run((ctx) => ctx.db.get(original.evidence.factIds[0] as Id<"sourceFacts">))).toEqual(before);
    const allowedInput = input("inside", inside);
    await save(allowedInput, "inside-evidence-receipt");
    expect(await save(allowedInput, "inside-evidence-receipt")).toMatchObject({ deduplicated: true });
    await expect(save(allowedInput)).resolves.toBeDefined();
  });

  test("known event keys cannot append an inside role to an outside event", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    let sequence = 0;
    const save = (key: string, personId: Id<"persons">) => t.mutation(internal.mcpFamilyHistory.saveEvent, { principal: principal(), grantId, operationId: `event-${++sequence}`, requestHash: `event-${sequence}`, input: { mode: "create", createKey: key, type: "census", personRoles: [{ personId, role: "primary" }] } });
    const outsideEvent = await save("outside-event", outside);
    await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { boundary: { kind: "selected_people", personIds: [String(inside)] } }));
    await expect(save("outside-event", inside)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    const roles = await t.run((ctx) => ctx.db.query("personEvents").withIndex("by_event", (q) => q.eq("eventId", outsideEvent.event.id)).collect());
    expect(roles.map((row) => row.personId)).toEqual([outside]);
    await save("inside-event", inside);
    await expect(save("inside-event", inside)).resolves.toBeDefined();
  });

  test("complete-result research and batched evidence cannot bypass stored or unattributable targets", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const rows = await records(t, outside, "Outside");
    const sourceId = await t.run((ctx) => ctx.db.insert("sources", { vaultOwnerId: OWNER, title: "Outside source", type: "other", createdAt: 1, updatedAt: 1 }));
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    await expect(t.mutation(internal.mcpFamilyHistory.saveCompleteResult, { principal: principal(), grantId, operationId: "complete-research", requestHash: "complete-research", input: { summary: "Synthetic", research: { finding: { mode: "update", findingId: rows.finding, expectedUpdatedAt: 1, summary: "Bad" } } } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    for (const tool of [internal.mcpFamilyHistory.saveRecords, internal.mcpFamilyHistory.saveCompleteResult]) {
      await expect(t.mutation(tool, { principal: principal(), grantId, operationId: "nested-source", requestHash: "nested-source", input: { summary: "Synthetic", evidence: [{ source: { mode: "update", sourceId, expectedUpdatedAt: 1, title: "Bad" }, citation: { mode: "create", createKey: "new-citation", confidence: "high" }, personas: [{ personaKey: "inside", nameAsWritten: "Allowed", personId: inside }] }] } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    }
  });

  test("selected discovery marks an exhausted in-bound scan incomplete even without matches", async () => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    await t.run(async (ctx) => {
      for (let i = 0; i <= FAMILY_HISTORY_MCP_LIMITS.searchScanPerType; i++) await ctx.db.insert("stories", { vaultOwnerId: OWNER, personId: inside, type: "biography", title: "No matching term", content: "Synthetic", citationIds: [], status: "draft", generatedBy: "human", createdAt: 1, updatedAt: 1 });
    });
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    const result = await search(t, grantId);
    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(true);
  });
});


test("batch person aliases cannot resolve an unselected owner-wide person key", async () => {
  const t = convexTest(schema, modules);
  const inside = await person(t, "Allowed");
  const outside = await person(t, "Outside");
  await t.run((ctx) => ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "person", recordKey: "outside-person", recordId: outside, createdAt: 1, updatedAt: 1 }));
  const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
  const input = { events: [{ mode: "create", createKey: "bad-batch-event", type: "census", personRoles: [{ personCreateKey: "outside-person", role: "primary" }] }] };
  await expect(t.mutation(internal.mcpFamilyHistory.saveRecords, { principal: principal(), grantId, operationId: "bad-batch-person-key", requestHash: "bad-batch-person-key", input })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual([]);
});

describe("individual evidence mapping boundaries", () => {
  test.each(["source", "citation", "fact"])("a known outside %s key is independently refused", async (kind) => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const outside = await person(t, "Outside");
    const sourceId = await t.run((ctx) => ctx.db.insert("sources", { vaultOwnerId: OWNER, title: "Outside source", type: "other", createdAt: 1, updatedAt: 1 }));
    const citationId = await t.run((ctx) => ctx.db.insert("citations", { vaultOwnerId: OWNER, sourceId, isEvidence: true, confidence: "high", createdAt: 1, updatedAt: 1 }));
    await t.run(async (ctx) => {
      await ctx.db.insert("recordPersonas", { vaultOwnerId: OWNER, sourceId, personaKey: "outside", nameAsWritten: "Outside", fields: [], personId: outside, createdAt: 1, updatedAt: 1 });
      const factId = await ctx.db.insert("sourceFacts", { vaultOwnerId: OWNER, personId: outside, sourceId, citationId, importKey: "outside-fact", factType: "name", label: "Outside", value: "Outside", confidence: "high", status: "candidate", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "source", recordKey: "outside-source", recordId: sourceId, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "citation", recordKey: "outside-citation", recordId: citationId, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "source_fact", recordKey: "outside-fact", recordId: factId, createdAt: 1, updatedAt: 1 });
    });
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
    const input = { source: { mode: "create", createKey: kind === "source" ? "outside-source" : "fresh-source", title: "Synthetic", type: "other" }, citation: { mode: "create", createKey: kind === "citation" ? "outside-citation" : "fresh-citation", confidence: "high" }, personas: [{ personaKey: "inside", nameAsWritten: "Allowed", personId: inside }], ...(kind === "fact" ? { facts: [{ factKey: "outside-fact", personId: inside, factType: "name", label: "Bad", value: "Bad", confidence: "high" }] } : {}) };
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, { principal: principal(), grantId, operationId: `outside-${kind}-key`, requestHash: `outside-${kind}-key`, input })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    expect(await t.run((ctx) => ctx.db.query("sources").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("sourceFacts").collect())).toMatchObject([{ personId: outside, value: "Outside" }]);
  });

  test.each(["overflow", "unattributed", "nonperson-link", "foreign-person"])("existing source attribution fails closed for %s", async (kind) => {
    const t = convexTest(schema, modules);
    const inside = await person(t, "Allowed");
    const foreign = await person(t, "Foreign", OTHER);
    const sourceId = await t.run((ctx) => ctx.db.insert("sources", { vaultOwnerId: OWNER, title: "Synthetic source", type: "other", createdAt: 1, updatedAt: 1 }));
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpRecordKeys", { vaultOwnerId: OWNER, recordType: "source", recordKey: "source-key", recordId: sourceId, createdAt: 1, updatedAt: 1 });
      const count = kind === "overflow" ? FAMILY_HISTORY_MCP_LIMITS.searchScanPerType + 1 : kind === "unattributed" ? 0 : 1;
      for (let i = 0; i < count; i++) await ctx.db.insert("recordPersonas", { vaultOwnerId: OWNER, sourceId, personaKey: `persona-${i}`, nameAsWritten: "Synthetic", fields: [], personId: kind === "foreign-person" ? foreign : inside, createdAt: 1, updatedAt: 1 });
      if (kind === "nonperson-link") {
        const citationId = await ctx.db.insert("citations", { vaultOwnerId: OWNER, sourceId, isEvidence: true, confidence: "high", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("citationLinks", { vaultOwnerId: OWNER, citationId, targetType: "event", targetId: "unknown-event", createdAt: 1 });
      }
    });
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside), String(foreign)] } });
    const input = { source: { mode: "create", createKey: "source-key", title: "Synthetic", type: "other" }, citation: { mode: "create", createKey: "new-citation", confidence: "high" }, personas: [{ personaKey: "inside", nameAsWritten: "Allowed", personId: inside }] };
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, { principal: principal(), grantId, operationId: `unproved-source-${kind}`, requestHash: `unproved-source-${kind}`, input })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
    expect(await t.run((ctx) => ctx.db.query("citations").collect())).toHaveLength(kind === "nonperson-link" ? 1 : 0);
  });
});

test("unchanged approving terms preserve selected fresh-create retries; narrowing invalidates the shortcut", async () => {
  const t = convexTest(schema, modules);
  const inside = await person(t, "Allowed");
  const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
  const personArgs = { principal: principal(), grantId, operationId: "fresh-person-retry", requestHash: "fresh-person-retry", input: { mode: "create", createKey: "fresh-person", name: { given: "New", surname: "Synthetic" }, sex: "unknown", living: false } };
  const first = await t.mutation(internal.mcpFamilyHistory.savePerson, personArgs);
  expect(await t.mutation(internal.mcpFamilyHistory.savePerson, personArgs)).toMatchObject({ deduplicated: true, person: { id: first.person.id } });
  const evidenceArgs = { principal: principal(), grantId, operationId: "fresh-unattributed-evidence", requestHash: "fresh-unattributed-evidence", input: { source: { mode: "create", createKey: "fresh-unattributed-source", title: "Synthetic", type: "other" }, citation: { mode: "create", createKey: "fresh-unattributed-citation", confidence: "high" } } };
  await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, evidenceArgs);
  expect(await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, evidenceArgs)).toMatchObject({ deduplicated: true });
  await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { boundary: { kind: "selected_people", personIds: [] } }));
  await expect(t.mutation(internal.mcpFamilyHistory.savePerson, personArgs)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, evidenceArgs)).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
});

test("receipt shortcuts never cross grants or survive revocation/expiry; legacy receipts recheck current targets", async () => {
  const t = convexTest(schema, modules);
  const inside = await person(t, "Allowed");
  const outside = await person(t, "Outside");
  const own = await records(t, inside, "Allowed");
  const other = await records(t, outside, "Outside");
  const grantId = await seedGrant(t, { vaultOwnerId: OWNER, boundary: { kind: "selected_people", personIds: [String(inside)] } });
  const args = { principal: principal(), grantId, operationId: "same-authority-created-person", requestHash: "same-authority-created-person", input: { mode: "create", createKey: "same-authority-person", name: { given: "New", surname: "Synthetic" }, sex: "unknown", living: false } };
  await t.mutation(internal.mcpFamilyHistory.savePerson, args);
  const different = await seedGrant(t, { vaultOwnerId: OWNER, clientId: "different-client", boundary: { kind: "selected_people", personIds: [String(inside)] } });
  await expect(t.mutation(internal.mcpFamilyHistory.savePerson, { ...args, principal: { ...principal(), clientId: "different-client" }, grantId: different })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { status: "revoked" }));
  await expect(t.mutation(internal.mcpFamilyHistory.savePerson, args)).rejects.toThrow(/GRANT_REVOKED/);
  await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { status: "active", expiryChoice: "chosen", expiresAt: Date.now() - 1000 }));
  await expect(t.mutation(internal.mcpFamilyHistory.savePerson, args)).rejects.toThrow(/GRANT_EXPIRED/);
  await t.run((ctx) => ctx.db.patch(grantId as Id<"mcpGrants">, { expiryChoice: "none", expiresAt: undefined }));
  const researchArgs = { principal: principal(), grantId, operationId: "legacy-inside-receipt", requestHash: "legacy-inside-receipt", input: { task: { mode: "update", taskId: own.task, expectedUpdatedAt: 1, title: "Allowed updated" } } };
  await t.mutation(internal.mcpFamilyHistory.saveResearchWork, researchArgs);
  await t.run(async (ctx) => {
    const row = await ctx.db.query("mcpOperations").withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", OWNER).eq("operationId", researchArgs.operationId)).unique();
    await ctx.db.patch(row!._id, { authoritySnapshot: undefined });
    await ctx.db.insert("mcpOperations", { vaultOwnerId: OWNER, operationId: "legacy-outside-receipt", toolName: "save_research_work", requestHash: "legacy-outside-receipt", clientId: principal().clientId, resultJson: JSON.stringify({ research: { task: { id: other.task, created: false } } }), createdAt: 1 });
  });
  expect(await t.mutation(internal.mcpFamilyHistory.saveResearchWork, researchArgs)).toMatchObject({ deduplicated: true });
  await expect(t.mutation(internal.mcpFamilyHistory.saveResearchWork, { ...researchArgs, operationId: "legacy-outside-receipt", requestHash: "legacy-outside-receipt", input: { task: { mode: "update", taskId: other.task, expectedUpdatedAt: 1, title: "Bad" } } })).rejects.toThrow(/OUTSIDE_GRANT_BOUNDARY/);
  await expect(t.mutation(internal.mcpFamilyHistory.savePerson, { ...args, requestHash: "different-input" })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
});
