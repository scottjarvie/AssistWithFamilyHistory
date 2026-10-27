/* eslint-disable @typescript-eslint/no-explicit-any -- Internal inputs are validated by the public MCP Zod schemas before dispatch. */
import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";
import { matchesVaultOwner } from "./vaultCore";
import { assertGrantPermits } from "./mcpGrants";
import { effectiveScopes, effectiveExpiry } from "../lib/mcp/grantDefaults";
import { findTool } from "../lib/mcp/catalog";

const principalValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
  clientId: v.string(),
  scopes: v.array(v.string()),
});

type McpPrincipal = {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: string[];
};

type RecordType = Doc<"mcpRecordKeys">["recordType"];

function ownerFromPrincipal(principal: McpPrincipal): string {
  const owner = principal.subject.trim();
  if (!owner || !principal.issuer.trim() || !principal.clientId.trim()) {
    throw new Error("MCP_FAMILY_HISTORY_ERROR:" + JSON.stringify({
      code: "AUTH_REQUIRED",
      message: "A verified Family History OAuth identity is required.",
      recovery: "Reconnect the MCP server and sign in to Assist With Family History.",
    }));
  }
  return owner;
}

function machineError(code: string, message: string, recovery: string): never {
  throw new Error(`MCP_FAMILY_HISTORY_ERROR:${JSON.stringify({ code, message, recovery })}`);
}

function cleanText(value: unknown, label: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) machineError("VALIDATION_ERROR", `${label} is required.`, `Provide ${label}.`);
    return undefined;
  }
  if (typeof value !== "string") machineError("VALIDATION_ERROR", `${label} must be text.`, `Correct ${label} and retry.`);
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized && required) machineError("VALIDATION_ERROR", `${label} is required.`, `Provide ${label}.`);
  if (normalized.length > max) machineError("VALIDATION_ERROR", `${label} is too long.`, `Shorten ${label} to ${max} characters or fewer.`);
  return normalized || undefined;
}

function cleanKey(value: unknown, label: string): string {
  return cleanText(value, label, FAMILY_HISTORY_MCP_LIMITS.recordKey, true)!;
}

function pickDefined(input: Record<string, unknown>, keys: string[]) {
  const result: Record<string, unknown> = {};
  for (const key of keys) if (input[key] !== undefined) result[key] = input[key];
  return result;
}

async function owned<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  id: string,
  owner: string,
  label: string,
) {
  const normalizedId = ctx.db.normalizeId(table, id);
  if (!normalizedId) {
    machineError("NOT_FOUND", `${label} was not found.`, "Refresh Family History context and use an ID returned for this vault.");
  }
  const row = await ctx.db.get(normalizedId as Id<T>);
  if (!row || !("vaultOwnerId" in row) || !matchesVaultOwner(row.vaultOwnerId as string | undefined, owner)) {
    machineError("NOT_FOUND", `${label} was not found.`, "Refresh Family History context and use an ID returned for this vault.");
  }
  return row as Doc<T>;
}

async function assertOwnedPlaceRefs(ctx: MutationCtx, owner: string, input: any, label: string) {
  const placeIds = [
    input?.place?.placeId,
    input?.birth?.place?.placeId,
    input?.death?.place?.placeId,
    input?.coverage?.spatial,
    ...(input?.facts ?? []).map((fact: any) => fact?.place?.placeId),
  ].filter((value): value is string => typeof value === "string");
  for (const placeId of new Set(placeIds)) await owned(ctx, "places", placeId, owner, label);
}

async function assertOwnedFindingTarget(
  ctx: MutationCtx,
  owner: string,
  entityType: string | undefined,
  entityId: string | undefined,
) {
  if (!entityId || !entityType || entityType === "other" || entityType === "building") return;
  const table = ({
    person: "persons",
    place: "places",
    relationship: "relationships",
    event: "events",
    source: "sources",
    citation: "citations",
    story: "stories",
    historicalContext: "historicalContext",
  } as const)[entityType as "person"];
  if (!table) machineError("VALIDATION_ERROR", "Unsupported research finding target.", "Use a supported Family History record returned by context.");
  await owned(ctx, table, entityId, owner, "Research finding target");
}

function assertFresh(row: { updatedAt?: number }, expectedUpdatedAt: unknown, label: string) {
  if (typeof expectedUpdatedAt !== "number" || row.updatedAt !== expectedUpdatedAt) {
    machineError("STALE_VERSION", `${label} changed after it was read.`, `Read the latest ${label.toLowerCase()} context and retry intentionally.`);
  }
}

async function mappedRecord(
  ctx: MutationCtx,
  owner: string,
  recordType: RecordType,
  recordKey: string,
) {
  return await ctx.db
    .query("mcpRecordKeys")
    .withIndex("by_owner_type_key", (q) =>
      q.eq("vaultOwnerId", owner).eq("recordType", recordType).eq("recordKey", recordKey),
    )
    .unique();
}

async function rememberRecord(
  ctx: MutationCtx,
  owner: string,
  recordType: RecordType,
  recordKey: string,
  recordId: string,
) {
  const now = Date.now();
  const existing = await mappedRecord(ctx, owner, recordType, recordKey);
  if (existing) {
    if (existing.recordId !== recordId) {
      machineError("IDEMPOTENCY_CONFLICT", `${recordType} key was already used for another record.`, "Reuse the original record or choose a new semantic create key.");
    }
    await ctx.db.patch(existing._id, { updatedAt: now });
    return;
  }
  await ctx.db.insert("mcpRecordKeys", {
    vaultOwnerId: owner,
    recordType,
    recordKey,
    recordId,
    createdAt: now,
    updatedAt: now,
  });
}

async function replayReceipt(
  ctx: MutationCtx,
  owner: string,
  operationId: string,
  toolName: string,
  requestHash: string,
) {
  const row = await ctx.db
    .query("mcpOperations")
    .withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", owner).eq("operationId", operationId))
    .unique();
  if (!row) return null;
  if (row.toolName !== toolName || row.requestHash !== requestHash) {
    machineError("IDEMPOTENCY_CONFLICT", "This operation ID was already used for different Family History work.", "Reuse the original inputs or mint a new operation ID.");
  }
  return { result: { ...(JSON.parse(row.resultJson) as Record<string, unknown>), deduplicated: true }, authoritySnapshot: row.authoritySnapshot };
}

async function finishOperation(
  ctx: MutationCtx,
  args: {
    owner: string;
    principal: McpPrincipal;
    grantId?: string;
    operationId: string;
    toolName: string;
    requestHash: string;
    authoritySnapshot: string;
    result: Record<string, unknown>;
    detail: string;
  },
) {
  const result = { ...args.result, operationId: args.operationId, deduplicated: false };
  const resultJson = JSON.stringify(result);
  if (resultJson.length > FAMILY_HISTORY_MCP_LIMITS.resultJson) {
    machineError("RESULT_TOO_LARGE", "The durable result receipt exceeded its safe size.", "Save a smaller complete result or split the work into granular saves.");
  }
  const now = Date.now();
  await ctx.db.insert("mcpOperations", {
    vaultOwnerId: args.owner,
    operationId: args.operationId,
    toolName: args.toolName,
    requestHash: args.requestHash,
    resultJson,
    authoritySnapshot: args.authoritySnapshot,
    clientId: args.principal.clientId,
    createdAt: now,
  });
  await ctx.db.insert("agentActivity", {
    vaultOwnerId: args.owner,
    requestId: args.operationId,
    principalKind: "mcp",
    route: "/mcp",
    method: "tools/call",
    scope: args.toolName,
    outcome: "ok",
    statusCode: 200,
    createdAt: now,
    detail: cleanText(args.detail, "activity detail", 300),
    grantId: args.grantId
      ? (ctx.db.normalizeId("mcpGrants", args.grantId) ?? undefined)
      : undefined,
    clientId: args.principal.clientId,
  });
  return result;
}

/**
 * Where a record came from, derived entirely on the server.
 *
 * Nothing in here can be supplied, shaped, or contradicted by the caller.
 * `actorId` is the OAuth `client_id` the transport verified against the
 * provider's JWKS; `operationId` is the replay key already validated above;
 * `recordedAt` is our clock. A connected AI therefore cannot stamp a record as
 * hand-entered, and a person's own entry can never be mistaken for an AI's.
 *
 * This is the same shape `convex/vaultMutations.ts` writes for a person's manual
 * first start, so one field answers "who first put this here" for every record
 * in the vault, whatever door it came through.
 */
type McpProvenance = {
  actorKind: "chosen_ai";
  actorId: string;
  method: "mcp";
  evidenceStatus: "unsourced";
  operationId: string;
  recordedAt: number;
};

function mcpProvenance(principal: McpPrincipal, operationId: string): McpProvenance {
  return {
    actorKind: "chosen_ai",
    actorId: principal.clientId,
    method: "mcp",
    // A person row created through MCP carries no citation of its own at the
    // moment of insert, even when the same pass also saves sources: the link
    // between a person and its evidence lives in citationLinks and sourceFacts,
    // and claiming `source_linked` here would be the record asserting its own
    // sourcing. Evidence status stays "unsourced" until something actually
    // sources it.
    evidenceStatus: "unsourced",
    operationId,
    recordedAt: Date.now(),
  };
}

// This is a canonical comparison record, not a credential or grant extension.
// Sorting makes list order irrelevant; changing any permission invalidates the
// shortcut. Fresh grant status/expiry checks always run before using a receipt.
function receiptAuthority(grant: Doc<"mcpGrants">): string {
  return JSON.stringify({
    grantId: String(grant._id), clientId: grant.clientId, issuer: grant.issuer,
    scopes: [...new Set(effectiveScopes(grant))].sort(), expiresAt: effectiveExpiry(grant) ?? null,
    boundary: { kind: grant.boundary.kind,
      personIds: [...new Set(grant.boundary.personIds ?? [])].sort(),
      queueItemIds: [...new Set(grant.boundary.queueItemIds ?? [])].sort() },
  });
}

/** Resolve existing write targets before work AND before returning an old receipt.
 * Create keys are owner-wide aliases, so caller-supplied replacement people do
 * not establish the current mapped record's attribution after a grant narrows.
 */
