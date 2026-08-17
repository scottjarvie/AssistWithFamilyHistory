/* eslint-disable @typescript-eslint/no-explicit-any -- Internal inputs are validated by the public MCP Zod schemas before dispatch. */
import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";
import { matchesVaultOwner } from "./vaultCore";
import { assertGrantPermits } from "./mcpGrants";
import { mayAiSetSourceFactStatus } from "../lib/vault/conflictResolution";

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
  return { ...(JSON.parse(row.resultJson) as Record<string, unknown>), deduplicated: true };
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
  await assertGrantPermits(ctx, {
    owner,
    grantId: args.grantId,
    toolName: args.toolName,
    input: args.input,
  });
  const operationId = cleanText(args.operationId, "operationId", FAMILY_HISTORY_MCP_LIMITS.operationId, true)!;
  const replay = await replayReceipt(ctx, owner, operationId, args.toolName, args.requestHash);
  if (replay) return replay;
  const completed = await work(owner, mcpProvenance(args.principal, operationId));
  return finishOperation(ctx, { ...args, owner, operationId, ...completed });
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

async function saveSourceEvidenceRecord(ctx: MutationCtx, owner: string, input: any) {
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
    const patch = pickDefined(sourceInput, ["title", "type", "repository", "url", "author", "publicationDate", "coverage", "notes"]);
    if (patch.notes !== undefined) patch.notes = cleanText(patch.notes, "source notes", FAMILY_HISTORY_MCP_LIMITS.notes);
    await ctx.db.patch(row._id, { ...patch, updatedAt: now });
    sourceId = row._id;
  }

  const citationInput = input.citation;
  let citationId: Id<"citations">;
  let citationCreated = false;
  if (citationInput.mode === "create") {
    const key = cleanKey(citationInput.createKey, "citation.createKey");
    const mapping = await mappedRecord(ctx, owner, "citation", key);
    if (mapping) citationId = (await owned(ctx, "citations", mapping.recordId, owner, "Citation"))._id;
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

  const factIds: string[] = [];
  for (const fact of input.facts ?? []) {
    await owned(ctx, "persons", fact.personId, owner, "Source fact person");
    const factKey = cleanKey(fact.factKey, "factKey");
    const importKey = `mcp:${factKey}`;
    const mapping = await mappedRecord(ctx, owner, "source_fact", factKey);
    const existing = mapping
      ? await owned(ctx, "sourceFacts", mapping.recordId, owner, "Source fact")
      : null;
    // AWF-0046: a connected AI may raise a conflict and may keep working on a
    // conflicting fact, but it may not take one OUT of conflict. Settling a
    // disagreement between two records is the researcher's judgment call, and
    // the consent screen for this permission already promises the person that
    // it "cannot accept a conclusion for you" (lib/mcp/catalog.ts). Without
    // this guard an AI could resolve a conflict simply by re-saving the fact
    // with a different status.
    if (!mayAiSetSourceFactStatus(existing?.status, fact.status ?? "candidate")) {
      machineError(
        "FORBIDDEN",
        "This fact is flagged as a conflict, and only the person can decide which record to believe.",
        "Leave the status as \"conflict\" and propose your answer on the conflict_resolution research task with family_history_save_research_work, including the evidence on both sides. The person confirms it in the web app.",
      );
    }
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
  return { sourceId, citationId, sourceCreated, citationCreated, linkIds, factIds, updatedAt: now };
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

export const getBrief = internalQuery({
  args: { principal: principalValidator },
  handler: async (ctx, { principal }) => {
    const owner = ownerFromPrincipal(principal);
    const limit = FAMILY_HISTORY_MCP_LIMITS.briefRows;
    const researchScan = FAMILY_HISTORY_MCP_LIMITS.searchScanPerType;
    const [people, stories, tasks, findings, queueGroups] = await Promise.all([
      ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(limit + 1),
      ctx.db.query("stories").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(limit + 1),
      ctx.db.query("researchTasks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(researchScan + 1),
      ctx.db.query("researchLog").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(limit + 1),
      Promise.all(["needs_you", "working", "waiting_for_your_ai", "done"].map((state) =>
        ctx.db.query("queueItems").withIndex("by_owner_state_updated", (q) => q.eq("vaultOwnerId", owner).eq("state", state as any)).order("desc").take(4),
      )),
    ]);
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
      queue: queueGroups.flat().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map((item) => ({ id: item._id, state: item.state, condition: item.condition, priority: item.priority, summary: item.summary, version: item.version, updatedAt: item.updatedAt })),
      truncated: people.length > limit || stories.length > limit || tasks.filter((task) => task.status !== "done").length > limit || tasks.length > researchScan || findings.length > limit,
      nextRecommendedTool: "search_family_history",
    };
  },
});

export const search = internalQuery({
  args: {
    principal: principalValidator,
    query: v.string(),
    kinds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    const needle = args.query.trim().toLowerCase();
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 25), FAMILY_HISTORY_MCP_LIMITS.searchLimit));
    const scan = FAMILY_HISTORY_MCP_LIMITS.searchScanPerType;
    const kinds = new Set(args.kinds?.length ? args.kinds : ["person", "source", "story", "research_task", "research_finding", "event"]);
    const results: Array<Record<string, unknown>> = [];
    const add = (kind: string, rows: Array<Record<string, unknown>>) => {
      for (const row of rows) if (results.length < limit) results.push({ kind, ...row });
    };
    if (kinds.has("person")) {
      const rows = await ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      add("person", rows.filter((row) => `${row.name.given} ${row.name.surname} ${(row.alternateNames ?? []).map((name) => `${name.given} ${name.surname}`).join(" ")} ${(row.tags ?? []).join(" ")}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, name: `${row.name.given} ${row.name.surname}`.trim(), living: row.living, researchStatus: row.researchStatus, updatedAt: row.updatedAt })));
    }
    if (kinds.has("source") && results.length < limit) {
      const rows = await ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      add("source", rows.filter((row) => `${row.title} ${row.repository ?? ""} ${row.author ?? ""} ${row.type}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, title: row.title, type: row.type, repository: row.repository, updatedAt: row.updatedAt })));
    }
    if (kinds.has("story") && results.length < limit) {
      const rows = await ctx.db.query("stories").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      add("story", rows.filter((row) => `${row.title} ${(row.tags ?? []).join(" ")} ${row.type}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, title: row.title, type: row.type, status: row.status, personId: row.personId, updatedAt: row.updatedAt })));
    }
    if (kinds.has("research_task") && results.length < limit) {
      const rows = await ctx.db.query("researchTasks").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      add("research_task", rows.filter((row) => `${row.title} ${row.description ?? ""} ${row.notes ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, title: row.title, status: row.status, priority: row.priority, personId: row.personId, updatedAt: row.updatedAt })));
    }
    if (kinds.has("research_finding") && results.length < limit) {
      const rows = await ctx.db.query("researchLog").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      add("research_finding", rows.filter((row) => `${row.summary} ${row.details ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, summary: row.summary, entityType: row.entityType, entityId: row.entityId, status: row.status, updatedAt: row.updatedAt })));
    }
    if (kinds.has("event") && results.length < limit) {
      const rows = await ctx.db.query("events").withIndex("by_owner", (q) => q.eq("vaultOwnerId", owner)).order("desc").take(scan + 1);
      add("event", rows.filter((row) => `${row.type} ${row.customType ?? ""} ${row.description ?? ""} ${row.place?.original ?? ""} ${row.date?.original ?? ""}`.toLowerCase().includes(needle)).map((row) => ({ id: row._id, type: row.type, customType: row.customType, date: row.date, place: row.place, description: row.description, updatedAt: row.updatedAt })));
    }
    return { query: args.query, results, limit, truncated: results.length === limit, nextRecommendedTool: "get_family_history_context" };
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
      return { kind: "source", source, citations: citations.slice(0, max), links, truncated: citations.length > max || links.length === max };
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
    machineError("VALIDATION_ERROR", "Unsupported context kind.", "Use person, story, source, event, relationship, research_task, or research_finding.");
  },
});

export const savePerson = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_person" }, async (owner, provenance) => ({ result: { person: await savePersonRecord(ctx, owner, args.input, provenance) }, detail: "Saved a person record through MCP." })),
});

export const saveRelationship = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_relationship" }, async (owner, provenance) => ({ result: { relationship: await saveRelationshipRecord(ctx, owner, args.input, provenance) }, detail: "Saved a relationship record through MCP." })),
});

export const saveEvent = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_event" }, async (owner) => ({ result: { event: await saveEventRecord(ctx, owner, args.input) }, detail: "Saved an event and additive person roles through MCP." })),
});

export const saveSourceEvidence = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: "save_source_evidence" }, async (owner) => ({ result: { evidence: await saveSourceEvidenceRecord(ctx, owner, args.input) }, detail: "Saved source, citation, evidence links, and source facts through MCP." })),
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
    const results: Record<string, unknown> = {};
    if (args.input.person) results.person = await savePersonRecord(ctx, owner, args.input.person, provenance);
    const relationships = [];
    for (const item of args.input.relationships ?? []) relationships.push(await saveRelationshipRecord(ctx, owner, item, provenance));
    results.relationships = relationships;
    const events = [];
    for (const item of args.input.events ?? []) events.push(await saveEventRecord(ctx, owner, item));
    results.events = events;
    const evidence = [];
    for (const item of args.input.evidence ?? []) evidence.push(await saveSourceEvidenceRecord(ctx, owner, item));
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
    const results: Record<string, BatchItemResult[]> = {
      people: [], relationships: [], events: [], evidence: [], stories: [],
    };
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const record = (kind: string, item: BatchItemResult) => {
      results[kind].push(item);
      counts[item.status] += 1;
    };

    for (const [index, item] of (input.people ?? []).entries()) {
      const createKey = typeof item?.createKey === "string" ? item.createKey : undefined;
      try {
        const saved = await savePersonRecord(ctx, owner, item, provenance);
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
        const saved = await saveRelationshipRecord(ctx, owner, resolved, provenance);
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
        const saved = await saveEventRecord(ctx, owner, resolved);
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
        const saved = await saveSourceEvidenceRecord(ctx, owner, resolved);
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
