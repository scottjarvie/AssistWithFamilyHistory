/* eslint-disable @typescript-eslint/no-explicit-any -- Batch items are validated by the public MCP Zod schemas before dispatch. */
/**
 * Whole-tree import over MCP.
 *
 * A person's AI reads their tree on an outside site (FamilySearch first) and
 * sends it here: thousands of people with every name, fact, relationship,
 * source, citation, note and media reference. This module stores it.
 *
 *   begin  -> one resumable import session per tree (`treeImports`)
 *   batch  -> up to 500 records per call, keyed by outside ids, idempotent,
 *             optional dry run, per-item results, one activity row per batch
 *   get    -> progress, the AI's own resume cursor, recent batches, and the
 *             possible-duplicate suggestions the import raised
 *
 * Rules that hold everywhere:
 *   - The same outside id always lands on the same record. Re-sending a batch
 *     updates; it never duplicates.
 *   - A record the person (or anything other than an import) created is never
 *     overwritten. The import fills its blanks and reports what it kept.
 *   - Two people who might be the same person get a proposed `possibly_same_as`
 *     connection for the person to decide. Nothing is ever merged here.
 *   - This server never contacts the outside site. The AI does the reading.
 *
 * Plan: docs/planning/whole-tree-import-2026-10.md
 */
import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { canonicalJson, FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";
import {
  addCounts,
  childRelationTypeFor,
  chunkBatch,
  citationKeyFor,
  confidenceForQuality,
  countRecords,
  duplicateReason,
  emptyCounts,
  eventTypeFor,
  externalRecordKey,
  factKeyFor,
  sourceTypeFor,
  splitNames,
  TREE_IMPORT_LIMITS,
  withYear,
  yearOf,
  type ExternalId,
  type ImportCounts,
  type ItemResult,
  type TargetInput,
  type TreeImportItem,
} from "../lib/treeImport/model";
import { assertGrantPermits } from "./mcpGrants";
import {
  cleanText,
  machineError,
  operation,
  ownerFromPrincipal,
  principalValidator,
  type McpPrincipal,
} from "./mcpFamilyHistory";
import { matchesVaultOwner } from "./vaultCore";

const BEGIN_TOOL = "family_history_begin_tree_import";
const BATCH_TOOL = "family_history_import_tree_batch";

const self = (internal as any).treeImport;

/* ------------------------------------------------------------------ writer */

/**
 * Dry runs and real runs share one code path. A dry run gets a writer that
 * hands back placeholder ids and changes nothing, so "what would happen" is
 * computed by exactly the code that would make it happen.
 */
type Writer = {
  dryRun: boolean;
  insert<T extends TableNames>(table: T, doc: any): Promise<string>;
  patch(id: string, doc: Record<string, unknown>): Promise<void>;
};

function liveWriter(ctx: MutationCtx): Writer {
  return {
    dryRun: false,
    insert: async (table, doc) => String(await ctx.db.insert(table, doc)),
    patch: async (id, doc) => (ctx.db.patch as unknown as (id: string, doc: Record<string, unknown>) => Promise<void>)(id, doc),
  };
}

function dryWriter(): Writer {
  let counter = 0;
  return {
    dryRun: true,
    insert: async (table) => `dry:${table}:${(counter += 1)}`,
    patch: async () => {},
  };
}

/* ----------------------------------------------------------------- context */

type ImportProvenance = {
  actorKind: "chosen_ai";
  actorId: string;
  method: "import";
  evidenceStatus: "unsourced" | "source_linked";
  operationId: string;
  recordedAt: number;
};

type ChunkContext = {
  ctx: QueryCtx;
  w: Writer;
  owner: string;
  job: Doc<"treeImports">;
  provenance: ImportProvenance;
  /** Outside key -> vault id, for everything saved or planned in this run. */
  local: Map<string, string>;
  /** Keys a dry run planned to create in earlier chunks of the same batch. */
  planned: Set<string>;
  plannedNow: string[];
  duplicatesSuggested: number;
};

type RecordType = Doc<"mcpRecordKeys">["recordType"];

const RECORD_TYPE: Record<string, RecordType> = {
  person: "person",
  relationship: "relationship",
  source: "source",
  citation: "citation",
  note: "note",
  media: "media",
  fact: "event",
};

class ItemFailure extends Error {
  constructor(public readonly code: string, message: string, public readonly whatToDo: string) {
    super(message);
  }
}

function fail(code: string, message: string, whatToDo: string): never {
  throw new ItemFailure(code, message, whatToDo);
}

function requiredKey(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) fail("VALIDATION_ERROR", `${label} is required.`, `Send ${label} as the record's id on the outside site.`);
  const key = value.trim();
  if (key.length > TREE_IMPORT_LIMITS.key) fail("VALIDATION_ERROR", `${label} is too long.`, `Keep ${label} to ${TREE_IMPORT_LIMITS.key} characters.`);
  return key;
}

