import {expect, test, vi, afterEach} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api, internal} from "./_generated/api";
import {BUILD} from "./vaultCounts";
import {withSearchWrites} from "./searchWrites";
import {getPublishedStory, getVaultSnapshot, loadPersonScopedSnapshot, buildPublicStoryBundle, assemblePersonWorkspaceFromSnapshot, buildStoryIndexRow} from "./vault";
const modules = import.meta.glob("./**/*.ts");
const owner = "user_syntheticPagesB";
const other = "user_syntheticOtherB";
afterEach(() => vi.unstubAllEnvs());
const person = (name: string, vaultOwnerId = owner) => ({vaultOwnerId, name: {given: name, surname: "Synthetic"}, sex: "unknown" as const, living: false, researchStatus: "basic" as const, createdAt: 1, updatedAt: 1});
async function migrate(t: ReturnType<typeof convexTest>) {
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* each step commits independently */ }
}
async function fixture(t: ReturnType<typeof convexTest>) {
  return t.run(async ctx => {
    const a = await ctx.db.insert("persons", person("Invented Ancestor"));
    const b = await ctx.db.insert("persons", person("Invented Cousin"));
    const foreign = await ctx.db.insert("persons", person("Foreign", other));
    const place = await ctx.db.insert("places", {vaultOwnerId: owner, name: "Invented", fullName: "Invented Parish", type: "parish", createdAt: 1, updatedAt: 1});
    await ctx.db.patch(a, {birth: {date: {original: "1800", year: 1800}, place: {original: "Invented", placeId: place}}});
    const context = await ctx.db.insert("contextItems", {vaultOwnerId: owner, title: "Invented note", content: "Private", itemType: "note", evidenceRole: "raw_material", personIds: [a, a], privacyLevel: "private", reviewStatus: "unreviewed", aiUseAllowed: false, createdAt: 1, updatedAt: 1});
    const media = await ctx.db.insert("media", {vaultOwnerId: owner, title: "Invented portrait", type: "photo", personIds: [a, a], privacyLevel: "public_source", reviewStatus: "reviewed", rightsStatus: "public_domain", createdAt: 1, updatedAt: 1});
    await ctx.db.insert("relationships", {vaultOwnerId: owner, person1: a, person2: b, type: "Couple", createdAt: 1, updatedAt: 1});
    const base = {vaultOwnerId: owner, timePeriod: {startYear: 1750, endYear: 1900}, topic: "other" as const, content: "Invented context", sources: [], privacyLevel: "public_source" as const, reviewStatus: "reviewed" as const, createdAt: 1, updatedAt: 1};
    await ctx.db.insert("historicalContext", {...base, title: "Place-less"});
    await ctx.db.insert("historicalContext", {...base, title: "Local", placeId: place});
    const irrelevant = await ctx.db.insert("places", {vaultOwnerId: owner, name: "Other", fullName: "Other", type: "city", createdAt: 1, updatedAt: 1});
    await ctx.db.insert("historicalContext", {...base, title: "Unrelated", placeId: irrelevant});
    const event = await ctx.db.insert("events", {vaultOwnerId: owner, type: "census", date: {original: "1820", year: 1820}, place: {original: "Invented", placeId: place}, createdAt: 1, updatedAt: 1});
    await ctx.db.insert("personEvents", {vaultOwnerId: owner, personId: a, eventId: event, role: "primary", createdAt: 1});
    await ctx.db.insert("relationships", {vaultOwnerId: owner, person1: a, person2: a, type: "Other", createdAt: 1, updatedAt: 1});
    const source = await ctx.db.insert("sources", {vaultOwnerId: owner, type: "other", title: "Invented register", notes: "private source notes", createdAt: 1, updatedAt: 1});
    const citation = await ctx.db.insert("citations", {vaultOwnerId: owner, sourceId: source, isEvidence: true, confidence: "high", extractedText: "private excerpt", createdAt: 1, updatedAt: 1});
    await ctx.db.insert("citationLinks", {vaultOwnerId: owner, citationId: citation, targetType: "event", targetId: String(event), createdAt: 1});
    const story = await ctx.db.insert("stories", {vaultOwnerId: owner, personId: a, type: "biography", title: "Invented story", content: "Invented narrative", citationIds: [], status: "published", generatedBy: "human", createdAt: 1, updatedAt: 1});
    return {a,b,foreign,place,context,media,story};
  });
}

