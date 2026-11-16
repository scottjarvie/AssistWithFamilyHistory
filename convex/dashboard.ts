import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { VaultSnapshot } from "./vault";
import { ownerCounts } from "./vaultCounts";
import { formatPersonName, sortByTimestampDesc } from "./vaultCore";
const personRow = (p: Doc<"persons">) => ({_id:p._id, routeId:p.fsId||String(p._id), displayName:formatPersonName(p), birth:p.birth?{date:{year:p.birth.date?.year}}:undefined, death:p.death?{date:{year:p.death.date?.year}}:undefined, researchStatus:p.researchStatus, researchPriority:p.researchPriority});
const importRow = (run: Doc<"importRuns">, person: Doc<"persons"> | null) => ({_id:run._id, personName:run.personName, pageTypes:run.pageTypes, importedAt:run.importedAt, mergeStatus:run.mergeStatus, personRouteId:person?.fsId||(run.personId?String(run.personId):run.personFsId)});
const taskRow = (task: Doc<"researchTasks">, person: Doc<"persons"> | null) => ({_id:task._id,title:task.title,status:task.status,updatedAt:task.updatedAt,person:person?{routeId:person.fsId||String(person._id),name:formatPersonName(person)}:null});
async function bounded<T>(range: AsyncIterable<T>, limit:number, bytes:number):Promise<T[]> {
  const rows:T[]=[];let used=0;
  for await(const row of range){rows.push(row);used+=new TextEncoder().encode(JSON.stringify(row)).byteLength;if(rows.length>=limit||used>=bytes)break;}
  return rows;
}
const priorityScope = "Up to five people by assigned research priority. This covers assigned priorities only, not every evidence gap.";
export type DashboardSummary = {firstStartEligible:boolean;counts:{people:number;places:number;stories:number;documents:number;imports:number;openTasks:number;provisionalRelatives:number};recentPeople:ReturnType<typeof personRow>[];recentImports:ReturnType<typeof importRow>[];operationsHighlights:ReturnType<typeof personRow>[];waitingTasks:ReturnType<typeof taskRow>[];priorityScope:string};
export function dashboardFromSnapshot(snapshot:VaultSnapshot,firstStartEligible:boolean):DashboardSummary {
  const people = new Map(snapshot.people.map(p=>[String(p._id),p]));
  const byId = (id:unknown)=>people.get(String(id))??null;
  return {firstStartEligible,counts:{people:snapshot.people.length,places:snapshot.places.length,stories:snapshot.stories.length,documents:snapshot.documents.length,imports:snapshot.importRuns.length,openTasks:snapshot.researchTasks.filter(t=>t.status!=="done").length,provisionalRelatives:snapshot.provisionalRelatives.filter(r=>r.mergeState==="provisional").length},
    recentPeople:sortByTimestampDesc(snapshot.people).slice(0,6).map(personRow),
    recentImports:sortByTimestampDesc(snapshot.importRuns).slice(0,6).map(run=>importRow(run,byId(run.personId))),
    operationsHighlights:snapshot.people.filter(p=>(p.researchPriority??0)>0).sort((a,b)=>(b.researchPriority??0)-(a.researchPriority??0)||b._creationTime-a._creationTime).slice(0,5).map(personRow),
    waitingTasks:sortByTimestampDesc(snapshot.researchTasks.filter(t=>t.status!=="done")).slice(0,5).map(t=>taskRow(t,byId(t.personId))),priorityScope};
}
export async function readDashboard(ctx:QueryCtx,owner:string):Promise<DashboardSummary> {
  const [counts,recent,priority,imports,...waiting] = await Promise.all([
    ownerCounts(ctx,owner),
    bounded(ctx.db.query("persons").withIndex("by_owner_active_browse",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined)),6,200_000),
    bounded(ctx.db.query("persons").withIndex("by_owner_active_priority",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).gt("researchPriority",0)).order("desc"),5,200_000),
    bounded(ctx.db.query("importRuns").withIndex("by_owner_active_browse",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined)),6,200_000),
    ...(["todo","in_progress","blocked"] as const).map(status=>bounded(ctx.db.query("researchTasks").withIndex("by_owner_active_status_order",q=>q.eq("vaultOwnerId",owner).eq("archivedAt",undefined).eq("status",status)),5,100_000)),
  ]);
  const open = waiting.flat().sort((a,b)=>b.updatedAt-a.updatedAt||a._creationTime-b._creationTime).slice(0,5);
  const getPerson = async (id:Doc<"persons">["_id"]|undefined) => {const p=id?await ctx.db.get(id):null;return p?.vaultOwnerId===owner&&p.archivedAt===undefined?p:null;};
  const [importPeople,taskPeople] = await Promise.all([Promise.all(imports.map(r=>getPerson(r.personId))),Promise.all(open.map(t=>getPerson(t.personId)))]);
  const snapshotTypes=["persons","relationships","events","personEvents","places","sources","citations","citationLinks","sourceFacts","media","contextItems","importRuns","researchTasks","researchLog","documents","stories","storyReviewEvents","historicalContext","researchChecks","provisionalRelatives"] as const;
  const firstStartEligible=snapshotTypes.every(t=>!(counts[t]?.active??0))&&!await ctx.db.query("queueItems").withIndex("by_owner",q=>q.eq("vaultOwnerId",owner)).first();
  return {firstStartEligible,counts:{people:counts.persons?.active??0,places:counts.places?.active??0,stories:counts.stories?.active??0,documents:counts.documents?.active??0,imports:counts.importRuns?.active??0,openTasks:(["todo","in_progress","blocked"] as const).reduce((n,s)=>n+(counts.researchTasks?.[`status:${s}`]??0),0),provisionalRelatives:counts.provisionalRelatives?.["mergeState:provisional"]??0},recentPeople:recent.map(personRow),recentImports:imports.map((r,i)=>importRow(r,importPeople[i])),operationsHighlights:priority.map(personRow),waitingTasks:open.map((t,i)=>taskRow(t,taskPeople[i])),priorityScope};
}