async function assertSelectedWriteTargets(ctx: MutationCtx, owner: string, grant: Doc<"mcpGrants">, toolName: string, input: any) {
  if (grant.boundary.kind !== "selected_people") return;
  const allowed = new Set(grant.boundary.personIds ?? []);
  const refuse = () => machineError("OUTSIDE_GRANT_BOUNDARY", "That request is outside the approved research boundary.", "Use records belonging to the approved people.");
  const person = async (id: unknown) => {
    if (typeof id !== "string" || !allowed.has(id)) refuse();
    const key = ctx.db.normalizeId("persons", id as string);
    const row = key ? await ctx.db.get(key) : null;
    if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) refuse();
  };
  const cap = FAMILY_HISTORY_MCP_LIMITS.searchScanPerType;
  const source = async (id: Id<"sources">) => {
    const [personas, facts, citations] = await Promise.all([
      ctx.db.query("recordPersonas").withIndex("by_source", (q) => q.eq("sourceId", id)).take(cap + 1),
      ctx.db.query("sourceFacts").withIndex("by_source", (q) => q.eq("sourceId", id)).take(cap + 1),
      ctx.db.query("citations").withIndex("by_source", (q) => q.eq("sourceId", id)).take(cap + 1),
    ]);
    if ([personas, facts, citations].some((rows) => rows.length > cap)) refuse();
    let attributed = false;
    for (const row of [...personas, ...facts]) {
      if (!matchesVaultOwner(row.vaultOwnerId, owner)) refuse();
      if (row.personId) { await person(row.personId); attributed = true; }
    }
    let count = 0;
    for (const citation of citations) {
      if (!matchesVaultOwner(citation.vaultOwnerId, owner)) refuse();
      const links = await ctx.db.query("citationLinks").withIndex("by_citation", (q) => q.eq("citationId", citation._id)).take(cap - count + 1);
      count += links.length;
      if (count > cap) refuse();
      for (const link of links) {
        if (!matchesVaultOwner(link.vaultOwnerId, owner) || link.targetType !== "person") refuse();
        await person(link.targetId); attributed = true;
      }
    }
    // Unresolved personas are permitted on fresh evidence, but cannot establish
    // access to an existing source. Never infer attribution from new input.
    if (!attributed) refuse();
  };
  const record = async (table: TableNames, id: string) => {
    const key = ctx.db.normalizeId(table, id);
    const row: any = key ? await ctx.db.get(key) : null;
    if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) refuse();
    if (table === "persons") await person(String(row._id));
    else if (table === "relationships") { await person(row.person1); await person(row.person2); }
    else if (table === "events") {
      const roles = await ctx.db.query("personEvents").withIndex("by_event", (q) => q.eq("eventId", row._id)).take(cap + 1);
      if (!roles.length || roles.length > cap) refuse();
      for (const role of roles) { if (!matchesVaultOwner(role.vaultOwnerId, owner)) refuse(); await person(role.personId); }
    } else if (table === "sources") await source(row._id);
    else if (table === "citations") {
      const parent = await ctx.db.get(row.sourceId as Id<"sources">);
      if (!parent || !matchesVaultOwner(parent.vaultOwnerId, owner)) refuse();
      await source(row.sourceId);
    } else if (table === "researchLog") { if (row.entityType !== "person") refuse(); await person(row.entityId); }
    else await person(row.personId); // stories, researchTasks and sourceFacts
  };
  const target = async (value: any, table: TableNames, type: RecordType, idField: string) => {
    if (!value) return;
    if (value.mode === "update") await record(table, value[idField]);
    else if (value.mode === "create" && typeof value.createKey === "string") {
      const mapping = await mappedRecord(ctx, owner, type, value.createKey.trim());
      if (mapping) await record(table, mapping.recordId);
    }
  };
  const evidence = async (value: any) => {
    await target(value?.source, "sources", "source", "sourceId");
    await target(value?.citation, "citations", "citation", "citationId");
    for (const fact of value?.facts ?? []) {
      if (typeof fact.factKey !== "string") continue;
      const mapping = await mappedRecord(ctx, owner, "source_fact", fact.factKey.trim());
      if (mapping) await record("sourceFacts", mapping.recordId);
    }
  };
  const research = async (value: any) => {
    await target(value?.task, "researchTasks", "research_task", "taskId");
    await target(value?.finding, "researchLog", "research_log", "findingId");
  };
  // Batch person aliases can resolve owner-wide mappings even when no people
  // array is supplied. Validate those existing people before resolving aliases.
  const personAliases = async (value: any): Promise<void> => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) await personAliases(item); return; }
    for (const key of ["personCreateKey", "person1CreateKey", "person2CreateKey", ...(value.targetType === "person" ? ["targetCreateKey"] : [])]) {
      if (typeof value[key] !== "string") continue;
      const mapping = await mappedRecord(ctx, owner, "person", value[key].trim());
      if (mapping) await record("persons", mapping.recordId);
    }
    for (const item of Object.values(value)) await personAliases(item);
  };
  await personAliases(input);
  switch (findTool(toolName)?.name) {
    case "family_history_save_person": await target(input, "persons", "person", "personId"); break;
    case "family_history_save_relationship": await target(input, "relationships", "relationship", "relationshipId"); break;
    case "family_history_save_event": await target(input, "events", "event", "eventId"); break;
    case "family_history_save_story_work": await target(input, "stories", "story", "storyId"); break;
    case "family_history_save_source_evidence": await evidence(input); break;
    case "family_history_save_research_work": await research(input); break;
    case "family_history_save_records":
    case "family_history_save_complete_result":
      await target(input.person, "persons", "person", "personId");
      for (const row of input.people ?? []) await target(row, "persons", "person", "personId");
      for (const row of input.relationships ?? []) await target(row, "relationships", "relationship", "relationshipId");
      for (const row of input.events ?? []) await target(row, "events", "event", "eventId");
      for (const row of input.stories ?? []) await target(row, "stories", "story", "storyId");
      for (const row of input.evidence ?? []) await evidence(row);
      await research(input.research);
  }
}

async function operation(
  ctx: MutationCtx,
  args: {
    principal: McpPrincipal;
    grantId?: string;
    operationId: string;
    toolName: string;
    requestHash: string;
    input: any;
  },
  work: (owner: string, provenance: McpProvenance) => Promise<{ result: Record<string, unknown>; detail: string }>,
) {
  const owner = ownerFromPrincipal(args.principal);
  // Defense in depth. The transport already resolved and checked this grant;
  // the data layer refuses independently so a transport bug or a future caller
  // cannot turn an unapproved connection into a write.
  const grant = await assertGrantPermits(ctx, {
    owner,
    grantId: args.grantId,
    toolName: args.toolName,
    input: args.input,
  });
  const authoritySnapshot = receiptAuthority(grant!);
  const operationId = cleanText(args.operationId, "operationId", FAMILY_HISTORY_MCP_LIMITS.operationId, true)!;
  const replay = await replayReceipt(ctx, owner, operationId, args.toolName, args.requestHash);
  // An exact retry under unchanged approving terms returns only its original
  // result, including fresh creations not named in the preexisting selection.
  if (replay?.authoritySnapshot === authoritySnapshot) return replay.result;
  await assertSelectedWriteTargets(ctx, owner, grant!, args.toolName, args.input);
  if (replay) return replay.result;
  const completed = await work(owner, mcpProvenance(args.principal, operationId));
  return finishOperation(ctx, { ...args, owner, operationId, authoritySnapshot, ...completed });
}

async function savePersonRecord(ctx: MutationCtx, owner: string, input: any, provenance: McpProvenance) {
  const now = Date.now();
  await assertOwnedPlaceRefs(ctx, owner, input, "Person place");
  if (input.mode === "create") {
    const createKey = cleanKey(input.createKey, "createKey");
    const mapping = await mappedRecord(ctx, owner, "person", createKey);
    if (mapping) {
      const row = await owned(ctx, "persons", mapping.recordId, owner, "Person");
      return { id: row._id, created: false, updatedAt: row.updatedAt, createKey };
    }
    if (!input.name || typeof input.name.given !== "string" || typeof input.name.surname !== "string") {
      machineError("VALIDATION_ERROR", "A person requires given and surname fields.", "Provide the person's name and retry.");
    }
    const id = await ctx.db.insert("persons", {
      vaultOwnerId: owner,
      name: input.name,
      alternateNames: input.alternateNames,
      sex: input.sex,
      living: input.living,
      birth: input.birth,
      death: input.death,
      fsId: input.fsId,
      researchStatus: input.researchStatus ?? "basic",
      researchPriority: input.researchPriority,
      notes: cleanText(input.notes, "person notes", FAMILY_HISTORY_MCP_LIMITS.notes),
      tags: input.tags,
      // The stamp that makes an AI-created person visibly an AI-created person.
      // Without it, telling the two apart meant joining through mcpRecordKeys —
      // so a person row was, on its own, silent about where it came from. Every
      // other MCP write path already stamps something (`importKey: "mcp:*"`,
      // `generatedBy: "ai"`, `aiSuggested`); persons were the gap.
      creationProvenance: provenance,
      createdAt: now,
      updatedAt: now,
    });
    await rememberRecord(ctx, owner, "person", createKey, String(id));
    return { id, created: true, updatedAt: now, createKey };
  }
  const row = await owned(ctx, "persons", input.personId, owner, "Person");
  assertFresh(row, input.expectedUpdatedAt, "Person");
  const patch = pickDefined(input, [
    "name", "alternateNames", "sex", "living", "birth", "death", "researchStatus", "researchPriority", "notes", "tags",
  ]);
  if (patch.notes !== undefined) patch.notes = cleanText(patch.notes, "person notes", FAMILY_HISTORY_MCP_LIMITS.notes);
  await ctx.db.patch(row._id, { ...patch, updatedAt: now });
  return { id: row._id, created: false, updatedAt: now };
}

async function saveRelationshipRecord(ctx: MutationCtx, owner: string, input: any, provenance: McpProvenance) {
  const now = Date.now();
  await assertOwnedPlaceRefs(ctx, owner, input, "Relationship place");
  if (input.mode === "create") {
    const createKey = cleanKey(input.createKey, "createKey");
    const mapping = await mappedRecord(ctx, owner, "relationship", createKey);
    if (mapping) {
      const row = await owned(ctx, "relationships", mapping.recordId, owner, "Relationship");
      return { id: row._id, created: false, updatedAt: row.updatedAt, createKey };
    }
    await owned(ctx, "persons", input.person1, owner, "Relationship person");
    await owned(ctx, "persons", input.person2, owner, "Relationship person");
    if (input.person1 === input.person2) machineError("VALIDATION_ERROR", "A person cannot be related to themself.", "Choose two different person IDs.");
    const id = await ctx.db.insert("relationships", {
      vaultOwnerId: owner,
      type: input.type,
      childRelationType: input.childRelationType,
      person1: input.person1,
      person2: input.person2,
      facts: input.facts,
      familySearchId: input.familySearchId,
      importKey: `mcp:${createKey}`,
      // Same server-derived stamp as persons. A relationship an AI proposed
      // should be as visibly AI-proposed as the people it connects.
      creationProvenance: provenance,
      createdAt: now,
      updatedAt: now,
    });
    await rememberRecord(ctx, owner, "relationship", createKey, String(id));
    return { id, created: true, updatedAt: now, createKey };
  }
  const row = await owned(ctx, "relationships", input.relationshipId, owner, "Relationship");
  assertFresh(row, input.expectedUpdatedAt, "Relationship");
  if (input.person1) await owned(ctx, "persons", input.person1, owner, "Relationship person");
  if (input.person2) await owned(ctx, "persons", input.person2, owner, "Relationship person");
  const patch = pickDefined(input, ["type", "childRelationType", "person1", "person2", "facts"]);
  const nextPerson1 = (patch.person1 ?? row.person1) as string;
  const nextPerson2 = (patch.person2 ?? row.person2) as string;
  if (nextPerson1 === nextPerson2) machineError("VALIDATION_ERROR", "A person cannot be related to themself.", "Choose two different person IDs.");
  await ctx.db.patch(row._id, { ...patch, updatedAt: now });
  return { id: row._id, created: false, updatedAt: now };
}

async function saveEventRecord(ctx: MutationCtx, owner: string, input: any) {
  const now = Date.now();
  await assertOwnedPlaceRefs(ctx, owner, input, "Event place");
  let eventId: Id<"events">;
  let created = false;
  let createKey: string | undefined;
  if (input.mode === "create") {
    createKey = cleanKey(input.createKey, "createKey");
    const mapping = await mappedRecord(ctx, owner, "event", createKey);
    if (mapping) {
      const row = await owned(ctx, "events", mapping.recordId, owner, "Event");
      eventId = row._id;
    } else {
      eventId = await ctx.db.insert("events", {
        vaultOwnerId: owner,
        type: input.type,
        customType: input.customType,
        date: input.date,
        endDate: input.endDate,
        place: input.place,
        description: cleanText(input.description, "event description", FAMILY_HISTORY_MCP_LIMITS.notes),
        notes: cleanText(input.notes, "event notes", FAMILY_HISTORY_MCP_LIMITS.notes),
        importKey: `mcp:${createKey}`,
        createdAt: now,
        updatedAt: now,
      });
      await rememberRecord(ctx, owner, "event", createKey, String(eventId));
      created = true;
    }
  } else {
    const row = await owned(ctx, "events", input.eventId, owner, "Event");
    assertFresh(row, input.expectedUpdatedAt, "Event");
    const patch = pickDefined(input, ["type", "customType", "date", "endDate", "place", "description", "notes"]);
    if (patch.description !== undefined) patch.description = cleanText(patch.description, "event description", FAMILY_HISTORY_MCP_LIMITS.notes);
    if (patch.notes !== undefined) patch.notes = cleanText(patch.notes, "event notes", FAMILY_HISTORY_MCP_LIMITS.notes);
    await ctx.db.patch(row._id, { ...patch, updatedAt: now });
    eventId = row._id;
  }
  for (const role of input.personRoles ?? []) {
    await owned(ctx, "persons", role.personId, owner, "Event person");
    const matches = await ctx.db
      .query("personEvents")
      .withIndex("by_person_and_event", (q) => q.eq("personId", role.personId).eq("eventId", eventId))
      .collect();
    const existing = matches.find((row) => matchesVaultOwner(row.vaultOwnerId, owner));
    if (existing) await ctx.db.patch(existing._id, { role: role.role });
    else await ctx.db.insert("personEvents", { vaultOwnerId: owner, personId: role.personId, eventId, role: role.role, createdAt: now });
  }
  return { id: eventId, created, updatedAt: now, createKey };
}

