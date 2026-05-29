/**
 * GEN-92FU-COV per-person/per-story loader parity test.
 *
 * This proves two narrowing optimizations are byte-identical to the prior
 * whole-vault path:
 *
 *   1. getContextCoverage — switched from getVaultSnapshot to
 *      loadPersonScopedSnapshot. It runs the exact pipeline
 *      buildSnapshotIndex -> buildPersonOperations -> buildContextCoverage,
 *      which is the same pipeline assemblePersonWorkspaceFromSnapshot runs to
 *      produce its `contextCoverage` field. We deep-equal the coverage output
 *      built on the SCOPED snapshot against the coverage output built on the
 *      FULL snapshot for the same person.
 *
 *   2. getStoryReview / buildStoryBundle — switched from getVaultSnapshot to
 *      loadStoryScopedSnapshot. The bundle reads only the story, its person's
 *      scoped data, the person's other stories (relatedStories), and this
 *      story's storyReviewEvents (by_story). We deep-equal the bundle built on
 *      the STORY-SCOPED snapshot against the bundle built on the FULL snapshot
 *      for the same story.
 *
 * It reuses the same hand-rolled fake QueryCtx as
 * scripts/test-person-snapshot-parity.ts: index reads are ordered by
 * `_creationTime` ascending (matching real Convex `withIndex(...).collect()`),
 * which is the ordering invariant the scoped loaders rely on for identical
 * output. Array-element indexes (media/contextItems.personIds, plus by_story on
 * storyReviewEvents and by_person on stories) are matched with eq()-contains
 * semantics, mirroring the real index runtime behavior.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getVaultSnapshot,
  loadPersonScopedSnapshot,
  loadStoryScopedSnapshot,
  getPersonByIdentifier,
  buildSnapshotIndex,
  buildPersonOperations,
  buildContextCoverage,
  buildStoryBundle,
} from "@/convex/vault";

const OWNER = "local-dev";

// ---------------------------------------------------------------------------
// Fake QueryCtx / db (mirrors scripts/test-person-snapshot-parity.ts)
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown> & { _id: string; _creationTime: number };

class FakeQuery {
  constructor(
    private rows: AnyRow[],
    private predicate: (row: AnyRow) => boolean = () => true
  ) {}

  withIndex(_indexName: string, fn?: (q: IndexBuilder) => IndexBuilder): FakeQuery {
    if (!fn) return this;
    const builder = new IndexBuilder();
    fn(builder);
    const eqs = builder.eqs;
    return new FakeQuery(this.rows, (row) =>
      eqs.every(([field, value]) => {
        const fieldValue = valueAtPath(row, field);
        // Convex indexes array fields by element: an eq() on an array-typed
        // index field matches rows whose array CONTAINS the value.
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
      const row = byId.get(id);
      return row && id.startsWith(`${table}:`) ? id : null;
    },
  };

  return { db } as never;
}

// ---------------------------------------------------------------------------
// Fixture vault
// ---------------------------------------------------------------------------

let clock = 1_000;
const t = () => ++clock;

function row<T extends Record<string, unknown>>(id: string, fields: T): AnyRow {
  return { _id: id, _creationTime: t(), vaultOwnerId: OWNER, ...fields } as AnyRow;
}

const TARGET = "persons:1";
const SPOUSE = "persons:2";
const CHILD = "persons:3";
const STRANGER = "persons:4";

const STORY_MAIN = "stories:1"; // TARGET's biography (the story under review)
const STORY_OTHER = "stories:2"; // TARGET's second story (relatedStories)
const STORY_STRANGER = "stories:3"; // STRANGER's story (must not leak)

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
    row("relationships:3", { type: "Couple", person1: STRANGER, person2: SPOUSE, createdAt: t(), updatedAt: t() }),
  ],
  events: [
    row("events:1", { type: "birth", date: { original: "1880", year: 1880 }, place: { original: "Ogden", placeId: "places:1" }, createdAt: t(), updatedAt: t() }),
    row("events:2", { type: "census", date: { original: "1900", year: 1900 }, place: { original: "Ogden", placeId: "places:1" }, createdAt: t(), updatedAt: t() }),
    row("events:3", { type: "death", date: { original: "1950", year: 1950 }, place: { original: "Salt Lake", placeId: "places:2" }, createdAt: t(), updatedAt: t() }),
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
    row("citationLinks:3", { citationId: "citations:3", targetType: "person", targetId: STRANGER, field: "birth", createdAt: t() }),
  ],
  sourceFacts: [
    row("sourceFacts:1", { personId: TARGET, sourceId: "sources:1", citationId: "citations:1", importKey: "k1", factType: "birth", label: "Birth", value: "1880", confidence: "high", status: "accepted", createdAt: t(), updatedAt: t() }),
    row("sourceFacts:2", { personId: STRANGER, sourceId: "sources:3", citationId: "citations:3", importKey: "k2", factType: "birth", label: "Birth", value: "1881", confidence: "low", status: "candidate", createdAt: t(), updatedAt: t() }),
  ],
  media: [
    row("media:1", { type: "photo", title: "John Portrait", personIds: [TARGET], privacyLevel: "publish_candidate", reviewStatus: "reviewed", rightsStatus: "owned", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("media:2", { type: "photo", title: "Family Photo", personIds: [TARGET, SPOUSE], privacyLevel: "private", reviewStatus: "unreviewed", createdAt: t(), updatedAt: t() }),
    row("media:3", { type: "photo", title: "Stranger Photo", personIds: [STRANGER], createdAt: t(), updatedAt: t() }),
    row("media:4", { type: "photo", title: "Group Photo", personIds: [SPOUSE, TARGET, CHILD], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("media:5", { type: "photo", title: "Spouse and Child", personIds: [SPOUSE, CHILD], privacyLevel: "private", reviewStatus: "unreviewed", createdAt: t(), updatedAt: t() }),
    { _id: "media:6", _creationTime: t(), vaultOwnerId: "other-owner", type: "photo", title: "Foreign Owner Photo", personIds: [TARGET], privacyLevel: "private", reviewStatus: "unreviewed", createdAt: t(), updatedAt: t() } as AnyRow,
  ],
  contextItems: [
    row("contextItems:1", { title: "Note about John", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [TARGET], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("contextItems:2", { title: "Stranger note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [STRANGER], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: t(), updatedAt: t() }),
    row("contextItems:3", { title: "Shared family note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [SPOUSE, TARGET], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("contextItems:4", { title: "Spouse-only note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [SPOUSE, CHILD], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: t(), updatedAt: t() }),
    { _id: "contextItems:5", _creationTime: t(), vaultOwnerId: "other-owner", title: "Foreign owner note", itemType: "note", evidenceRole: "raw_material", content: "...", personIds: [TARGET], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: t(), updatedAt: t() } as AnyRow,
  ],
  importRuns: [
    row("importRuns:1", { personId: TARGET, personFsId: "KWCJ-RN4", personName: "John Jarvie", captureId: "c1", captureVersion: "1", pageTypes: ["person"], sourceUrls: [], capturedAt: t(), importedAt: t(), compatibilityMode: false, mergeStatus: "created", counts: { sources: 1, citations: 1, memories: 0, relationships: 2, places: 2, events: 3, warnings: 0 }, warnings: [], artifactPaths: {} }),
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
    row("documents:1", { personId: "KWCJ-RN4", type: "PS", title: "Person Sheet", contentMarkdown: "# John", contentText: "John", createdAt: t(), updatedAt: t() }),
    row("documents:2", { personId: "KWCJ-XXX", type: "PS", title: "Stranger Sheet", contentMarkdown: "x", contentText: "x", createdAt: t(), updatedAt: t() }),
  ],
  stories: [
    row(STORY_MAIN, { personId: TARGET, type: "biography", title: "John's Life", content: "...", citationIds: ["citations:1"], status: "draft", generatedBy: "ai", publicSlug: "johns-life", createdAt: t(), updatedAt: t() }),
    row(STORY_OTHER, { personId: TARGET, type: "anecdote", title: "John's Anecdote", content: "...", citationIds: [], status: "review", generatedBy: "ai", createdAt: t(), updatedAt: t() }),
    row(STORY_STRANGER, { personId: STRANGER, type: "biography", title: "Stranger Story", content: "...", citationIds: [], status: "draft", generatedBy: "ai", createdAt: t(), updatedAt: t() }),
  ],
  storyReviewEvents: [
    row("storyReviewEvents:1", { storyId: STORY_MAIN, eventType: "draft_edit", actorRole: "first_party_owner", createdAt: t(), updatedAt: t() }),
    row("storyReviewEvents:2", { storyId: STORY_MAIN, eventType: "status_change", fromStatus: "draft", toStatus: "review", actorRole: "reviewer", createdAt: t(), updatedAt: t() }),
    // events for OTHER stories must NOT appear in STORY_MAIN's reviewHistory.
    row("storyReviewEvents:3", { storyId: STORY_OTHER, eventType: "draft_edit", actorRole: "first_party_owner", createdAt: t(), updatedAt: t() }),
    row("storyReviewEvents:4", { storyId: STORY_STRANGER, eventType: "draft_edit", actorRole: "first_party_owner", createdAt: t(), updatedAt: t() }),
    // DIFFERENT owner but names STORY_MAIN — by_story surfaces it, owner filter must drop it.
    { _id: "storyReviewEvents:5", _creationTime: t(), vaultOwnerId: "other-owner", storyId: STORY_MAIN, eventType: "draft_edit", actorRole: "first_party_owner", createdAt: t(), updatedAt: t() } as AnyRow,
  ],
  historicalContext: [
    row("historicalContext:1", { placeId: "places:1", timePeriod: { startYear: 1890, endYear: 1920 }, topic: "daily_life", title: "Ogden in 1900", content: "...", sources: [], privacyLevel: "publish_candidate", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("historicalContext:2", { timePeriod: { startYear: 1900, endYear: 1910 }, topic: "economy", title: "Economy 1900s", content: "...", sources: [], privacyLevel: "family_review", reviewStatus: "reviewed", aiUseAllowed: true, createdAt: t(), updatedAt: t() }),
    row("historicalContext:3", { placeId: "places:3", timePeriod: { startYear: 1890, endYear: 1920 }, topic: "war", title: "Nowhere", content: "...", sources: [], createdAt: t(), updatedAt: t() }),
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

type Snapshot = Awaited<ReturnType<typeof getVaultSnapshot>>;

// Reproduce the exact getContextCoverage handler pipeline on a snapshot.
function coverageFromSnapshot(snapshot: Snapshot, identifier: string) {
  const person = getPersonByIdentifier(snapshot, identifier);
  if (!person) return null;
  const index = buildSnapshotIndex(snapshot);
  const operations = buildPersonOperations(snapshot, index, person);
  return buildContextCoverage(snapshot, person, operations);
}

// ---------------------------------------------------------------------------
// Run both paths and deep-equal
// ---------------------------------------------------------------------------

// --- getContextCoverage parity (per-person loader) ---------------------
describe("getContextCoverage scoped-loader parity", () => {
  for (const identifier of [TARGET, "KWCJ-RN4"]) {
    test(`coverage is byte-identical to full snapshot for ${identifier}`, async () => {
      const ctx = makeFakeCtx(tables);
      const fullSnapshot = await getVaultSnapshot(ctx, OWNER);
      const fullCoverage = coverageFromSnapshot(fullSnapshot, identifier);

      const scopedSnapshot = await loadPersonScopedSnapshot(ctx, OWNER, identifier);
      assert.ok(scopedSnapshot, `scoped snapshot should resolve for ${identifier}`);
      const scopedCoverage = coverageFromSnapshot(scopedSnapshot, identifier);

      assert.deepEqual(
        scopedCoverage,
        fullCoverage,
        `getContextCoverage scoped output must be byte-identical to full-snapshot output for ${identifier}`
      );

      // Sanity: coverage is non-trivial and excludes off-place / off-year context.
      assert.ok(fullCoverage, "full coverage should be non-null");
      assert.equal(fullCoverage!.count, 2, "two overlapping context entries (hc:1 place match + hc:2 no-place)");
      assert.equal(fullCoverage!.relatedPlaceCount, 2, "two related places");
    });
  }

  test("unknown person → null scoped snapshot", async () => {
    const ctx = makeFakeCtx(tables);
    // Unknown person → null from both paths (handler returns null).
    const missingScoped = await loadPersonScopedSnapshot(ctx, OWNER, "persons:999");
    assert.equal(missingScoped, null, "unknown person → null scoped snapshot");
  });
});

// --- getStoryReview / buildStoryBundle parity (story-scoped loader) -----
describe("getStoryReview / buildStoryBundle scoped-loader parity", () => {
  for (const storyId of [STORY_MAIN, STORY_OTHER]) {
    test(`story bundle is byte-identical to full snapshot for ${storyId}`, async () => {
      const ctx = makeFakeCtx(tables);
      const fullSnapshot = await getVaultSnapshot(ctx, OWNER);
      const fullStory = fullSnapshot.stories.find((s) => s._id === storyId)!;
      const fullBundle = buildStoryBundle(fullSnapshot, fullStory);

      const scopedSnapshot = await loadStoryScopedSnapshot(ctx, OWNER, storyId as never);
      assert.ok(scopedSnapshot, `story-scoped snapshot should resolve for ${storyId}`);
      const scopedStory = scopedSnapshot!.stories.find((s) => s._id === storyId)!;
      const scopedBundle = buildStoryBundle(scopedSnapshot!, scopedStory);

      assert.deepEqual(
        scopedBundle,
        fullBundle,
        `getStoryReview scoped bundle must be byte-identical to full-snapshot bundle for ${storyId}`
      );

      // Also prove the public view (publishView=true) path matches — buildStoryBundle
      // reads the same snapshot fields, just with stricter filters.
      const fullPublic = buildStoryBundle(fullSnapshot, fullStory, { publicView: true });
      const scopedPublic = buildStoryBundle(scopedSnapshot!, scopedStory, { publicView: true });
      assert.deepEqual(
        scopedPublic,
        fullPublic,
        `getStoryReview scoped public bundle must be byte-identical for ${storyId}`
      );
    });
  }

  test("scoped main-story bundle narrows reviewHistory + relatedStories correctly", async () => {
    const ctx = makeFakeCtx(tables);
    // Targeted assertions on the SCOPED main-story bundle: the by_story narrowing
    // must (a) include only this story's events, (b) exclude other stories' and
    // the stranger's events, and (c) never leak a foreign-owner event that names
    // this story. relatedStories must contain the person's OTHER story only.
    const scopedMain = await loadStoryScopedSnapshot(ctx, OWNER, STORY_MAIN as never);
    assert.ok(scopedMain, "scoped main story snapshot");
    const mainStory = scopedMain!.stories.find((s) => s._id === STORY_MAIN)!;
    const mainBundle = buildStoryBundle(scopedMain!, mainStory);

    const reviewIds = mainBundle.reviewHistory.map((e) => e._id).sort();
    assert.deepEqual(
      reviewIds,
      ["storyReviewEvents:1", "storyReviewEvents:2"],
      "reviewHistory = this story's owned review events (others + foreign-owner excluded)"
    );
    assert.ok(
      !reviewIds.includes("storyReviewEvents:5"),
      "foreign-owner review event naming this story must never leak"
    );
    const relatedStoryIds = mainBundle.relatedStories.map((s) => s._id);
    assert.deepEqual(
      relatedStoryIds,
      [STORY_OTHER],
      "relatedStories = the person's OTHER stories only (stranger excluded, self excluded)"
    );
    assert.ok(mainBundle.person, "story bundle resolves the person");
    assert.equal(mainBundle.person!._id, TARGET, "story bundle person is the target");
    assert.ok(mainBundle.contextCoverage, "story bundle carries context coverage");
    assert.equal(mainBundle.contextCoverage!.count, 2, "story bundle coverage matches person coverage");
  });

  test("missing / foreign-owner story → null scoped snapshot", async () => {
    const ctx = makeFakeCtx(tables);
    // Missing / foreign-owner story → null.
    const missingStory = await loadStoryScopedSnapshot(ctx, OWNER, "stories:999" as never);
    assert.equal(missingStory, null, "unknown story → null scoped snapshot");
    const foreignStory = await loadStoryScopedSnapshot(ctx, "other-owner", STORY_MAIN as never);
    assert.equal(foreignStory, null, "story owned by another vault → null for this owner");
  });
});
