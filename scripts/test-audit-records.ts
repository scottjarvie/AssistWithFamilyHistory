import {test} from "node:test";
import assert from "node:assert/strict";
import {buildAuditRecordPage,type AuditRecordSnapshot,type AuditPersonInput} from "../lib/audit/records";
import {auditMetrics,type AuditMetric} from "../lib/audit/contract";
import {getVaultAudit as auditRead} from "../convex/vaultReads";
import {getVaultAudit as auditQuery} from "../convex/vault";
import type {ActionCtx, QueryCtx} from "../convex/_generated/server";
import {projectAuditSummary} from "../lib/audit/presentation";
const owner="owner-a";
const doc=(id:string,extra:Record<string,unknown>={},vaultOwnerId=owner)=>({_id:id,vaultOwnerId,notes:"PRIVATE_notes",content:"PRIVATE_body",url:"PRIVATE_url",...extra});
const people=[{...doc("a1"),routeId:"FS-A1",displayName:"Invented A One",storyWorkflow:"needs_genealogy_evidence",stats:{sources:0,stories:0},contextCoverage:{count:0}},{...doc("a2"),routeId:"FS-A2",displayName:"Invented A Two",storyWorkflow:"ready_to_review",stats:{sources:2,stories:1},contextCoverage:{count:1}},{...doc("b1",{},"owner-b"),routeId:"PRIVATE_foreign_route",displayName:"PRIVATE_foreign_person",storyWorkflow:"published",stats:{sources:0,stories:0},contextCoverage:{count:0}}] as AuditPersonInput[];
function snapshot():AuditRecordSnapshot {return {
 sources:[doc("s1",{title:"Invented source One",type:"census"}),doc("s2",{title:"Invented source Two",type:"letter"}),doc("sb",{title:"PRIVATE_foreign_source",type:"census"},"owner-b")],
 citations:[doc("c1",{sourceId:"s1",isEvidence:true,confidence:"high"}),doc("c2",{sourceId:"s2",isEvidence:false,confidence:"medium"}),doc("c3",{sourceId:"sb",isEvidence:true,confidence:"low"}),doc("cb",{sourceId:"sb",isEvidence:true,confidence:"high"},"owner-b")],
 citationLinks:[doc("cl1",{citationId:"c1",targetType:"event",targetId:"e1"}),doc("cl3",{citationId:"c3",targetType:"person",targetId:"b1"})],
 sourceFacts:[doc("fact",{sourceId:"s2",citationId:"c2",personId:"a2",value:"PRIVATE_fact"})],
 events:[doc("e1",{type:"birth"})], personEvents:[doc("pe1",{eventId:"e1",personId:"a1"})], relationships:[],
 places:[doc("p1",{fullName:"Invented place One"}),doc("p2",{fullName:"Invented place Two"}),doc("pb",{fullName:"PRIVATE_foreign_place"},"owner-b")],
 historicalContext:[doc("hc1",{title:"Invented context One",placeId:"p1",timePeriod:{startYear:1800,endYear:1900},topic:"daily_life"}),doc("hc2",{title:"Invented unlinked context",placeId:"pb",timePeriod:{startYear:1800,endYear:1900},topic:"economy"}),doc("hcb",{title:"PRIVATE_foreign_context",placeId:"p2",timePeriod:{startYear:1800,endYear:1900},topic:"economy"},"owner-b")],
 stories:[doc("st1",{title:"Invented draft",status:"draft"}),doc("st2",{title:"Invented published story",status:"published"}),doc("stb",{title:"PRIVATE_foreign_story",status:"published"},"owner-b")],
 researchTasks:[doc("t1",{title:"Invented task One",status:"todo",priority:"high",personId:"a1"}),doc("t2",{title:"Invented task Two",status:"in_progress",priority:"medium"}),doc("t3",{title:"Invented blocked task",status:"blocked",priority:"low",personId:"b1"}),doc("t4",{title:"Invented closed task",status:"done",priority:"low"}),doc("tb",{title:"PRIVATE_foreign_task",status:"todo",priority:"high"},"owner-b")],
 } as unknown as AuditRecordSnapshot;}

