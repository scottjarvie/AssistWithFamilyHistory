import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { seedGrant } from "../lib/mcp/testSupport";
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

async function sharedFixture(t: ReturnType<typeof setup>, count = 500) {
  return t.run(async ctx => {
    const place = await ctx.db.insert("places", {vaultOwnerId: owner, familySearchId: "SYNTHETIC-CITY", name: "Salt Lake City", fullName: "Salt Lake City", type: "city", createdAt: 0, updatedAt: 0});
    const source = await ctx.db.insert("sources", {vaultOwnerId: owner, fsId: "SYNTHETIC-SOURCE", title: "Invented register", type: "other", createdAt: 0, updatedAt: 0});
    const citation = await ctx.db.insert("citations", {vaultOwnerId: owner, sourceId: source, isEvidence: true, confidence: "high", createdAt: 0, updatedAt: 0});
    const people = [];
    for (let i=0;i<count;i++) {
      const id = await ctx.db.insert("persons", {...fields(i), birth: {place: {original: "Salt Lake City", placeId: place}}}); people.push(id);
      await ctx.db.insert("citationLinks", {vaultOwnerId: owner, citationId: citation, targetType: "person", targetId: String(id), createdAt: 0});
    }
    for (const table of ["mediaPeople", "peopleExplorerRows"]) await ctx.db.insert("searchBuildState", {table, complete: true, cursor: null});
    return {place, source, people};
  });
}

test("500 people sharing a place/source: capture no-ops refresh nobody", async () => {
  const t=setup(), ids=await sharedFixture(t);
  await t.withIdentity({subject: owner}).mutation(api.places.upsert, {vaultOwnerId: owner, familySearchId: "SYNTHETIC-CITY", name: "Salt Lake City", fullName: "Salt Lake City", type: "city"});
  await t.withIdentity({subject: owner}).mutation(api.vaultMutations.upsertSource, {vaultOwnerId: owner, fsId: "SYNTHETIC-SOURCE", title: "Invented register", type: "other"});
  expect((await t.run(ctx=>ctx.db.get(ids.place)))?.updatedAt).toBeGreaterThan(0);
  expect(await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect())).toEqual([]);
  expect(await t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
});

test("shared place rename and source archive commit before paged refresh; all 500 converge", async () => {
  vi.useFakeTimers();
  try {
    const t=setup(), ids=await sharedFixture(t);
    const grantId=await seedGrant(t,{vaultOwnerId:owner});
    const principal={subject:owner,issuer:"https://identity.example.test",clientId:"synthetic-mcp-client",scopes:[]};
    const saved=await t.mutation(internal.mcpFamilyHistory.saveRecords,{principal,grantId,operationId:"rename-shared",requestHash:"synthetic-rename",input:{summary:"Synthetic shared-place edit",places:[{mode:"update",placeId:ids.place,expectedUpdatedAt:0,name:"New city",fullName:"New city"}]}});
    expect(saved.counts).toMatchObject({updated:1,failed:0});
    await t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"archive-shared",requestHash:"synthetic-archive",input:{kind:"source",id:ids.source,expectedUpdatedAt:0,action:"archive"}});
    expect((await t.run(ctx=>ctx.db.get(ids.place)))?.fullName).toBe("New city");
    expect((await t.run(ctx=>ctx.db.get(ids.source)))?.archivedAt).toBeGreaterThan(0);
    expect((await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect())).length).toBeLessThanOrEqual(25);
    await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
    const rows=await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect());
    expect(rows).toHaveLength(500);expect(rows.every(r=>r.text.includes("new city") && r.payload.stats.sources===0)).toBe(true);
    expect(await t.run(ctx=>ctx.db.query("peopleExplorerFailures").collect())).toEqual([]);
  } finally {vi.useRealTimers();}
}, 120_000);