async function saveSourceEvidenceRecord(ctx: MutationCtx, owner: string, input: any, provenance?: McpProvenance) {
  const now = Date.now();
  const sourceInput = input.source;
  await assertOwnedPlaceRefs(ctx, owner, sourceInput, "Source coverage place");
  let sourceId: Id<"sources">;
  let sourceCreated = false;
  if (sourceInput.mode === "create") {
    const key = cleanKey(sourceInput.createKey, "source.createKey");
    const mapping = await mappedRecord(ctx, owner, "source", key);
    if (mapping) sourceId = (await owned(ctx, "sources", mapping.recordId, owner, "Source"))._id;
    else {
      sourceId = await ctx.db.insert("sources", {
        vaultOwnerId: owner,
        title: sourceInput.title,
        type: sourceInput.type,
        repository: sourceInput.repository,
        url: sourceInput.url,
        fsId: sourceInput.fsId,
        importKey: `mcp:${key}`,
        author: sourceInput.author,
        publicationDate: sourceInput.publicationDate,
        coverage: sourceInput.coverage,
        recordDate: sourceInput.recordDate,
        recordPlace: sourceInput.recordPlace,
        language: sourceInput.language,
        citationText: cleanText(sourceInput.citationText, "source citationText", FAMILY_HISTORY_MCP_LIMITS.notes),
        imageUrl: sourceInput.imageUrl,
        externalIds: sourceInput.externalIds,
        creationProvenance: provenance,
        notes: cleanText(sourceInput.notes, "source notes", FAMILY_HISTORY_MCP_LIMITS.notes),
        createdAt: now,
        updatedAt: now,
      });
      await rememberRecord(ctx, owner, "source", key, String(sourceId));
      sourceCreated = true;
    }
  } else {
    const row = await owned(ctx, "sources", sourceInput.sourceId, owner, "Source");
    assertFresh(row, sourceInput.expectedUpdatedAt, "Source");
    const patch = pickDefined(sourceInput, [
      "title", "type", "repository", "url", "author", "publicationDate", "coverage", "notes",
      "recordDate", "recordPlace", "language", "citationText", "imageUrl", "externalIds",
    ]);
    if (patch.notes !== undefined) patch.notes = cleanText(patch.notes, "source notes", FAMILY_HISTORY_MCP_LIMITS.notes);
    if (patch.citationText !== undefined) patch.citationText = cleanText(patch.citationText, "source citationText", FAMILY_HISTORY_MCP_LIMITS.notes);
    await ctx.db.patch(row._id, { ...patch, updatedAt: now });
    sourceId = row._id;
  }

  const citationInput = input.citation;
  let citationId: Id<"citations">;
  let citationCreated = false;
  if (citationInput.mode === "create") {
    const key = cleanKey(citationInput.createKey, "citation.createKey");
    const mapping = await mappedRecord(ctx, owner, "citation", key);
    if (mapping) {
      const row = await owned(ctx, "citations", mapping.recordId, owner, "Citation");
      if (row.sourceId !== sourceId) machineError("VALIDATION_ERROR", "Citation belongs to a different source.", "Use the citation's existing source or create a new citation.");
      citationId = row._id;
    }
    else {
      citationId = await ctx.db.insert("citations", {
        vaultOwnerId: owner,
        sourceId,
        isEvidence: citationInput.isEvidence ?? true,
        importKey: `mcp:${key}`,
        page: citationInput.page,
        confidence: citationInput.confidence,
        extractedText: cleanText(citationInput.extractedText, "citation extracted text", FAMILY_HISTORY_MCP_LIMITS.notes),
        editedText: cleanText(citationInput.editedText, "citation edited text", FAMILY_HISTORY_MCP_LIMITS.notes),
        url: citationInput.url,
        accessDate: citationInput.accessDate,
        notes: cleanText(citationInput.notes, "citation notes", FAMILY_HISTORY_MCP_LIMITS.notes),
        createdAt: now,
        updatedAt: now,
      });
      await rememberRecord(ctx, owner, "citation", key, String(citationId));
      citationCreated = true;
    }
  } else {
    const row = await owned(ctx, "citations", citationInput.citationId, owner, "Citation");
    assertFresh(row, citationInput.expectedUpdatedAt, "Citation");
    if (row.sourceId !== sourceId) machineError("VALIDATION_ERROR", "Citation belongs to a different source.", "Use the citation's existing source or create a new citation.");
    const patch = pickDefined(citationInput, ["isEvidence", "page", "confidence", "extractedText", "editedText", "url", "accessDate", "notes"]);
    for (const key of ["extractedText", "editedText", "notes"]) {
      if (patch[key] !== undefined) patch[key] = cleanText(patch[key], `citation ${key}`, FAMILY_HISTORY_MCP_LIMITS.notes);
    }
    await ctx.db.patch(row._id, { ...patch, updatedAt: now });
    citationId = row._id;
  }

  const linkIds: string[] = [];
  for (const link of input.links ?? []) {
    const table = ({ person: "persons", relationship: "relationships", event: "events", place: "places" } as const)[link.targetType as "person"];
    if (!table) machineError("VALIDATION_ERROR", "Unsupported citation target.", "Link evidence to a person, relationship, event, or place.");
    await owned(ctx, table, link.targetId, owner, "Citation target");
    const rows = await ctx.db
      .query("citationLinks")
      .withIndex("by_citation_and_target", (q) => q.eq("citationId", citationId).eq("targetType", link.targetType).eq("targetId", link.targetId))
      .collect();
    const existing = rows.find((row) => matchesVaultOwner(row.vaultOwnerId, owner));
    if (existing) {
      if (link.field !== undefined) await ctx.db.patch(existing._id, { field: link.field });
      linkIds.push(String(existing._id));
    } else {
      linkIds.push(String(await ctx.db.insert("citationLinks", {
        vaultOwnerId: owner,
        citationId,
        targetType: link.targetType,
        targetId: link.targetId,
        field: link.field,
        createdAt: now,
      })));
    }
  }

  // The original record's own content and the people as it names them come
  // before any claim, so a claim can point at the persona it was read from.
  const contentIds = await appendSourceContents(ctx, owner, sourceId, input.contents ?? [], provenance);
  const personaIdsByKey = new Map<string, Id<"recordPersonas">>();
  const personaIds: string[] = [];
  for (const persona of input.personas ?? []) {
    const saved = await savePersonaRecord(ctx, owner, sourceId, persona, provenance);
    personaIdsByKey.set(saved.personaKey, saved.id);
    personaIds.push(String(saved.id));
  }

  const factIds: string[] = [];
  for (const fact of input.facts ?? []) {
    await owned(ctx, "persons", fact.personId, owner, "Source fact person");
    const factKey = cleanKey(fact.factKey, "factKey");
    const importKey = `mcp:${factKey}`;
    const mapping = await mappedRecord(ctx, owner, "source_fact", factKey);
    const existing = mapping
      ? await owned(ctx, "sourceFacts", mapping.recordId, owner, "Source fact")
      : null;
    const payload = {
      vaultOwnerId: owner,
      personId: fact.personId,
      sourceId,
      citationId,
      importKey,
      factType: fact.factType,
      label: fact.label,
      value: fact.value,
      date: fact.date,
      place: fact.place,
      confidence: fact.confidence,
      status: fact.status ?? "candidate",
      conflictReason: fact.conflictReason,
      originalText: cleanText(fact.originalText, "fact originalText", FAMILY_HISTORY_MCP_LIMITS.notes),
      informationKind: fact.informationKind,
      personaId: fact.personaKey ? await personaFor(ctx, owner, sourceId, personaIdsByKey, fact.personaKey) : undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      factIds.push(String(existing._id));
    } else {
      const factId = await ctx.db.insert("sourceFacts", { ...payload, createdAt: now });
      await rememberRecord(ctx, owner, "source_fact", factKey, String(factId));
      factIds.push(String(factId));
    }
  }
  return { sourceId, citationId, sourceCreated, citationCreated, linkIds, factIds, contentIds, personaIds, updatedAt: now };
}

async function saveResearchRecord(ctx: MutationCtx, owner: string, input: any, provenance: McpProvenance) {
  const now = Date.now();
  const result: Record<string, unknown> = { updatedAt: now };
  if (input.task) {
    const task = input.task;
    let taskId: Id<"researchTasks">;
    let created = false;
    if (task.mode === "create") {
      const key = cleanKey(task.createKey, "task.createKey");
      const mapping = await mappedRecord(ctx, owner, "research_task", key);
      if (mapping) taskId = (await owned(ctx, "researchTasks", mapping.recordId, owner, "Research task"))._id;
      else {
        if (task.personId) await owned(ctx, "persons", task.personId, owner, "Research task person");
        taskId = await ctx.db.insert("researchTasks", {
          vaultOwnerId: owner,
          personId: task.personId,
          type: task.type,
          title: task.title,
          description: cleanText(task.description, "research task description", FAMILY_HISTORY_MCP_LIMITS.notes),
          status: task.status ?? "todo",
          priority: task.priority ?? "medium",
          aiSuggested: true,
          suggestedSources: task.suggestedSources,
          assignedTo: "chosen_ai_mcp",
          notes: cleanText(task.notes, "research task notes", FAMILY_HISTORY_MCP_LIMITS.notes),
          createdAt: now,
          completedAt: task.status === "done" ? now : undefined,
          updatedAt: now,
        });
        await rememberRecord(ctx, owner, "research_task", key, String(taskId));
        created = true;
      }
    } else {
      const row = await owned(ctx, "researchTasks", task.taskId, owner, "Research task");
      assertFresh(row, task.expectedUpdatedAt, "Research task");
      if (task.personId) await owned(ctx, "persons", task.personId, owner, "Research task person");
      const patch = pickDefined(task, ["personId", "type", "title", "description", "status", "priority", "suggestedSources", "notes"]);
      await ctx.db.patch(row._id, { ...patch, completedAt: task.status === "done" ? now : row.completedAt, updatedAt: now });
      taskId = row._id;
    }
    result.task = { id: taskId, created };
  }
  if (input.finding) {
    const finding = input.finding;
    let findingId: Id<"researchLog">;
    let created = false;
    if (finding.mode === "create") {
      const key = cleanKey(finding.createKey, "finding.createKey");
      const mapping = await mappedRecord(ctx, owner, "research_log", key);
      if (mapping) findingId = (await owned(ctx, "researchLog", mapping.recordId, owner, "Research finding"))._id;
      else {
        await assertOwnedFindingTarget(ctx, owner, finding.entityType, finding.entityId);
        findingId = await ctx.db.insert("researchLog", {
          vaultOwnerId: owner,
          entityType: finding.entityType,
          entityId: finding.entityId,
          activityType: finding.activityType ?? "other",
          status: finding.status ?? "done",
          summary: finding.summary,
          details: cleanText(finding.details, "research finding details", FAMILY_HISTORY_MCP_LIMITS.notes),
          outputRefs: finding.outputRefs,
          // Self-reported and untrusted: a client can name any model it likes,
          // or none. It is kept because a person may find it useful to see, and
          // bounded so it cannot be used as a smuggling channel. It is NOT the
          // provenance — `creationProvenance` below is, and the client cannot
          // touch that.
          model: cleanText(finding.model, "finding.model (self-reported)", FAMILY_HISTORY_MCP_LIMITS.shortText),
          creationProvenance: provenance,
          createdAt: now,
          updatedAt: now,
          completedAt: (finding.status ?? "done") === "done" ? now : undefined,
        });
        await rememberRecord(ctx, owner, "research_log", key, String(findingId));
        created = true;
      }
    } else {
      const row = await owned(ctx, "researchLog", finding.findingId, owner, "Research finding");
      assertFresh(row, finding.expectedUpdatedAt, "Research finding");
      await assertOwnedFindingTarget(
        ctx,
        owner,
        finding.entityType ?? row.entityType,
        finding.entityId ?? (row.entityId ? String(row.entityId) : undefined),
      );
      const patch = pickDefined(finding, ["entityType", "entityId", "activityType", "status", "summary", "details", "outputRefs", "model"]);
      // Still self-reported on a correction, and still bounded. A correction can
      // never rewrite `creationProvenance`: who first wrote a record is not a
      // field a later caller gets to edit.
      if (patch.model !== undefined) patch.model = cleanText(patch.model, "finding.model (self-reported)", FAMILY_HISTORY_MCP_LIMITS.shortText);
      await ctx.db.patch(row._id, { ...patch, completedAt: finding.status === "done" ? now : row.completedAt, updatedAt: now });
      findingId = row._id;
    }
    result.finding = { id: findingId, created };
  }
  return result;
}