function clean<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function same(a: unknown, b: unknown): boolean {
  return canonicalJson(clean(a) ?? null) === canonicalJson(clean(b) ?? null);
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Created by a tree import, so a later import of the same tree may refresh it. */
function importOwned(row: { creationProvenance?: { method?: string } }): boolean {
  return row.creationProvenance?.method === "import";
}

/** A planned (dry-run) or not-yet-real id: never read from or written against. */
function isPlaceholder(id: string): boolean {
  return id.startsWith("planned:") || id.startsWith("dry:");
}

async function lookup(c: ChunkContext, singular: string, key: string, system: string = c.job.system): Promise<string | null> {
  const mapKey = externalRecordKey(system, singular, key);
  const local = c.local.get(mapKey);
  if (local) return local;
  if (c.planned.has(mapKey)) return `planned:${mapKey}`;
  const row = await c.ctx.db
    .query("mcpRecordKeys")
    .withIndex("by_owner_type_key", (q) =>
      q.eq("vaultOwnerId", c.owner).eq("recordType", RECORD_TYPE[singular]).eq("recordKey", mapKey),
    )
    .unique();
  return row?.recordId ?? null;
}

async function remember(c: ChunkContext, singular: string, key: string, recordId: string, system: string = c.job.system) {
  const mapKey = externalRecordKey(system, singular, key);
  c.local.set(mapKey, recordId);
  if (c.w.dryRun) {
    c.plannedNow.push(mapKey);
    return;
  }
  const now = Date.now();
  await c.w.insert("mcpRecordKeys", {
    vaultOwnerId: c.owner,
    recordType: RECORD_TYPE[singular],
    recordKey: mapKey,
    recordId,
    createdAt: now,
    updatedAt: now,
  });
}

async function ownedRow<T extends TableNames>(c: ChunkContext, table: T, id: string): Promise<Doc<T> | null> {
  if (isPlaceholder(id)) return null;
  const normalized = c.ctx.db.normalizeId(table, id);
  if (!normalized) return null;
  const row = await c.ctx.db.get(normalized as Id<T>);
  if (!row || !matchesVaultOwner((row as any).vaultOwnerId, c.owner)) return null;
  return row as Doc<T>;
}

function externalIdsFor(c: ChunkContext, key: string, otherIds: ExternalId[] | undefined, url?: string): ExternalId[] {
  const ids: ExternalId[] = [{ system: c.job.system, id: key, ...(url ? { url } : {}) }];
  for (const other of otherIds ?? []) {
    if (!ids.some((existing) => existing.system === other.system && existing.id === other.id)) ids.push(other);
  }
  return ids;
}

function mergeExternalIds(existing: ExternalId[] | undefined, incoming: ExternalId[]): ExternalId[] {
  const merged = [...(existing ?? [])];
  for (const id of incoming) {
    if (!merged.some((row) => row.system === id.system && row.id === id.id)) merged.push(id);
  }
  return merged;
}

type UpsertOutcome = { id: string; status: ItemResult["status"]; kept?: string[] };

/**
 * The one update rule. Import-owned rows take the outside values; anything
 * else only has its blanks filled, and every disagreement is reported back.
 */
async function upsertRow(
  c: ChunkContext,
  args: {
    table: TableNames;
    singular: string;
    key: string;
    existingId: string | null;
    linked?: boolean;
    doc: Record<string, unknown>;
    createOnly?: Record<string, unknown>;
  },
): Promise<UpsertOutcome> {
  const now = Date.now();
  if (!args.existingId) {
    const id = await c.w.insert(args.table, {
      vaultOwnerId: c.owner,
      ...clean(args.doc),
      ...args.createOnly,
      importJobId: c.job._id,
      creationProvenance: c.provenance,
      createdAt: now,
      updatedAt: now,
    });
    await remember(c, args.singular, args.key, id);
    return { id, status: "created" };
  }
  if (isPlaceholder(args.existingId)) return { id: args.existingId, status: "unchanged" };
  const row = await ownedRow(c, args.table, args.existingId);
  if (!row) fail("NOT_FOUND", "The record this outside id pointed to is gone.", "Send the record again under a new key, or ask the person what happened to it.");
  const patch: Record<string, unknown> = {};
  const kept: string[] = [];
  const owned = importOwned(row as any);
  for (const [field, value] of Object.entries(args.doc)) {
    if (value === undefined) continue;
    const current = (row as any)[field];
    if (field === "externalIds") {
      const merged = mergeExternalIds(current, value as ExternalId[]);
      if (!same(merged, current)) patch.externalIds = merged;
      continue;
    }
    if (same(current, value)) continue;
    if (owned || isEmpty(current)) patch[field] = value;
    else kept.push(field);
  }
  if (args.linked) await remember(c, args.singular, args.key, String(row._id));
  if (Object.keys(patch).length > 0) {
    await c.w.patch(String(row._id), { ...clean(patch), ...(owned ? { importJobId: c.job._id } : {}), updatedAt: now });
  }
  const status: ItemResult["status"] = args.linked ? "linked" : Object.keys(patch).length > 0 ? "updated" : "unchanged";
  return { id: String(row._id), status, ...(kept.length ? { kept } : {}) };
}

/* ----------------------------------------------------------------- persons */

function factDescription(fact: { value?: string; description?: string }) {
  if (fact.value && fact.description) return `${fact.value}. ${fact.description}`;
  return fact.value ?? fact.description;
}

async function importPerson(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  if (!Array.isArray(item?.names) || item.names.length === 0) fail("VALIDATION_ERROR", "A person needs at least one name.", "Send names with given and surname as the site shows them.");
  if (typeof item.living !== "boolean") fail("VALIDATION_ERROR", "living must be true or false.", "Say whether the site marks this person as living.");
  const facts: any[] = Array.isArray(item.facts) ? item.facts : [];
  const { name, alternateNames } = splitNames(item.names);
  if (!name.given && !name.surname) fail("VALIDATION_ERROR", "The preferred name is empty.", "Send at least a given name or a surname.");
  const embedded = (type: string) => {
    const fact = facts.find((row) => eventTypeFor(row?.type ?? "").type === type);
    if (!fact) return undefined;
    return clean({
      date: withYear(fact.date),
      place: fact.place?.original ? { original: fact.place.original } : undefined,
      description: factDescription(fact),
    });
  };

  let existingId = await lookup(c, "person", key);
  let linked = false;
  if (!existingId && c.job.system === "familysearch") {
    // People captured earlier by the browser extension carry the PID as fsId.
    const legacy = await c.ctx.db.query("persons").withIndex("by_fsId", (q) => q.eq("fsId", key)).take(10);
    const mine = legacy.find((row) => matchesVaultOwner(row.vaultOwnerId, c.owner));
    if (mine) {
      existingId = String(mine._id);
      linked = true;
    }
  }
  const otherIds: ExternalId[] = Array.isArray(item.otherIds) ? item.otherIds : [];
  if (!existingId) {
    // The same person imported earlier from another site, under that site's id.
    for (const other of otherIds) {
      const found = await lookup(c, "person", other.id, other.system.toLowerCase());
      if (found) {
        existingId = found;
        linked = true;
        break;
      }
    }
  }

  const doc = {
    name,
    alternateNames: alternateNames.length ? alternateNames : undefined,
    sex: item.sex,
    living: item.living,
    birth: embedded("birth"),
    death: embedded("death"),
    fsId: c.job.system === "familysearch" ? key : undefined,
    tags: item.tags,
    externalIds: externalIdsFor(c, key, item.otherIds, item.sourceUrl),
  };
  let duplicates: string[] = [];
  if (!existingId) duplicates = await duplicateCandidates(c, name, yearOf(doc.birth?.date));
  const saved = await upsertRow(c, {
    table: "persons",
    singular: "person",
    key,
    existingId,
    linked,
    doc,
    createOnly: { researchStatus: "basic", sex: item.sex ?? "unknown" },
  });
  if (saved.status === "created") {
    for (const candidate of duplicates) await suggestDuplicate(c, saved.id, candidate, name, yearOf(doc.birth?.date));
  }
  // Remember the person's ids on other sites too, so an import from there
  // lands on this same person instead of making a second one.
  for (const other of otherIds) {
    const system = other.system.toLowerCase();
    if (system === c.job.system && other.id === key) continue;
    const mapped = await lookup(c, "person", other.id, system);
    if (!mapped) await remember(c, "person", other.id, saved.id, system);
    else if (mapped !== saved.id) saved.kept = [...(saved.kept ?? []), `otherIds:${system}:${other.id}`];
  }

  for (const fact of facts.slice(0, TREE_IMPORT_LIMITS.factsPerPerson)) {
    await importFact(c, saved.id, key, fact);
  }
  return {
    key,
    status: saved.status,
    id: saved.id,
    ...(saved.kept ? { kept: saved.kept } : {}),
    ...(duplicates.length ? { possibleDuplicates: duplicates } : {}),
  };
}

async function importFact(c: ChunkContext, personId: string, personKey: string, fact: any) {
  if (typeof fact?.type !== "string" || !fact.type.trim()) return;
  const factKey = factKeyFor(personKey, fact);
  const mapped = eventTypeFor(fact.type);
  const existingId = await lookup(c, "fact", factKey);
  const saved = await upsertRow(c, {
    table: "events",
    singular: "fact",
    key: factKey,
    existingId,
    doc: {
      type: mapped.type,
      customType: mapped.customType,
      date: withYear(fact.date),
      place: fact.place?.original ? { original: fact.place.original } : undefined,
      description: factDescription(fact),
      externalIds: fact.key ? [{ system: c.job.system, id: String(fact.key) }] : undefined,
    },
    createOnly: { importKey: `import:${externalRecordKey(c.job.system, "fact", factKey)}` },
  });
  if (saved.status === "created") {
    await c.w.insert("personEvents", {
      vaultOwnerId: c.owner,
      personId,
      eventId: saved.id,
      role: "primary",
      createdAt: Date.now(),
    });
  }
}

async function duplicateCandidates(c: ChunkContext, name: { given: string; surname: string }, birthYear: number | undefined) {
  if (birthYear === undefined || !name.surname) return [];
  const rows = await c.ctx.db
    .query("persons")
    .withIndex("by_owner_surname_birth_year", (q) =>
      q.eq("vaultOwnerId", c.owner).eq("name.surname", name.surname).gte("birth.date.year", birthYear - 2).lte("birth.date.year", birthYear + 2),
    )
    .take(TREE_IMPORT_LIMITS.duplicateScanPerPerson);
  const found: string[] = [];
  for (const row of rows) {
    const reason = duplicateReason(
      { given: name.given, surname: name.surname, birthYear },
      { given: row.name.given, surname: row.name.surname, birthYear: row.birth?.date?.year },
    );
    if (reason) found.push(String(row._id));
    if (found.length >= TREE_IMPORT_LIMITS.duplicateCandidatesPerPerson) break;
  }
  return found;
}

async function suggestDuplicate(
  c: ChunkContext,
  personId: string,
  candidateId: string,
  name: { given: string; surname: string },
  birthYear: number | undefined,
) {
  const candidate = await ownedRow(c, "persons", candidateId);
  const reason = candidate
    ? duplicateReason({ given: name.given, surname: name.surname, birthYear }, { given: candidate.name.given, surname: candidate.name.surname, birthYear: candidate.birth?.date?.year })
    : null;
  const now = Date.now();
  await c.w.insert("connections", {
    vaultOwnerId: c.owner,
    from: { kind: "person", id: personId },
    to: { kind: "person", id: candidateId },
    relation: "possibly_same_as",
    reason: reason ?? "Same name and nearby birth year.",
    state: "proposed",
    importKey: `tree-import:${c.job._id}`,
    importJobId: c.job._id,
    creationProvenance: c.provenance,
    createdAt: now,
    updatedAt: now,
  });
  c.duplicatesSuggested += 1;
}

/* ----------------------------------------------------------- relationships */

async function personFor(c: ChunkContext, key: unknown, label: string): Promise<string> {
  const personKey = requiredKey(key, label);
  const id = await lookup(c, "person", personKey);
  if (!id) fail("MISSING_PERSON", `${label} ${personKey} has not been imported yet.`, "Send that person first, in this batch or an earlier one, then resend this row.");
  return id;
}

async function importRelationship(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  if (item.type !== "Couple" && item.type !== "ParentChild") fail("VALIDATION_ERROR", "type must be Couple or ParentChild.", "Send a couple or one parent-child link per row.");
  const person1 = await personFor(c, item.person1Key, "person1Key");
  const person2 = await personFor(c, item.person2Key, "person2Key");
  if (person1 === person2) fail("VALIDATION_ERROR", "A person cannot be related to themself.", "Check the two person keys.");
  let existingId = await lookup(c, "relationship", key);
  let linked = false;
  if (!existingId && !isPlaceholder(person1) && !isPlaceholder(person2)) {
    // A relationship the person already entered by hand is the same one.
    const rows = await c.ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", item.type).eq("person1", person1 as Id<"persons">))
      .take(50);
    const match = rows.find((row) => row.person2 === person2 && matchesVaultOwner(row.vaultOwnerId, c.owner));
    if (match) {
      existingId = String(match._id);
      linked = true;
    }
  }
  const facts = Array.isArray(item.facts) && item.facts.length
    ? item.facts.map((fact: any) => clean({
      type: String(fact.type).slice(0, 120),
      date: withYear(fact.date),
      place: fact.place?.original ? { original: fact.place.original } : undefined,
      description: fact.description,
    }))
    : undefined;
  const saved = await upsertRow(c, {
    table: "relationships",
    singular: "relationship",
    key,
    existingId,
    linked,
    doc: {
      type: item.type,
      childRelationType: item.type === "ParentChild" ? childRelationTypeFor(item.lineage) : undefined,
      person1,
      person2,
      facts,
      familySearchId: c.job.system === "familysearch" ? key : undefined,
      externalIds: externalIdsFor(c, key, item.otherIds),
    },
    createOnly: { importKey: `import:${externalRecordKey(c.job.system, "relationship", key)}` },
  });
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ----------------------------------------------------------------- sources */

async function importSource(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  const title = cleanText(item.title, "source title", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!;
  let existingId = await lookup(c, "source", key);
  let linked = false;
  if (!existingId && c.job.system === "familysearch") {
    const legacy = await c.ctx.db.query("sources").withIndex("by_fsId", (q) => q.eq("fsId", key)).take(10);
    const mine = legacy.find((row) => matchesVaultOwner(row.vaultOwnerId, c.owner));
    if (mine) {
      existingId = String(mine._id);
      linked = true;
    }
  }
  const saved = await upsertRow(c, {
    table: "sources",
    singular: "source",
    key,
    existingId,
    linked,
    doc: {
      title,
      type: sourceTypeFor(item.type),
      repository: item.repository,
      url: item.url,
      author: item.author,
      publicationDate: item.publicationDate,
      citationText: cleanText(item.citationText, "source citationText", FAMILY_HISTORY_MCP_LIMITS.notes),
      recordDate: item.recordDate,
      recordPlace: item.recordPlace ? { original: item.recordPlace } : undefined,
      notes: cleanText(item.notes, "source notes", FAMILY_HISTORY_MCP_LIMITS.notes),
      fsId: c.job.system === "familysearch" ? key : undefined,
      externalIds: externalIdsFor(c, key, item.otherIds, item.url),
    },
    createOnly: { importKey: `import:${externalRecordKey(c.job.system, "source", key)}` },
  });
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ------------------------------------------------------------------- media */

async function importMedia(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  const title = cleanText(item.title, "media title", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!;
  const personIds: string[] = [];
  for (const personKey of item.personKeys ?? []) personIds.push(await personFor(c, personKey, "personKeys"));
  let sourceId: string | undefined;
  if (item.sourceKey) {
    sourceId = (await lookup(c, "source", requiredKey(item.sourceKey, "sourceKey"))) ?? undefined;
    if (!sourceId) fail("MISSING_SOURCE", `Source ${item.sourceKey} has not been imported yet.`, "Send the source first, then resend this row.");
  }
  const saved = await upsertRow(c, {
    table: "media",
    singular: "media",
    key,
    existingId: await lookup(c, "media", key),
    doc: {
      type: item.type ?? "other",
      title,
      description: cleanText(item.description, "media description", FAMILY_HISTORY_MCP_LIMITS.notes),
      // A reference only. No bytes travel with an import; the link is the
      // outside site's own, and only the person's signed-in browser can open it.
      url: item.url,
      mimeType: item.mimeType,
      date: item.date,
      personIds: personIds.filter((id) => !isPlaceholder(id)),
      sourceId: sourceId && !isPlaceholder(sourceId) ? sourceId : undefined,
      familySearchUrl: c.job.system === "familysearch" ? item.url : undefined,
      externalIds: externalIdsFor(c, key, undefined, item.url),
    },
    createOnly: {
      importKey: `import:${externalRecordKey(c.job.system, "media", key)}`,
      privacyLevel: "private",
      reviewStatus: "unreviewed",
      rightsStatus: "unknown",
      aiUseAllowed: false,
    },
  });
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* --------------------------------------------------------------- citations */

const TARGET_TABLE = { person: "person", relationship: "relationship", fact: "event", note: "note", media: "media" } as const;

async function resolveTarget(c: ChunkContext, target: TargetInput): Promise<{ targetType: "person" | "relationship" | "event" | "note" | "media"; targetId: string; field?: string }> {
  const key = requiredKey(target?.key, "target key");
  const singular = target.kind === "fact" ? "fact" : target.kind;
  if (!(target.kind in TARGET_TABLE)) fail("VALIDATION_ERROR", `Unknown target kind ${String(target.kind)}.`, "Use person, relationship, fact, note or media.");
  const lookupKey = target.kind === "fact" ? `${requiredKey(target.personKey, "target personKey")}/${key}` : key;
  const id = await lookup(c, singular, lookupKey);
  if (!id) fail("MISSING_TARGET", `The ${target.kind} ${lookupKey} has not been imported yet.`, "Send what the citation supports first, then resend this row.");
  return { targetType: TARGET_TABLE[target.kind], targetId: id, ...(target.field ? { field: target.field.slice(0, 80) } : {}) };
}

async function importCitation(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const sourceKey = requiredKey(item?.sourceKey, "sourceKey");
  if (!Array.isArray(item.targets) || item.targets.length === 0) fail("VALIDATION_ERROR", "A citation must support at least one record.", "Add targets: the person, fact or relationship this source supports.");
  const key = requiredKey(citationKeyFor(item), "key");
  const sourceId = await lookup(c, "source", sourceKey);
  if (!sourceId) fail("MISSING_SOURCE", `Source ${sourceKey} has not been imported yet.`, "Send the source first, then resend this row.");
  const targets = [];
  for (const target of item.targets.slice(0, TREE_IMPORT_LIMITS.targetsPerCitation)) targets.push(await resolveTarget(c, target));
  const saved = await upsertRow(c, {
    table: "citations",
    singular: "citation",
    key,
    existingId: await lookup(c, "citation", key),
    doc: {
      sourceId: isPlaceholder(sourceId) ? undefined : sourceId,
      page: item.page,
      confidence: confidenceForQuality(item.quality),
      extractedText: cleanText(item.extractedText, "citation extractedText", FAMILY_HISTORY_MCP_LIMITS.notes),
      url: item.url,
      accessDate: item.accessDate,
      notes: cleanText(item.notes, "citation notes", FAMILY_HISTORY_MCP_LIMITS.notes),
      externalIds: item.key ? [{ system: c.job.system, id: String(item.key) }] : undefined,
    },
    createOnly: { isEvidence: true, importKey: `import:${externalRecordKey(c.job.system, "citation", key)}` },
  });
  if (!isPlaceholder(saved.id)) {
    for (const target of targets) {
      if (isPlaceholder(target.targetId)) continue;
      const rows = await c.ctx.db
        .query("citationLinks")
        .withIndex("by_citation_and_target", (q) =>
          q.eq("citationId", saved.id as Id<"citations">).eq("targetType", target.targetType).eq("targetId", target.targetId),
        )
        .take(1);
      if (rows.length === 0) {
        await c.w.insert("citationLinks", { vaultOwnerId: c.owner, citationId: saved.id, ...target, createdAt: Date.now() });
      }
    }
  }
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ------------------------------------------------------------------- notes */

const NOTE_SUBJECT_KIND = { person: "person", relationship: "relationship", fact: "event", media: "media", source: "source", citation: "citation" } as const;

async function importNote(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  const text = cleanText(item.text, "note text", TREE_IMPORT_LIMITS.noteText, true)!;
  const subject = item.subject ?? {};
  const kind = NOTE_SUBJECT_KIND[subject.kind as keyof typeof NOTE_SUBJECT_KIND];
  if (!kind) fail("VALIDATION_ERROR", "A note needs a subject.", "Say which person, relationship, fact, source, citation or media the note belongs to.");
  const subjectKey = subject.kind === "fact" ? `${requiredKey(subject.personKey, "subject personKey")}/${requiredKey(subject.key, "subject key")}` : requiredKey(subject.key, "subject key");
  const subjectId = await lookup(c, subject.kind === "fact" ? "fact" : subject.kind, subjectKey);
  if (!subjectId) fail("MISSING_TARGET", `The ${subject.kind} ${subjectKey} has not been imported yet.`, "Send the record the note belongs to first, then resend this row.");
  const saved = await upsertRow(c, {
    table: "notes",
    singular: "note",
    key,
    existingId: await lookup(c, "note", key),
    doc: {
      subject: { kind, id: subjectId },
      noteType: item.noteType ?? "general",
      title: cleanText(item.title, "note title", FAMILY_HISTORY_MCP_LIMITS.shortText),
      text,
      externalIds: externalIdsFor(c, key, undefined),
    },
  });
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ------------------------------------------------------------------- chunk */

const IMPORTERS = {
  sources: importSource,
  persons: importPerson,
  relationships: importRelationship,
  media: importMedia,
  citations: importCitation,
  notes: importNote,
} as const;

function keyOf(item: TreeImportItem): string {
  const raw = item.item?.key;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (item.kind === "citations" && typeof item.item?.sourceKey === "string") {
    try { return citationKeyFor(item.item); } catch { /* fall through */ }
  }
  return `#${item.index}`;
}

async function runChunk(c: ChunkContext, items: TreeImportItem[]): Promise<ItemResult[]> {
  const results: ItemResult[] = [];
  for (const item of items) {
    const importer = IMPORTERS[item.kind];
    try {
      const saved = await importer(c, item.item);
      results.push({ kind: item.kind, index: item.index, ...saved });
    } catch (error) {
      if (error instanceof ItemFailure) {
        results.push({ kind: item.kind, index: item.index, key: keyOf(item), status: "failed", reason: `${error.code}: ${error.message}`, whatToDo: error.whatToDo });
        continue;
      }
      const raw = error instanceof Error ? error.message : String(error);
      const marker = "MCP_FAMILY_HISTORY_ERROR:";
      const at = raw.indexOf(marker);
      let reason = "INTERNAL_ERROR: this row could not be saved.";
      let whatToDo = "Correct this row and send it again. The other rows in this batch are saved.";
      if (at >= 0) {
        try {
          const parsed = JSON.parse(raw.slice(at + marker.length));
          reason = `${parsed.code}: ${parsed.message}`;
          whatToDo = parsed.recovery ?? whatToDo;
        } catch { /* stable fallback */ }
      }
      results.push({ kind: item.kind, index: item.index, key: keyOf(item), status: "failed", reason, whatToDo });
    }
  }
  return results;
}

async function loadJob(ctx: QueryCtx, owner: string, importJobId: string, requireOpen: boolean) {
  const id = ctx.db.normalizeId("treeImports", importJobId);
  const job = id ? await ctx.db.get(id) : null;
  if (!job || job.vaultOwnerId !== owner) {
    machineError("NOT_FOUND", "That tree import was not found.", "Call family_history_begin_tree_import to start or resume one, and use the importJobId it returns.");
  }
  if (requireOpen && job.status !== "open") {
    machineError("VALIDATION_ERROR", "That tree import is already marked complete.", "Call family_history_begin_tree_import with the same importKey to reopen it for another pass.");
  }
  return job;
}

function importProvenance(principal: McpPrincipal, operationId: string): ImportProvenance {
  return {
    actorKind: "chosen_ai",
    actorId: principal.clientId,
    method: "import",
    // The record arrives with no citation of its own; a citation row links it.
    evidenceStatus: "unsourced",
    operationId,
    recordedAt: Date.now(),
  };
}

const chunkArgs = {
  principal: principalValidator,
  grantId: v.optional(v.string()),
  importJobId: v.string(),
  operationId: v.string(),
  items: v.array(v.object({ kind: v.string(), index: v.number(), item: v.any() })),
};

/** A dry run of one chunk. Reads only; the writer changes nothing. */
export const planTreeImportChunk = internalQuery({
  args: { ...chunkArgs, plannedKeys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const job = await loadJob(ctx, owner, args.importJobId, true);
    const c: ChunkContext = {
      ctx, w: dryWriter(), owner, job, provenance: importProvenance(args.principal, args.operationId),
      local: new Map(), planned: new Set(args.plannedKeys), plannedNow: [], duplicatesSuggested: 0,
    };
    const results = await runChunk(c, args.items as TreeImportItem[]);
    const suggested = results.reduce((total, row) => total + (row.possibleDuplicates?.length ?? 0), 0);
    return { results, plannedKeys: c.plannedNow, duplicatesSuggested: suggested };
  },
});

/** One chunk of a real batch: one transaction, replay-safe under its own receipt. */
export const applyTreeImportChunk = internalMutation({
  args: { ...chunkArgs, requestHash: v.string() },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const receipt = await ctx.db
      .query("mcpOperations")
      .withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId))
      .unique();
    if (receipt) {
      if (receipt.requestHash !== args.requestHash) {
        machineError("IDEMPOTENCY_CONFLICT", "This operation ID was already used for a different batch.", "Reuse the original batch exactly, or mint a new operationId.");
      }
      return JSON.parse(receipt.resultJson) as { results: ItemResult[]; plannedKeys: string[]; duplicatesSuggested: number };
    }
    const job = await loadJob(ctx, owner, args.importJobId, true);
    const c: ChunkContext = {
      ctx, w: liveWriter(ctx), owner, job, provenance: importProvenance(args.principal, args.operationId),
      local: new Map(), planned: new Set(), plannedNow: [], duplicatesSuggested: 0,
    };
    const results = await runChunk(c, args.items as TreeImportItem[]);
    const result = { results, plannedKeys: [], duplicatesSuggested: c.duplicatesSuggested };
    await ctx.db.insert("mcpOperations", {
      vaultOwnerId: owner,
      operationId: args.operationId,
      toolName: `${BATCH_TOOL}#chunk`,
      requestHash: args.requestHash,
      resultJson: JSON.stringify(result),
      clientId: args.principal.clientId,
      createdAt: Date.now(),
    });
    return result;
  },
});

/** Before any chunk runs: is this a replay, and may this batch be accepted? */
export const prepareTreeImportBatch = internalQuery({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    importJobId: v.string(),
    operationId: v.string(),
    requestHash: v.string(),
    batchIndex: v.number(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const receipt = await ctx.db
      .query("mcpOperations")
      .withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId))
      .unique();
    if (receipt && !args.dryRun) {
      if (receipt.toolName !== BATCH_TOOL || receipt.requestHash !== args.requestHash) {
        machineError("IDEMPOTENCY_CONFLICT", "This operation ID was already used for a different batch.", "Reuse the original batch exactly, or mint a new operationId.");
      }
      return { replay: { ...(JSON.parse(receipt.resultJson) as Record<string, unknown>), deduplicated: true } };
    }
    const job = await loadJob(ctx, owner, args.importJobId, true);
    if (!Number.isInteger(args.batchIndex) || args.batchIndex < 0 || args.batchIndex > job.nextBatchIndex) {
      machineError(
        "VALIDATION_ERROR",
        `This import expects batch ${job.nextBatchIndex} next (or a resend of an earlier one).`,
        `Send batchIndex ${job.nextBatchIndex}. Call family_history_get_tree_import to see the saved cursor if you lost your place.`,
      );
    }
    return { replay: null };
  },
});

function compactResults(results: ItemResult[]) {
  // Unchanged rows need no id to act on; leaving them as counts keeps a
  // 500-row receipt well inside its size budget.
  return results.filter((row) => row.status !== "unchanged");
}

/** After every chunk: the batch's one activity entry, progress, and receipt. */
export const recordTreeImportBatch = internalMutation({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    importJobId: v.string(),
    operationId: v.string(),
    requestHash: v.string(),
    batchIndex: v.number(),
    cursor: v.optional(v.string()),
    final: v.boolean(),
    records: v.number(),
    results: v.any(),
    duplicatesSuggested: v.number(),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    const grant = await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const existing = await ctx.db
      .query("mcpOperations")
      .withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId))
      .unique();
    if (existing) return { ...(JSON.parse(existing.resultJson) as Record<string, unknown>), deduplicated: true };
    const job = await loadJob(ctx, owner, args.importJobId, true);
    const results = args.results as ItemResult[];
    const batchCounts = addCounts(emptyCounts(), results);
    const counts = addCounts(job.counts as ImportCounts, results);
    const failures = results
      .filter((row) => row.status === "failed")
      .slice(0, TREE_IMPORT_LIMITS.failuresKeptPerBatch)
      .map((row) => ({ kind: row.kind, key: row.key.slice(0, TREE_IMPORT_LIMITS.key), reason: (row.reason ?? "failed").slice(0, 300) }));
    const now = Date.now();
    const nextBatchIndex = Math.max(job.nextBatchIndex, args.batchIndex + 1);
    const cursor = cleanText(args.cursor, "cursor", TREE_IMPORT_LIMITS.cursor) ?? job.cursor;
    await ctx.db.patch(job._id, {
      counts,
      nextBatchIndex,
      cursor,
      recordsReceived: job.recordsReceived + args.records,
      duplicatesSuggested: job.duplicatesSuggested + args.duplicatesSuggested,
      status: args.final ? "completed" : "open",
      ...(args.final ? { completedAt: now } : {}),
      updatedAt: now,
    });
    await ctx.db.insert("treeImportBatches", {
      vaultOwnerId: owner,
      importJobId: job._id,
      batchIndex: args.batchIndex,
      operationId: args.operationId,
      records: args.records,
      counts: batchCounts,
      duplicatesSuggested: args.duplicatesSuggested,
      failures,
      cursor,
      createdAt: now,
    });
    const totals = Object.values(batchCounts).reduce(
      (sum, kind) => ({ created: sum.created + kind.created, updated: sum.updated + kind.updated + kind.linked, failed: sum.failed + kind.failed }),
      { created: 0, updated: 0, failed: 0 },
    );
    await ctx.db.insert("agentActivity", {
      vaultOwnerId: owner,
      requestId: args.operationId,
      principalKind: "mcp",
      route: "/mcp",
      method: "tools/call",
      scope: BATCH_TOOL,
      outcome: "ok",
      statusCode: 200,
      createdAt: now,
      detail: `Tree import "${job.label.slice(0, 80)}" batch ${args.batchIndex}: ${totals.created} created, ${totals.updated} updated, ${totals.failed} failed, ${args.duplicatesSuggested} possible duplicates.`,
      grantId: grant?._id,
      clientId: args.principal.clientId,
    });
    const result: Record<string, unknown> = {
      importJobId: job._id,
      batchIndex: args.batchIndex,
      nextBatchIndex,
      status: args.final ? "completed" : "open",
      cursor: cursor ?? null,
      counts: batchCounts,
      duplicatesSuggested: args.duplicatesSuggested,
      results: compactResults(results),
      note: failures.length
        ? "Some rows did not save; the rest did. Each failed row says what to do. Fix them and resend just those rows in a later batch."
        : "Every row in this batch was saved.",
      operationId: args.operationId,
      deduplicated: false,
    };
    let resultJson = JSON.stringify(result);
    if (resultJson.length > FAMILY_HISTORY_MCP_LIMITS.resultJson) {
      result.results = results.filter((row) => row.status === "failed");
      result.resultsTrimmed = "Only failed rows are listed; every other row saved and is counted above.";
      resultJson = JSON.stringify(result);
    }
    await ctx.db.insert("mcpOperations", {
      vaultOwnerId: owner,
      operationId: args.operationId,
      toolName: BATCH_TOOL,
      requestHash: args.requestHash,
      resultJson,
      clientId: args.principal.clientId,
      createdAt: now,
    });
    return result;
  },
});

