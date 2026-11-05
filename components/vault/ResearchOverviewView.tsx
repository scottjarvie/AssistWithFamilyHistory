"use client";
import { ActivityLedger } from "@/components/activity/ActivityLedger";
import { CollectionPage } from "@/components/collections/CollectionPage";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import { UtcDate } from "@/components/design/UtcDate";
import { SafeLink } from "@/components/layout/SafeLink";
import { countCollectionFacets } from "@/lib/collections/facets";
import { CollectionFilters } from "@/components/collections/CollectionFilters";
import type { ResearchTaskRow, ResearchLogRow } from "@/lib/vault/collectionRows";
const columns:CollectionColumn<ResearchTaskRow>[]=[
 {key:"title",label:"Task",sortOnly:true,render:r=>r.title,sortValue:r=>r.title},
 {key:"person",label:"Person",render:r=>r.person?<SafeLink href={r.person.href} className="inline-flex min-h-11 items-center text-primary underline">{r.person.name} →</SafeLink>:"Global task",sortValue:r=>r.person?.name||""},
 {key:"priority",label:"Priority",render:r=>r.priority,sortValue:r=>["high","medium","low"].indexOf(r.priority)},
 {key:"status",label:"Status",render:r=>r.status.replace(/_/g," "),sortValue:r=>r.status},
 {key:"kind",label:"Kind",render:r=>r.kind.replace(/_/g," "),sortValue:r=>r.kind},
 {key:"updated",fact:"prefix",compactLabel:"Updated",label:"Updated (UTC)",render:r=><UtcDate value={r.updatedAt}/>,sortValue:r=>r.updatedAt},
];
export function ResearchOverviewView({tasks,log,query="",status:requestedStatus="",preferenceKey}:{tasks:ResearchTaskRow[];log:ResearchLogRow[];query?:string;status?:string;preferenceKey:string}) {
 const status=["todo","in_progress","blocked","done"].includes(requestedStatus)?requestedStatus:"";
 const matchesQuery=(r:ResearchTaskRow)=>!query||`${r.title} ${r.description} ${r.person?.name||""}`.toLowerCase().includes(query.toLowerCase());
 const facets=countCollectionFacets(tasks,[{key:"status",label:"Task status",read:r=>r.status,options:["todo","in_progress","blocked","done"].map(value=>({value,label:value.replace(/_/g," ")}))}],{status},matchesQuery);
 const visible=tasks.filter(r=>(!status||r.status===status)&&matchesQuery(r));
 return <CollectionPage title="Research" eyebrow="Research ledger" description="Follow AI-suggested next steps and see how imports, context gathering, and narrative work accumulate around the same graph.">
  <h2 className="mb-1 text-2xl font-semibold">Tasks and follow-up</h2><p className="mb-4 text-sm text-muted-foreground">Actionable follow-up work attached to people in the vault. All recorded task states stay available.</p>
  <CollectionWorkspace rows={visible} columns={columns} preferenceKey={preferenceKey} filters={{q:query,status}} noun="tasks" identityLabel="Task" loadMoreHref={null} groups={[{key:"priority",label:"Priority",value:r=>r.priority,order:(a,b)=>["high","medium","low"].indexOf(a)-["high","medium","low"].indexOf(b)},{key:"status",label:"Status",value:r=>r.status.replace(/_/g," ")}]} rowKey={r=>r.id} rowTitle={r=>r.title} rowHref={()=>null} renderIdentity={r=><span className="block font-semibold">{r.title}</span>} renderDetail={r=><><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>{r.suggested&&<p className="mt-1 text-xs text-annotation">AI-suggested task</p>}</>}
    searchControls={<CollectionFilters path="/app/research" noun="tasks" query={query} queryLabel="Search tasks" placeholder="Search tasks or people" values={{status}} facets={facets}/>}
    emptyState={<p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">{tasks.length?"No tasks match this filter.":"No open research tasks yet. Imports and AI tools will start creating follow-up work here."}</p>}/>
  <ActivityLedger entries={log}/>
 </CollectionPage>;
}