async function saveStoryRecord(ctx: MutationCtx, owner: string, input: any) {
  const now = Date.now();
  if (input.status === "published") machineError("FORBIDDEN", "MCP cannot publish a Family History story.", "Save a draft or request review, then use the human publish gates in the web app.");
  if (input.personId) await owned(ctx, "persons", input.personId, owner, "Story person");
  if (input.relationshipId) await owned(ctx, "relationships", input.relationshipId, owner, "Story relationship");
  for (const citationId of input.citationIds ?? []) await owned(ctx, "citations", citationId, owner, "Story citation");
  for (const sourceFactId of input.sourceFactIds ?? []) await owned(ctx, "sourceFacts", sourceFactId, owner, "Story source fact");
  for (const contextPackId of input.contextPackIds ?? []) await owned(ctx, "historicalContext", contextPackId, owner, "Story context pack");
  if (input.mode === "create") {
    const key = cleanKey(input.createKey, "createKey");
    const mapping = await mappedRecord(ctx, owner, "story", key);
    if (mapping) {
      const row = await owned(ctx, "stories", mapping.recordId, owner, "Story");
      return { id: row._id, created: false, updatedAt: row.updatedAt, createKey: key };
    }
    const id = await ctx.db.insert("stories", {
      vaultOwnerId: owner,
      personId: input.personId,
      relationshipId: input.relationshipId,
      type: input.type,
      title: input.title,
      content: cleanText(input.content, "story content", FAMILY_HISTORY_MCP_LIMITS.story, true)!,
      citationIds: input.citationIds ?? [],
      sourceFactIds: input.sourceFactIds,
      contextPackIds: input.contextPackIds,
      status: input.status ?? "draft",
      generatedBy: "ai",
      promptUsed: input.promptUsed,
      modelUsed: input.modelUsed,
      publicIndexing: "noindex",
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    });
    await rememberRecord(ctx, owner, "story", key, String(id));
    return { id, created: true, updatedAt: now, createKey: key };
  }
  const row = await owned(ctx, "stories", input.storyId, owner, "Story");
  assertFresh(row, input.expectedUpdatedAt, "Story");
  if (row.status === "published") machineError("FORBIDDEN", "Published stories cannot be edited through MCP.", "Unpublish or create a new draft through the human review workflow.");
  const patch = pickDefined(input, ["personId", "relationshipId", "type", "title", "content", "citationIds", "sourceFactIds", "contextPackIds", "status", "promptUsed", "modelUsed", "tags"]);
  if (patch.content !== undefined) patch.content = cleanText(patch.content, "story content", FAMILY_HISTORY_MCP_LIMITS.story, true);
  await ctx.db.patch(row._id, { ...patch, generatedBy: row.generatedBy === "human" ? "ai_edited" : row.generatedBy, updatedAt: now });
  await ctx.db.insert("storyReviewEvents", {
    vaultOwnerId: owner,
    storyId: row._id,
    personId: (patch.personId ?? row.personId) as Id<"persons"> | undefined,
    eventType: "draft_edit",
    actorRole: "story_writer",
    actorName: "Your AI via MCP",
    createdAt: now,
    updatedAt: now,
  });
  return { id: row._id, created: false, updatedAt: now };
}

/* ------------------------------------------------------- original records */

/**
 * Places named by a createKey instead of an id. A whole source often brings
 * its own places (the parish, the church inside it, the farm the family
 * rented), so any `{ original, placeId }` reference may carry
 * `placeCreateKey` naming a place saved earlier in the same call or under that
 * key before. Resolved here, before the record functions see the input, so
 * nothing downstream ever stores the key itself.
 */
async function resolvePlaceKeys(ctx: MutationCtx, owner: string, batchPlaces: Map<string, string>, value: any): Promise<any> {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await resolvePlaceKeys(ctx, owner, batchPlaces, item));
    return out;
  }
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "placeCreateKey") continue;
    out[key] = await resolvePlaceKeys(ctx, owner, batchPlaces, item);
  }
  if (typeof value.placeCreateKey === "string" && value.placeCreateKey.trim()) {
    out.placeId = await resolveKeyedRecord(ctx, owner, batchPlaces, "place", value.placeCreateKey, "placeCreateKey");
  }
  return out;
}

async function resolveKeyedRecord(
  ctx: MutationCtx,
  owner: string,
  batch: Map<string, string>,
  recordType: RecordType,
  key: string,
  label: string,
): Promise<string> {
  const trimmedKey = key.trim();
  const inBatch = batch.get(trimmedKey);
  if (inBatch) return inBatch;
  const mapping = await mappedRecord(ctx, owner, recordType, trimmedKey);
  if (mapping) return mapping.recordId;
  machineError(
    "VALIDATION_ERROR",
    `${label} names a ${recordType} createKey that was not saved in this call and does not already exist.`,
    `Save the ${recordType} earlier in this same call, or use an id returned by search or context.`,
  );
}