test("Every Audit headline/gap/workflow returns its actual matching owner records and a minimal projection",()=>{
 const expected:Record<AuditMetric,number>={people:2,sources:2,citations:3,historicalContext:2,stories:2,publishedStories:1,peopleWithoutSources:1,peopleWithoutContext:1,peopleWithoutStories:1,placesWithoutContext:1,openResearchTasks:3,"workflow:needs_genealogy_evidence":1,"workflow:needs_context_research":0,"workflow:ready_to_draft":0,"workflow:ready_to_review":1,"workflow:published":0};
 for(const metric of auditMetrics){const page=buildAuditRecordPage(snapshot(),people,owner,metric);assert.equal(page.total,expected[metric],metric);assert.equal(page.rows.length,expected[metric],metric);assert.equal(page.nextOffset,null);assert.doesNotMatch(JSON.stringify(page),/PRIVATE_/);for(const row of page.rows)assert.deepEqual(Object.keys(row),["id","title","kind","detail","href","destination"]);}
});

test("Audit source/citation/context destinations use known owned references and never raw URLs or foreign identities",()=>{
 const input=snapshot();
 const sources=buildAuditRecordPage(input,people,owner,"sources").rows;
 assert.equal(sources.find(r=>r.id==="s1")?.href,"/app/people/FS-A1#record-section-sources");
 assert.equal(sources.find(r=>r.id==="s2")?.href,"/app/people/FS-A2#record-section-sources");
 const citations=buildAuditRecordPage(input,people,owner,"citations").rows;
 assert.equal(citations.find(r=>r.id==="c3")?.title,"Citation · source unavailable");assert.equal(citations.find(r=>r.id==="c3")?.href,null);
 const contexts=buildAuditRecordPage(input,people,owner,"historicalContext").rows;
 assert.equal(contexts.find(r=>r.id==="hc1")?.href,"/app/places/p1#record-section-context");assert.equal(contexts.find(r=>r.id==="hc2")?.href,null);
 const tasks=buildAuditRecordPage(input,people,owner,"openResearchTasks").rows;
 assert.equal(tasks.find(r=>r.id==="t3")?.href,"/app/research");
 input.events=[];assert.equal(buildAuditRecordPage(input,people,owner,"sources").rows.find(r=>r.id==="s1")?.href,null);
});

test("Audit pages are bounded, stable across equal titles and never truncate the matching total",()=>{
 const input=snapshot();input.sources=Array.from({length:120},(_,i)=>doc(`many-${String(i).padStart(3,"0")}`,{title:"Same invented title",type:"census"})) as unknown as AuditRecordSnapshot["sources"];
 const ids:string[]=[];let offset:number|null=0;
 while(offset!==null){const page=buildAuditRecordPage(input,people,owner,"sources",offset);assert.equal(page.total,120);assert.ok(page.rows.length<=50);ids.push(...page.rows.map(r=>r.id));offset=page.nextOffset;}
 assert.equal(ids.length,120);assert.equal(new Set(ids).size,120);assert.equal(ids[0],"many-000");assert.equal(ids.at(-1),"many-119");
 assert.deepEqual(buildAuditRecordPage(input,people,owner,"sources",200).rows,[]);
 for(const invalid of [-1,0.5,Infinity,NaN])assert.throws(()=>buildAuditRecordPage(input,people,owner,"sources",invalid),/offset/);
 assert.throws(()=>buildAuditRecordPage(input,people,owner,"untrusted" as AuditMetric),/Unknown Audit/);
});

