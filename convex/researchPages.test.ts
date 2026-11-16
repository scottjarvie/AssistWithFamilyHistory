import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal, api } from "./_generated/api";
import {projectResearchTask,projectResearchLog} from "../lib/vault/collectionRows";
import { withSearchWrites } from "./searchWrites";
const modules = import.meta.glob("./**/*.ts");
const owner = "user_syntheticResearch";
test("Research pages reproduce legacy rows/order with exact global facets and owner-safe person hydration", async () => {
  const t = convexTest(schema, modules);
  const personId = await t.run(async ctx => {
    const person = await ctx.db.insert("persons", {vaultOwnerId: owner, name: {given: "Invented", surname: "Reed"}, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1});
    const foreign = await ctx.db.insert("persons", {vaultOwnerId: "user_foreign", name: {given: "Other", surname: "Synthetic"}, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1});
    for (let i = 0; i < 122; i++) {
      await ctx.db.insert("researchTasks", {vaultOwnerId: owner, title: `Synthetic ${i}`, personId: i % 3 === 0 ? foreign : person, type: "other", status: i % 2 === 0 ? "done" : "todo", priority: "medium", aiSuggested: false, createdAt: i, updatedAt: i === 119 ? 42.0001 : i === 118 ? 42.0002 : 42, ...(i === 121 ? {archivedAt: 0} : {})});
      await ctx.db.insert("researchLog", {vaultOwnerId: owner, entityType: "person", entityId: i % 3 === 0 ? foreign : person, activityType: "other", status: "done", summary: `Synthetic ${i}`, createdAt: i, updatedAt: 42});
    }
    return person;
  });
  const legacy = await t.query(internal.vault.getResearchOverview, {vaultOwnerId: owner});
  const publicBefore = await t.withIdentity({subject: owner}).action(api.vaultReads.getResearchTasksPage, {vaultOwnerId: owner,cursor:null});
  expect(publicBefore.page.map(projectResearchTask)).toEqual(legacy.tasks.slice(0,50).map(projectResearchTask));
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* resume */ }
  const stripKey = <T extends {researchOrderTime?: number}>(row: T) => {const {researchOrderTime: _key, ...rest} = row; void _key; return rest;};
  let cursor: string | null = null;
  const tasks = [];
  do {
    const page = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, cursor});
    expect(page.page.length).toBeLessThanOrEqual(50);
    expect(page.totals).toEqual({active: 121, open:60, "status:done": 61, "status:todo": 60});
    tasks.push(...page.page.map(stripKey));
    if (page.isDone) break;
    cursor = page.continueCursor;
  } while (true);
  expect(tasks.map(projectResearchTask)).toEqual(legacy.tasks.map(projectResearchTask));
  const filtered = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, status: "done", cursor: null});
  expect(filtered.page.map(projectResearchTask)).toEqual(legacy.tasks.filter(t => t.status === "done").slice(0, 50).map(projectResearchTask));
  expect(filtered.totals.active).toBe(121);
  const after = await t.withIdentity({subject: owner}).action(api.vaultReads.getResearchTasksPage, {vaultOwnerId: owner,cursor:null});
  expect(after.page.map(projectResearchTask)).toEqual(legacy.tasks.slice(0,50).map(projectResearchTask));
  const logs=await t.withIdentity({subject:owner}).action(api.vaultReads.getResearchLogPage,{vaultOwnerId:owner,cursor:null});
  expect(logs.page.map(projectResearchLog)).toEqual(legacy.logEntries.slice(0,50).map(projectResearchLog));
  await t.run(ctx => withSearchWrites(ctx).db.patch(personId, {archivedAt: 0}));
  const archived = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, cursor: null});
  expect(archived.page.every(t => t.person === null)).toBe(true);
});

test("filtered continuation and large task descriptions remain complete", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    const db = withSearchWrites(ctx).db;
    for (let i = 0; i < 110; i++) await db.insert("researchTasks", {vaultOwnerId: owner, title: `Synthetic large ${i}`, description: "Synthetic ".repeat(2000), type: "other", status: "blocked", priority: "medium", aiSuggested: false, createdAt: i, updatedAt: i});
  });
  while (!await t.mutation(internal.vaultCounts.backfillStep, {})) { /* resume */ }
  let cursor: string | null = null;
  const titles: string[] = [];
  do {
    const r = await t.query(internal.researchPages.tasks, {vaultOwnerId: owner, cursor, status: "blocked"});
    expect(r.page.length).toBeLessThanOrEqual(50);
    titles.push(...r.page.map(x => x.title));
    if (r.isDone) break;
    cursor = r.continueCursor;
  } while (true);
  expect(titles).toEqual(Array.from({length: 110}, (_, i) => `Synthetic large ${109-i}`));
});

test("substring and person-name searches continue across empty bounded pages",async()=>{
 const t=convexTest(schema,modules);
 await t.run(async ctx=>{
  const person=await ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Invented",surname:"Ashford"},sex:"unknown",living:false,researchStatus:"basic",createdAt:0,updatedAt:0});
  for(let i=0;i<130;i++)await withSearchWrites(ctx).db.insert("researchTasks",{vaultOwnerId:owner,title:i===0?"Oldest Raremarker":"Synthetic",personId:i===0?person:undefined,type:"other",status:"todo",priority:"low",aiSuggested:false,createdAt:i,updatedAt:i});
 });
 while(!await t.mutation(internal.vaultCounts.backfillStep,{})) { /* restartable */ }
 let cursor:string|null=null;const rows=[];let calls=0;
 do{const r=await t.query(internal.researchPages.tasks,{vaultOwnerId:owner,cursor,search:"ford"});calls++;rows.push(...r.page);expect(r.totals.active).toBe(130);if(r.isDone)break;cursor=r.continueCursor;}while(true);
 expect(calls).toBeGreaterThan(1);expect(rows.map(r=>r.title)).toEqual(["Oldest Raremarker"]);
});

test("large referenced people split hydration without skipping unprocessed ordered tasks",async()=>{
 const t=convexTest(schema,modules);
 await t.run(async ctx=>{
  const people=[];for(let i=0;i<4;i++)people.push(await ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:`Invented ${i}`,surname:"Reed"},notes:"Synthetic ".repeat(60000),sex:"unknown",living:false,researchStatus:"basic",createdAt:i,updatedAt:i}));
  for(let i=0;i<8;i++)await ctx.db.insert("researchTasks",{vaultOwnerId:owner,personId:people[i%4],title:`Synthetic ${i}`,type:"other",status:"todo",priority:"low",aiSuggested:false,createdAt:i,updatedAt:i});
 });
 while(!await t.mutation(internal.vaultCounts.backfillStep,{})){ /* resume */ }
 let cursor:string|null=null;const names=[];
 do{const r=await t.query(internal.researchPages.tasks,{vaultOwnerId:owner,cursor});expect(r.page).toHaveLength(1);expect(r.page[0].person).not.toHaveProperty("notes");names.push(...r.page.map(t=>t.title));if(r.isDone)break;cursor=r.continueCursor;}while(true);
 expect(names).toEqual(Array.from({length:8},(_,i)=>`Synthetic ${7-i}`));
});