async function savePlaceRecord(
  ctx: MutationCtx,
  owner: string,
  input: any,
  provenance: McpProvenance,
  batchPlaces: Map<string, string>,
) {
  const now = Date.now();
  let parentId: Id<"places"> | undefined;
  const parentRef = input.parentId ?? (input.parentCreateKey
    ? await resolveKeyedRecord(ctx, owner, batchPlaces, "place", input.parentCreateKey, "parentCreateKey")
    : undefined);
  if (parentRef) parentId = (await owned(ctx, "places", parentRef, owner, "Parent place"))._id;
  const parent = parentId ? await ctx.db.get(parentId) : null;
  const description = cleanText(input.description, "place description", FAMILY_HISTORY_MCP_LIMITS.notes);
  const notes = cleanText(input.notes, "place notes", FAMILY_HISTORY_MCP_LIMITS.notes);
  if (input.mode === "create") {
    const createKey = cleanKey(input.createKey, "createKey");
    const mapping = await mappedRecord(ctx, owner, "place", createKey);
    if (mapping) {
      const row = await owned(ctx, "places", mapping.recordId, owner, "Place");
      batchPlaces.set(createKey, String(row._id));
      return { id: row._id, created: false, updatedAt: row.updatedAt, createKey };
    }
    const name = cleanText(input.name, "place name", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!;
    const fullName = cleanText(input.fullName, "place fullName", 1_000)
      ?? (parent ? `${name}, ${parent.fullName}` : name);
    const id = await ctx.db.insert("places", {
      vaultOwnerId: owner,
      name,
      fullName,
      type: input.type,
      parentId,
      latitude: input.latitude,
      longitude: input.longitude,
      temporalDescription: input.temporalDescription,
      alternateNames: input.alternateNames,
      description,
      notes,
      familySearchId: input.familySearchId,
      importKey: `mcp:${createKey}`,
      creationProvenance: provenance,
      createdAt: now,
      updatedAt: now,
    });
    await rememberRecord(ctx, owner, "place", createKey, String(id));
    batchPlaces.set(createKey, String(id));
    return { id, created: true, updatedAt: now, createKey };
  }
  const row = await owned(ctx, "places", input.placeId, owner, "Place");
  assertFresh(row, input.expectedUpdatedAt, "Place");
  if (parentId && parentId === row._id) machineError("VALIDATION_ERROR", "A place cannot sit inside itself.", "Choose a different parent place.");
  const patch = pickDefined(input, ["name", "fullName", "type", "latitude", "longitude", "temporalDescription", "alternateNames", "familySearchId"]);
  if (input.description !== undefined) patch.description = description;
  if (input.notes !== undefined) patch.notes = notes;
  if (parentId) patch.parentId = parentId;
  await ctx.db.patch(row._id, { ...patch, updatedAt: now });
  return { id: row._id, created: false, updatedAt: now };
}

async function saveTopicRecord(
  ctx: MutationCtx,
  owner: string,
  input: any,
  provenance: McpProvenance,
  batchPlaces: Map<string, string>,
  batchTopics: Map<string, string>,
) {
  const now = Date.now();
  const placeIds: Id<"places">[] = [];
  for (const placeId of input.placeIds ?? []) placeIds.push((await owned(ctx, "places", placeId, owner, "Topic place"))._id);
  for (const key of input.placeCreateKeys ?? []) {
    const placeId = await resolveKeyedRecord(ctx, owner, batchPlaces, "place", key, "placeCreateKeys");
    placeIds.push((await owned(ctx, "places", placeId, owner, "Topic place"))._id);
  }
  const description = cleanText(input.description, "topic description", FAMILY_HISTORY_MCP_LIMITS.notes);
  if (input.mode === "create") {
    const createKey = cleanKey(input.createKey, "createKey");
    const mapping = await mappedRecord(ctx, owner, "topic", createKey);
    if (mapping) {
      const row = await owned(ctx, "topics", mapping.recordId, owner, "Topic");
      batchTopics.set(createKey, String(row._id));
      return { id: row._id, created: false, updatedAt: row.updatedAt, createKey };
    }
    const id = await ctx.db.insert("topics", {
      vaultOwnerId: owner,
      name: cleanText(input.name, "topic name", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!,
      kind: input.kind,
      description,
      alternateNames: input.alternateNames,
      startYear: input.startYear,
      endYear: input.endYear,
      placeIds: placeIds.length ? [...new Set(placeIds)] : undefined,
      sourceRefs: input.sourceRefs,
      importKey: `mcp:${createKey}`,
      creationProvenance: provenance,
      createdAt: now,
      updatedAt: now,
    });
    await rememberRecord(ctx, owner, "topic", createKey, String(id));
    batchTopics.set(createKey, String(id));
    return { id, created: true, updatedAt: now, createKey };
  }
  const row = await owned(ctx, "topics", input.topicId, owner, "Topic");
  assertFresh(row, input.expectedUpdatedAt, "Topic");
  const patch = pickDefined(input, ["name", "kind", "alternateNames", "startYear", "endYear", "sourceRefs"]);
  if (input.description !== undefined) patch.description = description;
  if (placeIds.length) patch.placeIds = [...new Set(placeIds)];
  await ctx.db.patch(row._id, { ...patch, updatedAt: now });
  return { id: row._id, created: false, updatedAt: now };
}

/** Which table each Connection end lives in, and which createKey namespace names it. */
const CONNECTION_TARGETS = {
  person: { table: "persons", recordType: "person" },
  relationship: { table: "relationships", recordType: "relationship" },
  event: { table: "events", recordType: "event" },
  place: { table: "places", recordType: "place" },
  source: { table: "sources", recordType: "source" },
  source_content: { table: "sourceContents", recordType: "source_content" },
  persona: { table: "recordPersonas", recordType: null },
  citation: { table: "citations", recordType: "citation" },
  claim: { table: "sourceFacts", recordType: "source_fact" },
  media: { table: "media", recordType: null },
  topic: { table: "topics", recordType: "topic" },
  story: { table: "stories", recordType: "story" },
  research_finding: { table: "researchLog", recordType: "research_log" },
} as const;

type ConnectionKind = keyof typeof CONNECTION_TARGETS;

async function resolveConnectionEnd(
  ctx: MutationCtx,
  owner: string,
  batch: Map<string, Map<string, string>>,
  end: any,
  label: string,
): Promise<{ kind: ConnectionKind; id: string }> {
  const target = CONNECTION_TARGETS[end?.kind as ConnectionKind];
  if (!target) machineError("VALIDATION_ERROR", `${label} has an unsupported kind.`, "Use a record kind listed in the tool schema.");
  let recordId: string | undefined = typeof end.id === "string" && end.id.trim() ? end.id.trim() : undefined;
  if (!recordId && typeof end.createKey === "string") {
    if (!target.recordType) machineError("VALIDATION_ERROR", `${label} of kind ${end.kind} must use an id.`, "Use the id returned when the record was saved.");
    recordId = await resolveKeyedRecord(ctx, owner, batch.get(end.kind) ?? new Map(), target.recordType, end.createKey, `${label}.createKey`);
  }
  if (!recordId) machineError("VALIDATION_ERROR", `${label} needs an id or a createKey.`, "Name the record by id or by the createKey used to save it.");
  const row = await owned(ctx, target.table, recordId, owner, `Connection ${label}`);
  return { kind: end.kind, id: String(row._id) };
}

async function saveConnectionRecord(
  ctx: MutationCtx,
  owner: string,
  input: any,
  provenance: McpProvenance,
  batch: Map<string, Map<string, string>>,
) {
  const now = Date.now();
  const createKey = cleanKey(input.createKey, "createKey");
  const mapping = await mappedRecord(ctx, owner, "connection", createKey);
  if (mapping) {
    const row = await owned(ctx, "connections", mapping.recordId, owner, "Connection");
    return { id: row._id, created: false, updatedAt: row.updatedAt, createKey };
  }
  const from = await resolveConnectionEnd(ctx, owner, batch, input.from, "from");
  const to = await resolveConnectionEnd(ctx, owner, batch, input.to, "to");
  if (from.kind === to.kind && from.id === to.id) machineError("VALIDATION_ERROR", "A record cannot be connected to itself.", "Choose two different records.");
  const id = await ctx.db.insert("connections", {
    vaultOwnerId: owner,
    from,
    to,
    relation: input.relation,
    reason: cleanText(input.reason, "connection reason", FAMILY_HISTORY_MCP_LIMITS.shortText * 2),
    // An AI proposes; only the person accepts. There is no input that sets this.
    state: "proposed",
    importKey: `mcp:${createKey}`,
    creationProvenance: provenance,
    createdAt: now,
    updatedAt: now,
  });
  await rememberRecord(ctx, owner, "connection", createKey, String(id));
  return { id, created: true, updatedAt: now, createKey };
}

/**
 * Append original content to a source. Never updates: a correction is a new
 * row naming the one it supersedes, and both stay readable. Each content says
 * who made it, so an indexer's fields, a transcription and an AI's reading are
 * never mistaken for one another.
 */
async function appendSourceContents(
  ctx: MutationCtx,
  owner: string,
  sourceId: Id<"sources">,
  contents: any[],
  provenance?: McpProvenance,
) {
  const ids: string[] = [];
  for (const content of contents) {
    const contentKey = cleanKey(content.contentKey, "contentKey");
    const mapping = await mappedRecord(ctx, owner, "source_content", contentKey);
    if (mapping) {
      const row = await owned(ctx, "sourceContents", mapping.recordId, owner, "Source content");
      if (row.sourceId !== sourceId) machineError("IDEMPOTENCY_CONFLICT", "contentKey was already used on another source.", "Choose a new contentKey for this source.");
      ids.push(String(row._id));
      continue;
    }
    const text = cleanText(content.text, "content text", FAMILY_HISTORY_MCP_LIMITS.sourceContentText);
    const fields = Array.isArray(content.fields) && content.fields.length ? content.fields : undefined;
    if (!text && !fields) machineError("VALIDATION_ERROR", "A source content needs text, fields, or both.", "Send the original wording as text or the indexed values as fields.");
    if (content.kind === "ai_reading" && content.madeBy?.kind !== "chosen_ai") {
      machineError("VALIDATION_ERROR", "An ai_reading must be marked as made by chosen_ai.", "Set madeBy.kind to chosen_ai, or use transcription or extract for the record's own words.");
    }
    let supersedesId: Id<"sourceContents"> | undefined;
    if (content.supersedesId) {
      const earlier = await owned(ctx, "sourceContents", content.supersedesId, owner, "Superseded content");
      if (earlier.sourceId !== sourceId) machineError("VALIDATION_ERROR", "A content can only supersede content on the same source.", "Use a content id from this source.");
      supersedesId = earlier._id;
    }
    let fromMediaId: Id<"media"> | undefined;
    if (content.fromMediaId) fromMediaId = (await owned(ctx, "media", content.fromMediaId, owner, "Content media"))._id;
    const id = await ctx.db.insert("sourceContents", {
      vaultOwnerId: owner,
      sourceId,
      kind: content.kind,
      title: cleanText(content.title, "content title", FAMILY_HISTORY_MCP_LIMITS.shortText),
      text,
      fields,
      language: content.language,
      location: cleanText(content.location, "content location", FAMILY_HISTORY_MCP_LIMITS.shortText),
      madeBy: {
        kind: content.madeBy.kind,
        name: cleanText(content.madeBy.name, "madeBy.name (self-reported)", 160),
      },
      method: cleanText(content.method, "content method", FAMILY_HISTORY_MCP_LIMITS.shortText),
      fromMediaId,
      supersedesId,
      importKey: `mcp:${contentKey}`,
      creationProvenance: provenance,
      createdAt: Date.now(),
    });
    await rememberRecord(ctx, owner, "source_content", contentKey, String(id));
    ids.push(String(id));
  }
  return ids;
}

/**
 * Save one person as a record names them. Keyed by (source, personaKey) so a
 * repeated pass updates the same persona rather than duplicating it. A link to
 * a researched Person is always saved as proposed.
 */
async function savePersonaRecord(
  ctx: MutationCtx,
  owner: string,
  sourceId: Id<"sources">,
  input: any,
  provenance?: McpProvenance,
) {
  const now = Date.now();
  const personaKey = cleanKey(input.personaKey, "personaKey");
  let personId: Id<"persons"> | undefined;
  if (input.personId) personId = (await owned(ctx, "persons", input.personId, owner, "Persona person"))._id;
  const payload = {
    nameAsWritten: cleanText(input.nameAsWritten, "nameAsWritten", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!,
    role: cleanText(input.role, "persona role", 160),
    sexAsWritten: cleanText(input.sexAsWritten, "sexAsWritten", 80),
    fields: (input.fields ?? []).map((field: any) => ({
      label: cleanText(field.label, "persona field label", 300, true)!,
      value: cleanText(field.value, "persona field value", 2_000, true)!,
    })),
    personId,
    linkState: personId ? ("proposed" as const) : undefined,
    linkReason: personId ? cleanText(input.linkReason, "linkReason", FAMILY_HISTORY_MCP_LIMITS.shortText * 2) : undefined,
    updatedAt: now,
  };
  const existing = (await ctx.db
    .query("recordPersonas")
    .withIndex("by_source_key", (q) => q.eq("sourceId", sourceId).eq("personaKey", personaKey))
    .collect())
    .find((row) => row.vaultOwnerId === owner);
  if (existing) {
    // Never quietly undo the person's own decision about who this is.
    const keepDecision = existing.linkState === "accepted" || existing.linkState === "rejected";
    await ctx.db.patch(existing._id, keepDecision
      ? { ...payload, personId: existing.personId, linkState: existing.linkState, linkReason: existing.linkReason }
      : payload);
    return { id: existing._id, personaKey, created: false };
  }
  const id = await ctx.db.insert("recordPersonas", {
    vaultOwnerId: owner,
    sourceId,
    personaKey,
    ...payload,
    importKey: `mcp:${personaKey}`,
    creationProvenance: provenance,
    createdAt: now,
  });
  return { id, personaKey, created: true };
}

async function personaFor(
  ctx: MutationCtx,
  owner: string,
  sourceId: Id<"sources">,
  savedNow: Map<string, Id<"recordPersonas">>,
  personaKey: string,
): Promise<Id<"recordPersonas">> {
  const inCall = savedNow.get(personaKey);
  if (inCall) return inCall;
  const row = (await ctx.db
    .query("recordPersonas")
    .withIndex("by_source_key", (q) => q.eq("sourceId", sourceId).eq("personaKey", personaKey))
    .collect())
    .find((candidate) => candidate.vaultOwnerId === owner);
  if (!row) machineError("VALIDATION_ERROR", "A claim names a personaKey this source does not have.", "Add the persona to personas in the same call, or use a personaKey already saved on this source.");
  return row._id;
}

/** Bounded view of a source's original content for an AI read. */
function contentForRead(row: Doc<"sourceContents">, maxChars: number) {
  const text = row.text ?? undefined;
  const truncated = Boolean(text && text.length > maxChars);
  return {
    id: row._id,
    kind: row.kind,
    title: row.title,
    text: truncated ? text!.slice(0, maxChars) : text,
    textTruncated: truncated,
    textLength: text?.length ?? 0,
    fields: row.fields,
    language: row.language,
    location: row.location,
    madeBy: row.madeBy,
    method: row.method,
    fromMediaId: row.fromMediaId,
    supersedesId: row.supersedesId,
    createdAt: row.createdAt,
  };
}

async function connectionsFor(ctx: QueryCtx, owner: string, kind: string, id: string, max: number) {
  const [outgoing, incoming] = await Promise.all([
    ctx.db.query("connections").withIndex("by_from", (q) => q.eq("from.kind", kind as any).eq("from.id", id)).take(max + 1),
    ctx.db.query("connections").withIndex("by_to", (q) => q.eq("to.kind", kind as any).eq("to.id", id)).take(max + 1),
  ]);
  const rows = [...outgoing, ...incoming].filter((row) => row.vaultOwnerId === owner && row.state !== "rejected");
  return {
    connections: rows.slice(0, max).map((row) => ({
      id: row._id, from: row.from, to: row.to, relation: row.relation, reason: row.reason, state: row.state, updatedAt: row.updatedAt,
    })),
    truncated: outgoing.length > max || incoming.length > max,
  };
}

/**
 * What one grant may discover. Brief and search are broad reads, so they honour
 * the grant's record boundary, not just the owner: a selected-people connection
 * sees its own people and records attributable to them, and nothing it cannot
 * attribute (sources, places, topics, events). Queue summaries follow the
 * grant's Queue scopes and Queue item boundary separately.
 */
type DiscoveryScope = {
  wholeWorkspace: boolean;
  personIds: Set<string>;
  people: Doc<"persons">[];
  queue: boolean;
  queueItemIds: Set<string> | null;
};

async function discoveryScope(ctx: QueryCtx, owner: string, grant: Doc<"mcpGrants">): Promise<DiscoveryScope> {
  const { boundary } = grant;
  const scopes = effectiveScopes(grant);
  const people = boundary.kind === "selected_people" ? (await Promise.all([...new Set(boundary.personIds ?? [])].map((id) => {
    const personId = ctx.db.normalizeId("persons", id);
    return personId ? ctx.db.get(personId) : null;
  }))).filter((row): row is Doc<"persons"> => Boolean(row && matchesVaultOwner(row.vaultOwnerId, owner)))
    .sort((a, b) => b._creationTime - a._creationTime) : [];
  return {
    wholeWorkspace: boundary.kind === "whole_workspace",
    personIds: new Set(people.map((row) => String(row._id))),
    people,
    queue: scopes.includes("family_history:queue:read") || scopes.includes("family_history:queue:work"),
    queueItemIds: boundary.queueItemIds?.length ? new Set(boundary.queueItemIds) : null,
  };
}

function personInScope(scope: DiscoveryScope, personId: unknown): boolean {
  return scope.wholeWorkspace || (personId !== undefined && personId !== null && scope.personIds.has(String(personId)));
}

/** Newest-first people this grant may see: the owner index, or the selected people themselves. */
async function discoverablePeople(ctx: QueryCtx, owner: string, scope: DiscoveryScope, take: number): Promise<Doc<"persons">[]> {
  if (scope.wholeWorkspace) {
    return await ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(take);
  }
  return scope.people.slice(0, take);
}

// Bound work across the entire selected set, querying person indexes before the
// cap so unrelated owner rows cannot hide approved records. A partial scan is
// reported even when it found fewer matching search results than the limit.
async function discoveryRows<T extends "stories" | "researchTasks" | "researchLog">(
  ctx: QueryCtx, owner: string, scope: DiscoveryScope, table: T, take: number,
): Promise<{ rows: Doc<T>[]; truncated: boolean }> {
  if (scope.wholeWorkspace) {
    const query = table === "stories"
      ? ctx.db.query("stories").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner))
      : table === "researchTasks"
        ? ctx.db.query("researchTasks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner))
        : ctx.db.query("researchLog").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner));
    const rows = await query.order("desc").take(take);
    // The runtime table branches above preserve the caller's document type.
    return { rows: rows as unknown as Doc<T>[], truncated: rows.length === take };
  }
  const rows: Doc<T>[] = [];
  for (const person of scope.people) {
    if (rows.length === take) return { rows, truncated: true };
    const remaining = take - rows.length;
    const query = table === "researchLog"
      ? ctx.db.query("researchLog").withIndex("by_entity", (q) => q.eq("entityType", "person").eq("entityId", String(person._id)))
      : table === "stories"
        ? ctx.db.query("stories").withIndex("by_person", (q) => q.eq("personId", person._id))
        : ctx.db.query("researchTasks").withIndex("by_person", (q) => q.eq("personId", person._id));
    const selected = await query.filter((q) => q.eq(q.field("vaultOwnerId"), owner)).order("desc").take(remaining);
    rows.push(...selected as unknown as Doc<T>[]);
    if (selected.length === remaining) return { rows, truncated: true };
  }
  rows.sort((a, b) => b._creationTime - a._creationTime);
  return { rows, truncated: false };
}

