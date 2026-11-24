import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { countsReady, ownerTableCounter } from "./vaultCounts";
import { placeTotals } from "./placeCounts";
import { activeOwnerRows, readLegacyPlaceWorkspace } from "./vault";
import { normalizeVaultOwnerId } from "./vaultCore";
export const placePageArgs={vaultOwnerId:v.string(),cursor:v.union(v.string(),v.null())};
export const sectionValidator=v.union(v.literal("events"),v.literal("people"),v.literal("sources"),v.literal("context"),v.literal("research"),v.literal("media"));
export type PlaceListPage={page:PlaceRow[];continueCursor:string;isDone:boolean;total:number;mediaMode:"explicit"|"mentions"};
export type PlaceMention=MediaRow&{linked:boolean};
export type PlaceSection="events"|"people"|"sources"|"context"|"research"|"media";
export type PlaceRow={_id:Id<"places">;name:string;fullName:string;type:string;stats:{events:number;citations:number;media:number}};
export type EventRow={id:string;type:string;date?:{original:string;year?:number};description?:string};
export type PersonRow={id:string;routeId:string;name:string;birthYear?:number;deathYear?:number};
export type SourceRow={id:string;sourceId:string;title:string;type:string};
export type MediaRow={id:string;title:string;type:string};
export type ContextRow={id:string;title:string;topic:string;timePeriod:{startYear:number;endYear:number};content:string;sourcesCount:number};
export type LogRow={id:string;summary:string;details?:string;activityType:string;updatedAt:number;model?:string;creationProvenance?:{actorKind:string;method:string}};
export type SectionRows={events:EventRow;people:PersonRow;sources:SourceRow;context:ContextRow;research:LogRow;media:MediaRow};
export type SectionPage<S extends PlaceSection=PlaceSection>={page:SectionRows[S][];continueCursor:string;isDone:boolean};
export type WorkspacePages={[S in PlaceSection]:SectionPage<S>};
export type PlaceHeader={place:Pick<PlaceRow,"_id"|"name"|"fullName"|"type">;totals:{events:number;citations:number;media:number;context:number;research:number};firstYear:number|null;lastYear:number|null;indexed:boolean};
export type PlaceWorkspace={header:PlaceHeader;pages:WorkspacePages};
const visible=<T extends {vaultOwnerId?:string}>(row:T|null,owner:string):row is T=>!!row&&row.vaultOwnerId===owner&&(!("archivedAt"in row)||row.archivedAt===undefined);
const eventRow=(e:Doc<"events">):EventRow=>({id:String(e._id),type:e.type,date:e.date?{original:e.date.original,year:e.date.year}:undefined,description:e.description});
const personRow=(p:Doc<"persons">):PersonRow=>({id:String(p._id),routeId:p.fsId||String(p._id),name:[p.name.prefix,p.name.given,p.name.surname,p.name.suffix].filter(Boolean).join(" "),birthYear:p.birth?.date?.year,deathYear:p.death?.date?.year});
const mediaRow=(m:Doc<"media">):MediaRow=>({id:String(m._id),title:m.title,type:m.type});
const contextRow=(c:Doc<"historicalContext">):ContextRow=>({id:String(c._id),title:c.title,topic:c.topic,timePeriod:c.timePeriod,content:c.content,sourcesCount:c.sources.length});
const logRow=(r:Doc<"researchLog">):LogRow=>({id:String(r._id),summary:r.summary,details:r.details,activityType:r.activityType,updatedAt:r.updatedAt,model:r.model,creationProvenance:r.creationProvenance?{actorKind:r.creationProvenance.actorKind,method:r.creationProvenance.method}:undefined});
const keyCursor=(key:string)=>`k:${key}`;
const afterKey=(cursor:string|null)=>cursor?.startsWith("k:")?cursor.slice(2):"";
const nativeCursor=(cursor:string|null)=>cursor?.startsWith("n:")?cursor.slice(2):null;
async function ownedPlace(ctx:QueryCtx,owner:string,id:Id<"places">){const p=await ctx.db.get(id);return visible(p,owner)?p:null;}

