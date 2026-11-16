import {expect,test} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {internal} from "./_generated/api";
import {withSearchWrites} from "./searchWrites";
const modules=import.meta.glob("./**/*.ts"),owner="user_syntheticDashboard";
test("dashboard parity, exact counts and globally indexed bounded recent/priority/open-state rows",async()=>{
 const t=convexTest(schema,modules);
 await t.run(async ctx=>{
  for(let i=0;i<100;i++)await ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:`Invented ${i}`,surname:"Reed"},sex:"unknown",living:false,researchStatus:"basic",researchPriority:i%10+1,createdAt:i,updatedAt:i===0?1000:i});
  for(let i=0;i<30;i++)await ctx.db.insert("researchTasks",{vaultOwnerId:owner,title:`Synthetic ${i}`,type:"other",status:(["todo","in_progress","blocked","done"]as const)[i%4],priority:"low",aiSuggested:false,createdAt:i,updatedAt:i});
  for(let i=0;i<10;i++)await ctx.db.insert("importRuns",{vaultOwnerId:owner,personFsId:`SYNTHETIC-${i}`,personName:"Invented Reed",captureId:`synthetic${i}`,captureVersion:"1",pageTypes:["person"],sourceUrls:[],capturedAt:i,importedAt:i,compatibilityMode:false,mergeStatus:"created",counts:{sources:3,citations:0,memories:2,relationships:0,places:0,events:0,warnings:1},warnings:["Synthetic import warning"],artifactPaths:{}});
 });
 const legacy=await t.query(internal.vault.getDashboardSummary,{vaultOwnerId:owner});
 while(!await t.mutation(internal.vaultCounts.backfillStep,{})) { /* restartable */ }
 const after=await t.query(internal.vault.getDashboardSummary,{vaultOwnerId:owner});expect(after).toEqual(legacy);
 // /api/convex/stats forwards this DTO as JSON to the Imports page.
 const statsReply=JSON.parse(JSON.stringify({recentImports:after.recentImports}));
 expect(statsReply.recentImports[0]).toMatchObject({personFsId:"SYNTHETIC-9",counts:{sources:3,memories:2,warnings:1},warnings:["Synthetic import warning"]});
 expect(statsReply.recentImports[0].warnings.length).toBe(1);
 expect(after.counts).toMatchObject({people:100,imports:10,openTasks:23});expect(after.recentPeople).toHaveLength(6);expect(after.recentPeople[0].displayName).toBe("Invented 0 Reed");expect(after.operationsHighlights).toHaveLength(5);expect(after.operationsHighlights.every(p=>p.researchPriority===10)).toBe(true);
 expect(after.waitingTasks.map(t=>t.title)).toEqual(["Synthetic 29","Synthetic 28","Synthetic 26","Synthetic 25","Synthetic 24"]);expect(after.recentImports[0].importedAt).toBe(9);expect(after.priorityScope).toContain("assigned");
 const task=await t.run(ctx=>ctx.db.query("researchTasks").withIndex("by_owner",q=>q.eq("vaultOwnerId",owner)).first());
 await t.run(ctx=>withSearchWrites(ctx).db.patch(task!._id,{status:"done"}));expect((await t.query(internal.vault.getDashboardSummary,{vaultOwnerId:owner})).counts.openTasks).toBe(22);
 expect((await t.query(internal.vault.getDashboardSummary,{vaultOwnerId:"user_empty"})).firstStartEligible).toBe(true);
});
