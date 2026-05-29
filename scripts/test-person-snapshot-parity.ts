/**
 * GEN-92 per-person loader parity test.
 *
 * The single-person Convex consumers (getPersonWorkspace, getContextPack,
 * getPersonResearchChecks) used to load the ENTIRE vault via getVaultSnapshot
 * just to assemble ONE person's workspace. GEN-92 adds loadPersonScopedSnapshot,
 * which fetches only that person's related rows and feeds them into the SAME
 * assembly helper (assemblePersonWorkspaceFromSnapshot).
 *
 * This test PROVES the optimization is behavior-preserving: it seeds an
 * in-memory fixture vault (multiple people with relationships, events, media,
 * citations, stories, context, etc.), then runs BOTH assembly paths for a
 * target person and deep-equals the two outputs. They MUST be byte-identical.
 *
 * It uses a hand-rolled fake QueryCtx (no Convex runtime), mirroring the
 * dependency-injection style of scripts/test-vault-migration.ts. The fake db
 * orders index reads by `_creationTime` ascending, matching real Convex
 * `withIndex(...).collect()` ordering — which is the invariant the scoped
 * loader relies on for identical output.
 */
import assert from "node:assert/strict";
import {
  getVaultSnapshot,
  loadPersonScopedSnapshot,
  assemblePersonWorkspaceFromSnapshot,
} from "@/convex/vault";

const OWNER = "local-dev";

// ---------------------------------------------------------------------------
// Fake QueryCtx / db
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown> & { _id: string; _creationTime: number };

class FakeQuery {
  constructor(
    private rows: AnyRow[],
    private predicate: (row: AnyRow) => boolean = () => true
  ) {}

  withIndex(
    _indexName: string,
    fn?: (q: IndexBuilder) => IndexBuilder
  ): FakeQuery {
    if (!fn) return this;
    const builder = new IndexBuilder();
    fn(builder);
    const eqs = builder.eqs;
    return new FakeQuery(this.rows, (row) =>
      eqs.every(([field, value]) => {
        const fieldValue = valueAtPath(row, field);
        // GEN-92FU: Convex indexes array fields by element. When the indexed
        // field is an array (e.g. media/contextItems.personIds), an eq() on it
        // matches rows whose array CONTAINS the value, mirroring how
        // `withIndex("by_person", q => q.eq("personIds", personId))` behaves.
        if (Array.isArray(fieldValue)) return fieldValue.includes(value);
        return fieldValue === value;
      })
    );
  }

  private matched(): AnyRow[] {
    return this.rows
      .filter(this.predicate)
      .sort((a, b) => a._creationTime - b._creationTime);
  }

  async collect(): Promise<AnyRow[]> {
    return this.matched();
  }

  async first(): Promise<AnyRow | null> {
    return this.matched()[0] ?? null;
  }
}

class IndexBuilder {
  eqs: Array<[string, unknown]> = [];
  eq(field: string, value: unknown): IndexBuilder {
    this.eqs.push([field, value]);
    return this;
  }
}

function valueAtPath(row: AnyRow, path: string): unknown {
  // Index fields can be nested (e.g. "place.placeId"); the loader only uses
  // flat fields, but support dotted paths defensively.
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, row);
}

function makeFakeCtx(tables: Record<string, AnyRow[]>) {
  const byId = new Map<string, AnyRow>();
  for (const rows of Object.values(tables)) {
    for (const row of rows) byId.set(row._id, row);
  }

  const db = {
    query(table: string) {
      return new FakeQuery(tables[table] ?? []);
    },
    async get(id: unknown) {
      return byId.get(String(id)) ?? null;
    },
    normalizeId(table: string, id: string) {
      // Our fixture ids are `${table}:n`; a value is a valid id for `table` iff
      // it exists in that table. This mirrors Convex's normalizeId returning
      // null for ids that don't belong to the table.
      const row = byId.get(id);
      return row && id.startsWith(`${table}:`) ? id : null;
    },
  };

  // The loader/snapshot code only touches ctx.db.
  return { db } as never;
}

// ---------------------------------------------------------------------------
// Fixture vault
// ---------------------------------------------------------------------------

let clock = 1_000;
const t = () => ++clock; // monotonically increasing _creationTime

function row<T extends Record<string, unknown>>(id: string, fields: T): AnyRow {
  return { _id: id, _creationTime: t(), vaultOwnerId: OWNER, ...fields } as AnyRow;
}

