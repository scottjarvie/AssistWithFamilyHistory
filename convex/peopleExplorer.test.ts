import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal, api } from "./_generated/api";
import { applyExplorerChanges, type ExplorerChange } from "./peopleExplorer";
import { withSearchWrites } from "./searchWrites";
import { projectPeopleCollectionRow } from "../lib/vault/peopleCollection";
const modules = import.meta.glob("./**/*.ts");
const owner = "user_syntheticExplorer";
const fields = (i: number) => ({vaultOwnerId: owner, name: {given: `Invented${i}`, surname: "Finch"}, sex: "unknown" as const, living: false, researchStatus: "basic" as const, createdAt: i, updatedAt: i});
const setup = () => convexTest(schema, modules);
async function build(t: ReturnType<typeof setup>) {
  while (!await t.mutation(internal.peopleExplorer.backfillStep, {})) { /* resume */ }
  while (!await t.mutation(internal.peopleExplorer.projectionStep, {})) { /* resume */ }
}

describe("People cursor explorer", () => {
  test("bounded pagination, ordering, exact substring and status across sparse pages", async () => {
    const t = setup();
    await t.run(async ctx => {
      for (let i = 0; i < 105; i++) await ctx.db.insert("persons", fields(i));
      await ctx.db.insert("persons", {...fields(999), archivedAt: 1});
      await ctx.db.insert("persons", {...fields(1000), vaultOwnerId: "user_other"});
    });
    await build(t);
    let cursor: string | null = null;
    const ids = new Set<string>(); let pages = 0;
    for (;;) {
      const r = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor});
      expect(r.page.length).toBeLessThanOrEqual(50);
      if (pages === 0) expect(r.page[0].displayName).toBe("Invented104 Finch");
      for (const p of r.page) {expect(ids.has(p._id)).toBe(false); ids.add(p._id);}
      pages++; if (r.isDone) break; cursor = r.continueCursor;
    }
    expect(ids.size).toBe(105); expect(pages).toBe(3);
    const first = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null, search: "ted0 fi"});
    expect(first.page).toEqual([]);
    const found = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: first.continueCursor, search: "ted0 fi"});
    expect(found.page.map(p => p.displayName)).toEqual(["Invented0 Finch"]);
    expect(found.isDone).toBe(true);
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null, researchStatus: "complete"})).page).toEqual([]);
  });
  test("matches legacy display counts; media backfill and central writes remain exact", async () => {
    const t = setup();
    const {id, mediaId} = await t.run(async ctx => {
      const id = await ctx.db.insert("persons", {...fields(0), fsId: "SYNTHETIC-1"});
      const mediaId = await ctx.db.insert("media", {vaultOwnerId: owner, type: "photo", title: "Invented", personIds: [id], createdAt: 0, updatedAt: 0});
      return {id, mediaId};
    });
    const legacy = await t.query(internal.vault.getPeopleExplorer, {vaultOwnerId: owner});
    const before = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null});
    expect(before.page).toEqual(legacy.map(projectPeopleCollectionRow));
    await build(t);
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null})).page).toEqual(before.page);
    await t.run(async ctx => {const changes: ExplorerChange[] = []; await withSearchWrites(ctx, changes).db.patch(mediaId, {personIds: []}); await applyExplorerChanges(ctx, changes);});
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null})).page[0].stats.memories).toBe(0);
    await t.run(async ctx => {const changes: ExplorerChange[] = []; await withSearchWrites(ctx, changes).db.patch("media", mediaId, {personIds: [id, id]}); await applyExplorerChanges(ctx, changes);});
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null})).page[0].stats.memories).toBe(1);
    await t.run(async ctx => {const changes: ExplorerChange[] = []; await withSearchWrites(ctx, changes).db.delete(mediaId); await applyExplorerChanges(ctx, changes);});
    expect((await t.run(ctx => ctx.db.query("mediaPeople").collect()))).toEqual([]);
  });
  test("display DTO parity includes places, event citations, documents, stories and deduplicated imports", async () => {
    const t = setup();
    await t.run(async ctx => {
      const place = await ctx.db.insert("places", {vaultOwnerId: owner, name: "Ashford", fullName: "Invented Ashford Parish", type: "parish", createdAt: 0, updatedAt: 0});
      const id = await ctx.db.insert("persons", {...fields(0), fsId: "SYNTHETIC-2", birth: {date: {original: "about 1820", year: 1820}, place: {original: "Ashford", placeId: place}}});
      const event = await ctx.db.insert("events", {vaultOwnerId: owner, type: "census", place: {original: "Ashford", placeId: place}, createdAt: 0, updatedAt: 0});
      await ctx.db.insert("personEvents", {vaultOwnerId: owner, personId: id, eventId: event, role: "primary", createdAt: 0});
      const source = await ctx.db.insert("sources", {vaultOwnerId: owner, title: "Invented register", type: "other", createdAt: 0, updatedAt: 0});
      const citation = await ctx.db.insert("citations", {vaultOwnerId: owner, sourceId: source, isEvidence: true, confidence: "high", createdAt: 0, updatedAt: 0});
      for (const target of [{targetType: "person" as const, targetId: String(id)}, {targetType: "event" as const, targetId: String(event)}]) await ctx.db.insert("citationLinks", {vaultOwnerId: owner, citationId: citation, ...target, createdAt: 0});
      await ctx.db.insert("documents", {vaultOwnerId: owner, personId: "SYNTHETIC-2", type: "PS", title: "Invented sheet", contentMarkdown: "Synthetic", contentText: "Synthetic", createdAt: 0, updatedAt: 0});
      await ctx.db.insert("stories", {vaultOwnerId: owner, personId: id, type: "anecdote", title: "Invented story", content: "Synthetic", citationIds: [], status: "draft", generatedBy: "human", createdAt: 0, updatedAt: 0});
      await ctx.db.insert("importRuns", {vaultOwnerId: owner, personId: id, personFsId: "SYNTHETIC-2", personName: "Invented", captureId: "synthetic", captureVersion: "1", pageTypes: ["person"], sourceUrls: [], capturedAt: 1, importedAt: 2, compatibilityMode: false, mergeStatus: "created", counts: {sources: 0, citations: 0, memories: 0, relationships: 0, places: 0, events: 0, warnings: 0}, warnings: [], artifactPaths: {}});
    });
    await build(t);
    const legacy = (await t.query(internal.vault.getPeopleExplorer, {vaultOwnerId: owner})).map(projectPeopleCollectionRow);
    for (const search of [undefined, "ford par", "out 1820", "synthetic-2"]) {
      const actual = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null, search});
      expect(actual.page).toEqual(legacy);
      expect(actual.page[0].stats).toEqual({sources: 1, imports: 1, memories: 0, documents: 1, stories: 1});
      expect(actual.page[0].latestImport).toEqual({importedAt: 2});
    }
  });
  test("central writer propagation keeps place text and source counts exact", async () => {
    const t = setup();
    const ids = await t.run(async ctx => {
      const place = await ctx.db.insert("places", {vaultOwnerId: owner, name: "Invented", fullName: "Old parish", type: "parish", createdAt: 0, updatedAt: 0});
      const person = await ctx.db.insert("persons", {...fields(0), birth: {place: {original: "Invented", placeId: place}}});
      const source = await ctx.db.insert("sources", {vaultOwnerId: owner, title: "Invented", type: "other", createdAt: 0, updatedAt: 0});
      const citation = await ctx.db.insert("citations", {vaultOwnerId: owner, sourceId: source, isEvidence: true, confidence: "high", createdAt: 0, updatedAt: 0});
      await ctx.db.insert("citationLinks", {vaultOwnerId: owner, citationId: citation, targetType: "person", targetId: String(person), createdAt: 0});
      return {place, person, source};
    });
    await build(t);
    await t.run(async ctx => {const changes: ExplorerChange[]=[]; await withSearchWrites(ctx, changes).db.patch(ids.place, {fullName: "New parish"}); await applyExplorerChanges(ctx, changes);});
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null, search: "new par"})).page).toHaveLength(1);
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null, search: "old par"})).page).toHaveLength(0);
    await t.run(async ctx => {const changes: ExplorerChange[]=[]; await withSearchWrites(ctx, changes).db.patch(ids.source, {archivedAt: 1}); await applyExplorerChanges(ctx, changes);});
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null})).page[0].stats.sources).toBe(0);
    await t.run(async ctx => {const changes: ExplorerChange[]=[]; await withSearchWrites(ctx, changes).db.delete(ids.person); await applyExplorerChanges(ctx, changes);});
    expect((await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null})).page).toEqual([]);
  });
  test("sparse projected searches advance 2000 candidates without skipping old matches", async () => {
    const t = setup();
    await t.run(async ctx => {for(let i=0;i<2051;i++) await ctx.db.insert("persons", fields(i));});
    await build(t);
    const first = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: null, search: "ted0 fi"});
    expect(first.page).toEqual([]); expect(first.isDone).toBe(false);
    const second = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: first.continueCursor, search: "ted0 fi"});
    expect(second.page).toEqual([]); expect(second.isDone).toBe(false);
    const last = await t.query(internal.peopleExplorer.page, {vaultOwnerId: owner, cursor: second.continueCursor, search: "ted0 fi"});
    expect(last.page.map(p=>p.displayName)).toEqual(["Invented0 Finch"]); expect(last.isDone).toBe(true);
  }, 60_000);
  test("public action enforces tenant identity", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = setup();
    await expect(t.withIdentity({subject: "user_foreign"}).action(api.vaultReads.getPeopleExplorerPage, {vaultOwnerId: owner, cursor: null})).rejects.toThrow();
    vi.unstubAllEnvs();
  });
});
