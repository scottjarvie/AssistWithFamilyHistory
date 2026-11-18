import {afterEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api,internal} from "./_generated/api";
import {withSearchWrites} from "./searchWrites";
import {applyExplorerChanges,type ExplorerChange} from "./peopleExplorer";
import {auditMetrics,type AuditRecord} from "../lib/audit/contract";
import {projectAuditSummary} from "../lib/audit/presentation";
const modules=import.meta.glob("./**/*.ts"),owner="user_syntheticAudit",other="user_syntheticAuditOther";
const setup=()=>convexTest(schema,modules);
type T=ReturnType<typeof setup>;
const base={vaultOwnerId:owner,createdAt:1,updatedAt:1};
async function migrate(t:T){for(let i=0;i<1000;i++)if(await t.mutation(internal.vaultCounts.backfillStep,{}))return;throw Error("Backfill stuck");}
async function write(t:T,fn:(db:ReturnType<typeof withSearchWrites>["db"])=>Promise<unknown>){await t.run(async ctx=>{const changes:ExplorerChange[]=[];await fn(withSearchWrites(ctx,changes).db);await applyExplorerChanges(ctx,changes);});await t.finishAllScheduledFunctions(()=>vi.runAllTimers());}
async function fixture(t:T,n=65){return t.run(async ctx=>{
 const places=[];for(let i=0;i<3;i++)places.push(await ctx.db.insert("places",{...base,name:`Invented ${i}`,fullName:`Invented Place ${i}`,type:"city"}));
 const people=[],sources=[],stories=[],tasks=[],events=[],contexts=[];
 for(let i=0;i<n;i++) {
  const p=await ctx.db.insert("persons",{...base,name:{given:`Invented ${i}`,surname:"Synthetic"},sex:"unknown",living:false,researchStatus:"basic",birth:{date:{original:"1800",year:1800},place:{original:"Invented",placeId:places[i%3]}}});people.push(p);
  const e=await ctx.db.insert("events",{...base,type:"census",place:{original:"Invented",placeId:places[i%3]}});events.push(e);await ctx.db.insert("personEvents",{vaultOwnerId:owner,personId:p,eventId:e,role:"primary",createdAt:1});
  const s=await ctx.db.insert("sources",{...base,title:`Invented source ${i}`,type:"other"});sources.push(s);
  const c=await ctx.db.insert("citations",{...base,sourceId:s,isEvidence:true,confidence:"high"});
  await ctx.db.insert("citationLinks",{vaultOwnerId:owner,citationId:c,targetType:i%2===0?"person":"event",targetId:i%2===0?p:e,createdAt:1});
  if(i%2===0)stories.push(await ctx.db.insert("stories",{...base,personId:p,type:"biography",title:`Invented story ${i}`,content:"PRIVATE_synthetic",status:i%4===0?"published":"draft",citationIds:[],generatedBy:"human"}));
  tasks.push(await ctx.db.insert("researchTasks",{...base,personId:p,type:"record_search",title:`Invented task ${i}`,status:i%3===0?"done":"todo",priority:"medium",aiSuggested:false}));
 }
 for(let i=0;i<2;i++)contexts.push(await ctx.db.insert("historicalContext",{...base,updatedAt:i+1,placeId:places[i],title:`Invented context ${i}`,timePeriod:{startYear:1790,endYear:1900},topic:"other",content:"PRIVATE_context",sources:[]}));
 return {places,people,sources,stories,tasks,events,contexts};
});}
const sort=(rows:AuditRecord[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
async function parity(t:T,who=owner,drilldowns=false){
 const old=await t.query(internal.vault.getVaultAudit,{vaultOwnerId:who});
 const next=await t.withIdentity({subject:who}).action(api.vaultReads.getVaultAudit,{vaultOwnerId:who});
 expect(next.counts).toEqual(old.counts);expect(next.gaps).toEqual(old.gaps);expect(next.storyWorkflowCounts).toEqual(old.storyWorkflowCounts);expect(next.priorityPeople).toEqual(old.priorityPeople);expect(next.recentContext).toEqual(old.recentContext);
 if(drilldowns)for(const metric of auditMetrics){
  const rows:AuditRecord[]=[];let cursor:string|undefined;let calls=0;
  do {const p=(await t.withIdentity({subject:who}).action(api.vaultReads.getVaultAudit,{vaultOwnerId:who,metric,cursor})).records!;expect(p.rows.length).toBeLessThanOrEqual(50);expect(p.total).toBe(projectAuditSummary(old).metrics[metric]);rows.push(...p.rows);cursor=p.isDone?undefined:p.continueCursor;if(++calls>20)throw Error("Cursor stuck");}while(cursor);
  const legacy:AuditRecord[]=[];let offset:number|undefined;
  do {const p=(await t.query(internal.vault.getVaultAudit,{vaultOwnerId:who,metric,offset})).records!;legacy.push(...p.rows);offset=p.nextOffset??undefined;}while(offset!==undefined);
  expect(sort(rows),metric).toEqual(sort(legacy));expect(new Set(rows.map(r=>r.id)).size).toBe(rows.length);expect(JSON.stringify(rows)).not.toContain("PRIVATE_");
 }
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
test("v7 Audit summary and all sixteen complete paged record sets match the old snapshot",async()=>{vi.useFakeTimers();const t=setup();await fixture(t);await migrate(t);await parity(t,owner,true);});
test("exact Audit counters survive randomized writes, archives, restores, owner moves and deletes",async()=>{
 vi.useFakeTimers();const t=setup(),f=await fixture(t,8);await migrate(t);
 let seed=17;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
 for(let i=0;i<100;i++) {
  const ownerPatch={vaultOwnerId:random(2)?owner:other};const archive={archivedAt:random(2)?0:undefined};
  switch(random(8)) {
   case 0:await write(t,db=>db.patch(f.people[random(8)],{...ownerPatch,...archive}));break;
   case 1:await write(t,db=>db.patch(f.sources[random(8)],{...ownerPatch,...archive}));break;
   case 2:await write(t,db=>db.patch(f.stories[random(f.stories.length)],{...ownerPatch,...archive,status:random(2)?"published":"draft"}));break;
   case 3:await write(t,db=>db.patch(f.tasks[random(8)],{...ownerPatch,...archive,status:random(2)?"done":"blocked"}));break;
   case 4:await write(t,db=>db.patch(f.contexts[random(2)],{...ownerPatch,...archive,placeId:f.places[random(3)]}));break;
   case 5:await write(t,db=>db.patch(f.places[random(3)],{...ownerPatch,...archive}));break;
   case 6:await write(t,db=>db.patch(f.people[random(8)],{birth:{date:{original:"1950",year:random(2)?1800:1950},place:{original:"Invented",placeId:f.places[random(3)]}}}));break;
   case 7:await write(t,async db=>{const c=await db.insert("historicalContext",{...base,placeId:f.places[random(3)],title:"Invented temporary",timePeriod:{startYear:1800,endYear:1900},topic:"other",content:"Synthetic",sources:[]});await db.delete(c);});break;
  }
  await parity(t);await parity(t,other);
 }
 await parity(t,owner,true);await parity(t,other,true);
});
test("incomplete v7 keeps v6/v5/v4 readers migrated; only Audit retains legacy",async()=>{
 vi.useFakeTimers();const t=setup();await fixture(t,1);await migrate(t);
 await t.run(async ctx=>{const gate=(await ctx.db.query("searchBuildState").withIndex("by_table",q=>q.eq("table","vaultCounts:v7")).unique())!;await ctx.db.patch(gate._id,{complete:false});const {countsReady,scopedReadsReady}=await import("./vaultCounts");const {scoresReady}=await import("./personScores");expect(await countsReady(ctx)).toBe(true);expect(await scopedReadsReady(ctx)).toBe(true);expect(await scoresReady(ctx)).toBe(true);});
 expect(await t.query(internal.auditPages.status,{})).toBe(false);
 expect((await t.withIdentity({subject:owner}).action(api.vaultReads.getOperationsQueue,{vaultOwnerId:owner})).summaryScope).toBe("vault");
 expect((await t.withIdentity({subject:owner}).action(api.vaultReads.getStoryReadinessPage,{vaultOwnerId:owner})).page).toHaveLength(1);
 const audit=await t.withIdentity({subject:owner}).action(api.vaultReads.getVaultAudit,{vaultOwnerId:owner,metric:"people"});expect(audit.records?.continueCursor).toBeUndefined();
 await t.query(internal.vault.getDashboardSummary,{vaultOwnerId:owner});await t.query(internal.researchPages.tasks,{vaultOwnerId:owner,cursor:null});await t.query(internal.placePages.list,{vaultOwnerId:owner,cursor:null});
});
test("v7 backfill resumes and concurrent writes behind its cursor remain counted",async()=>{
 vi.useFakeTimers();const t=setup(),f=await fixture(t,2);for(let i=0;i<10;i++)await t.mutation(internal.vaultCounts.backfillStep,{});
 await write(t,db=>db.patch(f.contexts[0],{placeId:f.places[2]}));await write(t,db=>db.patch(f.stories[0],{status:"draft"}));await migrate(t);await parity(t,owner,true);expect(await t.mutation(internal.vaultCounts.backfillStep,{})).toBe(true);await parity(t);
});
test("Audit record reads enforce the owner in shadow mode as well as enforce",async()=>{vi.stubEnv("TRUST_BOUNDARY_MODE","shadow");const t=setup();for(const subject of [other,undefined])await expect((subject?t.withIdentity({subject}):t).action(api.vaultReads.getVaultAudit,{vaultOwnerId:owner,metric:"sources"})).rejects.toThrow(/Trust boundary denied/);});
test("destinations retain link precedence, source-fact fallback, name prefixes and references beyond fifty",async()=>{
 vi.useFakeTimers();const t=setup();const f=await fixture(t,2);
 await t.run(async ctx=>{
  await ctx.db.patch(f.people[0],{name:{prefix:"Dr",given:"Invented",surname:"Synthetic",suffix:"Jr"}});
  const source=await ctx.db.insert("sources",{...base,title:"Invented fact-only",type:"other"});
  const citation=await ctx.db.insert("citations",{...base,sourceId:source,isEvidence:true,confidence:"high"});
  await ctx.db.insert("sourceFacts",{...base,sourceId:source,citationId:citation,personId:f.people[0],importKey:"invented-audit-fact",factType:"occupation",label:"Occupation",value:"Invented",confidence:"high",status:"candidate"});
  const links=await ctx.db.query("citationLinks").collect();for(const link of links)await ctx.db.delete(link._id);
  const cites=await ctx.db.query("citations").withIndex("by_source",q=>q.eq("sourceId",f.sources[0])).collect();
  for(let i=0;i<55;i++)await ctx.db.insert("citationLinks",{vaultOwnerId:other,citationId:cites[0]._id,targetType:"person",targetId:f.people[0],createdAt:i});
  await ctx.db.insert("citationLinks",{vaultOwnerId:owner,citationId:cites[0]._id,targetType:"person",targetId:f.people[0],createdAt:100});
 });await migrate(t);await parity(t,owner,true);
});
test("completed v6 upgrades only Audit source tables and existing score flags",async()=>{
 vi.useFakeTimers();const t=setup();const f=await fixture(t,3);await migrate(t);
 await t.run(async ctx=>{
  const gate=(await ctx.db.query("searchBuildState").withIndex("by_table",q=>q.eq("table","vaultCounts:v7")).unique())!;await ctx.db.delete(gate._id);
  for(const row of await ctx.db.query("personScoreRows").collect())await ctx.db.patch(row._id,{auditWithoutSources:undefined,auditWithoutContext:undefined,auditWithoutStories:undefined});
  // Restore the source fields, ledger keys and aggregate keys as they were
  // before v7. The v6 person gap totals already existed, so retain those.
  for(const id of f.places)await ctx.db.patch(id,{auditWithoutContext:undefined});
  for(const id of f.tasks)await ctx.db.patch(id,{auditOpen:undefined});
  const isNewAuditKey=(table:string,key:string)=>
    (table==="places"&&key==="withoutContext")||
    (table==="researchTasks"&&key==="open")||
    (table==="stories"&&key.startsWith("status:"));
  for(const row of await ctx.db.query("vaultCountMembers").collect()){
    const keys=row.keys.filter(key=>!isNewAuditKey(row.table,key));
    if(keys.length!==row.keys.length)await ctx.db.patch(row._id,{keys});
  }
  for(const row of await ctx.db.query("vaultCounterShards").collect()){
    const keys=Object.entries(row.counts);
    const retained=keys.filter(([key])=>!isNewAuditKey(row.table,key));
    if(retained.length!==keys.length)await ctx.db.patch(row._id,{counts:Object.fromEntries(retained)});
  }
 });
 const {backfillStep}=await import("./vaultCounts");
 for(let i=0;i<10;i++) {
  const phase=await t.query(internal.vaultCounts.backfillStatus,{});
  const scoreTotals=phase.table==="auditFlags"
   ? await t.query(internal.personScores.totals,{vaultOwnerId:owner})
   : undefined;
  const done=await t.run(async ctx=>{
   const db=new Proxy(ctx.db,{get(target,key){if(key==="query")return (table:string)=>{if(["persons","sources","citations","citationLinks"].includes(table))throw Error("v7 upgrade reread v6 graph");return target.query(table as "persons");};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
   return (backfillStep as unknown as {_handler:(ctx:unknown,args:object)=>Promise<boolean>})._handler({...ctx,db},{});
  });
  if(scoreTotals)expect(await t.query(internal.personScores.totals,{vaultOwnerId:owner})).toEqual(scoreTotals);
  if(i===0){
   expect(await t.query(internal.auditPages.status,{})).toBe(false);
   await write(t,db=>db.patch(f.contexts[0],{placeId:f.places[2]}));
   await write(t,db=>db.patch(f.tasks[0],{status:"blocked"}));
   await write(t,db=>db.patch(f.stories[0],{status:"draft"}));
  }
  if(done)break;
 }
 expect(await t.query(internal.auditPages.status,{})).toBe(true);await parity(t,owner,true);
});
test("cursor continuation is bound to the matching metric and owner",async()=>{
 vi.useFakeTimers();const t=setup();await fixture(t);await migrate(t);const client=t.withIdentity({subject:owner});
 const first=(await client.action(api.vaultReads.getVaultAudit,{vaultOwnerId:owner,metric:"sources"})).records!;expect(first.isDone).toBe(false);
 await expect(client.action(api.vaultReads.getVaultAudit,{vaultOwnerId:owner,metric:"citations",cursor:first.continueCursor})).rejects.toThrow(/cursor belongs/);
 await expect(t.withIdentity({subject:other}).action(api.vaultReads.getVaultAudit,{vaultOwnerId:other,metric:"sources",cursor:first.continueCursor})).rejects.toThrow(/cursor belongs/);
});
test("place and task inserts and deletes maintain Audit gaps after v7",async()=>{
 vi.useFakeTimers();const t=setup();await migrate(t);
 for(let i=0;i<12;i++) {
  const ids=await t.run(async ctx=>{const db=withSearchWrites(ctx).db;return {p:await db.insert("places",{...base,name:`Invented ${i}`,fullName:`Invented ${i}`,type:"city"}),task:await db.insert("researchTasks",{...base,type:"other",title:`Invented task ${i}`,status:i%2?"todo":"done",priority:"low",aiSuggested:false})};});
  await parity(t);await write(t,async db=>{await db.patch(ids.p,{vaultOwnerId:other});await db.patch(ids.task,{vaultOwnerId:other,status:"blocked"});});await parity(t,other);
  await write(t,async db=>{await db.delete(ids.p);await db.delete(ids.task);});await parity(t);await parity(t,other);
 }
});
