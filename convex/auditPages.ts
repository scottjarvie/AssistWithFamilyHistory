/* eslint-disable @typescript-eslint/no-explicit-any */
import type {FunctionReturnType} from "convex/server";
import {v} from "convex/values";
import {internalQuery, type QueryCtx, type ActionCtx} from "./_generated/server";
import {internal} from "./_generated/api";
import {formatPersonName} from "./vaultCore";
import {BUILD, ownerCounts} from "./vaultCounts";
import {auditMetrics, type AuditMetric, type AuditRecord, type AuditRecordPage} from "../lib/audit/contract";
import {buildAuditRecordPage, type AuditPersonInput, type AuditRecordSnapshot} from "../lib/audit/records";

export const status=internalQuery({args:{},handler:async ctx=>!!(await ctx.db.query("searchBuildState").withIndex("by_table",q=>q.eq("table",BUILD)).unique())?.complete});
export async function auditSummary(ctx:QueryCtx,vaultOwnerId:string) {
 const c=await ownerCounts(ctx,vaultOwnerId);
 const active=(table:keyof typeof c)=>c[table]?.active??0;
 const scores=(c as Record<string,Record<string,number>>).personScores??{};
 const candidates=(await Promise.all(["needs_genealogy_evidence","needs_context_research","ready_to_draft","ready_to_review"].map(storyWorkflow=>ctx.db.query("personScoreRows").withIndex("by_workflow_readiness",q=>q.eq("vaultOwnerId",vaultOwnerId).eq("rowType","person").eq("storyWorkflow",storyWorkflow)).take(8)))).flat().sort((a,b)=>a.readinessOrder.localeCompare(b.readinessOrder)).slice(0,8);
 const visible=await Promise.all(candidates.map(async s=> !vaultOwnerId.startsWith("guest_") || (await ctx.db.get(ctx.db.normalizeId("persons",s.recordId)!))?.vaultOwnerId===vaultOwnerId));
 return {records:null,counts:{people:active("persons"),relationships:active("relationships"),events:active("events"),places:active("places"),sources:active("sources"),citations:active("citations"),media:active("media"),documents:active("documents"),historicalContext:active("historicalContext"),researchChecks:active("researchChecks"),researchTasks:active("researchTasks"),researchLog:active("researchLog"),stories:active("stories"),publishedStories:c.stories?.["status:published"]??0},storyWorkflowCounts:Object.fromEntries(Object.entries(scores).filter(([k,n])=>k.startsWith("workflow:")&&n>0).map(([k,n])=>[k.slice(9),n])),gaps:{peopleWithoutSources:scores.withoutSources??0,peopleWithoutContext:scores.withoutContext??0,peopleWithoutStories:scores.withoutStories??0,openResearchTasks:c.researchTasks?.open??0,placesWithoutContext:c.places?.withoutContext??0},priorityPeople:candidates.flatMap((s,i)=>visible[i]&&s.readiness?[{_id:s.readiness._id,displayName:s.readiness.displayName,routeId:s.readiness.routeId,storyWorkflow:s.readiness.storyWorkflow as "published"|"needs_genealogy_evidence"|"needs_context_research"|"ready_to_draft"|"ready_to_review",completionPercent:s.readiness.completionPercent,sourceCount:s.readiness.sourceCount,contextReportCount:s.readiness.contextReportCount,storyCount:s.readiness.storyCount,nextActions:s.readiness.nextActions}]:[]),recentContext:await ctx.db.query("historicalContext").withIndex("by_audit_recent",q=>q.eq("vaultOwnerId",vaultOwnerId).eq("archivedAt",undefined)).take(8)};
}
export const summary=internalQuery({args:{vaultOwnerId:v.string()},handler:(ctx,a)=>auditSummary(ctx,a.vaultOwnerId)});
const empty=():AuditRecordSnapshot=>({sources:[],citations:[],citationLinks:[],sourceFacts:[],personEvents:[],events:[],relationships:[],places:[],historicalContext:[],stories:[],researchTasks:[]});
const owned=(row:any,owner:string)=>row?.vaultOwnerId===owner&&row.archivedAt===undefined;
export const records=internalQuery({args:{vaultOwnerId:v.string(),metric:v.union(...auditMetrics.map(m=>v.literal(m))),cursor:v.union(v.string(),v.null())},handler:async(ctx,a)=>{
 const {vaultOwnerId:owner,metric}=a;
 const personMetric=metric==="people"||metric.startsWith("peopleWithout")||metric.startsWith("workflow:");
 let range:any;
 if(personMetric) {
  const base=ctx.db.query("personScoreRows");
  range=metric.startsWith("workflow:")?base.withIndex("by_workflow_readiness",q=>q.eq("vaultOwnerId",owner).eq("rowType","person").eq("storyWorkflow",metric.slice(9))):metric==="peopleWithoutSources"?base.withIndex("by_audit_sources",q=>q.eq("vaultOwnerId",owner).eq("rowType","person").eq("auditWithoutSources",true)):metric==="peopleWithoutContext"?base.withIndex("by_audit_context",q=>q.eq("vaultOwnerId",owner).eq("rowType","person").eq("auditWithoutContext",true)):metric==="peopleWithoutStories"?base.withIndex("by_audit_stories",q=>q.eq("vaultOwnerId",owner).eq("rowType","person").eq("auditWithoutStories",true)):base.withIndex("by_readiness",q=>q.eq("vaultOwnerId",owner).eq("rowType","person"));
 }else if(metric==="placesWithoutContext")range=ctx.db.query("places").withIndex("by_audit_context",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("auditWithoutContext",true));
 else if(metric==="openResearchTasks")range=ctx.db.query("researchTasks").withIndex("by_audit_open",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("auditOpen",true));
 else if(metric==="historicalContext")range=ctx.db.query("historicalContext").withIndex("by_audit_recent",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined));
 else if(metric==="publishedStories")range=ctx.db.query("stories").withIndex("by_audit_status",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("status","published"));
 else if(metric==="citations")range=ctx.db.query("citations").withIndex("by_owner",q=>q.eq("vaultOwnerId",owner));
 else if(metric==="stories")range=ctx.db.query("stories").withIndex("by_owner_updated",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined)).order("desc");
 else range=ctx.db.query("sources").withIndex("by_audit_active",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined));
 const p=await range.paginate({cursor:a.cursor,numItems:50,maximumBytesRead:250000});
 const rows:AuditRecord[]=[];
 for(const r of p.page) {
  const snapshot=empty();let people:AuditPersonInput[]=[];
  if(personMetric) {
   if(owner.startsWith("guest_")&&!owned(await ctx.db.get(ctx.db.normalizeId("persons",r.recordId)!),owner))continue;
   people=[{_id:r.recordId,vaultOwnerId:owner,routeId:r.readiness.routeId,displayName:r.operation.displayName,storyWorkflow:r.storyWorkflow,stats:{sources:r.operation.sourceCount,stories:r.operation.storyCount},contextCoverage:{count:r.operation.contextReportCount}}];
  }else {
   const table=metric==="placesWithoutContext"?"places":metric==="openResearchTasks"?"researchTasks":metric==="publishedStories"?"stories":metric;
   (snapshot as any)[table]=[r];
  }
  rows.push(...buildAuditRecordPage(snapshot,people,owner,metric).rows);
 }
 return {rows,continueCursor:p.continueCursor as string,isDone:p.isDone as boolean};
}});

