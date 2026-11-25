import { convexTest } from "convex-test";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { placeTotals } from "./placeCounts";
import schema from "./schema";
import { ownerTableCounter, type CountTable } from "./vaultCounts";

const modules = import.meta.glob("./**/*.ts");
const scope = { vaultOwnerId: "user_syntheticEvidenceOwner" };
const foreignOwner = "user_syntheticEvidenceNeighbor";
const writes = api.vaultMutations;

async function fixture() {
  const t = convexTest(schema, modules);
  const records = await t.run(async ({ db }) => {
    async function seedPerson(vaultOwnerId: string, given: string) {
      return db.insert("persons", {
        vaultOwnerId, name: { given, surname: "Synthetic" },
        sex: "unknown", living: false, researchStatus: "basic",
        birth: { date: { original: "1820", year: 1820 } }, createdAt: 1, updatedAt: 1,
      });
    }
    async function seedReferences(vaultOwnerId: string, name: string) {
      const fields = { vaultOwnerId, createdAt: 1, updatedAt: 1 };
      const personId = await seedPerson(vaultOwnerId, name);
      const placeId = await db.insert("places", {
        ...fields, name, fullName: `${name} Synthetic Parish`, type: "parish",
      });
      const sourceId = await db.insert("sources", { ...fields, title: name, type: "other" });
      const citationId = await db.insert("citations", {
        ...fields, sourceId, isEvidence: true, confidence: "high",
      });
      return { personId, placeId, sourceId, citationId };
    }
    const own = await seedReferences(scope.vaultOwnerId, "Alder");
    const foreign = await seedReferences(foreignOwner, "Birch");
    const partnerId = await seedPerson(scope.vaultOwnerId, "Cedar");
    // Use the migrated read paths without running backfills over the writes under test.
    for (const table of ["vaultCounts:v6", "mediaPeople", "peopleExplorerRows"]) {
      await db.insert("searchBuildState", { table, cursor: null, complete: true });
    }
    return { own, foreign, partnerId };
  });
  const owner = t.withIdentity({ subject: scope.vaultOwnerId });
  const other = t.withIdentity({ subject: foreignOwner });

  const snapshot = (table: CountTable) => t.run(async ({ db }) => ({
    rows: await db.query(table).collect(),
    counts: await db.query("vaultCounterShards").collect(),
    legacyCounts: await db.query("vaultCounts").collect(),
    memberships: await db.query("vaultCountMembers").collect(),
    placeCounts: await db.query("placeCounterShards").collect(),
    people: await db.query("peopleExplorerRows").collect(),
    scores: await db.query("personScoreRows").collect(),
    reviews: await db.query("personScoreReviews").collect(),
  }));
  async function refuses<F extends FunctionReference<"mutation">>(
    table: CountTable,
    mutation: F,
    args: FunctionArgs<F>,
    foreignReferences: Record<string, Partial<FunctionArgs<F>>>,
  ) {
    const before = await snapshot(table);
    await expect(t.mutation(mutation, args)).rejects.toThrow(/missing_identity/);
    expect(await snapshot(table), "anonymous call").toEqual(before);
    await expect(other.mutation(mutation, args)).rejects.toThrow(/Trust boundary denied: owner_mismatch/);
    expect(await snapshot(table), "wrong owner call").toEqual(before);
    for (const [reference, override] of Object.entries(foreignReferences)) {
      await expect(owner.mutation(mutation, { ...args, ...override }), reference)
        .rejects.toThrow(/reference_owner_mismatch/);
      expect(await snapshot(table), reference).toEqual(before);
    }
  }
  async function counts(table: CountTable, expected: Record<string, number> = { active: 1 }) {
    const [owned, foreign] = await t.run((ctx) => Promise.all([
      ownerTableCounter(ctx, scope.vaultOwnerId, table),
      ownerTableCounter(ctx, foreignOwner, table),
    ]));
    expect(owned.counts).toEqual(expected);
    expect(foreign.counts).toEqual({});
  }
  const score = (personId: Id<"persons">) => t.run(({ db }) =>
    db.query("personScoreRows").withIndex("by_record", (q) => q.eq("recordId", personId)).unique());
  const read = <T extends CountTable>(id: Id<T>) => t.run(({ db }) => db.get(id));
  return { t, owner, ...records, snapshot, refuses, counts, score, read };
}