export const list = internalQuery({args:{...placePageArgs,search:v.optional(v.string())},handler:async(ctx,args):Promise<PlaceListPage>=>{
 const owner=normalizeVaultOwnerId(args.vaultOwnerId),needle=args.search?.trim().toLowerCase();
 if(!await countsReady(ctx)) {
   const [places, events, citationLinks, media] = await Promise.all([
     activeOwnerRows(ctx, "places", owner), activeOwnerRows(ctx, "events", owner),
     activeOwnerRows(ctx, "citationLinks", owner), activeOwnerRows(ctx, "media", owner),
   ]);
   const offset=args.cursor?.startsWith("s:")?Number(args.cursor.slice(2)):0;
   const matches = places.filter(p=>!needle||`${p.name} ${p.fullName}`.toLowerCase().includes(needle));
   const page=matches.slice(offset,offset+50).map(p=>({_id:p._id,name:p.name,fullName:p.fullName,type:p.type,stats:{events:events.filter(e=>e.place?.placeId===p._id).length,citations:citationLinks.filter(l=>l.targetType==="place"&&l.targetId===String(p._id)).length,media:media.filter(m=>m.description?.includes(p.name)||m.title.includes(p.name)).length}}));
   return {page,continueCursor:`s:${offset+50}`,isDone:offset+50>=matches.length,total:places.length,mediaMode:"mentions"};
 }
 const result=await ctx.db.query("places").withIndex("by_owner_active",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined)).paginate({cursor:nativeCursor(args.cursor),numItems:50,maximumRowsRead:50,maximumBytesRead:250_000});
 const matching=result.page.filter(p=>!needle||`${p.name} ${p.fullName}`.toLowerCase().includes(needle));
 const page=await Promise.all(matching.map(async p=>{const {counts}=await placeTotals(ctx,owner,p._id);return {_id:p._id,name:p.name,fullName:p.fullName,type:p.type,stats:{events:counts.events,citations:counts.citations,media:counts.media}};}));
 const counter=await ownerTableCounter(ctx,owner,"places");
 return {page,continueCursor:`n:${result.continueCursor}`,isDone:result.isDone,total:counter.counts.active??0,mediaMode:"explicit"};
}});

type Legacy = NonNullable<Awaited<ReturnType<typeof readLegacyPlaceWorkspace>>>;
function legacyRows(workspace:Legacy):{[S in PlaceSection]:SectionRows[S][]} {
 return {events:workspace.events.map(eventRow),people:workspace.people.map(personRow),sources:workspace.sources.map((s,i)=>({id:`${s!._id}:${i}`,sourceId:String(s!._id),title:s!.title,type:s!.type})),context:workspace.contextEntries.map(contextRow),research:workspace.researchLog.map(logRow),media:workspace.media.map(mediaRow)};
}
function legacyHeader(w:Legacy):PlaceHeader {
 const years=w.events.flatMap(e=>typeof e.date?.year==="number"?[e.date.year]:[]);
 return {place:{_id:w.place._id,name:w.place.name,fullName:w.place.fullName,type:w.place.type},totals:{events:w.events.length,citations:w.citations.length,media:w.media.length,context:w.contextEntries.length,research:w.researchLog.length},firstYear:years.length?Math.min(...years):null,lastYear:years.length?Math.max(...years):null,indexed:false};
}
function initialLegacy(w:Legacy):PlaceWorkspace {
 const rows=legacyRows(w);const pages=Object.fromEntries(Object.entries(rows).map(([kind,page])=>[kind,{page:page.slice(0,50),continueCursor:"s:50",isDone:page.length<=50}]))as WorkspacePages;
 return {header:legacyHeader(w),pages};
}
/** One snapshot fallback, not one whole vault read per initial section. */
export const initial=internalQuery({args:{vaultOwnerId:v.string(),placeId:v.id("places")},handler:async(ctx,args):Promise<{mode:"legacy";workspace:PlaceWorkspace}|{mode:"indexed";header:PlaceHeader}|null>=>{
 const owner=normalizeVaultOwnerId(args.vaultOwnerId);
 const place=await ownedPlace(ctx,owner,args.placeId);if(!place)return null;
 if(!await countsReady(ctx)){const legacy=await readLegacyPlaceWorkspace(ctx,{...args,vaultOwnerId:owner});return legacy?{mode:"legacy",workspace:initialLegacy(legacy)}:null;}
 const {counts,firstYear,lastYear}=await placeTotals(ctx,owner,place._id);
 return {mode:"indexed",header:{place:{_id:place._id,name:place.name,fullName:place.fullName,type:place.type},totals:{events:counts.events,citations:counts.citations,media:counts.media,context:counts.context,research:counts.research},firstYear,lastYear,indexed:true}};
}});