// At most two source documents per transaction: a page's 50 large source
// bodies must never be hydrated together with its citation records.
export const recordLink=internalQuery({args:{vaultOwnerId:v.string(),metric:v.string(),id:v.string()},handler:async(ctx,a):Promise<Partial<AuditRecord>>=>{
 const table=a.metric==="citations"?"citations":a.metric==="historicalContext"?"historicalContext":"researchTasks";
 const id=ctx.db.normalizeId(table,a.id);const row:any=id?await ctx.db.get(id):null;
 if(!owned(row,a.vaultOwnerId))return {};
 if(a.metric==="citations") {const source=await ctx.db.get(row.sourceId);return {title:owned(source,a.vaultOwnerId)?(source as any).title:"Citation · source unavailable"};}
 if(a.metric==="historicalContext") {
  const place=row.placeId?await ctx.db.get(row.placeId):null;
  return owned(place,a.vaultOwnerId)?{href:`/app/places/${encodeURIComponent(row.placeId)}#record-section-context`,destination:`Open ${(place as any).fullName} · context`}:{};
 }
 const person=row.personId?await ctx.db.get(row.personId):null;
 return owned(person,a.vaultOwnerId)?{href:`/app/people/${encodeURIComponent((person as any).fsId||row.personId)}#record-section-research`,destination:`Open ${formatPersonName(person as any)} · research`}:{};
}});