const TARGET = "persons:1";
const SPOUSE = "persons:2";
const CHILD = "persons:3";
const STRANGER = "persons:4"; // unrelated person; must NOT leak into the target's workspace

const tables: Record<string, AnyRow[]> = {
  persons: [
    row(TARGET, {
      fsId: "KWCJ-RN4",
      name: { given: "John", surname: "Jarvie" },
      sex: "male",
      living: false,
      birth: { date: { original: "1 Jan 1880", year: 1880 }, place: { original: "Ogden", placeId: "places:1" } },
      death: { date: { original: "1950", year: 1950 }, place: { original: "Salt Lake", placeId: "places:2" } },
      researchStatus: "in_progress",
      createdAt: t(),
      updatedAt: t(),
    }),
    row(SPOUSE, {
      fsId: "KWCJ-SP1",
      name: { given: "Mary", surname: "Jarvie" },
      sex: "female",
      living: false,
      researchStatus: "basic",
      createdAt: t(),
      updatedAt: t(),
    }),
    row(CHILD, {
      fsId: "KWCJ-CH1",
      name: { given: "Anne", surname: "Jarvie" },
      sex: "female",
      living: false,
      researchStatus: "not_started",
      createdAt: t(),
      updatedAt: t(),
    }),
    row(STRANGER, {
      fsId: "KWCJ-XXX",
      name: { given: "Unrelated", surname: "Person" },
      sex: "male",
      living: false,
      researchStatus: "not_started",
      createdAt: t(),
      updatedAt: t(),
    }),
  ],
  relationships: [
    row("relationships:1", { type: "Couple", person1: TARGET, person2: SPOUSE, createdAt: t(), updatedAt: t() }),
    row("relationships:2", { type: "ParentChild", person1: TARGET, person2: CHILD, createdAt: t(), updatedAt: t() }),
    // A relationship between two OTHER people — must not appear for TARGET.
    row("relationships:3", { type: "Couple", person1: STRANGER, person2: SPOUSE, createdAt: t(), updatedAt: t() }),
  ],
  events: [
    row("events:1", { type: "birth", date: { original: "1880", year: 1880 }, place: { original: "Ogden", placeId: "places:1" }, createdAt: t(), updatedAt: t() }),
    row("events:2", { type: "census", date: { original: "1900", year: 1900 }, place: { original: "Ogden", placeId: "places:1" }, createdAt: t(), updatedAt: t() }),
    row("events:3", { type: "death", date: { original: "1950", year: 1950 }, place: { original: "Salt Lake", placeId: "places:2" }, createdAt: t(), updatedAt: t() }),
    // Stranger's event — not linked to TARGET via personEvents.
    row("events:4", { type: "birth", date: { original: "1881", year: 1881 }, createdAt: t(), updatedAt: t() }),
  ],
  personEvents: [
    row("personEvents:1", { personId: TARGET, eventId: "events:1", role: "primary", createdAt: t() }),
    row("personEvents:2", { personId: TARGET, eventId: "events:2", role: "primary", createdAt: t() }),
    row("personEvents:3", { personId: TARGET, eventId: "events:3", role: "primary", createdAt: t() }),
    row("personEvents:4", { personId: STRANGER, eventId: "events:4", role: "primary", createdAt: t() }),
  ],
  places: [
    row("places:1", { name: "Ogden", fullName: "Ogden, Weber, Utah, United States", type: "city", createdAt: t(), updatedAt: t() }),
    row("places:2", { name: "Salt Lake City", fullName: "Salt Lake City, Salt Lake, Utah, United States", type: "city", createdAt: t(), updatedAt: t() }),
    row("places:3", { name: "Nowhere", fullName: "Nowhere, Elsewhere", type: "city", createdAt: t(), updatedAt: t() }),
  ],
  sources: [
    row("sources:1", { title: "Birth and Baptism Register", type: "church_record", repository: "FamilySearch", createdAt: t(), updatedAt: t() }),
    row("sources:2", { title: "United States Census, 1900", type: "census", repository: "FamilySearch", createdAt: t(), updatedAt: t() }),
    row("sources:3", { title: "Stranger Source", type: "other", createdAt: t(), updatedAt: t() }),
  ],
  citations: [
    row("citations:1", { sourceId: "sources:1", isEvidence: true, confidence: "high", extractedText: "Born 1880", createdAt: t(), updatedAt: t() }),
    row("citations:2", { sourceId: "sources:2", isEvidence: true, confidence: "medium", extractedText: "Census 1900", createdAt: t(), updatedAt: t() }),
    row("citations:3", { sourceId: "sources:3", isEvidence: true, confidence: "low", extractedText: "Unrelated", createdAt: t(), updatedAt: t() }),
  ],
  citationLinks: [
    row("citationLinks:1", { citationId: "citations:1", targetType: "person", targetId: TARGET, field: "birth", createdAt: t() }),
    row("citationLinks:2", { citationId: "citations:2", targetType: "event", targetId: "events:2", field: "census", createdAt: t() }),
    // link on the stranger — must not surface for TARGET.
    row("citationLinks:3", { citationId: "citations:3", targetType: "person", targetId: STRANGER, field: "birth", createdAt: t() }),
  ],
  sourceFacts: [
    row("sourceFacts:1", { personId: TARGET, sourceId: "sources:1", citationId: "citations:1", importKey: "k1", factType: "birth", label: "Birth", value: "1880", confidence: "high", status: "accepted", createdAt: t(), updatedAt: t() }),
    row("sourceFacts:2", { personId: STRANGER, sourceId: "sources:3", citationId: "citations:3", importKey: "k2", factType: "birth", label: "Birth", value: "1881", confidence: "low", status: "candidate", createdAt: t(), updatedAt: t() }),
  ],
  // GEN-92FU: media/contextItems are now read via the by_person array-element
  // index instead of owner-wide. These fixtures exercise the narrowing AND the
  // GEN-70 cross-owner guard: (a) TARGET referenced among MULTIPLE people,
  // (b) rows referencing ONLY other people (must be excluded), and
  // (c) a DIFFERENT-owner row that names TARGET (by_person would surface it,
  // but the owner filter must drop it so it never leaks).
  media: [
    row("media:1", { type: "photo", title: "John Portrait", personIds: [TARGET], privacyLevel: "publish_candidate", reviewStatus: "reviewed", rightsStatus: "owned", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("media:2", { type: "photo", title: "Family Photo", personIds: [TARGET, SPOUSE], privacyLevel: "private", reviewStatus: "unreviewed", createdAt: t(), updatedAt: t() }),
    row("media:3", { type: "photo", title: "Stranger Photo", personIds: [STRANGER], createdAt: t(), updatedAt: t() }),
    // (a) TARGET among MULTIPLE people (3-way) — must be included for TARGET.
    row("media:4", { type: "photo", title: "Group Photo", personIds: [SPOUSE, TARGET, CHILD], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    // (b) Only OTHER people (spouse+child, no target) — must be excluded for TARGET.
    row("media:5", { type: "photo", title: "Spouse and Child", personIds: [SPOUSE, CHILD], privacyLevel: "private", reviewStatus: "unreviewed", createdAt: t(), updatedAt: t() }),
    // (c) DIFFERENT owner but references TARGET — by_person surfaces it; the
    //     owner filter MUST drop it so it never leaks into TARGET's workspace.
    { _id: "media:6", _creationTime: t(), vaultOwnerId: "other-owner", type: "photo", title: "Foreign Owner Photo", personIds: [TARGET], privacyLevel: "private", reviewStatus: "unreviewed", createdAt: t(), updatedAt: t() } as AnyRow,
  ],
  contextItems: [
    row("contextItems:1", { title: "Note about John", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [TARGET], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("contextItems:2", { title: "Stranger note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [STRANGER], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: t(), updatedAt: t() }),
    // (a) TARGET among MULTIPLE people — must be included for TARGET.
    row("contextItems:3", { title: "Shared family note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [SPOUSE, TARGET], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    // (b) Only OTHER people — must be excluded for TARGET.
    row("contextItems:4", { title: "Spouse-only note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [SPOUSE, CHILD], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: t(), updatedAt: t() }),
    // (c) DIFFERENT owner but references TARGET — must be dropped by owner filter.
    { _id: "contextItems:5", _creationTime: t(), vaultOwnerId: "other-owner", title: "Foreign owner note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [TARGET], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: t(), updatedAt: t() } as AnyRow,
  ],
  importRuns: [
    row("importRuns:1", { personId: TARGET, personFsId: "KWCJ-RN4", personName: "John Jarvie", captureId: "c1", captureVersion: "1", pageTypes: ["person"], sourceUrls: [], capturedAt: t(), importedAt: t(), compatibilityMode: false, mergeStatus: "created", counts: { sources: 1, citations: 1, memories: 0, relationships: 2, places: 2, events: 3, warnings: 0 }, warnings: [], artifactPaths: {} }),
    // Matched only by personFsId (no personId) — exercises the by_person_fsId union.
    row("importRuns:2", { personFsId: "KWCJ-RN4", personName: "John Jarvie", captureId: "c2", captureVersion: "1", pageTypes: ["sources"], sourceUrls: [], capturedAt: t(), importedAt: t(), compatibilityMode: false, mergeStatus: "updated", counts: { sources: 1, citations: 0, memories: 0, relationships: 0, places: 0, events: 0, warnings: 0 }, warnings: [], artifactPaths: {} }),
    row("importRuns:3", { personFsId: "KWCJ-XXX", personName: "Unrelated", captureId: "c3", captureVersion: "1", pageTypes: ["person"], sourceUrls: [], capturedAt: t(), importedAt: t(), compatibilityMode: false, mergeStatus: "created", counts: { sources: 0, citations: 0, memories: 0, relationships: 0, places: 0, events: 0, warnings: 0 }, warnings: [], artifactPaths: {} }),
  ],
  researchTasks: [
    row("researchTasks:1", { personId: TARGET, type: "record_search", title: "Find marriage record", status: "todo", priority: "high", aiSuggested: true, createdAt: t(), updatedAt: t() }),
    row("researchTasks:2", { personId: STRANGER, type: "record_search", title: "Stranger task", status: "todo", priority: "low", aiSuggested: false, createdAt: t(), updatedAt: t() }),
  ],
  researchLog: [
    row("researchLog:1", { entityType: "person", entityId: TARGET, activityType: "tier2_sources", status: "done", summary: "Imported sources", createdAt: t(), updatedAt: t() }),
    row("researchLog:2", { entityType: "person", entityId: STRANGER, activityType: "tier2_sources", status: "done", summary: "Stranger log", createdAt: t(), updatedAt: t() }),
    row("researchLog:3", { entityType: "place", entityId: "places:1", activityType: "location_deep_research", status: "done", summary: "Place log", createdAt: t(), updatedAt: t() }),
  ],
  documents: [
    // documents.personId uses fsId || _id convention; TARGET has fsId KWCJ-RN4.
    row("documents:1", { personId: "KWCJ-RN4", type: "PS", title: "Person Sheet", contentMarkdown: "# John", contentText: "John", createdAt: t(), updatedAt: t() }),
    row("documents:2", { personId: "KWCJ-XXX", type: "PS", title: "Stranger Sheet", contentMarkdown: "x", contentText: "x", createdAt: t(), updatedAt: t() }),
  ],
  stories: [
    row("stories:1", { personId: TARGET, type: "biography", title: "John's Life", content: "...", citationIds: ["citations:1"], status: "draft", generatedBy: "ai", createdAt: t(), updatedAt: t() }),
    row("stories:2", { personId: STRANGER, type: "biography", title: "Stranger Story", content: "...", citationIds: [], status: "draft", generatedBy: "ai", createdAt: t(), updatedAt: t() }),
  ],
  storyReviewEvents: [
    row("storyReviewEvents:1", { storyId: "stories:1", eventType: "draft_edit", actorRole: "first_party_owner", createdAt: t(), updatedAt: t() }),
  ],
  historicalContext: [
    // Overlaps TARGET years (1880-1950) and place:1 → included.
    row("historicalContext:1", { placeId: "places:1", timePeriod: { startYear: 1890, endYear: 1920 }, topic: "daily_life", title: "Ogden in 1900", content: "...", sources: [], privacyLevel: "publish_candidate", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    // No placeId → applies to everyone whose years overlap.
    row("historicalContext:2", { timePeriod: { startYear: 1900, endYear: 1910 }, topic: "economy", title: "Economy 1900s", content: "...", sources: [], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    // placeId places:3 (not the target's) → excluded by buildContextCoverage.
    row("historicalContext:3", { placeId: "places:3", timePeriod: { startYear: 1890, endYear: 1920 }, topic: "war", title: "Nowhere", content: "...", sources: [], createdAt: t(), updatedAt: t() }),
    // Years don't overlap TARGET → excluded.
    row("historicalContext:4", { placeId: "places:1", timePeriod: { startYear: 1700, endYear: 1750 }, topic: "culture", title: "Old Ogden", content: "...", sources: [], createdAt: t(), updatedAt: t() }),
  ],
  researchChecks: [
    row("researchChecks:1", { personId: TARGET, checkKey: "birth_record", status: "complete", applicability: "required", completionSource: "user", confidence: 0.9, lastReviewedAt: t(), createdAt: t(), updatedAt: t() }),
    row("researchChecks:2", { personId: STRANGER, checkKey: "birth_record", status: "missing", applicability: "required", completionSource: "inferred", confidence: 0.2, createdAt: t(), updatedAt: t() }),
  ],
  provisionalRelatives: [
    row("provisionalRelatives:1", { anchorPersonId: TARGET, displayName: "Possible Brother", relationshipHint: "brother", dedupeKey: "d1", evidenceCount: 2, mergeState: "provisional", createdAt: t(), updatedAt: t() }),
    row("provisionalRelatives:2", { anchorPersonId: STRANGER, displayName: "Stranger Rel", dedupeKey: "d2", evidenceCount: 1, mergeState: "provisional", createdAt: t(), updatedAt: t() }),
  ],
};

// ---------------------------------------------------------------------------
// Run both paths and deep-equal
// ---------------------------------------------------------------------------

async function main() {
  const ctx = makeFakeCtx(tables);

  for (const identifier of [TARGET, "KWCJ-RN4"]) {
    const fullSnapshot = await getVaultSnapshot(ctx, OWNER);
    const fullResult = assemblePersonWorkspaceFromSnapshot(fullSnapshot, identifier);

    const scopedSnapshot = await loadPersonScopedSnapshot(ctx, OWNER, identifier);
    assert.ok(scopedSnapshot, `scoped snapshot should resolve for ${identifier}`);
    const scopedResult = assemblePersonWorkspaceFromSnapshot(scopedSnapshot, identifier);

    assert.deepEqual(
      scopedResult,
      fullResult,
      `per-person loader output must be byte-identical to full-snapshot assembly for ${identifier}`
    );

    // Sanity: the workspace is non-trivial and excludes the stranger's data.
    assert.ok(fullResult, "full result should be non-null");
    assert.equal(fullResult!.relationships.length, 2, "two relationships for target");
    assert.equal(fullResult!.events.length, 3, "three events for target");
    // media:1 (target only), media:2 (target+spouse), media:4 (spouse+target+child);
    // media:3 (stranger only), media:5 (spouse+child) and media:6 (foreign owner) excluded.
    assert.equal(fullResult!.media.length, 3, "three media items for target");
    // contextItems:1 (target only) + contextItems:3 (spouse+target); others excluded.
    assert.equal(fullResult!.contextItems.length, 2, "two context items for target");
    assert.equal(fullResult!.stories.length, 1, "one story for target");
    assert.equal(fullResult!.importRuns.length, 2, "two import runs (personId + personFsId union)");
    assert.equal(fullResult!.provisionalRelatives.length, 1, "one provisional relative");
    assert.equal(fullResult!.researchTasks.length, 1, "one research task");
    assert.equal(fullResult!.researchLog.length, 1, "one research log entry");
    assert.equal(fullResult!.documents.length, 1, "one document (matched by fsId)");
    assert.equal(fullResult!.places.length, 2, "two related places");
    assert.equal(fullResult!.contextCoverage.count, 2, "two overlapping context entries");
    assert.ok(
      fullResult!.relatedPeople.every((p) => p._id !== STRANGER),
      "stranger must not appear in relatedPeople"
    );

    // GEN-92FU: the by_person index narrowing must (a) include rows where TARGET
    // is one of several people, (b) exclude other-people-only rows, and
    // (c) never leak a foreign-owner row that happens to name TARGET. Assert on
    // the SCOPED result so we prove the by_person path itself is correct.
    const scopedMediaIds = scopedResult!.media.map((m) => m._id);
    assert.deepEqual(
      [...scopedMediaIds].sort(),
      ["media:1", "media:2", "media:4"],
      "scoped media = target's owned media (multi-person included, others/foreign excluded)"
    );
    const scopedContextIds = scopedResult!.contextItems.map((c) => c._id);
    assert.deepEqual(
      [...scopedContextIds].sort(),
      ["contextItems:1", "contextItems:3"],
      "scoped context items = target's owned items (multi-person included, others/foreign excluded)"
    );
    assert.ok(
      !scopedMediaIds.includes("media:6") && !scopedContextIds.includes("contextItems:5"),
      "foreign-owner rows naming the target must never leak"
    );
  }

  // A missing identifier returns null from both paths.
  const nullScoped = await loadPersonScopedSnapshot(ctx, OWNER, "persons:999");
  assert.equal(nullScoped, null, "unknown person → null scoped snapshot");

  console.log("Person snapshot parity checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