test("New drilldowns require the matched identity in both legacy modes; ordinary callers retain their policy",async()=>{
 const handler=(auditRead as unknown as {_handler:(ctx:ActionCtx,args:{vaultOwnerId:string;metric?:AuditMetric;offset?:number})=>Promise<unknown>})._handler;
 const original=process.env.TRUST_BOUNDARY_MODE;
 try {for(const mode of ["shadow","enforce"]){process.env.TRUST_BOUNDARY_MODE=mode;
  for(const subject of [null,"owner-b",owner]) {
   let reads=0,denialLogs=0;
   const ctx={auth:{getUserIdentity:async()=>subject?{subject}:null},runQuery:async(_fn:unknown,args:unknown)=>{reads++;return args;},runMutation:async()=>{denialLogs++;}} as unknown as ActionCtx;
   if(subject===owner){assert.deepEqual(await handler(ctx,{vaultOwnerId:owner,metric:"people",offset:50}),{vaultOwnerId:owner,metric:"people",offset:50});assert.equal(reads,1);}
   else {await assert.rejects(()=>handler(ctx,{vaultOwnerId:owner,metric:"people"}),/Trust boundary denied/);assert.equal(reads,0);}
   assert.equal(denialLogs,0,"strict new reads do not depend on shadow logging");
   reads=0;
   if(mode==="enforce"&&subject!==owner)await assert.rejects(()=>handler(ctx,{vaultOwnerId:owner}),/Trust boundary denied/);
   else {await handler(ctx,{vaultOwnerId:owner});assert.equal(reads,1);assert.equal(denialLogs,subject===owner?0:1);}
  }
 }
 const ctx={auth:{getUserIdentity:async()=>({subject:owner})},runQuery:async()=>{throw Error("must not query");}} as unknown as ActionCtx;
 for(const offset of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER+1])await assert.rejects(()=>handler(ctx,{vaultOwnerId:owner,metric:"sources",offset}),/Invalid Audit offset/);
 } finally {if(original===undefined)delete process.env.TRUST_BOUNDARY_MODE;else process.env.TRUST_BOUNDARY_MODE=original;}
});

test("Canonical Audit query and all sixteen matching pages have count parity; browser summary excludes raw context",async()=>{
 const input=snapshot();
 const tables:Record<string,unknown[]>={...input,persons:[doc("a1",{name:{given:"Invented",surname:"One"},living:false,researchStatus:"not_started",createdAt:1,updatedAt:1}),doc("a2",{name:{given:"Invented",surname:"Two"},living:false,researchStatus:"basic",createdAt:1,updatedAt:1}),doc("b1",{name:{given:"PRIVATE",surname:"foreign"},living:false},"owner-b")]};
 const ctx={db:{query:(table:string)=>({withIndex:()=>({collect:async()=>tables[table]||[]})})}} as unknown as QueryCtx;
 type QueryResult={counts:Record<string,number>;gaps:Record<string,number>;storyWorkflowCounts:Record<string,number>;records:ReturnType<typeof buildAuditRecordPage>;priorityPeople:Parameters<typeof projectAuditSummary>[0]["priorityPeople"];recentContext:unknown[]};
 const handler=(auditQuery as unknown as {_handler:(ctx:QueryCtx,args:{vaultOwnerId:string;metric?:AuditMetric})=>Promise<QueryResult>})._handler;
 const summary=await handler(ctx,{vaultOwnerId:owner});
 assert.ok(summary.recentContext.length,"legacy raw context preserved for existing callers");
 const projected=projectAuditSummary(summary as unknown as Parameters<typeof projectAuditSummary>[0]);
 assert.deepEqual(Object.keys(projected),["metrics","priorityPeople"]);assert.doesNotMatch(JSON.stringify(projected),/PRIVATE_|recentContext|nextActions/);
 for(const metric of auditMetrics){const result=await handler(ctx,{vaultOwnerId:owner,metric});assert.equal(result.records.total,projected.metrics[metric],metric);assert.doesNotMatch(JSON.stringify(result.records),/PRIVATE_/);}
});

test("Audit HTTP read rejects unknown metrics/offsets before vault access and never caches unavailable reads",async()=>{
 const {GET}=await import("../app/api/audit/records/route");
 const {NextRequest}=await import("next/server");
 for(const query of ["metric=unknown","metric=people&offset=-1","metric=people&offset=1.5","metric=people&offset=9007199254740992","metric=people&offset="]){const response=await GET(new NextRequest(`http://localhost/api/audit/records?${query}`));assert.equal(response.status,400,query);assert.equal(response.headers.get("cache-control"),"private, no-store");}
 const before=process.env.NEXT_PUBLIC_CONVEX_URL;delete process.env.NEXT_PUBLIC_CONVEX_URL;
 try {const response=await GET(new NextRequest("http://localhost/api/audit/records?metric=people&offset=0"));assert.equal(response.status,503);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.deepEqual(Object.keys(await response.json()),["success","error"]);}
 finally {if(before!==undefined)process.env.NEXT_PUBLIC_CONVEX_URL=before;}
});
