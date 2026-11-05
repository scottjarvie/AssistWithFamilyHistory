import type { getVaultSnapshot } from "../../convex/vault";
import { filterByVaultOwner, normalizeVaultOwnerId } from "../../convex/vaultCore";
import { auditRecordPageSize, isAuditMetric, type AuditMetric, type AuditRecord, type AuditRecordPage } from "./contract";

type Snapshot=Awaited<ReturnType<typeof getVaultSnapshot>>;
export type AuditRecordSnapshot=Pick<Snapshot,"sources"|"citations"|"citationLinks"|"sourceFacts"|"personEvents"|"events"|"relationships"|"places"|"historicalContext"|"stories"|"researchTasks">;
export type AuditPersonInput={_id:unknown;vaultOwnerId?:string;routeId:string;displayName:string;storyWorkflow:string;stats:{sources:number;stories:number};contextCoverage:{count:number}};
type Destination={href:string;label:string};

/** Minimal private-owner record pages, never raw artifact/note/narrative objects.
 * Snapshot/people originate in the same canonical Audit read. The repeated owner
 * filter also prevents a future mixed-owner caller from creating cross-owner links.
 */
export function buildAuditRecordPage(snapshot:AuditRecordSnapshot,peopleInput:AuditPersonInput[],vaultOwnerId:string,metric:AuditMetric,offset=0):AuditRecordPage {
 if(!isAuditMetric(metric))throw new Error("Unknown Audit metric");
 if(!Number.isSafeInteger(offset)||offset<0)throw new Error("Audit offset must be a non-negative safe integer");
 const owner=normalizeVaultOwnerId(vaultOwnerId);
 const people=filterByVaultOwner(peopleInput,owner);
 const sources=filterByVaultOwner(snapshot.sources,owner),citations=filterByVaultOwner(snapshot.citations,owner);
 const links=filterByVaultOwner(snapshot.citationLinks,owner),facts=filterByVaultOwner(snapshot.sourceFacts,owner);
 const places=filterByVaultOwner(snapshot.places,owner),context=filterByVaultOwner(snapshot.historicalContext,owner);
 const stories=filterByVaultOwner(snapshot.stories,owner),tasks=filterByVaultOwner(snapshot.researchTasks,owner);
 const eventIds=new Set(filterByVaultOwner(snapshot.events,owner).map(event=>String(event._id)));
 const personEvents=filterByVaultOwner(snapshot.personEvents,owner),relationships=filterByVaultOwner(snapshot.relationships,owner);
 const personMap=new Map(people.map(p=>[String(p._id),p]));
 const placeMap=new Map(places.map(p=>[String(p._id),p]));
 const sourceMap=new Map(sources.map(s=>[String(s._id),s]));
 const personDestination=(id:string,section="sources"):Destination|null=>{const p=personMap.get(id);return p?{href:`/app/people/${encodeURIComponent(p.routeId)}#record-section-${section}`,label:`Open ${p.displayName} · ${section}`}:null;};
 const placeDestination=(id:string,section="sources"):Destination|null=>{const p=placeMap.get(id);return p?{href:`/app/places/${encodeURIComponent(id)}#record-section-${section}`,label:`Open ${p.fullName} · ${section}`}:null;};
 const targetDestination=(targetType:string,targetId:string):Destination|null=>{
  if(targetType==="person")return personDestination(targetId);
  if(targetType==="place")return placeDestination(targetId);
  if(targetType==="event"){
   if(!eventIds.has(targetId))return null;
   for(const link of personEvents.filter(row=>String(row.eventId)===targetId)){const destination=personDestination(String(link.personId));if(destination)return destination;}
  }
  if(targetType==="relationship"){
   const relationship=relationships.find(row=>String(row._id)===targetId);
   if(relationship)return personDestination(String(relationship.person1))||personDestination(String(relationship.person2));
  }
  return null;
 };
 const citationDestinations=new Map<string,Destination>();
 for(const link of links){const id=String(link.citationId),destination=targetDestination(link.targetType,link.targetId);if(destination&&!citationDestinations.has(id))citationDestinations.set(id,destination);}
 const sourceDestinations=new Map<string,Destination>();
 for(const citation of citations){const destination=citationDestinations.get(String(citation._id));if(destination&&!sourceDestinations.has(String(citation.sourceId)))sourceDestinations.set(String(citation.sourceId),destination);}
 for(const fact of facts){const destination=personDestination(String(fact.personId));if(!destination)continue;
  if(sourceMap.has(String(fact.sourceId))&&!sourceDestinations.has(String(fact.sourceId)))sourceDestinations.set(String(fact.sourceId),destination);
  if(!citationDestinations.has(String(fact.citationId)))citationDestinations.set(String(fact.citationId),destination);
 }
 const row=(id:string,title:string,kind:string,detail:string,destination:Destination|null=null):AuditRecord=>({id,title,kind,detail,href:destination?.href||null,destination:destination?.label||null});
 const personRows=(rows:AuditPersonInput[])=>rows.map(p=>row(String(p._id),p.displayName,"Person",`${p.storyWorkflow.replace(/_/g," ")} · ${p.stats.sources} sources · ${p.contextCoverage.count} context · ${p.stats.stories} stories`,{href:`/app/people/${encodeURIComponent(p.routeId)}`,label:`Open ${p.displayName}`}));
 let rows:AuditRecord[];
 switch(metric){
  case "people":rows=personRows(people);break;
  case "peopleWithoutSources":rows=personRows(people.filter(p=>p.stats.sources===0));break;
  case "peopleWithoutContext":rows=personRows(people.filter(p=>p.contextCoverage.count===0));break;
  case "peopleWithoutStories":rows=personRows(people.filter(p=>p.stats.stories===0));break;
  case "sources":rows=sources.map(s=>row(String(s._id),s.title,"Source",s.type.replace(/_/g," "),sourceDestinations.get(String(s._id))||null));break;
  case "citations":rows=citations.map(c=>row(String(c._id),sourceMap.get(String(c.sourceId))?.title||"Citation · source unavailable","Citation",`${c.isEvidence?"Recorded evidence":"Research conclusion"} · ${c.confidence.replace(/_/g," ")} confidence`,citationDestinations.get(String(c._id))||null));break;
  case "historicalContext":rows=context.map(c=>row(String(c._id),c.title,"Context report",`${c.timePeriod.startYear}–${c.timePeriod.endYear} · ${c.topic.replace(/_/g," ")}`,c.placeId?placeDestination(String(c.placeId),"context"):null));break;
  case "stories":case "publishedStories":rows=stories.filter(s=>metric==="stories"||s.status==="published").map(s=>row(String(s._id),s.title,"Story",s.status,{href:`/app/stories/${encodeURIComponent(String(s._id))}`,label:"Open private story record"}));break;
  case "placesWithoutContext":{const covered=new Set(context.filter(c=>c.placeId).map(c=>String(c.placeId)));rows=places.filter(p=>!covered.has(String(p._id))).map(p=>row(String(p._id),p.fullName,"Place","No linked context report",placeDestination(String(p._id),"context")));break;}
  case "openResearchTasks":rows=tasks.filter(t=>t.status!=="done").map(t=>row(String(t._id),t.title,"Research task",`${t.status.replace(/_/g," ")} · ${t.priority} priority`,t.personId?personDestination(String(t.personId),"research")||{href:"/app/research",label:"Open research collection"}:{href:"/app/research",label:"Open research collection"}));break;
  default:rows=personRows(people.filter(p=>p.storyWorkflow===metric.slice("workflow:".length)));
 }
 rows.sort((a,b)=>a.title.localeCompare(b.title,"en",{numeric:true})||a.id.localeCompare(b.id));
 const end=offset+auditRecordPageSize;
 return {metric,total:rows.length,rows:rows.slice(offset,end),nextOffset:end<rows.length?end:null};
}
