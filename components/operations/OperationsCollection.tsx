"use client";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import { CollectionFilters } from "@/components/collections/CollectionFilters";
import { OperationRowActions } from "@/components/vault/OperationRowActions";
import { operationWorkflowLabels, type OperationCollectionRow as Row, type OperationFilters } from "@/lib/vault/operationsRows";

const label = (value:string) => value.replace(/_/g," ");
const workflow = (row:Row) => operationWorkflowLabels[row.workflow] || label(row.workflow);
const columns: CollectionColumn<Row>[] = [
  {key:"type",label:"Type",compactRender:r=>`${r.rowType==="person"?"Canonical person":"Provisional relative"} · ${label(r.badge)}`,render:r=><><span className={r.rowType==="provisional"?"text-warning":""}>{r.rowType==="person"?"Canonical person":"Provisional relative"}</span><span className="mt-1 block text-xs text-muted-foreground">{label(r.badge)}</span></>,sortValue:r=>r.rowType},
  {key:"places",label:"Places",render:r=>r.places.join(" · ")||"No known places",sortValue:r=>r.places.join(" ")},
  {key:"coverage",label:"Coverage",width:96,fact:"bare",compactRender:r=>`${r.coverage}% coverage${r.stale?` · ${r.stale} stale ${r.stale===1?"check":"checks"}`:""}`,render:r=><span className="font-mono">{r.coverage}%{r.stale>0&&<span className="block text-xs text-warning">{r.stale} stale {r.stale===1?"check":"checks"}</span>}</span>,sortValue:r=>r.coverage},
  {key:"evidence",label:"Evidence",render:r=><span className="text-xs leading-6">{r.sources} sources · {r.memories} memories · {r.documents} documents · {r.context} context · {r.stories} stories</span>,sortValue:r=>r.sources},
  {key:"workflow",label:"Story state",render:workflow,sortValue:workflow},
  {key:"missing",label:"Missing checks",compactRender:r=>r.missing.length?`${r.missing.length} missing ${r.missing.length===1?"check":"checks"}`:"No critical gaps",render:r=>r.missing.length?<span className="block space-y-1 text-warning">{r.missing.map(x=><span className="block" key={x}>{label(x)}</span>)}</span>:<span className="text-success">None critical</span>,sortValue:r=>r.missing.length},
  {key:"next",label:"Next action",width:240,compactRender:r=>r.nextActions[0]||"Queue is clear for this row.",render:r=>r.nextActions.length?<span className="block space-y-2">{r.nextActions.map(x=><span className="block" key={x}>{x}</span>)}</span>:"Queue is clear for this row."},
];
const checkOptions=["identity_review","biography","timeline","birth_record","death_record","census","church_records"].map(value=>({value,label:label(value)}));
export function OperationsCollection({rows,filters,preferenceKey,loadMoreHref,readonlyPreview=false,isGuest=false}:{rows:Row[];filters:OperationFilters;preferenceKey:string;loadMoreHref:string|null;readonlyPreview?:boolean;isGuest?:boolean}) {
 const href=(patch:Partial<OperationFilters>)=>{const q=new URLSearchParams(Object.entries({...filters,...patch}).filter(([,v])=>v));return `/app/operations${q.size?`?${q}`:""}`;};
 const {q,...values}=filters;
 return <CollectionWorkspace rows={rows} columns={columns} rowKey={r=>`${r.rowType}:${r.id}`} rowTitle={r=>r.name}
  rowHref={r=>r.personIdentifier?`/app/people/${encodeURIComponent(r.personIdentifier)}`:r.anchor?`/app/people/${encodeURIComponent(r.anchor)}`:null}
  renderIdentity={r=><><strong className="font-medium">{r.name}</strong><p className="mt-1 text-xs text-muted-foreground">{r.lifespan}{r.rowType==="provisional"?" · provisional; opens anchor":""}</p>{r.rowType==="provisional"&&r.anchor&&<p className="mt-1 break-all text-xs text-muted-foreground">Anchor: {r.anchor}</p>}</>}
  renderDetail={r=><details className="operation-details mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-primary">Checks and next actions · {r.missing.length} / {r.nextActions.length}</summary><div className="border-l-2 border-border pl-3 text-sm leading-6"><h3 className="my-2 font-sans text-xs font-semibold">Missing critical checks</h3>{r.missing.length?<ul className="space-y-1 text-warning">{r.missing.map(x=><li key={x}>{label(x)}</li>)}</ul>:<p>None critical</p>}<h3 className="my-2 font-sans text-xs font-semibold">Next actions</h3>{r.nextActions.length?<ul className="space-y-2">{r.nextActions.map(x=><li key={x}>{x}</li>)}</ul>:<p>Queue is clear for this row.</p>}</div></details>}
  renderActions={r=><details className="min-w-0"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-primary" aria-label={`Actions for ${r.name}`}>Actions ⌄</summary><div className="max-w-sm py-2"><OperationRowActions rowType={r.rowType} personIdentifier={r.personIdentifier} provisionalId={r.rowType==="provisional"?r.id:undefined} anchorPersonIdentifier={r.anchor||undefined} displayName={r.name} missingCritical={r.missing} nextActions={r.nextActions} sourceCount={r.sources} memoryCount={r.memories} documentCount={r.documents} contextReportCount={r.context} storyWorkflow={r.workflow} staleChecksCount={r.stale} readonlyPreview={readonlyPreview}/></div></details>}
  groups={[{key:"workflow",label:"Story workflow",value:workflow,order:(a,b)=>Object.values(operationWorkflowLabels).indexOf(a)-Object.values(operationWorkflowLabels).indexOf(b)},{key:"type",label:"Entry type",value:r=>r.rowType==="person"?"Canonical people":"Provisional relatives"},{key:"stale",label:"Freshness",value:r=>r.stale>0?"Stale checks":"No stale checks"}]}
  defaultGroup="workflow" preferenceKey={preferenceKey} filters={filters} query={q} loadMoreHref={loadMoreHref} noun="research rows" identityLabel="Entry" naturalOrderLabel="Server research order" naturalLabels={{forward:"Server order",reverse:"Reverse server order"}}
  builtInViews={[{label:"All research",href:"/app/operations",active:!Object.values(filters).some(Boolean)},{label:"Provisional relatives",href:href({type:"provisional"}),active:filters.type==="provisional"},{label:"Stale checks",href:href({staleOnly:"true"}),active:filters.staleOnly==="true"},{label:"Ready to review",href:href({storyWorkflow:"ready_to_review"}),active:filters.storyWorkflow==="ready_to_review"}]}
  searchControls={<CollectionFilters path="/app/operations" noun="research rows" query={q} queryLabel="Search operations" placeholder="Search names, places, relatives" values={values} facets={[
   {key:"type",label:"Entry type",options:[{value:"person",label:"Canonical people"},{value:"provisional",label:"Provisional relatives"}]},
   {key:"storyStatus",label:"Saved story",options:[{value:"has_story",label:"Has saved draft/page"},{value:"no_story",label:"No saved draft yet"}]},
   {key:"storyWorkflow",label:"Story readiness",options:Object.entries(operationWorkflowLabels).map(([value,label])=>({value,label}))},
   {key:"missingCheck",label:"Missing check",options:checkOptions},
   {key:"staleOnly",label:"Freshness",options:[{value:"true",label:"Stale checks only"}]},
   {key:"sortBy",label:"Server sort",options:[{value:"missingCritical",label:"Missing critical"},{value:"completion",label:"Completion"},{value:"lastTouched",label:"Last touched"},{value:"sourceCount",label:"Source count"},{value:"storyReadiness",label:"Draft/publish readiness"},{value:"newestImport",label:"Newest import"}]},
   {key:"sortDirection",label:"Server direction",options:[{value:"desc",label:"Descending"},{value:"asc",label:"Ascending"}]},
  ]}/>}
  emptyState={<div className="border border-dashed border-border p-8"><h2 className="text-xl">{Object.values(filters).some(Boolean)?"No rows match this filter":isGuest?"This guest vault does not have any people yet":"This vault does not have any people yet"}</h2><p className="mt-2 text-sm text-muted-foreground">{Object.values(filters).some(Boolean)?"Widen the search or clear filters to see the rest of this vault.":isGuest?"You are signed out. This browser has a separate guest vault. Sign in to view your account vault, or import a FamilySearch capture package here to start a guest session.":"Import a FamilySearch capture package to populate the queue with people, provisional relatives, research checks, and next actions."}</p></div>}
 />;
}