/* ------------------------------------------------------------ batch action */

type BatchResponse = Record<string, unknown>;

/**
 * One MCP call: validate, replay if already done, cut the batch into
 * transaction-sized chunks in dependency order, run them, record the batch.
 * If the call is interrupted, sending it again with the same operationId
 * replays the chunks that finished and runs the rest.
 */
export const importTreeBatch = internalAction({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: async (ctx, args): Promise<BatchResponse> => {
    const input = args.input ?? {};
    const total = countRecords(input);
    if (total === 0) machineError("VALIDATION_ERROR", "This batch has no records.", "Send at least one person, relationship, source, citation, note or media row.");
    if (total > TREE_IMPORT_LIMITS.recordsPerBatch) {
      machineError("VALIDATION_ERROR", `A batch may carry at most ${TREE_IMPORT_LIMITS.recordsPerBatch} records.`, "Split the batch and send the rest as the next batchIndex.");
    }
    const dryRun = input.dryRun === true;
    const base = {
      principal: args.principal,
      grantId: args.grantId,
      importJobId: String(input.importJobId ?? ""),
    };
    const prep: { replay: BatchResponse | null } = await ctx.runQuery(self.prepareTreeImportBatch, {
      ...base,
      operationId: args.operationId,
      requestHash: args.requestHash,
      batchIndex: input.batchIndex,
      dryRun,
    });
    if (prep.replay) return prep.replay;

    const chunks = chunkBatch(input);
    const results: ItemResult[] = [];
    const planned: string[] = [];
    let duplicatesSuggested = 0;
    for (const [index, items] of chunks.entries()) {
      const chunk: { results: ItemResult[]; plannedKeys: string[]; duplicatesSuggested: number } = dryRun
        ? await ctx.runQuery(self.planTreeImportChunk, { ...base, operationId: args.operationId, items, plannedKeys: planned })
        : await ctx.runMutation(self.applyTreeImportChunk, {
          ...base,
          operationId: `${args.operationId}#${index}`,
          requestHash: `${args.requestHash}#${index}`,
          items,
        });
      results.push(...chunk.results);
      planned.push(...chunk.plannedKeys);
      duplicatesSuggested += chunk.duplicatesSuggested;
    }

    if (dryRun) {
      return {
        dryRun: true,
        importJobId: base.importJobId,
        batchIndex: input.batchIndex,
        counts: addCounts(emptyCounts(), results),
        possibleDuplicates: duplicatesSuggested,
        results: results.filter((row) => row.status !== "unchanged"),
        note: "Nothing was saved. Statuses say what a real send of this batch would do. Rows that would fail say why; fix them before sending for real.",
      };
    }
    return await ctx.runMutation(self.recordTreeImportBatch, {
      ...base,
      operationId: args.operationId,
      requestHash: args.requestHash,
      batchIndex: input.batchIndex,
      cursor: typeof input.cursor === "string" ? input.cursor : undefined,
      final: input.final === true,
      records: total,
      results,
      duplicatesSuggested,
    });
  },
});