async function discoveryQueue(ctx: QueryCtx, owner: string, scope: DiscoveryScope, take: number) {
  if (!scope.queue) return [];
  if (scope.queueItemIds) {
    const rows = await Promise.all([...scope.queueItemIds].map((id) => {
      const queueId = ctx.db.normalizeId("queueItems", id);
      return queueId ? ctx.db.get(queueId) : null;
    }));
    return rows.filter((row): row is Doc<"queueItems"> => Boolean(row && matchesVaultOwner(row.vaultOwnerId, owner)))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, take);
  }
  return (await Promise.all(["needs_you", "working", "waiting_for_your_ai", "done"].map((state) =>
    ctx.db.query("queueItems").withIndex("by_owner_state_updated", (q) => q.eq("vaultOwnerId", owner).eq("state", state as any)).order("desc").take(take),
  ))).flat().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, take);
}

export const getBrief = internalQuery({
  args: { principal: principalValidator, grantId: v.optional(v.string()) },
  handler: async (ctx, { principal, grantId }) => {
    const owner = ownerFromPrincipal(principal);
    const grant = await assertGrantPermits(ctx, { owner, grantId, toolName: "family_history_get_brief", input: {} });
    const scope = await discoveryScope(ctx, owner, grant!);
    const limit = FAMILY_HISTORY_MCP_LIMITS.briefRows;
    const researchScan = FAMILY_HISTORY_MCP_LIMITS.searchScanPerType;
    const recordScan = scope.wholeWorkspace ? limit + 1 : researchScan + 1;
    const [people, storyScan, taskScan, findingScan, queueItems] = await Promise.all([
      discoverablePeople(ctx, owner, scope, limit + 1),
      discoveryRows(ctx, owner, scope, "stories", recordScan),
      discoveryRows(ctx, owner, scope, "researchTasks", researchScan + 1),
      discoveryRows(ctx, owner, scope, "researchLog", recordScan),
      discoveryQueue(ctx, owner, scope, limit + 1),
    ]);
    const stories = storyScan.rows;
    const tasks = taskScan.rows;
    const findings = findingScan.rows;
    const personSummary = (person: Doc<"persons">) => ({
      id: person._id,
      name: [person.name.given, person.name.surname].filter(Boolean).join(" "),
      living: person.living,
      lifespan: `${person.birth?.date?.original ?? "?"} – ${person.death?.date?.original ?? (person.living ? "living" : "?")}`,
      researchStatus: person.researchStatus,
      updatedAt: person.updatedAt,
    });
    return {
      workspace: "Assist With Family History",
      privacy: "Private owner vault. Living-person notes and unreviewed private context are not returned in broad discovery.",
      recentPeople: people.slice(0, limit).map(personSummary),
      recentStories: stories.slice(0, limit).map((story) => ({ id: story._id, title: story.title, type: story.type, status: story.status, personId: story.personId, updatedAt: story.updatedAt })),
      openResearchTasks: tasks.filter((task) => task.status !== "done").slice(0, limit).map((task) => ({ id: task._id, title: task.title, type: task.type, status: task.status, priority: task.priority, personId: task.personId, updatedAt: task.updatedAt })),
      recentFindings: findings.slice(0, limit).map((finding) => ({ id: finding._id, entityType: finding.entityType, entityId: finding.entityId, status: finding.status, summary: finding.summary, updatedAt: finding.updatedAt })),
      queue: queueItems.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map((item) => ({ id: item._id, state: item.state, condition: item.condition, priority: item.priority, summary: item.summary, version: item.version, updatedAt: item.updatedAt })),
      truncated: people.length > limit || stories.length > limit || tasks.filter((task) => task.status !== "done").length > limit || taskScan.truncated || findingScan.truncated || storyScan.truncated || findings.length > limit || queueItems.length > limit,
      nextRecommendedTool: "search_family_history",
    };
  },
});

export const search = internalQuery({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    query: v.string(),
    kinds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    const grant = await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: "family_history_search", input: {} });
    const scope = await discoveryScope(ctx, owner, grant!);
    const needle = args.query.trim().toLowerCase();
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 25), FAMILY_HISTORY_MCP_LIMITS.searchLimit));
    const scan = FAMILY_HISTORY_MCP_LIMITS.searchScanPerType;
    const kinds = new Set(args.kinds?.length ? args.kinds : ["person", "source", "place", "topic", "story", "research_task", "research_finding", "event"]);
    if (!scope.wholeWorkspace) {
      // Workspace records nothing here can attribute to an approved person.
      for (const kind of ["source", "place", "topic", "event"]) kinds.delete(kind);
    }
    let scanTruncated = false;
    const results: Array<Record<string, unknown>> = [];
    const add = (kind: string, rows: Array<Record<string, unknown>>) => {
      for (const row of rows) if (results.length < limit) results.push({ kind, ...row });
    };
    if (kinds.has("person")) {
      const rows = await discoverablePeople(ctx, owner, scope, scan + 1);
      scanTruncated ||= rows.length > scan;
      add("person", rows.filter((row) => `${row.name.given} ${row.name.surname} ${(row.alternateNames ?? []).map((name) => `${name.given} ${name.surname}`).join(" ")} ${(row.tags ?? []).join(" ")}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, name: `${row.name.given} ${row.name.surname}`.trim(), living: row.living, researchStatus: row.researchStatus, updatedAt: row.updatedAt })));
    }
    if (kinds.has("source") && results.length < limit) {
      const rows = await ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      scanTruncated ||= rows.length > scan;
      add("source", rows.filter((row) => `${row.title} ${row.repository ?? ""} ${row.author ?? ""} ${row.type}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, title: row.title, type: row.type, repository: row.repository, updatedAt: row.updatedAt })));
    }
    if (kinds.has("story") && results.length < limit) {
      const scanned = await discoveryRows(ctx, owner, scope, "stories", scan + 1);
      const rows = scanned.rows;
      scanTruncated ||= scanned.truncated;
      add("story", rows.filter((row) => personInScope(scope, row.personId) && `${row.title} ${(row.tags ?? []).join(" ")} ${row.type}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, title: row.title, type: row.type, status: row.status, personId: row.personId, updatedAt: row.updatedAt })));
    }
    if (kinds.has("research_task") && results.length < limit) {
      const scanned = await discoveryRows(ctx, owner, scope, "researchTasks", scan + 1);
      const rows = scanned.rows;
      scanTruncated ||= scanned.truncated;
      add("research_task", rows.filter((row) => personInScope(scope, row.personId) && `${row.title} ${row.description ?? ""} ${row.notes ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, title: row.title, status: row.status, priority: row.priority, personId: row.personId, updatedAt: row.updatedAt })));
    }
    if (kinds.has("research_finding") && results.length < limit) {
      const scanned = await discoveryRows(ctx, owner, scope, "researchLog", scan + 1);
      const rows = scanned.rows;
      scanTruncated ||= scanned.truncated;
      add("research_finding", rows.filter((row) => (scope.wholeWorkspace || (row.entityType === "person" && personInScope(scope, row.entityId))) && `${row.summary} ${row.details ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, summary: row.summary, entityType: row.entityType, entityId: row.entityId, status: row.status, updatedAt: row.updatedAt })));
    }
    if (kinds.has("event") && results.length < limit) {
      const rows = await ctx.db.query("events").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      scanTruncated ||= rows.length > scan;
      add("event", rows.filter((row) => `${row.type} ${row.customType ?? ""} ${row.description ?? ""} ${row.place?.original ?? ""} ${row.date?.original ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, type: row.type, customType: row.customType, date: row.date, place: row.place, description: row.description, updatedAt: row.updatedAt })));
    }
    if (kinds.has("place") && results.length < limit) {
      const rows = await ctx.db.query("places").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      scanTruncated ||= rows.length > scan;
      add("place", rows.filter((row) => `${row.name} ${row.fullName} ${row.type} ${(row.alternateNames ?? []).map((name) => name.name).join(" ")}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, name: row.name, fullName: row.fullName, type: row.type, parentId: row.parentId, updatedAt: row.updatedAt })));
    }
    if (kinds.has("topic") && results.length < limit) {
      const rows = await ctx.db.query("topics").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      scanTruncated ||= rows.length > scan;
      add("topic", rows.filter((row) => `${row.name} ${row.kind} ${(row.alternateNames ?? []).join(" ")} ${row.description ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, name: row.name, kind: row.kind, updatedAt: row.updatedAt })));
    }
    return { query: args.query, results, limit, truncated: scanTruncated || results.length === limit, nextRecommendedTool: "get_family_history_context" };
  },
});

