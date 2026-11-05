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
  legacyExternalRecordKey,
  factKeyFor,
  factTargetKey,
  legacyFactKeyFor,
  legacyCitationKeyFor,
  isGedcomSystem,
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
  rows?: Map<string, any>;
  personIndexes?: Map<string, { surname: string; year: number | null; fsId?: string }>;
  relationshipIndexes?: Map<string, { type: string; person1: string | null }>;
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

function dryWriter(scope: string, rows: Map<string, any>, personIndexes: Map<string, { surname: string; year: number | null; fsId?: string }>, relationshipIndexes: Map<string, { type: string; person1: string | null }>): Writer {
  let counter = 0;
  return {
    dryRun: true,
    rows,
    personIndexes,
    relationshipIndexes,
    insert: async (table, doc) => {
      const id = `dry:${encodeURIComponent(scope)}:${table}:${(counter += 1)}`;
      rows.set(id, { ...clean(doc), _id: id, _creationTime: Date.now() });
      return id;
    },
    patch: async (id, doc) => {
      const row = rows.get(id);
      if (!row) throw new Error("Dry planning attempted to patch an unloaded record.");
      rows.set(id, { ...row, ...clean(doc) });
    },
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
  baselines: Map<string, Record<string, unknown> | null>;
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
  factGenerated: "event",
  citationGenerated: "citation",
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

/** A planned (dry-run) or not-yet-real id: never read from or written against. */
function isPlaceholder(id: string): boolean {
  return id.startsWith("planned:") || id.startsWith("dry:");
}

async function lookup(c: ChunkContext, singular: string, key: string, system: string = c.job.system): Promise<string | null> {
  const mapKey = externalRecordKey(system, singular, key, c.job.importKey);
  const local = c.local.get(mapKey);
  if (local) return local;
  if (c.planned.has(mapKey)) return `planned:${mapKey}`;
  const find = (recordKey: string) => c.ctx.db.query("mcpRecordKeys").withIndex("by_owner_type_key", q =>
    q.eq("vaultOwnerId", c.owner).eq("recordType", RECORD_TYPE[singular]).eq("recordKey", recordKey),
  ).unique();
  const legacyKey = legacyExternalRecordKey(system, singular, key, c.job.importKey);
  if (legacyKey !== mapKey) {
    const legacy = await find(legacyKey);
    if (legacy && legacy.externalKeyVersion !== 2) fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "An older external-system key is ambiguous; its original record was retained.", "Have the person review the legacy mapping before retrying; do not rekey it automatically.");
  }
  const row = await find(mapKey);
  if (row && row.externalKeyVersion !== 2 && (legacyKey !== mapKey || key.startsWith(`${singular}:`) || key.includes(`:${singular}:`))) {
    fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "This older mapping could have been built from different external-system components.", "Review the original mapping before linking; nothing was rekeyed.");
  }
  if (row && row.externalKeyVersion !== 2 && singular === "fact") {
    // An old raw tuple can equal a new escaped tuple for a different person.
    // Outside fact IDs alone cannot establish the owning person.
    const parts = key.split("/");
    let personKey: string | undefined;
    let factKey: string | undefined;
    try {
      if (parts.length === 2) [personKey, factKey] = parts.map(decodeURIComponent);
    } catch { /* A malformed old tuple is deliberately refused below. */ }
    const personId = personKey ? (await resolvePersonIdentity(c, personKey, system)).id : null;
    const event = await ownedRow(c, "events", row.recordId);
    const person = personId ? await ownedRow(c, "persons", personId) : null;
    const link = person && event && !isPlaceholder(personId!) ? await c.ctx.db.query("personEvents")
      .withIndex("by_person_and_event", q => q.eq("personId", person._id).eq("eventId", event._id)).unique() : null;
    if (!person || !event || !link || !matchesVaultOwner(link.vaultOwnerId, c.owner)
      || !event.externalIds?.some(id => id.system.trim().toLowerCase() === system.trim().toLowerCase() && id.id.trim() === factKey)) {
      fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "The complete person/fact identity of this older mapping cannot be verified.", "Review the original person, fact and mapping; nothing was rekeyed or overwritten.");
    }
  }
  return row?.recordId ?? null;
}

/** Never guess which record an old ambiguous composite identified. */
async function rejectLegacyIdentity(c: ChunkContext, singular: string, key: string, legacyKey: string, legacySingular: string = singular) {
  if ((key !== legacyKey || singular !== legacySingular) && await lookup(c, legacySingular, legacyKey)) {
    fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "An older import used an ambiguous record key. The original record has been retained.",
      "Have the person review the original import mapping before retrying; do not rename outside IDs to bypass this check.");
  }
}

const REFERENCE_TABLE: Record<string, TableNames> = {
  person: "persons", relationship: "relationships", source: "sources",
  fact: "events", citation: "citations", note: "notes", media: "media",
};

/** Mappings retain history after deletion; they do not prove a target exists. */
async function lookupReference(c: ChunkContext, kind: string, key: string, origin: unknown): Promise<string | null> {
  const id = await lookupReferenceId(c, kind, key, origin);
  return id && await ownedRow(c, REFERENCE_TABLE[kind], id) ? id : null;
}

/** A missing origin remains compatible only when exactly one domain resolves. */
async function lookupReferenceId(c: ChunkContext, kind: string, key: string, origin: unknown): Promise<string | null> {
  if (origin !== undefined && origin !== "explicit" && origin !== "generated") {
    fail("VALIDATION_ERROR", "Unknown keyOrigin.", "Use explicit or generated for keyOrigin.");
  }
  const supportsGenerated = kind === "fact" || kind === "citation";
  if (origin === "generated" && !supportsGenerated) {
    fail("VALIDATION_ERROR", "This record kind has no generated key domain.", "Use generated only for fact or citation references.");
  }
  if (kind === "person") return (await resolvePersonIdentity(c, key, c.job.system)).id;
  if (kind === "source") return (await resolveSourceIdentity(c, key)).id;
  if (origin === "explicit" || !supportsGenerated) {
    const id = await lookup(c, kind, key);
    if (origin === "explicit" && supportsGenerated) {
      const externalKey = kind === "fact" ? key.slice(key.indexOf("/") + 1) : key;
      await assertExplicitIdentity(c, kind === "fact" ? "events" : "citations", id, kind === "fact" ? decodeURIComponent(externalKey) : externalKey);
    }
    return id;
  }
  const generated = await lookup(c, `${kind}Generated`, key);
  if (origin === "generated") return generated;
  const explicit = await lookup(c, kind, key);
  if (explicit && generated && explicit !== generated) {
    fail("AMBIGUOUS_TARGET", "Both an explicit and a generated record use this key.", "Set keyOrigin to explicit or generated to identify the intended record.");
  }
  return explicit ?? generated;
}

/** Old generated rows have no outside ID; never refresh one as an explicit ID. */
async function assertExplicitIdentity(c: ChunkContext, table: "events" | "citations", id: string | null, key: string) {
  if (!id || isPlaceholder(id)) return;
  const row = await ownedRow(c, table, id);
  if (row && !row.externalIds?.some(external => external.system === c.job.system && external.id.trim() === key.trim())) {
    fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "This explicit key points at an older record without matching outside-ID evidence. The original was retained.",
      "Have the person review the old mapping before retrying. Do not rekey the original automatically.");
  }
}