/* ------------------------------------------------------------------- begin */

/** Start an import session for one tree, or resume the one with this importKey. */
export const beginTreeImport = internalMutation({
  args: { principal: principalValidator, grantId: v.optional(v.string()), operationId: v.string(), requestHash: v.string(), input: v.any() },
  handler: (ctx, args) => operation(ctx, { ...args, toolName: BEGIN_TOOL }, async (owner) => {
    const input = args.input ?? {};
    const importKey = cleanText(input.importKey, "importKey", FAMILY_HISTORY_MCP_LIMITS.recordKey, true)!;
    const system = cleanText(input.system, "system", TREE_IMPORT_LIMITS.system, true)!.toLowerCase();
    const label = cleanText(input.label, "label", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!;
    const now = Date.now();
    const existing = await ctx.db
      .query("treeImports")
      .withIndex("by_owner_key", (q) => q.eq("vaultOwnerId", owner).eq("importKey", importKey))
      .unique();
    let job: Doc<"treeImports">;
    let resumed = false;
    if (existing) {
      if (existing.system !== system) {
        machineError("VALIDATION_ERROR", "This importKey belongs to an import from a different site.", "Use a new importKey for a different site.");
      }
      resumed = true;
      await ctx.db.patch(existing._id, {
        status: "open",
        label,
        expectedPeople: input.expectedPeople ?? existing.expectedPeople,
        updatedAt: now,
      });
      job = (await ctx.db.get(existing._id))!;
    } else {
      const id = await ctx.db.insert("treeImports", {
        vaultOwnerId: owner,
        importKey,
        system,
        label,
        rootExternalId: cleanText(input.rootExternalId, "rootExternalId", TREE_IMPORT_LIMITS.key),
        status: "open",
        nextBatchIndex: 0,
        expectedPeople: input.expectedPeople,
        recordsReceived: 0,
        duplicatesSuggested: 0,
        counts: emptyCounts(),
        clientId: args.principal.clientId,
        grantId: args.grantId ? (ctx.db.normalizeId("mcpGrants", args.grantId) ?? undefined) : undefined,
        startedAt: now,
        updatedAt: now,
      });
      job = (await ctx.db.get(id))!;
    }
    return {
      result: { ...jobSummary(job), resumed },
      detail: `${resumed ? "Resumed" : "Started"} tree import "${label.slice(0, 80)}" from ${system}.`,
    };
  }),
});

/* --------------------------------------------------------------------- get */

function jobSummary(job: Doc<"treeImports">) {
  const counts = job.counts as ImportCounts;
  const people = counts.persons;
  return {
    importJobId: job._id,
    importKey: job.importKey,
    system: job.system,
    label: job.label,
    rootExternalId: job.rootExternalId ?? null,
    status: job.status,
    nextBatchIndex: job.nextBatchIndex,
    cursor: job.cursor ?? null,
    expectedPeople: job.expectedPeople ?? null,
    peopleSaved: people.created + people.updated + people.unchanged + people.linked,
    recordsReceived: job.recordsReceived,
    duplicatesSuggested: job.duplicatesSuggested,
    counts,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
  };
}

export const getTreeImport = internalQuery({
  args: {
    principal: principalValidator,
    importJobId: v.optional(v.string()),
    suggestionsCursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    if (!args.importJobId) {
      const jobs = await ctx.db
        .query("treeImports")
        .withIndex("by_owner_updated", (q) => q.eq("vaultOwnerId", owner))
        .order("desc")
        .take(10);
      return { imports: jobs.map(jobSummary) };
    }
    const job = await loadJob(ctx, owner, args.importJobId, false);
    const batches = await ctx.db
      .query("treeImportBatches")
      .withIndex("by_job_batch", (q) => q.eq("importJobId", job._id))
      .order("desc")
      .take(TREE_IMPORT_LIMITS.batchesShown);
    const page = await ctx.db
      .query("connections")
      .withIndex("by_import_job", (q) => q.eq("importJobId", job._id))
      .paginate({ numItems: 25, cursor: args.suggestionsCursor ?? null });
    const suggestions = [];
    for (const row of page.page) {
      if (row.vaultOwnerId !== owner || row.state !== "proposed") continue;
      const a = await ctx.db.get(row.from.id as Id<"persons">);
      const b = await ctx.db.get(row.to.id as Id<"persons">);
      suggestions.push({
        connectionId: row._id,
        personId: row.from.id,
        personName: a ? `${a.name.given} ${a.name.surname}`.trim() : null,
        possiblySameAsId: row.to.id,
        possiblySameAsName: b ? `${b.name.given} ${b.name.surname}`.trim() : null,
        reason: row.reason ?? null,
        reviewAt: `/app/people/${row.from.id}`,
      });
    }
    return {
      import: jobSummary(job),
      recentBatches: batches.map((batch) => ({
        batchIndex: batch.batchIndex,
        records: batch.records,
        counts: batch.counts,
        duplicatesSuggested: batch.duplicatesSuggested,
        failures: batch.failures,
        cursor: batch.cursor ?? null,
        at: batch.createdAt,
      })),
      possibleDuplicates: suggestions,
      possibleDuplicatesCursor: page.isDone ? null : page.continueCursor,
      note: "Possible duplicates are suggestions for the person to review. Nothing here merges people.",
    };
  },
});