export const getRecordContext = internalQuery({
  args: { principal: principalValidator, kind: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    const max = FAMILY_HISTORY_MCP_LIMITS.contextRows;
    if (args.kind === "person") {
      const person = await owned(ctx, "persons", args.id, owner, "Person");
      const [asPerson1, asPerson2, personEventLinks, stories, tasks, findings] = await Promise.all([
        ctx.db.query("relationships").withIndex("by_person1", (q) => q.eq("person1", person._id)).take(max + 1),
        ctx.db.query("relationships").withIndex("by_person2", (q) => q.eq("person2", person._id)).take(max + 1),
        ctx.db.query("personEvents").withIndex("by_person", (q) => q.eq("personId", person._id)).take(max + 1),
        ctx.db.query("stories").withIndex("by_person", (q) => q.eq("personId", person._id)).order("desc").take(max + 1),
        ctx.db.query("researchTasks").withIndex("by_person", (q) => q.eq("personId", person._id)).order("desc").take(max + 1),
        ctx.db.query("researchLog").withIndex("by_entity", (q) => q.eq("entityType", "person").eq("entityId", String(person._id))).order("desc").take(max + 1),
      ]);
      const relationships = [...asPerson1, ...asPerson2]
        .filter((row) => matchesVaultOwner(row.vaultOwnerId, owner))
        .slice(0, max);
      const roles = personEventLinks.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max);
      const events = (await Promise.all(roles.map((role) => ctx.db.get(role.eventId))))
        .filter((row): row is Doc<"events"> => Boolean(row && matchesVaultOwner(row.vaultOwnerId, owner)));
      const citationLinks = (await ctx.db
        .query("citationLinks")
        .withIndex("by_target", (q) => q.eq("targetType", "person").eq("targetId", String(person._id)))
        .take(max + 1))
        .filter((row) => matchesVaultOwner(row.vaultOwnerId, owner));
      const citations = (await Promise.all(citationLinks.slice(0, max).map((link) => ctx.db.get(link.citationId))))
        .filter((row): row is Doc<"citations"> => Boolean(row && matchesVaultOwner(row.vaultOwnerId, owner)));
      const sources = (await Promise.all(citations.map((citation) => ctx.db.get(citation.sourceId))))
        .filter((row): row is Doc<"sources"> => Boolean(row && matchesVaultOwner(row.vaultOwnerId, owner)));
      return {
        kind: "person",
        person,
        relationships,
        events,
        eventRoles: roles,
        evidence: { citations, links: citationLinks.slice(0, max), sources },
        stories: stories.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max),
        researchTasks: tasks.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max),
        researchFindings: findings.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max),
        truncated: [asPerson1, asPerson2, personEventLinks, stories, tasks, findings, citationLinks].some((rows) => rows.length > max),
      };
    }
    if (args.kind === "story") {
      const story = await owned(ctx, "stories", args.id, owner, "Story");
      const [person, relationship, citations, reviews] = await Promise.all([
        story.personId ? ctx.db.get(story.personId) : null,
        story.relationshipId ? ctx.db.get(story.relationshipId) : null,
        Promise.all(story.citationIds.slice(0, max).map((citationId) => ctx.db.get(citationId))),
        ctx.db.query("storyReviewEvents").withIndex("by_story", (q) => q.eq("storyId", story._id)).order("desc").take(max + 1),
      ]);
      return {
        kind: "story",
        story,
        person: person && matchesVaultOwner(person.vaultOwnerId, owner) ? person : null,
        relationship: relationship && matchesVaultOwner(relationship.vaultOwnerId, owner) ? relationship : null,
        citations: citations.filter((row): row is Doc<"citations"> => Boolean(row && matchesVaultOwner(row.vaultOwnerId, owner))),
        reviewEvents: reviews.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max),
        truncated: story.citationIds.length > max || reviews.length > max,
      };
    }
    if (args.kind === "source") {
      const source = await owned(ctx, "sources", args.id, owner, "Source");
      const citations = (await ctx.db.query("citations").withIndex("by_source", (q) => q.eq("sourceId", source._id)).take(max + 1)).filter((row) => matchesVaultOwner(row.vaultOwnerId, owner));
      const links = (await Promise.all(citations.slice(0, max).map((citation) => ctx.db.query("citationLinks").withIndex("by_citation", (q) => q.eq("citationId", citation._id)).take(max)))).flat().filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max);
      const [contents, personas, facts, related] = await Promise.all([
        ctx.db.query("sourceContents").withIndex("by_source", (q) => q.eq("sourceId", source._id)).take(max + 1),
        ctx.db.query("recordPersonas").withIndex("by_source", (q) => q.eq("sourceId", source._id)).take(max + 1),
        ctx.db.query("sourceFacts").withIndex("by_source", (q) => q.eq("sourceId", source._id)).take(max + 1),
        connectionsFor(ctx, owner, "source", String(source._id), max),
      ]);
      const ownedContents = contents.filter((row) => row.vaultOwnerId === owner).slice(0, max);
      return {
        kind: "source",
        source,
        // Original content first and verbatim. Long texts are cut here; read one
        // in full with kind "source_content".
        contents: ownedContents.map((row) => contentForRead(row, FAMILY_HISTORY_MCP_LIMITS.contentPreviewChars)),
        personas: personas.filter((row) => row.vaultOwnerId === owner).slice(0, max),
        claims: facts.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max),
        citations: citations.slice(0, max),
        links,
        connections: related.connections,
        truncated: citations.length > max || links.length === max || contents.length > max || personas.length > max || facts.length > max || related.truncated,
      };
    }
    if (args.kind === "source_content") {
      const content = await owned(ctx, "sourceContents", args.id, owner, "Source content");
      return { kind: "source_content", content: contentForRead(content, FAMILY_HISTORY_MCP_LIMITS.sourceContentText) };
    }
    if (args.kind === "place") {
      const place = await owned(ctx, "places", args.id, owner, "Place");
      const [parent, children, events, related] = await Promise.all([
        place.parentId ? ctx.db.get(place.parentId) : null,
        ctx.db.query("places").withIndex("by_parent", (q) => q.eq("parentId", place._id)).take(max + 1),
        ctx.db.query("events").withIndex("by_place", (q) => q.eq("place.placeId", place._id)).take(max + 1),
        connectionsFor(ctx, owner, "place", String(place._id), max),
      ]);
      return {
        kind: "place",
        place,
        parent: parent && matchesVaultOwner(parent.vaultOwnerId, owner) ? { id: parent._id, name: parent.name, fullName: parent.fullName, type: parent.type } : null,
        children: children.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max).map((row) => ({ id: row._id, name: row.name, type: row.type })),
        events: events.filter((row) => matchesVaultOwner(row.vaultOwnerId, owner)).slice(0, max).map((row) => ({ id: row._id, type: row.type, customType: row.customType, date: row.date, description: row.description })),
        connections: related.connections,
        truncated: children.length > max || events.length > max || related.truncated,
      };
    }
    if (args.kind === "topic") {
      const topic = await owned(ctx, "topics", args.id, owner, "Topic");
      const related = await connectionsFor(ctx, owner, "topic", String(topic._id), max);
      return {
        kind: "topic",
        label: "Historical context. Not evidence about any particular person.",
        topic,
        connections: related.connections,
        truncated: related.truncated,
      };
    }
    if (args.kind === "event") {
      const event = await owned(ctx, "events", args.id, owner, "Event");
      const roles = (await ctx.db.query("personEvents").withIndex("by_event", (q) => q.eq("eventId", event._id)).take(max + 1)).filter((row) => matchesVaultOwner(row.vaultOwnerId, owner));
      const people = await Promise.all(roles.slice(0, max).map((role) => ctx.db.get(role.personId)));
      return { kind: "event", event, roles: roles.slice(0, max), people: people.filter(Boolean).map((person: any) => ({ id: person._id, name: `${person.name.given} ${person.name.surname}`.trim(), living: person.living })), truncated: roles.length > max };
    }
    if (args.kind === "relationship") {
      const relationship = await owned(ctx, "relationships", args.id, owner, "Relationship");
      const [person1, person2] = await Promise.all([ctx.db.get(relationship.person1), ctx.db.get(relationship.person2)]);
      return { kind: "relationship", relationship, people: [person1, person2].filter(Boolean).map((person: any) => ({ id: person._id, name: `${person.name.given} ${person.name.surname}`.trim(), living: person.living })) };
    }
    if (args.kind === "research_task") return { kind: args.kind, task: await owned(ctx, "researchTasks", args.id, owner, "Research task") };
    if (args.kind === "research_finding") return { kind: args.kind, finding: await owned(ctx, "researchLog", args.id, owner, "Research finding") };
    machineError("VALIDATION_ERROR", "Unsupported context kind.", "Use person, story, source, source_content, place, topic, event, relationship, research_task, or research_finding.");
  },
});

export const savePerson = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_person" }, async (owner, provenance) => ({ result: { person: await savePersonRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, new Map(), args.input), provenance) }, detail: "Saved a person record through MCP." })),
});

export const saveRelationship = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_relationship" }, async (owner, provenance) => ({ result: { relationship: await saveRelationshipRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, new Map(), args.input), provenance) }, detail: "Saved a relationship record through MCP." })),
});

export const saveEvent = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_event" }, async (owner) => ({ result: { event: await saveEventRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, new Map(), args.input)) }, detail: "Saved an event and additive person roles through MCP." })),
});

export const saveSourceEvidence = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_source_evidence" }, async (owner, provenance) => ({ result: { evidence: await saveSourceEvidenceRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, new Map(), args.input), provenance) }, detail: "Saved source, citation, evidence links, and source facts through MCP." })),
});

export const saveResearchWork = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_research_work" }, async (owner, provenance) => ({ result: { research: await saveResearchRecord(ctx, owner, args.input, provenance) }, detail: "Saved research task or finding through MCP." })),
});

export const saveStoryWork = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_story_work" }, async (owner) => ({ result: { story: await saveStoryRecord(ctx, owner, args.input) }, detail: "Saved private story work through MCP." })),
});

export const saveCompleteResult = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_complete_result" }, async (owner, provenance) => {
    const cap = FAMILY_HISTORY_MCP_LIMITS.completeResultRowsPerKind;
    for (const [kind, rows] of Object.entries({ events: args.input.events ?? [], relationships: args.input.relationships ?? [], evidence: args.input.evidence ?? [], stories: args.input.stories ?? [] })) {
      if (!Array.isArray(rows) || rows.length > cap) machineError("VALIDATION_ERROR", `Complete result ${kind} exceed the safe batch limit.`, `Use at most ${cap} ${kind} per complete result or split the work.`);
    }
    if (args.input.personId) await owned(ctx, "persons", args.input.personId, owner, "Complete-result person");
    // Any placeCreateKey here must name a place saved by an earlier call.
    args = { ...args, input: await resolvePlaceKeys(ctx, owner, new Map(), args.input) };
    const results: Record<string, unknown> = {};
    if (args.input.person) results.person = await savePersonRecord(ctx, owner, args.input.person, provenance);
    const relationships = [];
    for (const item of args.input.relationships ?? []) relationships.push(await saveRelationshipRecord(ctx, owner, item, provenance));
    results.relationships = relationships;
    const events = [];
    for (const item of args.input.events ?? []) events.push(await saveEventRecord(ctx, owner, item));
    results.events = events;
    const evidence = [];
    for (const item of args.input.evidence ?? []) evidence.push(await saveSourceEvidenceRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, new Map(), item), provenance));
    results.evidence = evidence;
    if (args.input.research) results.research = await saveResearchRecord(ctx, owner, args.input.research, provenance);
    const stories = [];
    for (const item of args.input.stories ?? []) stories.push(await saveStoryRecord(ctx, owner, item));
    results.stories = stories;
    return { result: { saved: results, summary: cleanText(args.input.summary, "complete result summary", 1_000, true) }, detail: "Saved one complete Family History result atomically through MCP." };
  }),
});

/* ------------------------------------------------------------------- batch */

/**
 * Resolve a person reference that may name a person created in THIS call.
 *
 * A census page is the real case: an AI extracts a household, creates a dozen
 * people, and immediately needs to relate them. Making it round-trip for ids
 * would mean a dozen approvals and a dozen chances to drift. So relationship,
 * event, evidence, and story items may name a person by the `createKey` used
 * earlier in the same call — an index into the caller's own arrays, never a
 * guessed id.
 */
async function resolveBatchPerson(
  ctx: MutationCtx,
  owner: string,
  batch: Map<string, string>,
  ref: { id?: unknown; createKey?: unknown },
  label: string,
): Promise<string> {
  if (typeof ref.id === "string" && ref.id.trim()) return ref.id.trim();
  if (typeof ref.createKey === "string" && ref.createKey.trim()) {
    const key = ref.createKey.trim();
    const inBatch = batch.get(key);
    if (inBatch) return inBatch;
    const mapping = await mappedRecord(ctx, owner, "person", key);
    if (mapping) return mapping.recordId;
    machineError(
      "VALIDATION_ERROR",
      `${label} names a createKey that was not created in this call and does not already exist.`,
      "Put the person in the people array of this same call, or use an id returned by search or context.",
    );
  }
  machineError(
    "VALIDATION_ERROR",
    `${label} needs either a person id or the createKey of a person in this call.`,
    "Add personId, or add the person to the people array and reference its createKey.",
  );
}