// Follow graph destinations through bounded index pages, never a whole-owner
// snapshot or a first-N reference window. Only compact references leave queries.
export const references=internalQuery({args:{vaultOwnerId:v.string(),kind:v.union(v.literal("source"),v.literal("citation"),v.literal("event"),v.literal("sourceFacts"),v.literal("citationFacts")),id:v.string(),cursor:v.union(v.string(),v.null())},handler:async(ctx,a)=>{
 const base:any=ctx.db.query(a.kind==="source"?"citations":a.kind==="citation"?"citationLinks":a.kind==="event"?"personEvents":"sourceFacts");
 const range=base.withIndex(a.kind==="source"||a.kind==="sourceFacts"?"by_source":a.kind==="event"?"by_event":"by_citation",(q:any)=>q.eq(a.kind==="source"||a.kind==="sourceFacts"?"sourceId":a.kind==="event"?"eventId":"citationId",a.id));
 const p=await range.paginate({cursor:a.cursor,numItems:50,maximumBytesRead:250000});
 return {refs:p.page.filter((r:any)=>owned(r,a.vaultOwnerId)&&(a.kind!=="citation"||["person","place","event","relationship"].includes(r.targetType))).map((r:any)=>a.kind==="source"?{kind:"linkedCitation",id:String(r._id)}:a.kind==="citation"?{kind:r.targetType as string,id:r.targetId as string}:{kind:"person",id:String(r.personId)}),continueCursor:p.continueCursor as string,isDone:p.isDone as boolean};
}});
type Destination={href:string;label:string};
export const target=internalQuery({args:{vaultOwnerId:v.string(),kind:v.string(),id:v.string()},handler:async(ctx,a):Promise<{destination:Destination|null;event?:boolean}>=>{
 const table=a.kind==="person"?"persons":a.kind==="place"?"places":a.kind==="event"?"events":a.kind==="relationship"?"relationships":null;
 const id=table?ctx.db.normalizeId(table,a.id):null;const row:any=id?await ctx.db.get(id):null;
 if(!owned(row,a.vaultOwnerId))return {destination:null};
 if(a.kind==="person")return {destination:{href:`/app/people/${encodeURIComponent(row.fsId||String(row._id))}#record-section-sources`,label:`Open ${formatPersonName(row)} · sources`}};
 if(a.kind==="place")return {destination:{href:`/app/places/${encodeURIComponent(a.id)}#record-section-sources`,label:`Open ${row.fullName} · sources`}};
 if(a.kind==="event")return {destination:null,event:true};
 for(const pid of [row.person1,row.person2]) {const p=await ctx.db.get(pid);if(owned(p,a.vaultOwnerId)) {const person:any=p;return {destination:{href:`/app/people/${encodeURIComponent(person.fsId||String(pid))}#record-section-sources`,label:`Open ${formatPersonName(person)} · sources`}};}}
 return {destination:null};
}});
export async function resolveDestination(ctx:Pick<ActionCtx,"runQuery">,owner:string,kind:string,id:string):Promise<Destination|null> {
 const scan=async(kind:"source"|"citation"|"event"|"sourceFacts"|"citationFacts",id:string):Promise<Destination|null>=>{
  let cursor:string|null=null;
  do {
   const p:FunctionReturnType<typeof internal.auditPages.references>=await ctx.runQuery(internal.auditPages.references,{vaultOwnerId:owner,kind,id,cursor});
   for(const ref of p.refs) {const dest=await resolveDestination(ctx,owner,ref.kind,ref.id);if(dest)return dest;}
   if(p.isDone)return null;cursor=p.continueCursor;
  }while(true);
 };
 if(kind==="source")return await scan("source",id)??await scan("sourceFacts",id);
 if(kind==="linkedCitation")return scan("citation",id);
 if(kind==="citation")return await scan("citation",id)??await scan("citationFacts",id);
 const t=await ctx.runQuery(internal.auditPages.target,{vaultOwnerId:owner,kind,id});
 return t.event?scan("event",id):t.destination;
}
export async function readRecords(ctx:Pick<ActionCtx,"runQuery">,owner:string,metric:AuditMetric,cursor:string|null,total:number,people:number):Promise<AuditRecordPage> {
 let rawCursor:string|null=null;
 if(cursor) {
  let value:{owner?:string;metric?:string;cursor?:unknown};
  try{value=JSON.parse(cursor);}catch{throw new Error("Invalid Audit cursor; restart at page one");}
  if(!value||value.owner!==owner||value.metric!==metric||typeof value.cursor!=="string")throw new Error("Audit cursor belongs to another metric or vault; restart at page one");
  rawCursor=value.cursor;
 }
 const p=await ctx.runQuery(internal.auditPages.records,{vaultOwnerId:owner,metric,cursor:rawCursor});
 const rows=await Promise.all(p.rows.map(async raw=>{
  const r=["citations","historicalContext","openResearchTasks"].includes(metric)?{...raw,...await ctx.runQuery(internal.auditPages.recordLink,{vaultOwnerId:owner,metric,id:raw.id})}:raw;
  if(metric!=="sources"&&metric!=="citations")return r;
  const dest=await resolveDestination(ctx,owner,metric==="sources"?"source":"citation",r.id);
  return {...r,href:dest?.href??null,destination:dest?.label??null};
 }));
 return {metric,total,rows,nextOffset:null,continueCursor:JSON.stringify({owner,metric,cursor:p.continueCursor}),isDone:p.isDone,...(metric.startsWith("peopleWithout")||metric.startsWith("workflow:")?{denominator:{metric:"people" as const,total:people}}:{})};
}