test("v5 resumes after v4, source edits commute with backfill, memberships stay deduplicated and exact", async () => {
  const t = convexTest(schema, modules), ids = await fixture(t);
  await t.run(ctx => ctx.db.insert("searchBuildState", {table: "vaultCounts:v4", complete: true, cursor: null}));
  expect((await t.query(internal.vaultCounts.backfillStatus, {})).complete).toBe(false);
  // A write to a legacy row before the context table traversal creates its new links atomically.
  await t.run(async ctx => withSearchWrites(ctx).db.patch(ids.context, {personIds: [ids.b, ids.b]}));
  for (let i = 0; i < 12; i++) await t.mutation(internal.vaultCounts.backfillStep, {});
  await t.run(async ctx => withSearchWrites(ctx).db.patch(ids.media, {personIds: [ids.b]}));
  await migrate(t); await migrate(t);
  expect(await t.run(ctx => ctx.db.query("contextItemPeople").collect())).toMatchObject([{contextItemId: ids.context, personId: ids.b}]);
  expect(await t.run(ctx => ctx.db.query("mediaPeople").collect())).toMatchObject([{mediaId: ids.media, personId: ids.b}]);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    await db.patch(ids.context, {vaultOwnerId: other, personIds: [ids.a, ids.foreign]});
    await db.patch(ids.media, {archivedAt: 0});
  });
  const scoped = await t.run(ctx => loadPersonScopedSnapshot(ctx, owner, String(ids.a)));
  expect(scoped!.contextItems).toEqual([]); expect(scoped!.media).toEqual([]);
  await t.run(async ctx => {const db = withSearchWrites(ctx).db; await db.delete(ids.context); await db.delete(ids.media);});
  expect(await t.run(ctx => ctx.db.query("contextItemPeople").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("mediaPeople").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("searchBuildState").withIndex("by_table", q => q.eq("table", BUILD)).unique())).toMatchObject({complete: true});
});

test("scoped public DTO and workspace equal original complete snapshot before and after migration; privacy gates survive edits", async () => {
  const t = convexTest(schema, modules), ids = await fixture(t);
  for (const migrated of [false, true]) {
    if (migrated) await migrate(t);
    const expected = await t.run(async ctx => {
      const all = await getVaultSnapshot(ctx, owner), scoped = (await loadPersonScopedSnapshot(ctx, owner, String(ids.a)))!;
      expect(assemblePersonWorkspaceFromSnapshot(scoped, String(ids.a))).toEqual(assemblePersonWorkspaceFromSnapshot(all, String(ids.a)));
      return buildPublicStoryBundle(all, all.stories[0]);
    });
    expect(await t.query(api.vault.getPublishedStory, {storyId: ids.story})).toEqual(expected);
    expect(await t.query(api.vault.getPublishedStoryByIdentifier, {storyIdentifier: String(ids.story)})).toEqual(expected);
  }
  await t.run(async ctx => {const db = withSearchWrites(ctx).db; await db.patch(ids.b, {archivedAt: 0});});
  expect((await t.query(api.vault.getPublishedStory, {storyId: ids.story}))!.relationships.every(row => row.type === "Other")).toBe(true);
  await t.run(async ctx => withSearchWrites(ctx).db.patch(ids.a, {living: true}));
  expect(await t.query(api.vault.getPublishedStory, {storyId: ids.story})).toBeNull();
  await t.run(async ctx => withSearchWrites(ctx).db.patch(ids.a, {living: false, archivedAt: 0}));
  expect(await t.query(api.vault.getPublishedStory, {storyId: ids.story})).toBeNull();
  await t.run(async ctx => withSearchWrites(ctx).db.patch(ids.a, {archivedAt: undefined}));
  await t.run(async ctx => withSearchWrites(ctx).db.patch(ids.story, {archivedAt: 0}));
  expect(await t.query(api.vault.getPublishedStory, {storyId: ids.story})).toBeNull();
  expect(await t.query(api.vault.getPublishedStoryByIdentifier, {storyIdentifier: String(ids.story)})).toBeNull();
});