async function remember(c: ChunkContext, singular: string, key: string, recordId: string, system: string = c.job.system, imported?: Record<string, unknown>) {
  const mapKey = externalRecordKey(system, singular, key, c.job.importKey);
  c.local.set(mapKey, recordId);
  if (c.w.dryRun) {
    c.baselines.set(mapKey, imported ? clean(imported) : null);
    c.plannedNow.push(mapKey);
    return;
  }
  const now = Date.now();
  await c.w.insert("mcpRecordKeys", {
    vaultOwnerId: c.owner,
    recordType: RECORD_TYPE[singular],
    recordKey: mapKey,
    externalKeyVersion: 2,
    recordId,
    ...(imported ? { lastImportedJson: JSON.stringify(clean(imported)) } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

async function ownedRow<T extends TableNames>(c: ChunkContext, table: T, id: string): Promise<Doc<T> | null> {
  const virtual = c.w.rows?.get(id);
  if (virtual) return matchesVaultOwner(virtual.vaultOwnerId, c.owner) ? virtual as Doc<T> : null;
  if (isPlaceholder(id)) return null;
  const normalized = c.ctx.db.normalizeId(table, id);
  if (!normalized) return null;
  const row = await c.ctx.db.get(normalized as Id<T>);
  if (!row || !matchesVaultOwner((row as any).vaultOwnerId, c.owner)) return null;
  if (c.w.rows) {
    c.w.rows.set(id, clean(row));
    if (table === "persons") c.w.personIndexes?.set(id, { surname: (row as Doc<"persons">).name.surname, year: (row as Doc<"persons">).birth?.date?.year ?? null, fsId: (row as Doc<"persons">).fsId });
    if (table === "relationships") c.w.relationshipIndexes?.set(id, { type: (row as Doc<"relationships">).type, person1: (row as Doc<"relationships">).person1 ?? null });
  }
  return row as Doc<T>;
}

/** Retained attachments describe the current assertion, regardless of review status. */
async function hasRetainedAttachments(c: ChunkContext, kind: "relationship" | "event" | "media" | "note" | "citation", id: string): Promise<boolean> {
  if ([...(c.w.rows?.values() ?? [])].some(row =>
    (row.subject?.kind === kind && row.subject.id === id)
    || (row.targetType === kind && row.targetId === id))) return true;
  if (isPlaceholder(id)) return false;
  const attachments = await Promise.all([
    kind === "note" ? Promise.resolve(null) : c.ctx.db.query("notes").withIndex("by_subject", q => q.eq("subject.kind", kind).eq("subject.id", id)).first(),
    kind === "citation" ? Promise.resolve(null) : c.ctx.db.query("citationLinks").withIndex("by_target", q => q.eq("targetType", kind).eq("targetId", id)).first(),
  ]);
  return attachments.some(Boolean);
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

type UpsertOutcome = { id: string; status: ItemResult["status"]; kept?: string[]; importedBaseline: Record<string, unknown> };

function mergeableObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && !Object.hasOwn(value, "placeId") && !(Object.hasOwn(value, "kind") && Object.hasOwn(value, "id"));
}

/** Supplied leaves refresh independently; omitted leaves and manual edits stay. */
function mergeImportedValue(current: unknown, incoming: unknown, baseline: unknown, hasBaseline: boolean, mergeFacts = false): { value: unknown; baseline: unknown; hasBaseline: boolean; kept: boolean } {
  if (same(current, incoming)) return { value: current, baseline, hasBaseline, kept: false };
  if (mergeFacts && Array.isArray(current) && Array.isArray(incoming)) {
    const value = [...current];
    const imported: any[] = hasBaseline && Array.isArray(baseline) ? [...baseline] : [];
    const suppliedTypes = new Set<string>();
    let kept = false;
    let known = hasBaseline;
    for (const fact of incoming) {
      const type = fact?.type;
      const matches = value.map((row, index) => row?.type === type ? index : -1).filter(index => index >= 0);
      const originals = imported.map((row, index) => row?.type === type ? index : -1).filter(index => index >= 0);
      if (typeof type !== "string" || suppliedTypes.has(type) || matches.length > 1 || originals.length > 1) {
        fail("RELATIONSHIP_FACT_REVIEW_REQUIRED", "Relationship facts cannot be matched unambiguously by type.", "Review the original fact list with the person before replacing it; this relationship item saved nothing.");
      }
      suppliedTypes.add(type);
      if (!matches.length && originals.length) { kept = true; continue; } // Retain a manual deletion.
      const next = mergeImportedValue(matches.length ? value[matches[0]] : undefined, fact, originals.length ? imported[originals[0]] : undefined, originals.length > 0);
      if (matches.length) value[matches[0]] = next.value;
      else value.push(next.value);
      if (next.hasBaseline) {
        const entry = { type, ...(next.baseline as Record<string, unknown>) };
        if (originals.length) imported[originals[0]] = entry;
        else imported.push(entry);
        known = true;
      }
      kept ||= next.kept;
    }
    return { value, baseline: imported, hasBaseline: known, kept };
  }
  if (mergeableObject(current) && mergeableObject(incoming)) {
    const dateFields = ["year", "month", "day", "formal", "range", "approximate"];
    const changedText = typeof current.original === "string" && typeof incoming.original === "string" && current.original !== incoming.original;
    if (changedText) {
      const omitted = dateFields.filter(field => current[field] !== undefined && incoming[field] === undefined);
      if (omitted.length) fail("FACT_DATE_CONFIRMATION_REQUIRED", `Changed date text requires its retained structured metadata: ${omitted.join(", ")}.`, "Review and resubmit the complete corrected date before replacing it. This record item saved nothing.");
    }
    const value: Record<string, unknown> = { ...current };
    const old: Record<string, unknown> = hasBaseline && mergeableObject(baseline) ? baseline : {};
    const imported: Record<string, unknown> = { ...old };
    let known = hasBaseline;
    let kept = false;
    for (const [key, supplied] of Object.entries(incoming)) {
      if (supplied === undefined) continue;
      const next = mergeImportedValue(current[key], supplied, old[key], Object.hasOwn(old, key));
      value[key] = next.value;
      if (next.hasBaseline) { imported[key] = next.baseline; known = true; }
      kept ||= next.kept;
    }
    if (changedText && kept && dateFields.some(field => current[field] !== undefined || incoming[field] !== undefined)) {
      fail("FACT_DATE_CONFIRMATION_REQUIRED", "Changed date text conflicts with retained manual date metadata.", "Review the complete corrected date before replacing it. This record item saved nothing.");
    }
    return { value, baseline: imported, hasBaseline: known, kept };
  }
  if (hasBaseline ? same(current, baseline) : isEmpty(current)) return { value: incoming, baseline: incoming, hasBaseline: true, kept: false };
  return { value: current, baseline, hasBaseline, kept: true };
}

/**
 * Refresh only fields still equal to their last imported value. Manual edits
 * and legacy populated fields are retained, with disagreements reported back.
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
    // Import-only provenance lives in the mapping baseline, never the record.
    baselineMetadata?: Record<string, unknown>;
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
    const importedBaseline = clean({ ...args.doc, ...args.baselineMetadata });
    await remember(c, args.singular, args.key, id, c.job.system, importedBaseline);
    return { id, status: "created", importedBaseline };
  }
  const row = await ownedRow(c, args.table, args.existingId);
  if (!row) fail("NOT_FOUND", "The record this outside id pointed to is gone.", "Send the record again under a new key, or ask the person what happened to it.");
  const patch: Record<string, unknown> = {};
  const kept: string[] = [];
  const mapKey = externalRecordKey(c.job.system, args.singular, args.key, c.job.importKey);
  const plannedBaseline = c.baselines.has(mapKey);
  const mapping = plannedBaseline ? null : await c.ctx.db.query("mcpRecordKeys").withIndex("by_owner_type_key", q =>
    q.eq("vaultOwnerId", c.owner).eq("recordType", RECORD_TYPE[args.singular]).eq("recordKey", mapKey),
  ).unique();
  const baseline = plannedBaseline ? c.baselines.get(mapKey) : mapping?.lastImportedJson ? JSON.parse(mapping.lastImportedJson) : null;
  // Creation provenance is historical, never permission to replace later edits.
  // Legacy rows without a baseline conservatively retain populated fields.
  const imported: Record<string, unknown> = { ...(baseline ?? {}) };
  for (const [field, value] of Object.entries(args.doc)) {
    if (value === undefined) continue;
    const current = (row as any)[field];
    if (field === "externalIds") {
      const merged = mergeExternalIds(current, value as ExternalId[]);
      if (!same(merged, current)) patch.externalIds = merged;
      continue;
    }
    const next = mergeImportedValue(current, value, baseline?.[field], !!baseline && Object.hasOwn(baseline, field), args.table === "relationships" && field === "facts");
    if (!same(current, next.value)) {
      patch[field] = next.value;
      if (next.hasBaseline) imported[field] = next.baseline;
    }
    if (next.kept) kept.push(field);
  }
  Object.assign(imported, args.baselineMetadata);
  const baselineChanged = Object.keys(patch).length > 0 || (args.baselineMetadata !== undefined && !same(baseline, imported));
  // Only supplied leaves actually filled/refreshed above enter this baseline;
  // retained legacy fields remain outside the importer's refresh authority.
  if (args.linked) await remember(c, args.singular, args.key, String(row._id), c.job.system, imported);
  if (Object.keys(patch).length > 0) {
    await c.w.patch(String(row._id), { ...clean(patch), updatedAt: now });
  }
  if (c.w.dryRun && (plannedBaseline || mapping) && baselineChanged) c.baselines.set(mapKey, clean(imported));
  if (mapping && !c.w.dryRun && baselineChanged) {
    await c.w.patch(String(mapping._id), { lastImportedJson: JSON.stringify(clean(imported)) });
  }
  const status: ItemResult["status"] = args.linked ? "linked" : Object.keys(patch).length > 0 ? "updated" : "unchanged";
  return { id: String(row._id), status, importedBaseline: imported, ...(kept.length ? { kept } : {}) };
}

/* ----------------------------------------------------------------- persons */

function factDescription(fact: { value?: string; description?: string }) {
  if (fact.value && fact.description) return `${fact.value}. ${fact.description}`;
  return fact.value || fact.description || fact.value;
}

function projectFactDate(supplied: any, effective: any) {
  if (!supplied || !effective) return undefined;
  const projected = { ...supplied };
  for (const key of Object.keys(supplied)) projected[key] = effective[key];
  if (effective.year !== undefined) projected.year = effective.year;
  return withYear(projected);
}

async function effectiveFactInput(c: ChunkContext, personKey: string, fact: any) {
  if (typeof fact?.type !== "string" || !fact.type.trim()) return fact;
  const key = factKeyFor(personKey, fact);
  const singular = fact.key?.trim() ? "fact" : "factGenerated";
  const id = await lookup(c, singular, key);
  const previous = id ? await ownedRow(c, "events", id) : null;
  if (!previous?.importedFact) return fact;
  const mapKey = externalRecordKey(c.job.system, singular, key, c.job.importKey);
  const mapping = c.baselines.has(mapKey) ? null : await c.ctx.db.query("mcpRecordKeys").withIndex("by_owner_type_key", q => q.eq("vaultOwnerId", c.owner).eq("recordType", "event").eq("recordKey", mapKey)).unique();
  const baseline = c.baselines.has(mapKey) ? c.baselines.get(mapKey) : mapping?.lastImportedJson ? JSON.parse(mapping.lastImportedJson) : null;
  const oldDate = previous.importedFact.date;
  if (oldDate && fact.date && oldDate.original !== fact.date.original) {
    const omitted = Object.keys(oldDate).filter(field => field !== "original" && (oldDate as any)[field] !== undefined && fact.date[field] === undefined);
    const dateBaseline = baseline?.importedFact?.date;
    const date = mergeImportedValue(oldDate, fact.date, dateBaseline, !!baseline?.importedFact && Object.hasOwn(baseline.importedFact, "date"));
    if (omitted.length || date.kept) fail("FACT_DATE_CONFIRMATION_REQUIRED", "Changed fact date text cannot carry omitted or conflicting structured date metadata.",
      "Review and resubmit the complete corrected date, including retained structured fields. This person/fact item saved nothing.");
  }
  return mergeImportedValue(previous.importedFact, fact, baseline?.importedFact, !!baseline && Object.hasOwn(baseline, "importedFact")).value as any;
}

/** A FamilySearch mapping never outranks an existing owned PID identity. */
async function resolvePersonIdentity(c: ChunkContext, key: string, system: string) {
  const mapped = await lookup(c, "person", key, system);
  const identities = new Set<string>(mapped ? [mapped] : []);
  if (system.trim().toLowerCase() === "familysearch") {
    const row = mapped ? await ownedRow(c, "persons", mapped) : null;
    const matches = (row: any) => row?.vaultOwnerId === c.owner && typeof row.living === "boolean" && !!row.name && row.fsId === key;
    const movedOut = [...(c.w.personIndexes ?? [])].filter(([id, index]) => index.fsId === key && !matches(c.w.rows?.get(id))).length;
    if (movedOut > TREE_IMPORT_LIMITS.duplicateScanPerPerson) fail("DRY_RUN_PLAN_LIMIT", "Too many planned PID index moves for a bounded identity lookup.", "Use smaller dry-run batches; nothing was saved.");
    const legacy = await c.ctx.db.query("persons").withIndex("by_owner_fsId", q => q.eq("vaultOwnerId", c.owner).eq("fsId", key)).take(2 + movedOut);
    for (const row of legacy) if (matches(c.w.rows?.get(String(row._id)) ?? row)) identities.add(String(row._id));
    for (const row of c.w.rows?.values() ?? []) if (matches(row)) identities.add(String(row._id));
    if (identities.size === 1 && row?.fsId && row.fsId !== key) fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "The person mapping disagrees with its current FamilySearch identity.", "Review the original person and mapping before importing more material; neither identity was changed.");
  }
  if (identities.size > 1) fail("AMBIGUOUS_PERSON_IDENTITY", "This outside ID identifies different existing people; no identity was selected.", "Have the person resolve the mapping and legacy PID disagreement before retrying; all originals were retained.");
  return { mapped, id: [...identities][0] ?? null };
}

async function importPerson(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  if (!Array.isArray(item?.names) || item.names.length === 0) fail("VALIDATION_ERROR", "A person needs at least one name.", "Send names with given and surname as the site shows them.");
  if (typeof item.living !== "boolean") fail("VALIDATION_ERROR", "living must be true or false.", "Say whether the site marks this person as living.");
  const facts: any[] = [];
  const identities = new Map<string, any>();
  for (const fact of (Array.isArray(item.facts) ? item.facts : []).slice(0, TREE_IMPORT_LIMITS.factsPerPerson)) {
    if (typeof fact?.type === "string" && fact.type.trim()) {
      const identity = JSON.stringify([fact.key?.trim() ? "explicit" : "generated", factKeyFor(key, fact)]);
      if (identities.has(identity)) {
        if (!same(identities.get(identity), fact)) fail("AMBIGUOUS_FACT_IDENTITY", "One person contains different assertions for the same fact identity.", "Combine the supplied fields into one fact before retrying; the original person and facts were retained.");
        continue;
      }
      identities.set(identity, fact);
    }
    facts.push(fact);
  }
  const effectiveFacts = new Map<any, any>();
  for (const type of ["birth", "death"]) {
    const fact = facts.find(row => eventTypeFor(row?.type ?? "").type === type);
    if (fact) effectiveFacts.set(fact, await effectiveFactInput(c, key, fact));
  }
  const { name, alternateNames } = splitNames(item.names);
  if (!name.given && !name.surname) fail("VALIDATION_ERROR", "The preferred name is empty.", "Send at least a given name or a surname.");
  const embedded = (type: string) => {
    const fact = facts.find((row) => eventTypeFor(row?.type ?? "").type === type);
    if (!fact) return undefined;
    return clean({
      date: projectFactDate(fact.date, (effectiveFacts.get(fact) ?? fact).date),
      place: fact.place?.original ? { original: fact.place.original } : undefined,
      description: fact.value !== undefined || fact.description !== undefined ? factDescription(effectiveFacts.get(fact) ?? fact) : undefined,
    });
  };

  const primary = await resolvePersonIdentity(c, key, c.job.system);
  const primaryMappingKey = externalRecordKey(c.job.system, "person", key, c.job.importKey);
  const candidates = new Set<string>(primary.id ? [primary.id] : []);
  const otherIds: ExternalId[] = Array.isArray(item.otherIds) ? item.otherIds : [];
  const aliases = new Map<string, { system: string; id: string; mapped: string | null }>();
  for (const other of otherIds) {
    if (isGedcomSystem(other.system) && !isGedcomSystem(c.job.system)) continue;
    const system = other.system.trim().toLowerCase();
    const id = requiredKey(other.id, "otherIds.id");
    const aliasKey = externalRecordKey(system, "person", id, c.job.importKey);
    if (aliasKey === primaryMappingKey || aliases.has(aliasKey)) continue;
    const identity = await resolvePersonIdentity(c, id, system);
    aliases.set(aliasKey, { system, id, mapped: identity.mapped });
    if (identity.id) candidates.add(identity.id);
  }
  if (candidates.size > 1) fail("AMBIGUOUS_PERSON_IDENTITY", "These outside IDs already identify different people; no identity was selected.", "Have the person resolve the conflicting aliases before retrying; all originals were retained.");
  const existingId = [...candidates][0] ?? null;
  const linked = !primary.mapped && !!existingId;
  const previous = existingId ? await ownedRow(c, "persons", existingId) : null;

  const doc = {
    importedNames: clean(item.names),
    name,
    alternateNames: alternateNames.length ? alternateNames : undefined,
    // Include the effective creation value in the imported refresh baseline.
    sex: item.sex ?? (existingId ? undefined : "unknown"),
    living: item.living,
    birth: embedded("birth"),
    death: embedded("death"),
    fsId: c.job.system === "familysearch" ? key : undefined,
    tags: item.tags,
    externalIds: externalIdsFor(c, key, item.otherIds, item.sourceUrl),
  };
  let duplicates: string[] = [];
  if (!existingId && !item.living) duplicates = await duplicateCandidates(c, name, yearOf(doc.birth?.date));
  const saved = await upsertRow(c, {
    table: "persons",
    singular: "person",
    key,
    existingId,
    linked,
    doc,
    createOnly: { researchStatus: "basic" },
  });
  if (previous) {
    const current = await ownedRow(c, "persons", saved.id);
    const assertions = ["name", "alternateNames", "importedNames", "sex", "living", "birth", "death"] as const;
    const changed = current ? assertions.filter(field => !same(previous[field], current[field])) : [];
    if (changed.length) {
      const max = FAMILY_HISTORY_MCP_LIMITS.contextRows;
      const links = isPlaceholder(saved.id) ? [] : await c.ctx.db.query("citationLinks")
        .withIndex("by_target", q => q.eq("targetType", "person").eq("targetId", saved.id)).take(max + 1);
      const virtual = [...(c.w.rows?.values() ?? [])].filter(row => row.targetType === "person" && row.targetId === saved.id);
      const supportsChanged = (field: string | undefined) => {
        if (!field?.trim()) return true;
        const path = field.trim().toLowerCase().replace(/^person[.:]/, "");
        const root = /^[a-z]+/.exec(path)?.[0] ?? "";
        if (["name", "names", "alternatenames", "importednames"].includes(root)) return changed.some(key => ["name", "alternateNames", "importedNames"].includes(key));
        if (!["sex", "living", "birth", "death"].includes(root)) return true; // Unrecognised field semantics require review.
        return changed.some(key => key.toLowerCase() === root);
      };
      if (links.length > max || [...links, ...virtual].some(link => supportsChanged(link.field))) {
        fail("PERSON_CITATION_REVIEW_REQUIRED", "Changed person assertions cannot inherit retained person-field citation evidence.",
          "Review the person fields and their citations with the person. This person item saved nothing; its original fields, events and evidence were retained.");
      }
    }
  }
  if (saved.status === "created") {
    for (const candidate of duplicates) await suggestDuplicate(c, saved.id, candidate, name, yearOf(doc.birth?.date));
  }
  // Remember the person's ids on other sites too, so an import from there
  // lands on this same person instead of making a second one.
  for (const other of aliases.values()) {
    if (!other.mapped) await remember(c, "person", other.id, saved.id, other.system, saved.importedBaseline);
  }

  for (const fact of facts.slice(0, TREE_IMPORT_LIMITS.factsPerPerson)) {
    const outcome = await importFact(c, saved.id, key, fact);
    if (!outcome) continue;
    if (saved.status === "unchanged" && outcome.status !== "unchanged") saved.status = "updated";
    if (outcome.kept?.length) saved.kept = [...(saved.kept ?? []), ...outcome.kept.map(field => `facts:${factKeyFor(key, fact)}:${field}`)];
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
  const singular = fact.key?.trim() ? "fact" : "factGenerated";
  await rejectLegacyIdentity(c, singular, factKey, legacyFactKeyFor(personKey, fact), "fact");
  const mapped = eventTypeFor(fact.type);
  const existingId = await lookup(c, singular, factKey);
  if (singular === "fact") await assertExplicitIdentity(c, "events", existingId, fact.key);
  const previous = existingId ? await ownedRow(c, "events", existingId) : null;
  const effective = await effectiveFactInput(c, personKey, fact);
  const saved = await upsertRow(c, {
    table: "events",
    singular,
    key: factKey,
    existingId,
    doc: {
      type: mapped.type,
      customType: mapped.customType,
      importedFact: clean(fact),
      date: projectFactDate(fact.date, effective.date),
      place: fact.place?.original ? { original: fact.place.original } : undefined,
      description: fact.value !== undefined || fact.description !== undefined ? factDescription(effective) : undefined,
      externalIds: fact.key ? [{ system: c.job.system, id: String(fact.key) }] : undefined,
    },
    createOnly: { importKey: `import:${externalRecordKey(c.job.system, singular, factKey, c.job.importKey)}` },
  });
  if (previous) {
    const current = await ownedRow(c, "events", saved.id);
    const assertion = ["type", "customType", "importedFact", "date", "place", "description"] as const;
    if (current && assertion.some(field => !same(previous[field], current[field])) && await hasRetainedAttachments(c, "event", saved.id)) {
      fail("FACT_ATTRIBUTION_REVIEW_REQUIRED", "Changed fact assertions cannot inherit retained notes or citation evidence.",
        "Review the fact and its attachments with the person. This person/fact item saved nothing; its original assertions and attachments were retained.");
    }
  }
  if (saved.status === "created") {
    await c.w.insert("personEvents", {
      vaultOwnerId: c.owner,
      personId,
      eventId: saved.id,
      role: "primary",
      createdAt: Date.now(),
    });
  }
  return saved;
}

async function duplicateCandidates(c: ChunkContext, name: { given: string; surname: string }, birthYear: number | undefined) {
  if (birthYear === undefined || !name.surname) return [];
  const inRange = (row: any) => row?.vaultOwnerId === c.owner && row.name?.surname === name.surname && typeof row.birth?.date?.year === "number" && Math.abs(row.birth.date.year - birthYear) <= 2;
  const movedOut = [...(c.w.personIndexes ?? [])].filter(([id, index]) => index.surname === name.surname && index.year !== null && Math.abs(index.year - birthYear) <= 2 && !inRange(c.w.rows?.get(id))).length;
  if (movedOut > TREE_IMPORT_LIMITS.duplicateScanPerPerson) fail("DRY_RUN_PLAN_LIMIT", "Too many planned index moves for a bounded duplicate scan.", "Use smaller dry-run batches; nothing was saved.");
  const persisted = await c.ctx.db
    .query("persons")
    .withIndex("by_owner_surname_birth_year", (q) =>
      q.eq("vaultOwnerId", c.owner).eq("name.surname", name.surname).gte("birth.date.year", birthYear - 2).lte("birth.date.year", birthYear + 2),
    ).take(TREE_IMPORT_LIMITS.duplicateScanPerPerson + movedOut);
  const effective = new Map<string, any>();
  for (const row of persisted) {
    const current = c.w.rows?.get(String(row._id)) ?? row;
    if (inRange(current)) effective.set(String(row._id), current);
  }
  for (const row of c.w.rows?.values() ?? []) if (typeof row.living === "boolean" && inRange(row)) effective.set(String(row._id), row);
  const rows = [...effective.values()].sort((a, b) => a.birth.date.year - b.birth.date.year || (a._creationTime ?? a.createdAt) - (b._creationTime ?? b.createdAt)).slice(0, TREE_IMPORT_LIMITS.duplicateScanPerPerson);
  const found: string[] = [];
  for (const row of rows) {
    // Persons have no explicit AI privacy review flag yet. Fail closed for
    // living people until a dedicated reviewed state is available.
    if (row.living) continue;
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
  const id = (await resolvePersonIdentity(c, personKey, c.job.system)).id;
  if (!id || !await ownedRow(c, "persons", id)) fail("MISSING_PERSON", `${label} ${personKey} has no existing owned person.`, "Review missing or deleted people before retrying; an old mapping is not a usable target.");
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
  if (!existingId) {
    const inIndex = (row: any) => row?.type === item.type && row.person1 === person1;
    const movedOut = [...(c.w.relationshipIndexes ?? [])].filter(([id, original]) => original.type === item.type && original.person1 === person1 && !inIndex(c.w.rows?.get(id))).length;
    if (movedOut > 50) fail("DRY_RUN_PLAN_LIMIT", "Too many planned relationship index moves for a bounded scan.", "Use smaller dry-run batches; nothing was saved.");
    const persisted = isPlaceholder(person1) ? [] : await c.ctx.db.query("relationships")
      .withIndex("by_type_person1", q => q.eq("type", item.type).eq("person1", person1 as Id<"persons">)).take(50 + movedOut);
    const effective = new Map<string, any>();
    for (const row of persisted) {
      const current = c.w.rows?.get(String(row._id)) ?? row;
      if (inIndex(current)) effective.set(String(row._id), current);
    }
    for (const row of c.w.rows?.values() ?? []) if (inIndex(row)) effective.set(String(row._id), row);
    const match = [...effective.values()].sort((a, b) => (a._creationTime ?? a.createdAt) - (b._creationTime ?? b.createdAt)).slice(0, 50)
      .find(row => row.person2 === person2 && matchesVaultOwner(row.vaultOwnerId, c.owner));
    if (match) { existingId = String(match._id); linked = true; }
  }
  const previous = existingId ? await ownedRow(c, "relationships", existingId) : null;
  const mapKey = externalRecordKey(c.job.system, "relationship", key, c.job.importKey);
  const mapping = previous && !c.baselines.has(mapKey) ? await c.ctx.db.query("mcpRecordKeys").withIndex("by_owner_type_key", q => q.eq("vaultOwnerId", c.owner).eq("recordType", "relationship").eq("recordKey", mapKey)).unique() : null;
  const baseline = c.baselines.has(mapKey) ? c.baselines.get(mapKey) : mapping?.lastImportedJson ? JSON.parse(mapping.lastImportedJson) : null;
  let retainedDate = false;
  // Explicit and inferred years have the same display shape. Remember only
  // proven inference in the import baseline; unmarked legacy dates stay cautious.
  type InferredYear = { type: string; original: string; year: number };
  const inferredYears: InferredYear[] = Array.isArray(baseline?._relationshipInferredYears)
    ? baseline._relationshipInferredYears.filter((entry: InferredYear) => {
      const current = previous?.facts?.filter(row => row.type === entry.type) ?? [];
      const original = baseline.facts?.filter((row: any) => row.type === entry.type) ?? [];
      return current.length === 1 && original.length === 1
        && current[0].date?.original === entry.original && current[0].date?.year === entry.year
        && original[0].date?.original === entry.original && original[0].date?.year === entry.year;
    }) : [];
  const suppliedFacts = Array.isArray(item.facts) && item.facts.length ? item.facts.map((fact: any) => clean({
      type: String(fact.type).slice(0, 120),
      date: withYear(fact.date),
      place: fact.place?.original ? { original: fact.place.original } : undefined,
      description: fact.description,
    })) : undefined;
  const facts = suppliedFacts?.map((fact: any, index: number) => {
    const supplied = item.facts[index].date;
    const matches = previous?.facts?.filter(row => row.type === fact.type) ?? [];
    const originals = Array.isArray(baseline?.facts) ? baseline.facts.filter((row: any) => row.type === fact.type) : [];
    if (!supplied) return fact;
    const inference = inferredYears.find(entry => entry.type === fact.type);
    const incoming = inference && matches.length === 1 && supplied.year === undefined && supplied.original !== matches[0].date?.original
      ? clean({ ...supplied, year: withYear(supplied)?.year }) : supplied;
    const rememberInference = (date: any) => {
      const position = inferredYears.findIndex(entry => entry.type === fact.type);
      if (position >= 0) inferredYears.splice(position, 1);
      const unique = (suppliedFacts ?? []).filter((row: any) => row.type === fact.type).length === 1;
      if (unique && originals.length <= 1 && matches.length <= 1 && supplied.year === undefined
        && (!matches[0]?.date || inference) && date?.year !== undefined && date.year === withYear(supplied)?.year) {
        inferredYears.push({ type: fact.type, original: date.original, year: date.year });
      }
    };
    if (matches.length !== 1 || originals.length > 1) { rememberInference(fact.date); return fact; }
    const date = mergeImportedValue(matches[0].date, incoming, originals[0]?.date, !!originals[0] && Object.hasOwn(originals[0], "date"));
    if (matches[0].date && matches[0].date.original !== supplied.original && date.kept) {
      fail("FACT_DATE_CONFIRMATION_REQUIRED", "Changed relationship date text conflicts with retained manual metadata.", "Review and resubmit the complete corrected date. This relationship item saved nothing.");
    }
    retainedDate ||= date.kept;
    const projected = projectFactDate(incoming, date.value);
    rememberInference(projected);
    return clean({ ...fact, date: projected });
  });
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
    createOnly: { importKey: `import:${externalRecordKey(c.job.system, "relationship", key, c.job.importKey)}` },
    baselineMetadata: { _relationshipInferredYears: inferredYears },
  });
  if (retainedDate && !saved.kept?.includes("facts")) saved.kept = [...(saved.kept ?? []), "facts"];
  if (previous) {
    const current = await ownedRow(c, "relationships", saved.id);
    const references = ["type", "childRelationType", "person1", "person2"] as const;
    const moved = current && references.some(field => !same(previous[field], current[field]));
    const keptReference = saved.kept?.some(field => references.some(reference => reference === field));
    if (current && (moved || !same(previous.facts, current.facts)) && await hasRetainedAttachments(c, "relationship", saved.id)) {
      fail("RELATIONSHIP_ATTRIBUTION_REVIEW_REQUIRED", "Relationship assertion changes cannot reattribute retained notes or citation evidence.",
        "Review the relationship and its attached material with the person. This relationship item saved nothing; all attachments were retained.");
    }
    if (current && ((moved && current.facts?.length && !same(suppliedFacts, current.facts)) || (keptReference && !same(previous.facts, current.facts)))) {
      fail("RELATIONSHIP_FACT_REVIEW_REQUIRED", "Relationship facts cannot acquire different endpoints or a conflicting retained identity without confirmation.",
        "Review the relationship and explicitly resubmit its complete facts with the correct endpoints. This relationship item saved nothing.");
    }
  }
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ----------------------------------------------------------------- sources */

async function resolveSourceIdentity(c: ChunkContext, key: string) {
  const mapped = await lookup(c, "source", key);
  const identities = new Set<string>(mapped ? [mapped] : []);
  if (c.job.system === "familysearch") {
    const row = mapped ? await ownedRow(c, "sources", mapped) : null;
    if (mapped && (!row || (row.fsId && row.fsId !== key))) fail("LEGACY_IDENTITY_REVIEW_REQUIRED", "The source mapping disagrees with its owned FamilySearch identity.", "Review the original source and mapping; neither was changed.");
    const legacy = await c.ctx.db.query("sources").withIndex("by_owner_fsId", q => q.eq("vaultOwnerId", c.owner).eq("fsId", key)).take(2);
    for (const source of legacy) identities.add(String(source._id));
    // Source PIDs are never reassigned, so stored matches cannot move away.
    for (const source of c.w.rows?.values() ?? []) if (source.vaultOwnerId === c.owner && source.fsId === key && typeof source.title === "string") identities.add(String(source._id));
  }
  if (identities.size > 1) fail("AMBIGUOUS_SOURCE_IDENTITY", "This outside source ID identifies different owned sources.", "Review the original sources before retrying; nothing was merged or rekeyed.");
  return { mapped, id: [...identities][0] ?? null };
}

async function importSource(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  const title = cleanText(item.title, "source title", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!;
  const identity = await resolveSourceIdentity(c, key);
  const existingId = identity.id;
  const linked = !identity.mapped && !!existingId;
  const saved = await upsertRow(c, {
    table: "sources",
    singular: "source",
    key,
    existingId,
    linked,
    doc: {
      title,
      type: item.type === undefined && existingId ? undefined : sourceTypeFor(item.type),
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
    createOnly: { importKey: `import:${externalRecordKey(c.job.system, "source", key, c.job.importKey)}` },
  });
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ------------------------------------------------------------------- media */

async function importMedia(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  const title = cleanText(item.title, "media title", FAMILY_HISTORY_MCP_LIMITS.shortText, true)!;
  const existingId = await lookup(c, "media", key);
  const previous = existingId ? await ownedRow(c, "media", existingId) : null;
  let personIds: string[] | undefined;
  if (item.personKeys !== undefined) {
    personIds = [];
    for (const personKey of item.personKeys) personIds.push(await personFor(c, personKey, "personKeys"));
  } else if (!existingId) personIds = [];
  let sourceId: string | undefined;
  if (item.sourceKey) {
    sourceId = (await resolveSourceIdentity(c, requiredKey(item.sourceKey, "sourceKey"))).id ?? undefined;
    if (!sourceId || !await ownedRow(c, "sources", sourceId)) fail("MISSING_SOURCE", `Source ${item.sourceKey} has no existing owned source.`, "Review missing or deleted sources before retrying; an old mapping is not a usable target.");
  }
  const saved = await upsertRow(c, {
    table: "media",
    singular: "media",
    key,
    existingId,
    doc: {
      type: item.type ?? (existingId ? undefined : "other"),
      title,
      description: cleanText(item.description, "media description", FAMILY_HISTORY_MCP_LIMITS.notes),
      // A reference only. No bytes travel with an import; the link is the
      // outside site's own, and only the person's signed-in browser can open it.
      url: item.url,
      mimeType: item.mimeType,
      date: item.date,
      personIds,
      sourceId,
      familySearchUrl: c.job.system === "familysearch" ? item.url : undefined,
      externalIds: externalIdsFor(c, key, undefined, item.url),
    },
    createOnly: {
      importKey: `import:${externalRecordKey(c.job.system, "media", key, c.job.importKey)}`,
      privacyLevel: "private",
      reviewStatus: "unreviewed",
      rightsStatus: "unknown",
      aiUseAllowed: false,
    },
  });
  if (previous) {
    const current = await ownedRow(c, "media", saved.id);
    const reviewed = previous.reviewedAt !== undefined || previous.aiUseAllowed === true
      || (previous.reviewStatus !== undefined && previous.reviewStatus !== "unreviewed")
      || (previous.privacyLevel !== undefined && previous.privacyLevel !== "private")
      || (previous.rightsStatus !== undefined && previous.rightsStatus !== "unknown");
    const content = ["type", "title", "description", "url", "mimeType", "date", "personIds", "sourceId", "familySearchUrl"] as const;
    if (current && content.some(field => !same(previous[field], current[field]))) {
      if (reviewed) fail("MEDIA_REVIEW_REQUIRED", "Changed media content or attribution cannot inherit an earlier privacy, rights or AI-use decision.",
        "Review the replacement with the person before retrying. This media item saved nothing and retained the original review decision.");
      if (await hasRetainedAttachments(c, "media", saved.id)) fail("MEDIA_ATTRIBUTION_REVIEW_REQUIRED", "Changed media content or attribution cannot inherit retained notes or citation evidence.",
        "Review the media and its attachments with the person. This media item saved nothing; its original content and attachments were retained.");
    }
  }
  return { key, status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* --------------------------------------------------------------- citations */

const TARGET_TABLE = { person: "person", relationship: "relationship", fact: "event", note: "note", media: "media" } as const;

async function resolveTarget(c: ChunkContext, target: TargetInput): Promise<{ targetType: "person" | "relationship" | "event" | "note" | "media"; targetId: string; field?: string }> {
  const key = requiredKey(target?.key, "target key");
  const singular = target.kind === "fact" ? "fact" : target.kind;
  if (!(target.kind in TARGET_TABLE)) fail("VALIDATION_ERROR", `Unknown target kind ${String(target.kind)}.`, "Use person, relationship, fact, note or media.");
  const lookupKey = target.kind === "fact" ? factTargetKey(requiredKey(target.personKey, "target personKey"), key) : key;
  if (target.kind === "fact") {
    await personFor(c, target.personKey, "target personKey");
    await rejectLegacyIdentity(c, "fact", lookupKey, `${target.personKey!.trim()}/${key}`);
  }
  const id = await lookupReference(c, singular, lookupKey, target.keyOrigin);
  if (!id) fail("MISSING_TARGET", `The ${target.kind} ${lookupKey} has not been imported yet.`, "Send what the citation supports first, then resend this row.");
  return { targetType: TARGET_TABLE[target.kind], targetId: id, ...(target.field ? { field: target.field.slice(0, 80) } : {}) };
}

async function importCitation(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const sourceKey = requiredKey(item?.sourceKey, "sourceKey");
  if (!Array.isArray(item.targets) || item.targets.length === 0) fail("VALIDATION_ERROR", "A citation must support at least one record.", "Add targets: the person, fact or relationship this source supports.");
  const key = requiredKey(citationKeyFor(item), "key");
  const singular = item.key?.trim() ? "citation" : "citationGenerated";
  await rejectLegacyIdentity(c, singular, key, legacyCitationKeyFor(item), "citation");
  const sourceId = (await resolveSourceIdentity(c, sourceKey)).id;
  if (!sourceId || !await ownedRow(c, "sources", sourceId)) fail("MISSING_SOURCE", `Source ${sourceKey} has no existing owned source.`, "Review missing or deleted sources before retrying; an old mapping is not a usable target.");
  const targets: Awaited<ReturnType<typeof resolveTarget>>[] = [];
  for (const target of item.targets.slice(0, TREE_IMPORT_LIMITS.targetsPerCitation)) targets.push(await resolveTarget(c, target));
  const existingId = await lookup(c, singular, key);
  if (singular === "citation") await assertExplicitIdentity(c, "citations", existingId, key);
  const previous = existingId ? await ownedRow(c, "citations", existingId) : null;
  const evidence = {
    sourceId,
    page: item.page,
    // An omitted quality is a partial refresh, not a reset of a known rating.
    confidence: item.quality === undefined && existingId ? undefined : confidenceForQuality(item.quality),
    extractedText: cleanText(item.extractedText, "citation extractedText", FAMILY_HISTORY_MCP_LIMITS.notes),
    url: item.url,
    accessDate: item.accessDate,
    notes: cleanText(item.notes, "citation notes", FAMILY_HISTORY_MCP_LIMITS.notes),
  };
  const saved = await upsertRow(c, {
    table: "citations",
    singular,
    key,
    existingId,
    doc: {
      ...evidence,
      externalIds: item.key ? [{ system: c.job.system, id: String(item.key) }] : undefined,
    },
    createOnly: { isEvidence: true, importKey: `import:${externalRecordKey(c.job.system, singular, key, c.job.importKey)}` },
  });
  if (saved.kept?.length) {
    // Retaining corrected evidence cannot authorize links from a different
    // incoming assertion. The item's mutation/planning boundary rolls back
    // any partial refresh and its baseline before this failure is returned.
    fail("CITATION_EVIDENCE_CONFLICT", `Corrected citation fields conflict with the incoming evidence: ${saved.kept.join(", ")}.`,
      "Review the corrected citation with the person, then resend matching evidence and targets. This citation item saved nothing.");
  }
  const current = previous ? await ownedRow(c, "citations", saved.id) : null;
  const evidenceFields = ["sourceId", "page", "confidence", "extractedText", "url", "accessDate", "notes"] as const;
  const evidenceChanged = !!previous && !!current && evidenceFields.some(field => !same(previous[field], current[field]));
  // Resolve additions before writing any link, including repeated input targets.
  const additions = new Map<string, (typeof targets)[number]>();
  for (const target of targets) {
    const virtualLink = [...(c.w.rows?.values() ?? [])].some(row => row.citationId === saved.id && row.targetType === target.targetType && row.targetId === target.targetId && row.field === target.field && row.vaultOwnerId === c.owner);
    let existingLink = virtualLink;
    if (!existingLink && !isPlaceholder(saved.id) && !isPlaceholder(target.targetId)) {
      existingLink = (await c.ctx.db.query("citationLinks").withIndex("by_citation_and_target", q =>
        q.eq("citationId", saved.id as Id<"citations">).eq("targetType", target.targetType).eq("targetId", target.targetId),
      ).filter(q => q.eq(q.field("field"), target.field)).take(1)).length > 0;
    }
    if (!existingLink) additions.set(JSON.stringify([target.targetType, target.targetId, target.field ?? null]), target);
  }
  if (current && (evidenceChanged || additions.size > 0)) {
    if (await hasRetainedAttachments(c, "citation", saved.id)) fail("CITATION_NOTE_REVIEW_REQUIRED", "Changed citation evidence or attribution cannot carry retained explanatory notes.",
      "Review the citation and its notes with the person. This citation item saved nothing; its original evidence, links and notes were retained.");
    if (!isEmpty(current.editedText)) fail("CITATION_INTERPRETATION_REVIEW_REQUIRED", "Retained human interpretation cannot acquire new citation attribution through import.",
      "Review the citation interpretation and its source/targets with the person. The import interface cannot confirm editedText; this citation item saved nothing.");
    const omitted = evidenceFields.filter(field => {
      // "medium" is the importer's unspecified-quality default, not an
      // outside quality assertion. Every substantive retained field needs
      // its actual value resubmitted before changing attribution.
      if (field === "confidence" && current.confidence === "medium") return false;
      return !isEmpty(current[field]) && evidence[field] === undefined;
    });
    if (omitted.length) fail("CITATION_EVIDENCE_CONFIRMATION_REQUIRED", `Changing citation attribution requires the retained evidence: ${omitted.join(", ")}.`,
      "Read the corrected citation and explicitly resubmit its evidence before adding targets or refreshing evidence. This citation item saved nothing.");
  }
  if (evidenceChanged) {
    const persisted = isPlaceholder(saved.id) ? [] : await c.ctx.db.query("citationLinks")
      .withIndex("by_citation", q => q.eq("citationId", saved.id as Id<"citations">)).take(TREE_IMPORT_LIMITS.targetsPerCitation + 1);
    const virtual = [...(c.w.rows?.values() ?? [])].filter(row => row.citationId === saved.id && row.targetType);
    const supports = (link: any) => link.vaultOwnerId === c.owner && targets.some(target => target.targetType === link.targetType && target.targetId === link.targetId && target.field === link.field);
    if (persisted.length > TREE_IMPORT_LIMITS.targetsPerCitation || ![...persisted, ...virtual].every(supports)) {
      fail("CITATION_TARGET_REVIEW_REQUIRED", "Changed evidence does not explicitly support every existing citation target.",
        "Review the citation and all its existing targets with the person. No original links were deleted and this citation item saved nothing.");
    }
  }
  for (const target of additions.values()) {
    await c.w.insert("citationLinks", { vaultOwnerId: c.owner, citationId: saved.id, ...target, createdAt: Date.now() });
    if (saved.status === "unchanged") saved.status = "updated";
  }
  return { key, keyOrigin: singular === "citationGenerated" ? "generated" : "explicit", status: saved.status, id: saved.id, ...(saved.kept ? { kept: saved.kept } : {}) };
}

/* ------------------------------------------------------------------- notes */

const NOTE_SUBJECT_KIND = { person: "person", relationship: "relationship", fact: "event", media: "media", source: "source", citation: "citation" } as const;

async function importNote(c: ChunkContext, item: any): Promise<Omit<ItemResult, "kind" | "index">> {
  const key = requiredKey(item?.key, "key");
  const text = cleanText(item.text, "note text", TREE_IMPORT_LIMITS.noteText, true)!;
  const subject = item.subject ?? {};
  const kind = NOTE_SUBJECT_KIND[subject.kind as keyof typeof NOTE_SUBJECT_KIND];
  if (!kind) fail("VALIDATION_ERROR", "A note needs a subject.", "Say which person, relationship, fact, source, citation or media the note belongs to.");
  const subjectKey = subject.kind === "fact" ? factTargetKey(requiredKey(subject.personKey, "subject personKey"), requiredKey(subject.key, "subject key")) : requiredKey(subject.key, "subject key");
  if (subject.kind === "fact") {
    await personFor(c, subject.personKey, "subject personKey");
    await rejectLegacyIdentity(c, "fact", subjectKey, `${subject.personKey.trim()}/${subject.key.trim()}`);
  }
  const subjectId = await lookupReference(c, subject.kind === "fact" ? "fact" : subject.kind, subjectKey, subject.keyOrigin);
  if (!subjectId) fail("MISSING_TARGET", `The ${subject.kind} ${subjectKey} has not been imported yet.`, "Send the record the note belongs to first, then resend this row.");
  const existingId = await lookup(c, "note", key);
  const previous = existingId ? await ownedRow(c, "notes", existingId) : null;
  const nextSubject = { kind, id: subjectId };
  if (previous && !same(previous.subject, nextSubject)) {
    fail("NOTE_SUBJECT_CONFLICT", "An existing imported note cannot be reassigned to a different subject.",
      "Review the note and its subject with the person before retrying. This note item saved nothing.");
  }
  const saved = await upsertRow(c, {
    table: "notes",
    singular: "note",
    key,
    existingId,
    doc: {
      subject: nextSubject,
      noteType: item.noteType ?? (existingId ? undefined : "general"),
      title: cleanText(item.title, "note title", FAMILY_HISTORY_MCP_LIMITS.shortText),
      text,
      externalIds: externalIdsFor(c, key, undefined),
    },
  });
  if (previous) {
    const current = await ownedRow(c, "notes", saved.id);
    const content = ["noteType", "title", "text"] as const;
    if (current && content.some(field => !same(previous[field], current[field])) && await hasRetainedAttachments(c, "note", saved.id)) {
      fail("NOTE_ATTRIBUTION_REVIEW_REQUIRED", "Changed note assertions cannot inherit retained citation evidence.",
        "Review the note and its supporting citations with the person. This note item saved nothing; the original note and evidence links were retained.");
    }
  }
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
    // Match a real item's nested mutation rollback boundary for dry planning.
    const before = c.w.dryRun ? { local: new Map(c.local), plannedNow: c.plannedNow.length, duplicatesSuggested: c.duplicatesSuggested, rows: new Map(c.w.rows), baselines: new Map(c.baselines), personIndexes: new Map(c.w.personIndexes), relationshipIndexes: new Map(c.w.relationshipIndexes) } : null;
    try {
      const saved = c.w.dryRun
        ? await importer(c, item.item)
        : await (c.ctx as MutationCtx).runMutation(self.applyTreeImportItem, {
          owner: c.owner, job: c.job, provenance: c.provenance, item,
        });
      if (!c.w.dryRun) c.duplicatesSuggested += saved.possibleDuplicates?.length ?? 0;
      results.push({ kind: item.kind, index: item.index, ...saved });
    } catch (error) {
      if (before) {
        c.local.clear();
        for (const [key, id] of before.local) c.local.set(key, id);
        c.plannedNow.length = before.plannedNow;
        c.duplicatesSuggested = before.duplicatesSuggested;
        c.baselines = before.baselines;
        if (c.w.personIndexes) { c.w.personIndexes.clear(); for (const [id, index] of before.personIndexes) c.w.personIndexes.set(id, index); }
        if (c.w.relationshipIndexes) { c.w.relationshipIndexes.clear(); for (const [id, index] of before.relationshipIndexes) c.w.relationshipIndexes.set(id, index); }
        if (c.w.rows) {
          c.w.rows.clear();
          for (const [id, row] of before.rows) c.w.rows.set(id, row);
        }
      }
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

/** Each row is a subtransaction: a late fact/link failure rolls back all writes. */
export const applyTreeImportItem = internalMutation({
  args: { owner: v.string(), job: v.any(), provenance: v.any(), item: v.any() },
  handler: async (ctx, args): Promise<Omit<ItemResult, "kind" | "index">> => {
    const c: ChunkContext = {
      ctx, w: liveWriter(ctx), owner: args.owner, job: args.job, provenance: args.provenance,
      local: new Map(), planned: new Set(), plannedNow: [], baselines: new Map(), duplicatesSuggested: 0,
    };
    const item = args.item as TreeImportItem;
    try {
      return await IMPORTERS[item.kind](c, item.item);
    } catch (error) {
      if (error instanceof ItemFailure) machineError(error.code as any, error.message, error.whatToDo);
      throw error;
    }
  },
});

/** A dry run of one chunk. Reads only; the writer changes nothing. */
export const planTreeImportChunk = internalQuery({
  args: { ...chunkArgs, plannedKeys: v.array(v.string()), plannedRecords: v.optional(v.array(v.object({ key: v.string(), recordId: v.string() }))), plannedState: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const job = await loadJob(ctx, owner, args.importJobId, true);
    const local = new Map((args.plannedRecords ?? []).map(row => [row.key, row.recordId]));
    if (args.plannedKeys.some(key => !local.has(key))) {
      machineError("VALIDATION_ERROR", "Dry-run keys need their original identity mappings.", "Restart the dry run and carry plannedRecords alongside plannedKeys between chunks.");
    }
    const c: ChunkContext = {
      ctx, w: dryWriter(args.operationId, new Map<string, any>(args.plannedState?.rows ?? []), new Map<string, { surname: string; year: number | null; fsId?: string }>(args.plannedState?.personIndexes ?? []), new Map<string, { type: string; person1: string | null }>(args.plannedState?.relationshipIndexes ?? [])), owner, job, provenance: importProvenance(args.principal, args.operationId),
      local, planned: new Set(args.plannedKeys), plannedNow: [], baselines: new Map<string, Record<string, unknown> | null>(args.plannedState?.baselines ?? []), duplicatesSuggested: 0,
    };
    const results = await runChunk(c, args.items as TreeImportItem[]);
    const suggested = results.reduce((total, row) => total + (row.possibleDuplicates?.length ?? 0), 0);
    const plannedState = { rows: [...(c.w.rows ?? [])], baselines: [...c.baselines], personIndexes: [...(c.w.personIndexes ?? [])], relationshipIndexes: [...(c.w.relationshipIndexes ?? [])] };
    if (new TextEncoder().encode(JSON.stringify(plannedState)).byteLength > FAMILY_HISTORY_MCP_LIMITS.requestBytes) {
      machineError("DRY_RUN_PLAN_LIMIT", "This dry-run document plan exceeds its memory budget.", "Use smaller dry-run batches; no records were saved.");
    }
    return { results, plannedState, plannedKeys: c.plannedNow, plannedRecords: [...c.local].map(([key, recordId]) => ({ key, recordId })), duplicatesSuggested: suggested };
  },
});

const CHUNK_RECEIPT_BYTES = 64_000;
const DETAIL_PAGE_BYTES = 48_000;

function assertBatchBinding(receipt: Doc<"mcpOperations">, args: { requestHash: string; importJobId: string; batchIndex: number }) {
  const binding = receipt.pendingImport ?? JSON.parse(receipt.resultJson);
  if (receipt.toolName !== BATCH_TOOL || receipt.requestHash !== args.requestHash || String(binding.importJobId) !== args.importJobId || binding.batchIndex !== args.batchIndex) {
    machineError("IDEMPOTENCY_CONFLICT", "This operation ID belongs to different Family History work or another import batch.", "Resume the original request exactly, or use a new operationId for different work.");
  }
}

async function importReceipt(ctx: QueryCtx | MutationCtx, owner: string, jobId: Id<"treeImports">, operationId: string, chunkIndex: number, detailIndex: number) {
  const receipt = await ctx.db.query("treeImportReceipts").withIndex("by_owner_job_operation_chunk_detail", q =>
    q.eq("vaultOwnerId", owner).eq("importJobId", jobId).eq("operationId", operationId).eq("chunkIndex", chunkIndex).eq("detailIndex", detailIndex)).unique();
  if (receipt) return receipt;
  // Read old receipts without creating more entries in their ambiguous domain.
  const legacyId = `${operationId}#${chunkIndex}${detailIndex < 0 ? "" : `:detail:${detailIndex}`}`;
  const rows = await ctx.db.query("mcpOperations").withIndex("by_owner_operation", q => q.eq("vaultOwnerId", owner).eq("operationId", legacyId)).take(2);
  const expectedTool = `${BATCH_TOOL}#${detailIndex < 0 ? "chunk" : "detail"}`;
  const matches = rows.filter(row => row.toolName === expectedTool && (!JSON.parse(row.resultJson).importJobId || JSON.parse(row.resultJson).importJobId === String(jobId)));
  if (rows.length > 1) machineError("LEGACY_IDENTITY_REVIEW_REQUIRED", "Older receipt identities collide.", "Review the original operation receipts; no receipt was overwritten.");
  return matches[0] ?? null;
}

function resultEntries(results: ItemResult[]): Record<string, unknown>[] {
  return results.flatMap<Record<string, unknown>>(row => {
    const { kept, ...base } = row;
    return kept?.length ? kept.map(field => clean({ ...base, kept: field })) : [clean(base)];
  });
}

/** Store expanded conflicts before they can exceed a Convex document. */
async function boundedChunkResult(ctx: MutationCtx, args: { batchOperationId: string; chunkIndex: number; requestHash: string }, owner: string, importJobId: Id<"treeImports">, results: ItemResult[], duplicatesSuggested: number) {
  const full = { importJobId, results, plannedKeys: [] as string[], duplicatesSuggested };
  if (new TextEncoder().encode(JSON.stringify(full)).byteLength <= CHUNK_RECEIPT_BYTES) return full;
  const entries = resultEntries(results);
  const pages: Record<string, unknown>[][] = [];
  let page: Record<string, unknown>[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = new TextEncoder().encode(JSON.stringify(entry)).byteLength + 1;
    if (size > DETAIL_PAGE_BYTES) machineError("RESULT_DETAIL_LIMIT", "One result detail exceeds its bounded page budget.", "Use shorter outside keys or smaller fact groups; this chunk was not saved.");
    if (bytes + size > DETAIL_PAGE_BYTES && page.length) { pages.push(page); page = []; bytes = 0; }
    page.push(entry); bytes += size;
  }
  if (page.length) pages.push(page);
  for (const [index, entries] of pages.entries()) await ctx.db.insert("treeImportReceipts", {
    vaultOwnerId: owner, importJobId, operationId: args.batchOperationId, chunkIndex: args.chunkIndex, detailIndex: index, requestHash: args.requestHash,
    resultJson: JSON.stringify({ importJobId, entries }), createdAt: Date.now(),
  });
  const compact = { ...full, results: results.map(row => {
    const { kept, ...rest } = row;
    return { ...rest, ...(kept?.length ? { keptCount: kept.length } : {}) };
  }), detailEntryCounts: pages.map(entries => entries.length) };
  if (new TextEncoder().encode(JSON.stringify(compact)).byteLength > 800_000) machineError("RESULT_DETAIL_LIMIT", "The compact chunk receipt exceeds its safe document budget.", "Use smaller batches; this chunk was not saved.");
  return compact;
}

/** One chunk of a real batch: one transaction, replay-safe under its own receipt. */
export const applyTreeImportChunk = internalMutation({
  args: { ...chunkArgs, requestHash: v.string(), batchOperationId: v.string(), batchRequestHash: v.string(), batchIndex: v.number(), chunkIndex: v.number() },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const job = await loadJob(ctx, owner, args.importJobId, false);
    const operation = await ctx.db.query("mcpOperations").withIndex("by_owner_operation", q => q.eq("vaultOwnerId", owner).eq("operationId", args.batchOperationId)).unique();
    if (!operation) machineError("IDEMPOTENCY_CONFLICT", "This import operation has no reservation.", "Prepare the original batch before running its chunks.");
    assertBatchBinding(operation, { requestHash: args.batchRequestHash, importJobId: args.importJobId, batchIndex: args.batchIndex });
    if (args.requestHash !== `${args.batchRequestHash}#${args.chunkIndex}`) machineError("IDEMPOTENCY_CONFLICT", "The chunk hash does not match its reserved operation.", "Resume the original batch exactly.");
    const receipt = await importReceipt(ctx, owner, job._id, args.batchOperationId, args.chunkIndex, -1);
    if (receipt) {
      if (receipt.requestHash !== args.requestHash) {
        machineError("IDEMPOTENCY_CONFLICT", "This operation ID was already used for a different batch.", "Reuse the original batch exactly, or mint a new operationId.");
      }
      return JSON.parse(receipt.resultJson) as { results: ItemResult[]; plannedKeys: string[]; duplicatesSuggested: number };
    }
    if (!operation.pendingImport) machineError("IDEMPOTENCY_CONFLICT", "This operation already completed and has no matching chunk receipt.", "Use the original completed operation result.");
    if (job.status !== "open") machineError("VALIDATION_ERROR", "That tree import is already marked complete.", "Reopen it with family_history_begin_tree_import.");
    const c: ChunkContext = {
      ctx, w: liveWriter(ctx), owner, job, provenance: importProvenance(args.principal, args.operationId),
      local: new Map(), planned: new Set(), plannedNow: [], baselines: new Map(), duplicatesSuggested: 0,
    };
    const results = await runChunk(c, args.items as TreeImportItem[]);
    const result = await boundedChunkResult(ctx, args, owner, job._id, results, c.duplicatesSuggested);
    await ctx.db.insert("treeImportReceipts", {
      vaultOwnerId: owner,
      importJobId: job._id,
      operationId: args.batchOperationId,
      chunkIndex: args.chunkIndex,
      detailIndex: -1,
      requestHash: args.requestHash,
      resultJson: JSON.stringify(result),
      createdAt: Date.now(),
    });
    return result;
  },
});

const prepareBatchArgs = {
  principal: principalValidator,
  grantId: v.optional(v.string()),
  importJobId: v.string(),
  operationId: v.string(),
  requestHash: v.string(),
  batchIndex: v.number(),
  dryRun: v.boolean(),
};

type PrepareBatchInput = { principal: McpPrincipal; grantId?: string; importJobId: string; operationId: string; requestHash: string; batchIndex: number; dryRun: boolean };

async function prepareBatch(ctx: QueryCtx | MutationCtx, args: PrepareBatchInput, reserve: boolean) {
  const owner = ownerFromPrincipal(args.principal);
  await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
  const receipt = await ctx.db.query("mcpOperations")
    .withIndex("by_owner_operation", q => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId)).unique();
  if (receipt && !args.dryRun) {
    assertBatchBinding(receipt, args);
    if (!receipt.pendingImport) return { replay: { ...(JSON.parse(receipt.resultJson) as Record<string, unknown>), deduplicated: true } };
  }
  const job = await loadJob(ctx, owner, args.importJobId, true);
  if (!Number.isInteger(args.batchIndex) || args.batchIndex < 0 || args.batchIndex > job.nextBatchIndex) {
    machineError("VALIDATION_ERROR", `This import expects batch ${job.nextBatchIndex} next (or a resend of an earlier one).`,
      `Send batchIndex ${job.nextBatchIndex}. Call family_history_get_tree_import for saved progress.`);
  }
  if (reserve && !args.dryRun && !receipt) {
    // Adopt an older interrupted operation only for its original job/hash.
    const earlier = await ctx.db.query("treeImportReceipts").withIndex("by_owner_operation_job", q => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId).lt("importJobId", job._id)).first();
    const later = await ctx.db.query("treeImportReceipts").withIndex("by_owner_operation_job", q => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId).gt("importJobId", job._id)).first();
    const original = await ctx.db.query("treeImportReceipts").withIndex("by_owner_operation_job", q => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId).eq("importJobId", job._id)).first();
    const legacy = await ctx.db.query("mcpOperations").withIndex("by_owner_operation", q => q.eq("vaultOwnerId", owner).eq("operationId", `${args.operationId}#0`)).take(2);
    const legacyChunks = legacy.filter(row => row.toolName === `${BATCH_TOOL}#chunk`);
    if (earlier || later || (original && original.requestHash !== `${args.requestHash}#${original.chunkIndex}`)
      || legacyChunks.some(row => row.requestHash !== `${args.requestHash}#0` || (JSON.parse(row.resultJson).importJobId && JSON.parse(row.resultJson).importJobId !== args.importJobId))) {
      machineError("IDEMPOTENCY_CONFLICT", "Older committed chunks reserve this operation for different import work.", "Resume the original job with its exact request; use a new operationId for different work.");
    }
    if (legacy.length > 1) machineError("IDEMPOTENCY_CONFLICT", "Older operation receipts collide.", "Review the original receipts before resuming; nothing was overwritten.");
    await (ctx as MutationCtx).db.insert("mcpOperations", {
      vaultOwnerId: owner, operationId: args.operationId, toolName: BATCH_TOOL, requestHash: args.requestHash,
      pendingImport: { importJobId: job._id, batchIndex: args.batchIndex }, resultJson: "{}", clientId: args.principal.clientId, createdAt: Date.now(),
    });
  }
  return { replay: null };
}

/** Dry-run preparation reads only and never reserves caller identities. */
export const validateTreeImportBatch = internalQuery({
  args: prepareBatchArgs,
  handler: (ctx, args) => prepareBatch(ctx, args, false),
});

/** Real preparation reserves the owner-wide operation before any chunk writes. */
export const prepareTreeImportBatch = internalMutation({
  args: prepareBatchArgs,
  handler: (ctx, args) => prepareBatch(ctx, args, true),
});

function compactResults(results: ItemResult[]) {
  // Unchanged rows need no id to act on; leaving them as counts keeps a
  // 500-row receipt well inside its size budget.
  return results.filter((row) => row.status !== "unchanged" || row.kept?.length || row.keptCount);
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
    chunkCount: v.optional(v.number()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    const grant = await assertGrantPermits(ctx, { owner, grantId: args.grantId, toolName: BATCH_TOOL, input: {} });
    const existing = await ctx.db
      .query("mcpOperations")
      .withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId))
      .unique();
    if (existing) {
      assertBatchBinding(existing, args);
      if (!existing.pendingImport) return { ...(JSON.parse(existing.resultJson) as Record<string, unknown>), deduplicated: true };
    }
    if (!existing) machineError("IDEMPOTENCY_CONFLICT", "This import operation has no reservation.", "Prepare the original batch before finalizing it.");
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
    const submittedCursor = cleanText(args.cursor, "cursor", TREE_IMPORT_LIMITS.cursor);
    const cursor = args.batchIndex >= job.nextBatchIndex ? submittedCursor ?? job.cursor : job.cursor;
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
      resultDetails: { operationId: args.operationId, chunkCount: args.chunkCount ?? 0 },
    };
    let resultJson = JSON.stringify(result);
    if (resultJson.length > FAMILY_HISTORY_MCP_LIMITS.resultJson || results.some(row => row.keptCount)) {
      result.results = [];
      result.resultsTrimmed = "Full results, including failures and retained conflicts, are available through family_history_get_tree_import using resultDetails.operationId, resultsChunkIndex and resultsOffset.";
      resultJson = JSON.stringify(result);
    }
    await ctx.db.patch(existing._id, { resultJson, pendingImport: undefined });
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
    const preparation = {
      ...base,
      operationId: args.operationId,
      requestHash: args.requestHash,
      batchIndex: input.batchIndex,
      dryRun,
    };
    const prep: { replay: BatchResponse | null } = dryRun
      ? await ctx.runQuery(self.validateTreeImportBatch, preparation)
      : await ctx.runMutation(self.prepareTreeImportBatch, preparation);
    if (prep.replay) return prep.replay;

    const chunks = chunkBatch(input);
    const results: ItemResult[] = [];
    const planned: string[] = [];
    let plannedRecords: { key: string; recordId: string }[] = [];
    let plannedState: unknown = undefined;
    let duplicatesSuggested = 0;
    for (const [index, items] of chunks.entries()) {
      const chunk: { results: ItemResult[]; plannedKeys: string[]; plannedRecords?: { key: string; recordId: string }[]; plannedState?: unknown; duplicatesSuggested: number } = dryRun
        ? await ctx.runQuery(self.planTreeImportChunk, { ...base, operationId: `${args.operationId}#${index}`, items, plannedKeys: planned, plannedRecords, ...(plannedState ? { plannedState } : {}) })
        : await ctx.runMutation(self.applyTreeImportChunk, {
          ...base,
          operationId: `${args.operationId}#${index}`,
          batchOperationId: args.operationId,
          batchRequestHash: args.requestHash,
          batchIndex: input.batchIndex,
          chunkIndex: index,
          requestHash: `${args.requestHash}#${index}`,
          items,
        });
      results.push(...chunk.results);
      planned.push(...chunk.plannedKeys);
      plannedRecords = chunk.plannedRecords ?? plannedRecords;
      plannedState = chunk.plannedState ?? plannedState;
      duplicatesSuggested += chunk.duplicatesSuggested;
    }

    if (dryRun) {
      return {
        dryRun: true,
        importJobId: base.importJobId,
        batchIndex: input.batchIndex,
        counts: addCounts(emptyCounts(), results),
        possibleDuplicates: duplicatesSuggested,
        results: results.filter((row) => row.status !== "unchanged" || row.kept?.length || row.keptCount),
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
      chunkCount: chunks.length,
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
    resultsOperationId: v.optional(v.string()),
    resultsChunkIndex: v.optional(v.number()),
    resultsOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = ownerFromPrincipal(args.principal);
    if (args.resultsOperationId && !args.importJobId) machineError("VALIDATION_ERROR", "Result pages need an importJobId.", "Supply the import whose receipt you are reading.");
    if (!args.importJobId) {
      const jobs = await ctx.db
        .query("treeImports")
        .withIndex("by_owner_updated", (q) => q.eq("vaultOwnerId", owner))
        .order("desc")
        .take(10);
      return { imports: jobs.map(jobSummary) };
    }
    const job = await loadJob(ctx, owner, args.importJobId, false);
    if (args.resultsOperationId) {
      const chunkIndex = args.resultsChunkIndex ?? 0;
      const offset = args.resultsOffset ?? 0;
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || !Number.isInteger(offset) || offset < 0) machineError("VALIDATION_ERROR", "Invalid result page.", "Use nonnegative integer chunk and offset values.");
      const receipt = await ctx.db.query("mcpOperations").withIndex("by_owner_operation", q => q.eq("vaultOwnerId", owner).eq("operationId", args.resultsOperationId!)).unique();
      const summary = receipt?.toolName === BATCH_TOOL ? JSON.parse(receipt.resultJson) : null;
      if (!summary || summary.importJobId !== String(job._id) || chunkIndex >= (summary.resultDetails?.chunkCount ?? 0)) machineError("NOT_FOUND", "That result page is not available for this import.", "Use the operationId and chunk count returned by the batch.");
      const chunk = await importReceipt(ctx, owner, job._id, args.resultsOperationId, chunkIndex, -1);
      const data = chunk ? JSON.parse(chunk.resultJson) : null;
      if (!data || data.importJobId !== String(job._id)) machineError("NOT_FOUND", "The detailed chunk receipt is not available.", "Use a batch with retrievable resultDetails.");
      let page: Record<string, unknown>[];
      let total: number;
      if (data.detailEntryCounts) {
        const counts = data.detailEntryCounts as number[];
        total = counts.reduce((sum, count) => sum + count, 0);
        let pageIndex = 0;
        let localOffset = offset;
        while (pageIndex < counts.length && localOffset >= counts[pageIndex]) { localOffset -= counts[pageIndex]; pageIndex++; }
        if (pageIndex >= counts.length) machineError("VALIDATION_ERROR", "Result offset is outside the chunk.", "Use the returned next cursor.");
        const detail = await importReceipt(ctx, owner, job._id, args.resultsOperationId, chunkIndex, pageIndex);
        const value = detail ? JSON.parse(detail.resultJson) : null;
        if (!value || value.importJobId !== String(job._id)) machineError("NOT_FOUND", "That result detail is unavailable for this import.", "Use the returned resultDetails pointer.");
        page = value.entries.slice(localOffset, localOffset + 10);
      } else {
        const entries = resultEntries(data.results as ItemResult[]);
        total = entries.length;
        page = entries.slice(offset, offset + 10);
      }
      const nextOffset = offset + page.length;
      const next = nextOffset < total ? { resultsChunkIndex: chunkIndex, resultsOffset: nextOffset }
        : chunkIndex + 1 < summary.resultDetails.chunkCount ? { resultsChunkIndex: chunkIndex + 1, resultsOffset: 0 } : null;
      return { importJobId: String(job._id), resultsOperationId: args.resultsOperationId, resultsChunkIndex: chunkIndex, resultsOffset: offset, results: page, next };
    }
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
      if (!a || !b || a.living || b.living || a.vaultOwnerId !== owner || b.vaultOwnerId !== owner) continue;
      suggestions.push({
        connectionId: row._id,
        personId: row.from.id,
        personName: `${a.name.given} ${a.name.surname}`.trim(),
        possiblySameAsId: row.to.id,
        possiblySameAsName: `${b.name.given} ${b.name.surname}`.trim(),
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