test("evidence-heavy person edits defer and repair outside the source transaction", async () => {
  vi.useFakeTimers();
  try {
    const t=setup();
    const personId=await t.run(async ctx=>{
      const personId=await ctx.db.insert("persons", {...fields(0), fsId:"DENSE-SYNTHETIC"});
      for(let i=0;i<150;i++) {
        const source=await ctx.db.insert("sources",{vaultOwnerId:owner,title:"Invented",type:"other",createdAt:0,updatedAt:0});
        const citationId=await ctx.db.insert("citations",{vaultOwnerId:owner,sourceId:source,isEvidence:true,confidence:"high",createdAt:0,updatedAt:0});
        await ctx.db.insert("citationLinks",{vaultOwnerId:owner,citationId,targetType:"person",targetId:String(personId),createdAt:0});
      }
      await ctx.db.insert("searchBuildState",{table:"mediaPeople",complete:true,cursor:null});return personId;
    });
    await t.withIdentity({subject:owner}).mutation(api.vaultMutations.upsertPerson,{vaultOwnerId:owner,fsId:"DENSE-SYNTHETIC",name:{given:"Updated",surname:"Finch"},sex:"unknown",living:false});
    expect((await t.run(ctx=>ctx.db.get(personId)))?.name.given).toBe("Updated");
    expect(await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect())).toEqual([]);
    await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
    expect((await t.run(ctx=>ctx.db.query("peopleExplorerRows").unique()))?.payload.stats.sources).toBe(150);
    await t.mutation(internal.peopleExplorer.refreshPeople,{personIds:[personId]});
    await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
    expect(await t.run(ctx=>ctx.db.query("peopleExplorerFailures").collect())).toEqual([]);
  }finally{vi.useRealTimers();}
});

test("pre-backfill list uses the legacy slice and creation-ascending tie order", async () => {
  const t=setup();await t.run(async ctx=>{for(let i=0;i<70;i++)await ctx.db.insert("persons",{...fields(i),updatedAt:42});});
  const old=(await t.query(internal.vault.getPeopleExplorer,{vaultOwnerId:owner})).map(projectPeopleCollectionRow);
  const first=await t.query(internal.peopleExplorer.page,{vaultOwnerId:owner,cursor:null});
  const next=await t.query(internal.peopleExplorer.page,{vaultOwnerId:owner,cursor:first.continueCursor});
  expect(first.page).toEqual(old.slice(0,50));expect(next.page).toEqual(old.slice(50));expect(next.isDone).toBe(true);
});

test("guest migration is reachable in shadow mode and defers 80 people's projection work", async () => {
  vi.useFakeTimers();vi.stubEnv("TRUST_BOUNDARY_MODE","shadow");
  try {
    const t=setup(), guest="guest_syntheticMigration";
    await t.run(async ctx=>{for(let i=0;i<80;i++)await ctx.db.insert("persons",{...fields(i),vaultOwnerId:guest});});
    await build(t);
    const result=await t.withIdentity({subject:owner}).mutation(api.vaultMigration.migrateGuestVault,{fromVaultOwnerId:guest,toVaultOwnerId:owner});
    expect(result.perTable.persons).toBe(80);
    expect((await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect()))).toEqual([]);
    const jobs=await t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());expect(jobs).toHaveLength(1);
    expect(jobs[0].args).toEqual([{kind:"owner",id:owner}]);
    await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
    expect((await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect())).every(r=>r.vaultOwnerId===owner)).toBe(true);
    expect((await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect()))).toHaveLength(80);
  }finally{vi.useRealTimers();vi.unstubAllEnvs();}
},60_000);

test("backfill can skip/log an isolated failure, and repair releases the complete flag", async () => {
  vi.useFakeTimers();
  try {
    let fail=true;
    const t=convexTest(schema,{...modules,"./peopleExplorer.ts":async()=>{
      const real=await import("./peopleExplorer");
      return {...real,rebuildOne:internalMutation({args:{personId:v.id("persons")},handler:async(ctx,args)=>{
        if(fail && args.personId===blocked) throw new Error("Synthetic projection failure");
        await (real.rebuildOne as unknown as {_handler:(ctx:MutationCtx,args:{personId:Id<"persons">})=>Promise<void>})._handler(ctx,args);
      }})};
    }});
    const blocked=await t.run(async ctx=>{const first=await ctx.db.insert("persons",fields(0));await ctx.db.insert("persons",fields(1));return first;});
    await expect(t.action(internal.peopleExplorer.backfill,{})).rejects.toThrow(/skipErrors/);
    expect((await t.query(internal.peopleExplorer.backfillStatus,{})).traversalComplete).toBe(false);
    expect(await t.action(internal.peopleExplorer.backfill,{skipErrors:true})).toEqual({complete:false,traversalComplete:true});
    expect((await t.query(internal.peopleExplorer.failures,{cursor:null})).page.map(r=>r.personId)).toEqual([blocked]);
    expect(await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect())).toHaveLength(1);
    fail=false;
    await t.mutation(internal.peopleExplorer.refreshPeople,{personIds:[blocked]});
    await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
    expect((await t.query(internal.peopleExplorer.backfillStatus,{}))).toMatchObject({complete:true,hasFailures:false});
    expect(await t.run(ctx=>ctx.db.query("peopleExplorerRows").collect())).toHaveLength(2);
  }finally{vi.useRealTimers();}
});