describe.each(["shadow", "enforce"])("vault evidence writes in %s mode", (mode) => {
  beforeEach(() => vi.stubEnv("TRUST_BOUNDARY_MODE", mode));
  afterEach(() => vi.unstubAllEnvs());

  test("upsertEvent updates its owner’s import match, search index, and place counts", async () => {
    const { t, owner, own, foreign, refuses, counts, read } = await fixture();
    const args = {
      ...scope, importKey: "synthetic-census", type: "census",
      date: { original: "1850", year: 1850 }, description: "enumeration",
      place: { original: "Alder", placeId: own.placeId },
    } satisfies FunctionArgs<typeof writes.upsertEvent>;
    const foreignEventId = await t.run(({ db }) => db.insert("events", {
      ...args, vaultOwnerId: foreignOwner,
      place: { original: "Birch", placeId: foreign.placeId }, createdAt: 1, updatedAt: 1,
      searchText: "census enumeration Birch 1850",
    }));
    const foreignEvent = await read(foreignEventId);
    const { eventId, created } = await owner.mutation(writes.upsertEvent, args);
    expect(created).toBe(true);
    expect(eventId).not.toBe(foreignEventId);
    expect(await read(eventId)).toMatchObject(args);
    const search = (term: string) => t.run(async ({ db }) =>
      (await db.query("events").withSearchIndex("search_text", (q) =>
        q.search("searchText", term).eq("vaultOwnerId", scope.vaultOwnerId).eq("archivedAt", undefined),
      ).collect()).map((event) => event._id));
    expect(await search("enumeration")).toEqual([eventId]);
    const place = () => t.run((ctx) => placeTotals(ctx, scope.vaultOwnerId, own.placeId));
    expect(await place()).toMatchObject({ counts: { events: 1 }, firstYear: 1850, lastYear: 1850 });

    const edited = { ...args, description: "transcription", date: { original: "1860", year: 1860 } };
    await refuses("events", writes.upsertEvent, edited, {
      place: { place: { original: "Birch", placeId: foreign.placeId } },
    });
    expect(await owner.mutation(writes.upsertEvent, edited)).toEqual({ eventId, created: false });
    expect(await read(eventId)).toMatchObject(edited);
    expect(await read(foreignEventId)).toEqual(foreignEvent);
    expect(await search("enumeration")).toEqual([]);
    expect(await search("transcription")).toEqual([eventId]);
    expect(await place()).toMatchObject({ counts: { events: 1, "year:1850": 0, "year:1860": 1 }, firstYear: 1860, lastYear: 1860 });
    await counts("events");
  });

  test("upsertPersonEvent links the event, refreshes the person, and replaces the role in place", async () => {
    const { t, owner, own, foreign, refuses, counts, score, read } = await fixture();
    const { eventId } = await owner.mutation(writes.upsertEvent, {
      ...scope, type: "census", place: { original: "Alder", placeId: own.placeId },
    });
    const foreignEventId = await t.run(({ db }) => db.insert("events", {
      vaultOwnerId: foreignOwner, type: "census", createdAt: 1, updatedAt: 1,
    }));
    const args = {
      ...scope, personId: own.personId, eventId, role: "primary",
    } satisfies FunctionArgs<typeof writes.upsertPersonEvent>;
    const linkId = await owner.mutation(writes.upsertPersonEvent, args);
    const link = await read(linkId);
    expect(link).toMatchObject(args);
    expect(link?.pageOrderKey?.endsWith(`:${linkId}`)).toBe(true);
    const page = await t.query(internal.peopleExplorer.page, {
      ...scope, cursor: null, search: "alder synthetic parish",
    });
    expect(page.page.map((person) => person._id)).toEqual([own.personId]);
    expect((await score(own.personId))?.operation.researchChecks).toContainEqual(
      expect.objectContaining({ checkKey: "census", status: "complete" }),
    );

    const edited = { ...args, role: "witness" as const };
    await refuses("personEvents", writes.upsertPersonEvent, edited, {
      person: { personId: foreign.personId },
      event: { eventId: foreignEventId },
    });
    expect(await owner.mutation(writes.upsertPersonEvent, edited)).toBe(linkId);
    expect(await read(linkId)).toMatchObject({ ...edited, pageOrderKey: link?.pageOrderKey });
    await counts("personEvents");
  });

  test("upsertRelationship refreshes both endpoints and reuses the relationship", async () => {
    const { owner, own, foreign, partnerId, refuses, counts, score, read } = await fixture();
    const args = {
      ...scope, type: "Couple", person1: own.personId, person2: partnerId,
      facts: [{ type: "Marriage", place: { original: "Alder", placeId: own.placeId } }],
    } satisfies FunctionArgs<typeof writes.upsertRelationship>;
    const { relationshipId, created } = await owner.mutation(writes.upsertRelationship, args);
    expect(created).toBe(true);
    expect(await read(relationshipId)).toMatchObject(args);
    for (const personId of [own.personId, partnerId]) {
      expect((await score(personId))?.operation.researchChecks).toContainEqual(
        expect.objectContaining({ checkKey: "relationships", status: "complete" }),
      );
    }

    const edited = { ...args, facts: [{ ...args.facts[0], description: "Synthetic register entry" }] };
    await refuses("relationships", writes.upsertRelationship, edited, {
      firstPerson: { person1: foreign.personId },
      secondPerson: { person2: foreign.personId },
      factPlace: { facts: [{ type: "Marriage", place: { original: "Birch", placeId: foreign.placeId } }] },
    });
    expect(await owner.mutation(writes.upsertRelationship, edited)).toEqual({ relationshipId, created: false });
    expect(await read(relationshipId)).toMatchObject(edited);
    await counts("relationships");
  });

  test("upsertSourceFact retains its evidence links and updates the same claim", async () => {
    const { t, owner, own, foreign, snapshot, refuses, counts, read } = await fixture();
    const args = {
      ...scope, personId: own.personId, sourceId: own.sourceId, citationId: own.citationId,
      importKey: "synthetic-occupation", factType: "occupation", label: "Occupation", value: "Weaver",
      confidence: "medium", status: "candidate",
    } satisfies FunctionArgs<typeof writes.upsertSourceFact>;
    const { sourceFactId, created } = await owner.mutation(writes.upsertSourceFact, args);
    expect(created).toBe(true);
    expect(await read(sourceFactId)).toMatchObject(args);

    const edited = { ...args, value: "Silk weaver", status: "accepted" as const };
    await refuses("sourceFacts", writes.upsertSourceFact, edited, {
      person: { personId: foreign.personId },
      source: { sourceId: foreign.sourceId },
      citation: { citationId: foreign.citationId },
    });
    const otherSourceId = await t.run(({ db }) => db.insert("sources", {
      ...scope, title: "Different synthetic source", type: "other", createdAt: 1, updatedAt: 1,
    }));
    const before = await snapshot("sourceFacts");
    await expect(owner.mutation(writes.upsertSourceFact, { ...edited, sourceId: otherSourceId }))
      .rejects.toThrow(/citation does not belong to the selected source/);
    expect(await snapshot("sourceFacts")).toEqual(before);
    expect(await owner.mutation(writes.upsertSourceFact, edited)).toEqual({ sourceFactId, created: false });
    expect(await read(sourceFactId)).toMatchObject(edited);
    await counts("sourceFacts");
  });

  test.each([
    { name: "ensureResearchTask", aiSuggested: true, type: "record_search" },
    { name: "createResearchTask", aiSuggested: false, type: "other" },
  ] as const)("$name registers a searchable open task with the expected origin", async ({
    aiSuggested, type,
  }) => {
    const { t, owner, own, foreign, refuses, counts, score, read } = await fixture();
    const args = {
      ...scope, personId: own.personId, title: "Locate register", description: "Check synthetic microfilm",
      priority: "high",
    } satisfies FunctionArgs<typeof writes.createResearchTask>;
    const ensureArgs = { ...args, type: "record_search" as const };
    const result = aiSuggested
      ? await owner.mutation(writes.ensureResearchTask, ensureArgs)
      : await owner.mutation(writes.createResearchTask, args);
    const { taskId } = result;
    const row = await read(taskId);
    expect(row).toMatchObject({
      ...args, type, status: "todo", aiSuggested, auditOpen: true,
      searchText: "Locate register Check synthetic microfilm ",
      researchOrderTime: -(row?.updatedAt ?? 0),
    });
    const facets = { active: 1, open: 1, "status:todo": 1 };
    await counts("researchTasks", facets);
    expect(await t.query(internal.researchPages.tasks, {
      ...scope, cursor: null, status: "todo", search: "microfilm",
    })).toMatchObject({
      page: [{ _id: taskId, person: { _id: own.personId } }], isDone: true, totals: facets,
    });
    expect((await score(own.personId))?.operation.openTaskCount).toBe(1);

    const denied = { ...args, title: "Attempted additional task" };
    if (aiSuggested) {
      expect(result).toEqual({ taskId, created: true });
      expect(await owner.mutation(writes.ensureResearchTask, { ...ensureArgs, priority: "low" }))
        .toEqual({ taskId, created: false });
      expect(await read(taskId)).toEqual(row);
      await counts("researchTasks", facets);
      await refuses("researchTasks", writes.ensureResearchTask, { ...denied, type: ensureArgs.type }, {
        person: { personId: foreign.personId },
      });
    } else {
      await refuses("researchTasks", writes.createResearchTask, denied, {
        person: { personId: foreign.personId },
      });
    }
  });

  test("upsertResearchCheck updates the person’s score and replaces the review membership", async () => {
    const { t, owner, own, foreign, partnerId, refuses, counts, score, read } = await fixture();
    const args = {
      ...scope, personId: own.personId, checkKey: "identity_review",
      status: "needs_review", applicability: "required", completionSource: "user", confidence: 0.5,
      linkedSourceIds: [own.sourceId], linkedPlaceIds: [own.placeId], linkedPersonIds: [partnerId],
      lastReviewedAt: 100,
    } satisfies FunctionArgs<typeof writes.upsertResearchCheck>;
    const { checkId, created } = await owner.mutation(writes.upsertResearchCheck, args);
    expect(created).toBe(true);
    expect(await read(checkId)).toMatchObject(args);
    expect((await score(own.personId))?.operation.missingCritical).toContain(args.checkKey);

    const edited = { ...args, status: "complete" as const, confidence: 0.9, lastReviewedAt: 200 };
    await refuses("researchChecks", writes.upsertResearchCheck, edited, {
      subject: { personId: foreign.personId },
      source: { linkedSourceIds: [own.sourceId, foreign.sourceId] },
      place: { linkedPlaceIds: [own.placeId, foreign.placeId] },
      linkedPerson: { linkedPersonIds: [partnerId, foreign.personId] },
    });
    expect(await owner.mutation(writes.upsertResearchCheck, edited)).toEqual({ checkId, created: false });
    expect(await read(checkId)).toMatchObject(edited);
    const updated = await score(own.personId);
    expect(updated?.operation.researchChecks).toContainEqual({
      checkKey: args.checkKey, status: "complete", applicability: "required", lastReviewedAt: 200,
    });
    expect(updated?.operation.missingCritical).not.toContain(args.checkKey);
    const reviews = await t.run(({ db }) => db.query("personScoreReviews")
      .withIndex("by_record", (q) => q.eq("recordId", own.personId)).collect());
    expect(reviews.map(({ reviewedAt }) => reviewedAt)).toEqual([200]);
    await counts("researchChecks");
  });
});