type BatchItemResult = {
  index: number;
  createKey?: string;
  id?: string;
  status: "created" | "updated" | "skipped" | "failed";
  reason?: string;
  whatToDo?: string;
};

function failureOf(error: unknown, index: number, createKey?: string): BatchItemResult {
  const raw = error instanceof Error ? error.message : String(error);
  const marker = "MCP_FAMILY_HISTORY_ERROR:";
  const at = raw.indexOf(marker);
  if (at >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(at + marker.length)) as {
        code?: string;
        message?: string;
        recovery?: string;
      };
      return {
        index,
        createKey,
        status: "failed",
        reason: `${parsed.code ?? "INTERNAL_ERROR"}: ${parsed.message ?? "This row could not be saved."}`,
        whatToDo: parsed.recovery ?? "Correct this row and send it again on its own.",
      };
    } catch {
      /* fall through to the stable shape below */
    }
  }
  return {
    index,
    createKey,
    status: "failed",
    reason: "INTERNAL_ERROR: this row could not be saved.",
    whatToDo: "Correct this row and send it again on its own. The rows that succeeded are already saved.",
  };
}

/**
 * One call, one approval, one transaction, per-item results.
 *
 * Failures are caught INSIDE the mutation on purpose: one bad row must not
 * discard a good pass. A partial answer with its gaps named beats a refusal.
 * Use save_complete_result when the caller genuinely wants all-or-nothing.
 */
export const saveRecords = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "family_history_save_records" }, async (owner, provenance) => {
    const input = args.input ?? {};
    const caps: Array<[string, number]> = [
      ["people", FAMILY_HISTORY_MCP_LIMITS.batchPeople],
      ["relationships", FAMILY_HISTORY_MCP_LIMITS.batchRelationships],
      ["events", FAMILY_HISTORY_MCP_LIMITS.batchEvents],
      ["evidence", FAMILY_HISTORY_MCP_LIMITS.batchEvidence],
      ["stories", FAMILY_HISTORY_MCP_LIMITS.batchStories],
      ["places", FAMILY_HISTORY_MCP_LIMITS.batchPlaces],
      ["topics", FAMILY_HISTORY_MCP_LIMITS.batchTopics],
      ["connections", FAMILY_HISTORY_MCP_LIMITS.batchConnections],
    ];
    for (const [key, cap] of caps) {
      const rows = input[key] ?? [];
      if (!Array.isArray(rows)) {
        machineError("VALIDATION_ERROR", `${key} must be a list.`, `Send ${key} as an array or omit it.`);
      }
      if (rows.length > cap) {
        machineError(
          "VALIDATION_ERROR",
          `This batch has more ${key} than one call may carry.`,
          `Send at most ${cap} ${key} per call and continue in a second call with a new operationId.`,
        );
      }
    }

    const batchPeople = new Map<string, string>();
    const batchPlaces = new Map<string, string>();
    const batchTopics = new Map<string, string>();
    const batchEvents = new Map<string, string>();
    const batchSources = new Map<string, string>();
    const batchStories = new Map<string, string>();
    const results: Record<string, BatchItemResult[]> = {
      places: [], topics: [], people: [], relationships: [], events: [], evidence: [], stories: [], connections: [],
    };
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const record = (kind: string, item: BatchItemResult) => {
      results[kind].push(item);
      counts[item.status] += 1;
    };

    // Places first: a source, an event or a person's birth may name a place
    // saved in this same call by its createKey. Parents before children is the
    // caller's order to keep.
    for (const [index, item] of (input.places ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const saved = await savePlaceRecord(ctx, owner, item, provenance, batchPlaces);
        record("places", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : item?.mode === "create" ? "skipped" : "updated",
        });
      } catch (error) {
        record("places", failureOf(error, index, createKey));
      }
    }

    for (const [index, item] of (input.topics ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const saved = await saveTopicRecord(ctx, owner, item, provenance, batchPlaces, batchTopics);
        record("topics", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : item?.mode === "create" ? "skipped" : "updated",
        });
      } catch (error) {
        record("topics", failureOf(error, index, createKey));
      }
    }

    for (const [index, item] of (input.people ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const saved = await savePersonRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, batchPlaces, item), provenance);
        if (createKey) batchPeople.set(createKey, String(saved.id));
        record("people", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : item?.mode === "create" ? "skipped" : "updated",
          ...(saved.created || item?.mode !== "create"
            ? {}
            : { reason: "Already saved under this createKey.", whatToDo: "Nothing to do; the earlier record was reused." }),
        });
      } catch (error) {
        record("people", failureOf(error, index, createKey));
      }
    }

    for (const [index, item] of (input.relationships ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const resolved = { ...item };
        if (item?.mode === "create") {
          resolved.person1 = await resolveBatchPerson(ctx, owner, batchPeople, { id: item.person1, createKey: item.person1CreateKey }, "person1");
          resolved.person2 = await resolveBatchPerson(ctx, owner, batchPeople, { id: item.person2, createKey: item.person2CreateKey }, "person2");
        }
        delete resolved.person1CreateKey;
        delete resolved.person2CreateKey;
        const saved = await saveRelationshipRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, batchPlaces, resolved), provenance);
        record("relationships", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : item?.mode === "create" ? "skipped" : "updated",
        });
      } catch (error) {
        record("relationships", failureOf(error, index, createKey));
      }
    }

    for (const [index, item] of (input.events ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const resolved = { ...item };
        if (Array.isArray(item?.personRoles)) {
          resolved.personRoles = [];
          for (const role of item.personRoles) {
            resolved.personRoles.push({
              role: role.role,
              personId: await resolveBatchPerson(ctx, owner, batchPeople, { id: role.personId, createKey: role.personCreateKey }, "personRoles.personId"),
            });
          }
        }
        const saved = await saveEventRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, batchPlaces, resolved));
        if (createKey) batchEvents.set(createKey, String(saved.id));
        record("events", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : item?.mode === "create" ? "skipped" : "updated",
        });
      } catch (error) {
        record("events", failureOf(error, index, createKey));
      }
    }

    for (const [index, item] of (input.evidence ?? []).entries()) {
      const createKey = typeof item?.source?.createKey === "string" ? item.source.createKey : undefined;
      try {
        const resolved = { ...item };
        if (Array.isArray(item?.links)) {
          resolved.links = [];
          for (const link of item.links) {
            resolved.links.push(
              link.targetType === "person"
                ? { ...link, targetId: await resolveBatchPerson(ctx, owner, batchPeople, { id: link.targetId, createKey: link.targetCreateKey }, "links.targetId"), targetCreateKey: undefined }
                : link,
            );
          }
          resolved.links = resolved.links.map((link: any) => {
            const copy = { ...link };
            delete copy.targetCreateKey;
            return copy;
          });
        }
        if (Array.isArray(item?.facts)) {
          resolved.facts = [];
          for (const fact of item.facts) {
            const copy = { ...fact };
            copy.personId = await resolveBatchPerson(ctx, owner, batchPeople, { id: fact.personId, createKey: fact.personCreateKey }, "facts.personId");
            delete copy.personCreateKey;
            resolved.facts.push(copy);
          }
        }
        if (Array.isArray(item?.personas)) {
          resolved.personas = [];
          for (const persona of item.personas) {
            const copy = { ...persona };
            if (persona.personId || persona.personCreateKey) {
              copy.personId = await resolveBatchPerson(ctx, owner, batchPeople, { id: persona.personId, createKey: persona.personCreateKey }, "personas.personId");
            }
            delete copy.personCreateKey;
            resolved.personas.push(copy);
          }
        }
        const saved = await saveSourceEvidenceRecord(ctx, owner, await resolvePlaceKeys(ctx, owner, batchPlaces, resolved), provenance);
        if (createKey) batchSources.set(createKey, String(saved.sourceId));
        record("evidence", {
          index,
          createKey,
          id: String(saved.citationId),
          status: saved.sourceCreated || saved.citationCreated ? "created" : "updated",
        });
      } catch (error) {
        record("evidence", failureOf(error, index, createKey));
      }
    }

    for (const [index, item] of (input.stories ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const resolved = { ...item };
        if (item?.personCreateKey || item?.personId) {
          resolved.personId = await resolveBatchPerson(ctx, owner, batchPeople, { id: item.personId, createKey: item.personCreateKey }, "story.personId");
        }
        delete resolved.personCreateKey;
        const saved = await saveStoryRecord(ctx, owner, resolved);
        if (createKey) batchStories.set(createKey, String(saved.id));
        record("stories", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : item?.mode === "create" ? "skipped" : "updated",
        });
      } catch (error) {
        record("stories", failureOf(error, index, createKey));
      }
    }

    // Connections last, so either end may be anything saved above.
    const connectionKeys = new Map<string, Map<string, string>>([
      ["person", batchPeople], ["place", batchPlaces], ["topic", batchTopics],
      ["event", batchEvents], ["source", batchSources], ["story", batchStories],
    ]);
    for (const [index, item] of (input.connections ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const saved = await saveConnectionRecord(ctx, owner, item, provenance, connectionKeys);
        record("connections", {
          index,
          createKey,
          id: String(saved.id),
          status: saved.created ? "created" : "skipped",
        });
      } catch (error) {
        record("connections", failureOf(error, index, createKey));
      }
    }

    const summary = cleanText(input.summary, "batch summary", 1_000, true)!;
    return {
      result: {
        summary,
        results,
        counts,
        provenance: {
          clientId: args.principal.clientId,
          grantId: args.grantId ?? null,
          at: Date.now(),
        },
        note: counts.failed > 0
          ? "Some rows did not save. Everything else in this call did. Fix the failed rows and send only those again with a new operationId."
          : "Every row in this call was saved.",
      },
      detail: `Saved a batch through MCP: ${counts.created} created, ${counts.updated} updated, ${counts.skipped} already present, ${counts.failed} failed.`,
    };
  }),
});

/* ------------------------------------------------- appended source content */

/**
 * Add a transcription, translation, extract, full text or AI reading to a
 * source that already exists. Append-only: nothing here edits earlier content.
 */
export const addSourceContent = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "family_history_add_source_content" }, async (owner, provenance) => {
    const source = await owned(ctx, "sources", args.input?.sourceId, owner, "Source");
    const contents = args.input?.contents;
    if (!Array.isArray(contents) || contents.length === 0 || contents.length > FAMILY_HISTORY_MCP_LIMITS.contentsPerCall) {
      machineError("VALIDATION_ERROR", "Send between one and the allowed number of contents.", `Send 1 to ${FAMILY_HISTORY_MCP_LIMITS.contentsPerCall} contents per call.`);
    }
    const contentIds = await appendSourceContents(ctx, owner, source._id, contents, provenance);
    await ctx.db.patch(source._id, { updatedAt: Date.now() });
    return { result: { sourceId: source._id, contentIds }, detail: `Added ${contentIds.length} original content item(s) to a source through MCP.` };
  }),
});

/** The records-as-written and connections that sit beside a person's workspace. */
export const getPersonOriginals = internalQuery({
  args: { principal: principalValidator, personId: v.string() },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    const max = FAMILY_HISTORY_MCP_LIMITS.contextRows;
    const person = await owned(ctx, "persons", args.personId, owner, "Person");
    const [personas, related] = await Promise.all([
      ctx.db.query("recordPersonas").withIndex("by_person", (q) => q.eq("personId", person._id)).take(max + 1),
      connectionsFor(ctx, owner, "person", String(person._id), max),
    ]);
    return {
      recordPersonas: personas.filter((row) => row.vaultOwnerId === owner && row.linkState !== "rejected").slice(0, max),
      connections: related.connections,
      truncated: personas.length > max || related.truncated,
    };
  },
});