type PeopleCursor={stage:"birth"|"death"|"events";cursor:string|null;events?:Id<"events">[];eventDone?:boolean;after?:string};
async function peoplePage(ctx:QueryCtx,owner:string,placeId:Id<"places">,cursor:string|null):Promise<SectionPage<"people">> {
 const state:PeopleCursor=cursor?.startsWith("p:")?JSON.parse(cursor.slice(2)):{stage:"birth",cursor:null};
 if(!["birth","death","events"].includes(state.stage)||state.events&&(state.events.length>50||!state.events.every(id=>ctx.db.normalizeId("events",id)))||state.after&&state.after.length>200)throw new Error("Invalid place people cursor");
 if(state.stage==="birth"||state.stage==="death"){
  const query=state.stage==="birth"?ctx.db.query("persons").withIndex("by_owner_birth_place",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("birth.place.placeId",placeId)):ctx.db.query("persons").withIndex("by_owner_death_place",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("death.place.placeId",placeId));
  const result=await query.paginate({cursor:state.cursor,numItems:50,maximumRowsRead:50,maximumBytesRead:250_000});
  const next:PeopleCursor=result.isDone?{stage:state.stage==="birth"?"death":"events",cursor:null}:{...state,cursor:result.continueCursor};
  return {page:result.page.map(personRow),isDone:false,continueCursor:`p:${JSON.stringify(next)}`};
 }
 if(!state.events?.length){
  if(state.eventDone)return {page:[],isDone:true,continueCursor:""};
  const result=await ctx.db.query("events").withIndex("by_owner_place",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("place.placeId",placeId)).paginate({cursor:state.cursor,numItems:50,maximumRowsRead:50,maximumBytesRead:250_000});
  return {page:[],isDone:result.isDone&&!result.page.length,continueCursor:`p:${JSON.stringify({stage:"events",cursor:result.continueCursor,events:result.page.map(e=>e._id),eventDone:result.isDone,after:""})}`};
 }
 const remaining=[...state.events];let after=state.after??"",used=0,processed=0,eventReads=0;
 const rows:PersonRow[]=[];
 while(remaining.length&&processed<50&&eventReads<25&&used<500_000){
  const eventId=remaining[0],event=await ctx.db.get(eventId);eventReads++;used+=event?new TextEncoder().encode(JSON.stringify(event)).byteLength:0;
  if(!visible(event,owner)||event.place?.placeId!==placeId){remaining.shift();after="";continue;}
  let finished=true;
  const links=ctx.db.query("personEvents").withIndex("by_owner_event_order",q=>q.eq("vaultOwnerId",owner).eq("eventId",eventId).gt("pageOrderKey",after));
  for await(const link of links){
   used+=new TextEncoder().encode(JSON.stringify(link)).byteLength;
   const person=await ctx.db.get(link.personId);used+=person?new TextEncoder().encode(JSON.stringify(person)).byteLength:0;
   after=link.pageOrderKey!;processed++;if(visible(person,owner))rows.push(personRow(person));
   if(processed>=50||used>=500_000){finished=false;break;}
  }
  if(finished){remaining.shift();after="";}
 }
 const next:PeopleCursor={stage:"events",cursor:state.cursor,events:remaining,eventDone:state.eventDone,after};
 return {page:[...new Map(rows.map(r=>[r.id,r])).values()],continueCursor:`p:${JSON.stringify(next)}`,isDone:!remaining.length&&!!state.eventDone};
}
export const section=internalQuery({args:{...placePageArgs,placeId:v.id("places"),section:sectionValidator},handler:async(ctx,args):Promise<SectionPage>=>{
 const owner=normalizeVaultOwnerId(args.vaultOwnerId);if(!await ownedPlace(ctx,owner,args.placeId))throw new Error("Place not found");
 const ready=await countsReady(ctx);
 if(args.cursor&&((args.cursor.startsWith("s:")&&ready)||(!args.cursor.startsWith("s:")&&!ready)))throw new Error("Place read mode changed. Reload this place to continue.");
 if(!ready){
  const w=await readLegacyPlaceWorkspace(ctx,{vaultOwnerId:owner,placeId:args.placeId});if(!w)throw new Error("Place not found");const rows=legacyRows(w)[args.section],offset=args.cursor?.startsWith("s:")?Number(args.cursor.slice(2)):0;return {page:rows.slice(offset,offset+50),continueCursor:`s:${offset+50}`,isDone:offset+50>=rows.length};
 }
 if(args.section==="people")return peoplePage(ctx,owner,args.placeId,args.cursor);
 if(args.section==="events") {const r=await ctx.db.query("events").withIndex("by_owner_place",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("place.placeId",args.placeId)).paginate({cursor:nativeCursor(args.cursor),numItems:50,maximumRowsRead:50,maximumBytesRead:250_000});return {page:r.page.map(eventRow),continueCursor:`n:${r.continueCursor}`,isDone:r.isDone};}
 if(args.section==="context"){const r=await ctx.db.query("historicalContext").withIndex("by_owner_place_order",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("placeId",args.placeId)).paginate({cursor:nativeCursor(args.cursor),numItems:50,maximumRowsRead:50,maximumBytesRead:250_000});return {page:r.page.map(contextRow),continueCursor:`n:${r.continueCursor}`,isDone:r.isDone};}
 if(args.section==="research"){const r=await ctx.db.query("researchLog").withIndex("by_owner_entity_order",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("entityType","place").eq("entityId",args.placeId)).paginate({cursor:nativeCursor(args.cursor),numItems:50,maximumRowsRead:50,maximumBytesRead:250_000});return {page:r.page.map(logRow),continueCursor:`n:${r.continueCursor}`,isDone:r.isDone};}
 const after=afterKey(args.cursor);let used=0,last=after,processed=0;
 if(args.section==="sources"){
  const r=await ctx.db.query("citationLinks").withIndex("by_owner_target_order",q=>q.eq("vaultOwnerId",owner).eq("targetType","place").eq("targetId",String(args.placeId)).gt("pageOrderKey",after)).paginate({cursor:null,numItems:50,maximumRowsRead:50,maximumBytesRead:100_000});
  const page:SourceRow[]=[];const sources=new Map<string,Doc<"sources">|null>();
  for(const link of r.page){const citation=await ctx.db.get(link.citationId);used+=citation?new TextEncoder().encode(JSON.stringify(citation)).byteLength:0;let source:Doc<"sources">|null=null;if(visible(citation,owner)){if(sources.has(String(citation.sourceId)))source=sources.get(String(citation.sourceId))??null;else{source=await ctx.db.get(citation.sourceId);sources.set(String(citation.sourceId),source);used+=source?new TextEncoder().encode(JSON.stringify(source)).byteLength:0;}}if(visible(source,owner))page.push({id:String(link._id),sourceId:String(source._id),title:source.title,type:source.type});last=link.pageOrderKey!;processed++;if(used>=500_000)break;}
  return {page,continueCursor:keyCursor(last),isDone:processed===r.page.length&&r.isDone};
 }
 const r=await ctx.db.query("placeMediaMembers").withIndex("by_place_order",q=>q.eq("vaultOwnerId",owner).eq("placeId",args.placeId).eq("active",true).gt("orderKey",after)).paginate({cursor:null,numItems:50,maximumRowsRead:50,maximumBytesRead:100_000});
 const page:MediaRow[]=[];
 for(const member of r.page){const media=await ctx.db.get(member.mediaId);used+=media?new TextEncoder().encode(JSON.stringify(media)).byteLength:0;if(visible(media,owner))page.push(mediaRow(media));last=member.orderKey;processed++;if(used>=500_000)break;}
 return {page,continueCursor:keyCursor(last),isDone:processed===r.page.length&&r.isDone};
}});
export const mentions=internalQuery({args:{vaultOwnerId:v.string(),placeId:v.id("places")},handler:async(ctx,args):Promise<PlaceMention[]>=>{
 const owner=normalizeVaultOwnerId(args.vaultOwnerId),place=await ownedPlace(ctx,owner,args.placeId);if(!place||!await countsReady(ctx)||!place.name.trim())return [];
 const [titles,descriptions]=await Promise.all([
  ctx.db.query("media").withSearchIndex("search_title",q=>q.search("title",place.name).eq("vaultOwnerId",owner).eq("archivedAt",undefined)).take(6),
  ctx.db.query("media").withSearchIndex("search_description",q=>q.search("description",place.name).eq("vaultOwnerId",owner).eq("archivedAt",undefined)).take(6),
 ]);
 return Promise.all([...new Map([...titles,...descriptions].map(m=>[String(m._id),m])).values()].map(async m=>({...mediaRow(m),linked:!!(await ctx.db.query("placeMediaMembers").withIndex("by_place_media",q=>q.eq("vaultOwnerId",owner).eq("placeId",args.placeId).eq("mediaId",m._id)).unique())?.active})));
}});
