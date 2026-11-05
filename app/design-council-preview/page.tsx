/** Development-only component harness. Invented records, no backend or authenticated reads. */
import { notFound } from "next/navigation";
import { DashboardView, type DashboardSummary } from "@/components/vault/DashboardView";
import { PeopleExplorerView, type PeopleExplorerRow } from "@/components/vault/PeopleExplorerView";
import { PlaceCollectionView } from "@/components/vault/PlaceCollectionView";
import { StoriesCollectionView } from "@/components/vault/StoriesCollectionView";
import { WritingCandidatesView } from "@/components/vault/WritingCandidatesView";
import { ResearchOverviewView } from "@/components/vault/ResearchOverviewView";
import { BaselinePlaces,BaselineStories,BaselineWriting,BaselineResearch } from "@/components/design/BaselineCollections";
import { FixtureNavigation } from "@/components/design/FixtureNavigation";
import { AppSidebar, AppMobileNav } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import type { PlaceCollectionRow,StoryCollectionRow,WritingCandidateRow,ResearchTaskRow,ResearchLogRow } from "@/lib/vault/collectionRows";
export const dynamic="force-dynamic";
export const metadata={title:"Synthetic design preview",robots:{index:false,follow:false}};
const people=[
 ["Eleanor Finch",1842,1913,"in_progress",12,3], ["Samuel Finch",1838,1901,"thorough",24,0],
 ["Mabel Ashford",1870,1948,"basic",7,5], ["Arthur Bell",1865,1932,"not_started",2,8],
].map(([displayName,birth,death,researchStatus,sources,gaps],index)=>({
 _id:`synthetic-${index}`,routeId:`synthetic-${index}`,displayName,living:false,birth:{date:{year:birth}},death:{date:{year:death}},researchStatus,
 stats:{sources,imports:2,memories:3,documents:2,stories:1},operations:{requiredMissingCount:gaps,criticalMissing:["birth_record","identity_review","timeline","relationships","death_record","biography","memories","place_context"].slice(0,Number(gaps))},latestImport:{importedAt:1793808000000},
})) as unknown as PeopleExplorerRow[];
const summary={firstStartEligible:false,counts:{people:4,places:3,stories:4,imports:8,documents:8,openTasks:6,provisionalRelatives:0},recentPeople:people,recentImports:[{_id:"synthetic-import",personName:"Eleanor Finch",personRouteId:"synthetic-0",pageTypes:["sources"],importedAt:1793808000000,mergeStatus:"merged"}],operationsHighlights:people} as unknown as DashboardSummary;
const places:PlaceCollectionRow[]=[{id:"place-1",name:"Ashford, Kent, England",kind:"city",events:12,citations:8,media:3},{id:"place-2",name:"Whitby, Yorkshire, England",kind:"city",events:5,citations:4,media:1},{id:"place-3",name:"Utah, United States",kind:"state",events:7,citations:3,media:2}];
const stories:StoryCollectionRow[]=[
 {id:"story-1",title:"Eleanor’s journey across the water",content:"A letter is the beginning of this story. Eleanor left her home with two carefully wrapped books and an address written on a folded sheet. The sources agree on the port of departure, but the passenger list still needs review. This narrative keeps the uncertainty visible. It follows the evidence through several places, notes what has not been found, and separates remembered family stories from documented observations. The work continues with the original letter and the census entry, rather than treating this draft as the final record.",kind:"biography",status:"draft",workflow:"needs_genealogy_evidence",person:"Eleanor Finch",sources:12,places:3,context:2,ready:60,warnings:2,publicHref:null},
 {id:"story-2",title:"Samuel’s workshop",content:"An invented review draft about a workshop and the records that describe it. The census and a trade directory provide the first clues.",kind:"biography",status:"review",workflow:"ready_to_review",person:"Samuel Finch",sources:24,places:2,context:4,ready:90,warnings:0,publicHref:null},
 {id:"story-3",title:"Mabel’s album",content:"A synthetic published-story fixture, with photographs described as sources. No real family story or media is used in this preview.",kind:"biography",status:"published",workflow:"published",person:"Mabel Ashford",sources:7,places:1,context:2,ready:100,warnings:0,publicHref:"/stories/synthetic-mabel"},
];
const candidates:WritingCandidateRow[]=people.map((p,index)=>({id:String(p._id),routeId:p.routeId,name:p.displayName,lifespan:`${p.birth?.date.year}–${p.death?.date.year}`,workflow:index===1?"ready_to_draft":"needs_context_research",sources:p.stats.sources,context:2,ready:index===1?90:60}));
const tasks:ResearchTaskRow[]=[{id:"task-1",title:"Locate the original passenger list",description:"Compare the indexed entry with its preserved source image before treating the departure date as settled.",kind:"record_search",priority:"high",status:"todo",suggested:true,updatedAt:1793808000000,person:{name:"Eleanor Finch",href:"/app/people/synthetic-0"}},{id:"task-2",title:"Review the place context",description:"A synthetic global task. No specific person is linked yet.",kind:"context_research",priority:"medium",status:"in_progress",suggested:false,updatedAt:1793721600000,person:null}];
const log:ResearchLogRow[]=[{id:"log-1",summary:"Compared the directory entry with the census source.",kind:"context_research",updatedAt:1793808000000,person:{name:"Samuel Finch",href:"/app/people/synthetic-1"},authorKind:"chosen_ai",method:"mcp",modelHint:"Synthetic model hint"},{id:"log-2",summary:"Added a note about the photograph’s date.",kind:"tier2_notes",updatedAt:1793721600000,person:{name:"Mabel Ashford",href:"/app/people/synthetic-2"},authorKind:"user",method:"manual_first_start",modelHint:null},{id:"log-3",summary:"Preserved a reviewed source capture.",kind:"tier1_bulk_import",updatedAt:1793635200000,person:null,authorKind:"system",method:"import",modelHint:null}];
export default async function DesignPreview({searchParams}:{searchParams:Promise<{surface?:string;page?:string;theme?:string;fixtureOwner?:string;q?:string;status?:string;workflow?:string}>}) {
 if(process.env.NODE_ENV!=="development"||process.env.VERCEL||process.env.CI)notFound();
 const {surface:requested,page,theme,fixtureOwner,q="",status="",workflow=""}=await searchParams;
 const surface=requested||page||"home";
 const baseline=surface.startsWith("baseline-");
 const displaySurface=baseline?surface.slice(9):surface;
 const isPeople=["people","people-more","people-long"].includes(surface);
 const fixturePeople=surface==="people-long"?[{...people[0],displayName:"EleanorFinchAshfordBell".repeat(12)},...people.slice(1)]:people;
 const filteredPeople=fixturePeople.filter(p=>(!q||`${p.displayName} ${p.routeId} ${p.birth?.date.year} ${p.death?.date.year}`.toLowerCase().includes(q.toLowerCase()))&&(!status||p.researchStatus===status));
 const key=`awf.collection.${isPeople?"people":surface}.design-fixture${fixtureOwner==="other"?".other":""}`;
 const activePath=isPeople?"/app/people":({places:"/app/places",stories:"/app/stories",research:"/app/research",writing:"/app/story-writer"}[displaySurface]||"/app");
 return <div className={theme==="dark"?"dark":""}><div className="min-h-screen bg-background text-foreground"><FixtureNavigation surface={surface}>
  <AppSidebar accountMode="local" vaultOwnerId="synthetic-design-only" clerkEnabled={false} activePath={activePath}/><AppMobileNav accountMode="local" vaultOwnerId="synthetic-design-only" clerkEnabled={false} activePath={activePath}/>
  <main className="min-h-screen md:ml-64"><AppTopBar clerkEnabled={false}/><p className="border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">Design preview · invented records · no backend connected{baseline?" · original route JSX reconstructed with current shared runtime":""}</p>
   {surface==="baseline-places"?<BaselinePlaces input={places} params={{q}}/>:surface==="baseline-stories"?<BaselineStories input={stories} params={{status,workflow}}/>:surface==="baseline-writing"?<BaselineWriting input={candidates}/>:surface==="baseline-research"?<BaselineResearch tasks={tasks} log={log}/>:isPeople?<PeopleExplorerView preferenceKey={key} people={filteredPeople} firstStartEligible={false} query={q} status={status} loadMoreHref={surface==="people-more"?"/app/people?page=2":null}/>:surface==="places"?<PlaceCollectionView places={places.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()))} query={q} preferenceKey={key}/>:surface==="stories"?<StoriesCollectionView stories={stories} query={q} status={status} workflow={workflow} preferenceKey={key}/>:surface==="writing"?<WritingCandidatesView people={candidates} preferenceKey={key}/>:surface==="research"?<ResearchOverviewView tasks={tasks} log={log} query={q} status={status} preferenceKey={key}/>:<DashboardView summary={surface==="empty"?{...summary,firstStartEligible:true,recentPeople:[],recentImports:[]}:summary}/>}
  </main></FixtureNavigation></div></div>;
}