test("story pages exclude archived candidates before pagination, equal the rich rows, and isolate owners", async () => {
  vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
  const t = convexTest(schema, modules), ids = await fixture(t);
  await migrate(t);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    const original = (await ctx.db.get(ids.story))!;
    for (let i = 0; i < 27; i++) {
      const {_id, _creationTime, ...fields} = original;
      void _id; void _creationTime;
      await db.insert("stories", {...fields, title: `Invented ${i}`, updatedAt: i + 2, ...(i > 16 ? {archivedAt: 0} : {})});
    }
    const {_id, _creationTime, ...fields} = original; void _id; void _creationTime;
    await db.insert("stories", {...fields, vaultOwnerId: other});
  });
  expect((await t.query(internal.vault.getStoriesIndex, {vaultOwnerId: owner})).page).toHaveLength(10);
  let cursor: string | null = null; const found: string[] = [];
  do {
    const page = await t.withIdentity({subject: owner}).action(api.vaultReads.getStoriesIndex, {vaultOwnerId: owner, cursor});
    for (const row of page.page) {
      found.push(String(row._id));
      expect(row.vaultOwnerId).toBe(owner);
      const expected = await t.run(async ctx => buildStoryIndexRow(await getVaultSnapshot(ctx, owner), (await ctx.db.get(row._id))!));
      expect(row).toEqual(expected);
    }
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  expect(found).toHaveLength(18); expect(new Set(found).size).toBe(found.length);
  await expect(t.withIdentity({subject: other}).action(api.vaultReads.getStoriesIndex, {vaultOwnerId: owner})).rejects.toThrow(/owner_mismatch/);
});

test("provisional pages retain all merge states and owner/anchor scope", async () => {
  vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
  const t = convexTest(schema, modules), ids = await fixture(t);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    for (let i = 0; i < 125; i++) await db.insert("provisionalRelatives", {vaultOwnerId: owner, anchorPersonId: i % 2 ? ids.a : ids.b, displayName: `Invented relative ${i}`, dedupeKey: String(i), sourceKeys: [], evidenceCount: 0, mergeState: i % 3 ? "provisional" : "dismissed", createdAt: i, updatedAt: i});
    await db.insert("provisionalRelatives", {vaultOwnerId: other, anchorPersonId: ids.a, displayName: "Foreign", dedupeKey: "foreign", sourceKeys: [], evidenceCount: 0, mergeState: "provisional", createdAt: 1, updatedAt: 1});
  });
  for (const personIdentifier of [undefined, String(ids.a), "ABSENT-ID"]) {
    let cursor: string | null = null; const found: string[] = [];
    do {
      const page = await t.withIdentity({subject: owner}).action(api.vaultReads.getProvisionalRelatives, {vaultOwnerId: owner, personIdentifier, cursor});
      expect(page.page.length).toBeLessThanOrEqual(50);
      for (const row of page.page) {expect(row.vaultOwnerId).toBe(owner); if (personIdentifier) expect(String(row.anchorPersonId)).toBe(personIdentifier); found.push(String(row._id));}
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    expect(found).toHaveLength(personIdentifier === undefined ? 125 : personIdentifier === String(ids.a) ? 62 : 0);
    expect(new Set(found).size).toBe(found.length);
  }
});

test("migrated public reads cannot regress to owner-wide media/context or unrelated private history", async () => {
  const t = convexTest(schema, modules), ids = await fixture(t);
  await migrate(t);
  const ranges: [string, string][] = [];
  await t.run(async ctx => {
    const db = new Proxy(ctx.db, {get(target, key) {
      if (key === "query") return (table: Parameters<typeof target.query>[0]) => {
        const query = target.query(table);
        return new Proxy(query, {get(queryTarget, queryKey) {
          if (queryKey === "withIndex") return (...args: Parameters<typeof query.withIndex>) => {
            ranges.push([table, args[0]]);
            if (["media", "contextItems", "historicalContext"].includes(table)) expect(args[0]).not.toBe("by_owner");
            return queryTarget.withIndex(...args);
          };
          const value = Reflect.get(queryTarget, queryKey);
          return typeof value === "function" ? value.bind(queryTarget) : value;
        }});
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }});
    expect(await getPublishedStory._handler({...ctx, db} as never, {storyId: ids.story})).not.toBeNull();
  });
  for (const table of ["sourceFacts", "stories", "contextItems", "documents", "importRuns", "researchTasks", "researchLog", "researchChecks", "provisionalRelatives", "storyReviewEvents"]) expect(ranges.some(([name]) => name === table)).toBe(false);
  expect(ranges).toContainEqual(["mediaPeople", "by_person"]);
});
