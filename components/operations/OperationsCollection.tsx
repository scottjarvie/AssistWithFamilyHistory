"use client";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import { CollectionFilters } from "@/components/collections/CollectionFilters";
import { OperationRowActions } from "@/components/vault/OperationRowActions";
import { operationWorkflowLabels, type OperationCollectionRow as Row, type OperationFilters } from "@/lib/vault/operationsRows";

const label=(value:string)=>value.replace(/_/g," ");
const workflow=(row:Row)=>operationWorkflowLabels[row.workflow]||label(row.workflow);
const count=(n:number,one:string,many=one+"s")=>`${n} ${n===1?one:many}`;
function Evidence({row:r}:{row:Row}) {
 return <span className="block space-y-1 text-[11px] leading-5">{[count(r.sources,"source"),count(r.memories,"memory","memories"),count(r.documents,"document"),`${r.context} context`,count(r.stories,"story","stories")].map(fact=><span key={fact} className="block whitespace-nowrap">{fact}</span>)}</span>;
}
const columns:CollectionColumn<Row>[]=[
 {key:"next",label:"Next action",width:220,compactRender:()=>null,render:r=>r.nextActions.length?<ul className="space-y-2">{r.nextActions.map(x=><li key={x}>{x}</li>)}</ul>:"Queue is clear for this row."},
 {key:"type",label:"Type",width:112,compactRender:()=>null,render:r=><><span className={r.rowType==="provisional"?"text-warning":""}>{r.rowType==="person"?"Canonical person":"Provisional relative"}</span><span className="mt-1 block text-xs text-muted-foreground">{label(r.badge)}</span></>,sortValue:r=>r.rowType},
 {key:"places",label:"Places",width:120,compactRender:()=>null,render:r=>r.places.join(" · ")||"No known places",sortValue:r=>r.places.join(" ")},
 {key:"coverage",label:"Coverage",width:120,compactRender:()=>null,render:r=><span className="font-mono">{r.coverage}%{r.stale>0&&<span className="mt-1 block whitespace-nowrap font-sans text-xs text-warning">{count(r.stale,"stale check")}</span>}</span>,sortValue:r=>r.coverage},
 {key:"evidence",label:"Evidence",width:108,compactRender:()=>null,render:r=><Evidence row={r}/>,sortValue:r=>r.sources},
 {key:"workflow",label:"Story state",width:124,compactRender:()=>null,render:workflow,sortValue:workflow},
 {key:"missing",label:"Missing checks",width:128,compactRender:()=>null,render:r=>r.missing.length?<ul className="space-y-1 text-warning">{r.missing.map(x=><li key={x}>{label(x)}</li>)}</ul>:<span className="text-success">None critical</span>,sortValue:r=>r.missing.length},
];
const checkOptions=["identity_review","biography","timeline","birth_record","death_record","census","church_records"].map(value=>({value,label:label(value)}));
export function OperationsCollection({rows,filters,preferenceKey,loadMoreHref,readonlyPreview=false,isGuest=false}:{rows:Row[];filters:OperationFilters;preferenceKey:string;loadMoreHref:string|null;readonlyPreview?:boolean;isGuest?:boolean}) {
 const href=(patch:Partial<OperationFilters>)=>{const q=new URLSearchParams(Object.entries({...filters,...patch}).filter(([,v])=>v));return `/app/operations${q.size?`?${q}`:""}`;};
 const {q,...values}=filters;
 const hasActiveFilters=Boolean(q||filters.type||filters.storyStatus||filters.storyWorkflow||filters.staleOnly||filters.missingCheck);
 return <CollectionWorkspace rows={rows} columns={columns} rowKey={r=>`${r.rowType}:${r.id}`} rowTitle={r=>r.name}
  rowHref={r=>r.personIdentifier?`/app/people/${encodeURIComponent(r.personIdentifier)}`:r.anchor?`/app/people/${encodeURIComponent(r.anchor)}`:null}
  renderIdentity={r=><><strong className="font-medium">{r.name}</strong><p className="mt-1 text-xs text-muted-foreground">{r.lifespan}{r.rowType==="provisional"?" · provisional; opens anchor":""}</p>{r.rowType==="provisional"&&r.anchor&&<p className="mt-1 break-all text-xs text-muted-foreground">Anchor: {r.anchor}</p>}</>}
  renderDetail={(r,visible)=>{const has=(key:string)=>visible.includes(key);return <div className="operation-details mt-2">
   {(has("workflow")||has("missing"))&&<p className="text-sm font-medium">{has("workflow")&&workflow(r)}{has("missing")&&<span className="whitespace-nowrap text-warning">{has("workflow")?" · ":""}{count(r.missing.length,"missing check")}</span>}</p>}
   {has("next")&&<p className="mt-1 text-sm leading-6 text-muted-foreground">{r.nextActions[0]||"Queue is clear for this row."}</p>}
   {visible.some(key=>key!=="workflow")&&<details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-primary">{visible.length===columns.length?"Full research details":"Selected research details"}</summary><div className="space-y-3 border-l-2 border-border pl-3 text-sm leading-6">
    {has("type")&&<p>{r.rowType==="person"?"Canonical person":"Provisional relative"} · {label(r.badge)}</p>}{has("places")&&<p>{r.places.join(" · ")||"No known places"}</p>}{has("coverage")&&<p><span className="whitespace-nowrap">{r.coverage}% coverage</span>{r.stale>0&&<> · <span className="whitespace-nowrap">{count(r.stale,"stale check")}</span></>}</p>}{has("evidence")&&<Evidence row={r}/>}
    {has("missing")&&<><h3 className="font-sans text-xs font-semibold">Missing critical checks</h3>{r.missing.length?<ul className="space-y-1 text-warning">{r.missing.map(x=><li key={x}>{label(x)}</li>)}</ul>:<p>None critical</p>}</>}
    {has("next")&&<><h3 className="font-sans text-xs font-semibold">Next actions</h3>{r.nextActions.length?<ul className="space-y-2">{r.nextActions.map(x=><li key={x}>{x}</li>)}</ul>:<p>Queue is clear for this row.</p>}</>}
   </div></details>}
  </div>;}}

  renderActions={r=><details className="min-w-0"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-primary" aria-label={`Actions for ${r.name}`}>Actions ⌄</summary><div className="max-w-sm py-2"><OperationRowActions rowType={r.rowType} personIdentifier={r.personIdentifier} provisionalId={r.rowType==="provisional"?r.id:undefined} anchorPersonIdentifier={r.anchor||undefined} displayName={r.name} missingCritical={r.missing} nextActions={r.nextActions} sourceCount={r.sources} memoryCount={r.memories} documentCount={r.documents} contextReportCount={r.context} storyWorkflow={r.workflow} staleChecksCount={r.stale} readonlyPreview={readonlyPreview}/></div></details>}
  groups={[{key:"workflow",label:"Story workflow",value:workflow,order:(a,b)=>Object.values(operationWorkflowLabels).indexOf(a)-Object.values(operationWorkflowLabels).indexOf(b)},{key:"type",label:"Entry type",value:r=>r.rowType==="person"?"Canonical people":"Provisional relatives"},{key:"stale",label:"Freshness",value:r=>r.stale>0?"Stale checks":"No stale checks"}]}
  defaultGroup="workflow" preferenceKey={preferenceKey} filters={filters} query={q} loadMoreHref={loadMoreHref} noun="research rows" identityLabel="Entry" naturalOrderLabel="Server research order" naturalLabels={{forward:"Server order",reverse:"Reverse server order"}}
  builtInViews={[{label:"All research",href:"/app/operations",active:!hasActiveFilters},{label:"Provisional relatives",href:href({type:"provisional"}),active:filters.type==="provisional"},{label:"Stale checks",href:href({staleOnly:"true"}),active:filters.staleOnly==="true"},{label:"Ready to review",href:href({storyWorkflow:"ready_to_review"}),active:filters.storyWorkflow==="ready_to_review"}]}
  searchControls={<CollectionFilters path="/app/operations" noun="research rows" query={q} queryLabel="Search operations" placeholder="Search names, places, relatives" values={values} facets={[
   {key:"type",label:"Entry type",options:[{value:"person",label:"Canonical people"},{value:"provisional",label:"Provisional relatives"}]},
   {key:"storyStatus",label:"Saved story",options:[{value:"has_story",label:"Has saved draft/page"},{value:"no_story",label:"No saved draft yet"}]},
   {key:"storyWorkflow",label:"Story readiness",options:Object.entries(operationWorkflowLabels).map(([value,label])=>({value,label}))},
   {key:"missingCheck",label:"Missing check",options:checkOptions},
   {key:"staleOnly",label:"Freshness",options:[{value:"true",label:"Stale checks only"}]},
   {key:"sortBy",kind:"order",defaultLabel:"Default: missing critical",label:"Server sort",options:[{value:"missingCritical",label:"Missing critical"},{value:"completion",label:"Completion"},{value:"lastTouched",label:"Last touched"},{value:"sourceCount",label:"Source count"},{value:"storyReadiness",label:"Draft/publish readiness"},{value:"newestImport",label:"Newest import"}]},
   {key:"sortDirection",kind:"order",defaultLabel:"Default: descending",label:"Server direction",options:[{value:"desc",label:"Descending"},{value:"asc",label:"Ascending"}]},
  ]}/>}
  emptyState={<div className="border border-dashed border-border p-8"><h2 className="text-xl">{hasActiveFilters?"No rows match this filter":isGuest?"This guest vault does not have any people yet":"This vault does not have any people yet"}</h2><p className="mt-2 text-sm text-muted-foreground">{hasActiveFilters?"Widen the search or clear filters to see the rest of this vault.":isGuest?"You are signed out. This browser has a separate guest vault. Sign in to view your account vault, or import a FamilySearch capture package here to start a guest session.":"Import a FamilySearch capture package to populate the queue with people, provisional relatives, research checks, and next actions."}</p></div>}
 />;
}
