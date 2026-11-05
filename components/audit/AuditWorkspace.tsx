"use client";

import {useEffect, useRef, useState, Fragment} from "react";
import {SafeLink} from "@/components/layout/SafeLink";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "@/components/ui/sheet";
import {CollectionWorkspace} from "@/components/collections/CollectionWorkspace";
import {applyCollectionFilters} from "@/lib/collections/viewFilters";
import {useCollectionPreferences} from "@/components/collections/useCollectionPreferences";
import {auditMetricLabels, auditRecordPageSize, isAuditMetric, type AuditMetric, type AuditRecord, type AuditRecordPage} from "@/lib/audit/contract";
import type {AuditSummary} from "@/lib/audit/presentation";

export type AuditPreview = {records:Partial<Record<AuditMetric,AuditRecord[]>>;errorMetric?:AuditMetric};
const headlines:AuditMetric[]=["people","sources","citations","historicalContext","stories","publishedStories"];
const gaps:AuditMetric[]=["peopleWithoutSources","peopleWithoutContext","peopleWithoutStories","placesWithoutContext","openResearchTasks"];
const workflows:AuditMetric[]=["workflow:needs_genealogy_evidence","workflow:needs_context_research","workflow:ready_to_draft","workflow:ready_to_review","workflow:published"];
const viewHref=(metric:AuditMetric,q="")=>`/app/audit?${new URLSearchParams({view:metric,...(q?{q}:{})})}`;
const label=(metric:AuditMetric)=>metric==="workflow:published"?"Published":auditMetricLabels[metric];

/** Snapshot instruments. Each number reads the actual matching records, not priority samples. */
export function AuditWorkspace({summary,preferenceKey,initialView="",initialQuery="",preview}:{summary:AuditSummary;preferenceKey:string;initialView?:string;initialQuery?:string;preview?:AuditPreview}) {
  const [drawer,setDrawer]=useState<AuditMetric|null>(null);
  const [viewRevision,setViewRevision]=useState(0);
  const [settings,savePreferences]=useCollectionPreferences(preferenceKey);
  const origin=useRef<HTMLButtonElement|null>(null);
  const sheetRef=useRef<HTMLDivElement|null>(null);
  const largestTotal=Math.max(1,...headlines.map(metric=>summary.metrics[metric]));
  const fullView=isAuditMetric(initialView)?initialView:null;
  const open=(metric:AuditMetric,button:HTMLButtonElement)=>{origin.current=button;setDrawer(metric);};
  const metricButton=(metric:AuditMetric,large=false)=><button type="button" data-audit-metric={metric} onClick={e=>open(metric,e.currentTarget)} aria-label={`${auditMetricLabels[metric]}: ${summary.metrics[metric]}. Show matching records`} className={`group flex min-h-11 w-full items-center justify-between gap-3 text-left ${large?"min-h-28 flex-col items-start p-4 sm:p-5":"px-4 py-3"}`}><span className="text-sm text-muted-foreground group-hover:text-foreground">{label(metric)}</span><span className={`shrink-0 whitespace-nowrap font-mono tabular-nums text-foreground group-hover:text-primary ${large?"text-3xl":"text-lg"}`}>{summary.metrics[metric].toLocaleString()}<AuditArrow diagonal/></span></button>;
  return <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[.15em] text-primary"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5"><path d="M3 20V4m0 16h18M7 16V9m5 7V5m5 11v-5M5 7h4m1-4h4m1 6h4"/></svg>Research instruments</p><h1 className="font-serif text-3xl font-semibold">Vault audit</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Find the evidence and context gaps before writing the story.</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><SafeLink href="/app/places">Add context</SafeLink></Button><Button asChild><SafeLink href="/app/operations">Work Queue</SafeLink></Button></div>
    </header>
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-border py-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary"/>Current vault snapshot</span><span>Trend: not dated</span><span>Choose a number to inspect its records</span></div>
    {initialView&&!fullView&&<p role="status" className="mb-4 text-sm text-muted-foreground">That Audit view is unavailable. Showing the instruments instead.</p>}
    {settings.saved?.length ? <nav aria-label="Saved Audit views" className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Saved views</span>{settings.saved.filter(v=>isAuditMetric(v.filters?.metric||"")).map(v=><Button key={v.id} asChild variant="outline"><SafeLink href={viewHref(v.filters!.metric as AuditMetric,v.filters?.q||"")} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){savePreferences({...settings,activeViewId:v.id,view:v.view,compact:v.compact,columns:v.columns,columnVersion:v.columnVersion,group:v.group,sort:v.sort,descending:v.descending});if(fullView===v.filters?.metric&&initialQuery===(v.filters?.q||""))setViewRevision(value=>value+1);}}}>{v.name}</SafeLink></Button>)}</nav> : null}
    {fullView ? <section aria-label="Audit record view" className="border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><p className="text-xs text-muted-foreground">Audit · matching records</p><h2 className="mt-1 font-serif text-2xl">{auditMetricLabels[fullView]}</h2></div><Button asChild variant="outline"><SafeLink href="/app/audit">Back to instruments</SafeLink></Button></div><div className="p-4"><AuditRecords key={`${fullView}:${initialQuery}:${viewRevision}`} metric={fullView} pageCount={summary.metrics[fullView]} preferenceKey={preferenceKey} initialQuery={initialQuery} preview={preview}/></div></section> : <>
      <section aria-label="Vault totals" className="border border-border bg-card"><header className="flex flex-wrap justify-between gap-1 border-b border-border px-4 py-2 text-xs text-muted-foreground"><h2 className="font-medium text-foreground">Records by type</h2><p>Bar lengths compare current totals</p></header><div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-6">{headlines.map(metric=><div key={metric}><button type="button" data-audit-metric={metric} onClick={e=>open(metric,e.currentTarget)} aria-label={`${auditMetricLabels[metric]}: ${summary.metrics[metric]}. Show matching records`} className="group block min-h-24 w-full p-4 text-left"><span className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground group-hover:text-foreground">{label(metric)}</span><span className="shrink-0 whitespace-nowrap font-mono text-xl tabular-nums">{summary.metrics[metric].toLocaleString()}<AuditArrow diagonal/></span></span><span aria-hidden="true" className="mt-3 block h-1 bg-muted"><span className="block h-full bg-primary/60" style={{width:`${100*summary.metrics[metric]/largestTotal}%`}}/></span></button></div>)}</div></section>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
        <section aria-labelledby="audit-gaps" className="border border-border bg-card"><PanelHeader id="audit-gaps" title="Coverage gaps" description="Choose the next research pass."/><div className="divide-y divide-border">{gaps.map(metric=>{const peopleGap=metric.startsWith("peopleWithout");return <div key={metric} className="px-4 py-2"><div className="flex items-center gap-2"><div className="min-w-0 flex-1">{metricButton(metric)}</div>{peopleGap&&<button type="button" data-audit-denominator="people" onClick={e=>open("people",e.currentTarget)} aria-label={`${summary.metrics.people} people total. Show matching records`} className="min-h-11 shrink-0 whitespace-nowrap text-xs text-primary">/ <span className="font-mono">{summary.metrics.people}</span> people</button>}</div>{peopleGap&&<div aria-hidden="true" className="h-1 bg-muted"><div className="h-full bg-primary/60" style={{width:`${summary.metrics.people?100*summary.metrics[metric]/summary.metrics.people:0}%`}}/></div>}</div>;})}</div></section>
        <section aria-labelledby="audit-workflow" className="border border-border bg-card"><PanelHeader id="audit-workflow" title="Story workflow" description="People by their current evidence and writing stage."/><div className="divide-y divide-border">{workflows.map(metric=><div key={metric} className="px-4 py-2"><div className="flex items-center gap-3"><div className="min-w-0 flex-1">{metricButton(metric)}</div><SafeLink href={`/app/operations?storyWorkflow=${metric.slice(9)}`} className="inline-flex min-h-11 shrink-0 items-center text-xs text-primary underline underline-offset-4" aria-label={`Work stage: ${label(metric)}`}>Work stage</SafeLink></div><div aria-hidden="true" className="h-1 bg-muted"><div className="h-full bg-primary/60" style={{width:`${summary.metrics.people?Math.min(100,100*summary.metrics[metric]/summary.metrics.people):0}%`}}/></div></div>)}</div></section>
      </div>
      <section aria-labelledby="audit-priority" className="mt-4 border border-border bg-card"><PanelHeader id="audit-priority" title="Priority people" description="Up to eight candidates, ordered by story readiness. Address evidence and context gaps before drafting or review."/>{summary.priorityPeople.length ? <div className="divide-y divide-border">{summary.priorityPeople.map(person=><SafeLink key={person.id} href={`/app/people/${encodeURIComponent(person.routeId)}`} className="grid gap-2 px-4 py-4 hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_180px_100px] sm:items-center"><div className="min-w-0"><p className="break-words font-medium">{person.name}</p><p className="mt-1 text-xs text-muted-foreground">{label(`workflow:${person.workflow}` as AuditMetric)||person.workflow.replaceAll("_"," ")}</p></div><p className="text-sm text-muted-foreground"><span className="whitespace-nowrap">{person.sources} {person.sources===1?"source":"sources"}</span> · <span className="whitespace-nowrap">{person.context} context</span></p><p className="whitespace-nowrap font-mono text-sm">{person.completion}% ready <AuditArrow/></p></SafeLink>)}</div> : <p className="p-4 text-sm text-muted-foreground">No candidate people found in this vault yet.</p>}</section>
    </>}
    <Sheet open={drawer!==null} onOpenChange={value=>{if(!value)setDrawer(null);}}><SheetContent ref={sheetRef} className="w-full gap-0 overflow-hidden sm:w-[min(900px,90vw)] sm:max-w-none" onEscapeKeyDown={event=>{const open=sheetRef.current?.querySelector("details[open]");if(open){event.preventDefault();open.removeAttribute("open");open.querySelector("summary")?.focus();}}} onCloseAutoFocus={e=>{e.preventDefault();origin.current?.focus();}}><SheetHeader className="shrink-0 border-b border-border pr-16"><SheetTitle className="font-serif text-2xl">{drawer?auditMetricLabels[drawer]:"Matching records"}</SheetTitle><SheetDescription>Behind the number · owner&apos;s matching records</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto p-4">{drawer&&<AuditRecords key={drawer} metric={drawer} pageCount={summary.metrics[drawer]} preferenceKey={preferenceKey} preview={preview} onOpenView={()=>setDrawer(null)} drawer/>}</div></SheetContent></Sheet>
  </div>;
}

function AuditArrow({diagonal=false}:{diagonal?:boolean}) {return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="ml-2 inline size-3.5 text-primary"><path d={diagonal?"M4 12 12 4M4 4h8v8":"M2 8h11M8 3l5 5-5 5"}/></svg>;}

function auditFacts(detail:string) {
  return <span className="text-sm text-muted-foreground">{detail.split(" · ").map((fact,index)=><Fragment key={`${index}-${fact}`}>{index>0&&" · "}<span className={/^\d[\d,.]* (sources?|context reports?|stor(?:y|ies))$/.test(fact)?"inline-block whitespace-nowrap":""}>{fact}</span></Fragment>)}</span>;
}

function auditHeadline(page:AuditRecordPage) {
  const count=page.total;
  const people=count===1?"person":"people";
  const gaps:Partial<Record<AuditMetric,string>>={peopleWithoutSources:"source",peopleWithoutContext:"context report",peopleWithoutStories:"story"};
  const missing=gaps[page.metric];
  if(missing){const basis=page.denominator;return `${count}${basis?` of ${basis.total}`:""} ${basis?.total===1?"person":basis?"people":people} ${count===1?"has":"have"} no ${missing}`;}
  if(page.metric.startsWith("workflow:"))return `${count} ${people} in the ${label(page.metric).toLowerCase()} stage`;
  switch(page.metric){
    case "people":return `${count} ${people} in this vault`;
    case "sources":return `${count} ${count===1?"source":"sources"} in this vault`;
    case "citations":return `${count} ${count===1?"citation":"citations"} in this vault`;
    case "historicalContext":return `${count} context ${count===1?"report":"reports"} in this vault`;
    case "stories":return `${count} ${count===1?"story":"stories"} in this vault`;
    case "publishedStories":return `${count} published ${count===1?"story":"stories"}`;
    case "placesWithoutContext":return `${count} ${count===1?"place has":"places have"} no linked context report`;
    default:return `${count} research ${count===1?"task remains":"tasks remain"} open`;
  }
}

function PanelHeader({id,title,description}:{id:string;title:string;description:string}) {return <header className="border-b border-border bg-muted/30 px-4 py-3"><h2 id={id} className="font-serif text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></header>;}

function AuditRecords({metric,pageCount,preferenceKey,initialQuery="",preview,drawer=false,onOpenView}:{metric:AuditMetric;pageCount:number;preferenceKey:string;initialQuery?:string;preview?:AuditPreview;drawer?:boolean;onOpenView?:()=>void}) {
  const [page,setPage]=useState<AuditRecordPage|null>(null);
  const [q,setQ]=useState(initialQuery);
  const [pending,setPending]=useState(true);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const request=useRef<AbortController|null>(null);
  const generation=useRef(0);
  const attempted=useRef({offset:0,replace:true});
  const load=async(offset:number,replace=false)=>{
    attempted.current={offset,replace};
    request.current?.abort();const controller=new AbortController();request.current=controller;const serial=++generation.current;
    setPending(true);setError("");
    try {
      let result:AuditRecordPage;
      if(preview){if(preview.errorMetric===metric)throw new Error("Synthetic Audit read unavailable. No vault was contacted.");const rows=preview.records[metric]||[];result={metric,total:rows.length,rows:rows.slice(offset,offset+auditRecordPageSize),nextOffset:offset+auditRecordPageSize<rows.length?offset+auditRecordPageSize:null,...(preview.records.people?{denominator:{metric:"people" as const,total:preview.records.people.length}}:{})};}
      else {const response=await fetch(`/api/audit/records?${new URLSearchParams({metric,offset:String(offset)})}`,{cache:"no-store",signal:controller.signal});const body=await response.json();if(!response.ok||!body.success||!body.page)throw new Error(body.details||body.error||"Could not read matching records.");result=body.page;}
      if(serial!==generation.current||controller.signal.aborted)return;
      setPage(previous=>({...result,rows:replace?result.rows:[...new Map([...(previous?.rows||[]),...result.rows].map(row=>[row.id,row])).values()]}));
    } catch(failure){if(!controller.signal.aborted&&serial===generation.current)setError(failure instanceof Error?failure.message:"Could not read matching records.");}
    finally {if(!controller.signal.aborted&&serial===generation.current)setPending(false);}
  };
  useEffect(()=>{void load(0,true);return()=>{generation.current++;request.current?.abort();};
    // Each metric/fixture is keyed by the parent; refresh explicitly reloads page one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[revision]);
  const uniformKind=Boolean(page?.rows.length&&page.rows.every(row=>row.kind===page.rows[0].kind));
  const filtered=(page?.rows||[]).filter(row=>`${row.title} ${row.kind} ${row.detail}`.toLowerCase().includes(q.trim().toLowerCase()));
  if(drawer&&page?.total===0&&!pending&&!error)return <div><p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">No records match this metric. Nothing has been hidden or removed.</p><Button asChild variant="outline" className="mt-4"><SafeLink href={viewHref(metric,q)} onClick={onOpenView}>Open as a view</SafeLink></Button></div>;
  return <div className="min-w-0">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="text-sm" aria-live="polite">{page?<><p className="font-medium">{auditHeadline(page)}</p><p className="mt-1 text-xs text-muted-foreground">{page.total.toLocaleString()} matching records · {page.rows.length} loaded</p></>:pending?"Reading matching records…":null}</div><div className="flex flex-wrap gap-2">{drawer&&<Button asChild variant="outline"><SafeLink href={viewHref(metric,q)} onClick={onOpenView}>Open as a view</SafeLink></Button>}<Button variant="ghost" aria-label="Refresh matches" disabled={pending} onClick={()=>setRevision(value=>value+1)}>Refresh</Button></div></div>
    {page&&page.total!==pageCount&&<p role="status" className="mb-3 border-l-2 border-annotation pl-3 text-sm text-muted-foreground">This read has {page.total} matches; the instrument snapshot showed {pageCount}. The vault has changed since that snapshot.</p>}
    {error&&<div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-card p-4"><p className="font-medium">Matching records unavailable</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-3" onClick={()=>void load(attempted.current.offset,attempted.current.replace)}>Try again</Button></div>}
    {page&&!(drawer&&page.total===0)&&<CollectionWorkspace rows={filtered} columns={[...(!drawer||!uniformKind?[{key:"kind",label:"Kind",width:100,render:(r:AuditRecord)=>r.kind,sortValue:(r:AuditRecord)=>r.kind}]:[]),{key:"detail",label:"Details",width:240,render:r=>auditFacts(r.detail),sortValue:r=>r.detail}]} rowKey={r=>r.id} rowTitle={r=>r.title} rowHref={r=>r.href} renderIdentity={r=><div><span className="break-words font-medium">{r.title}</span>{!r.href&&<p className="mt-1 text-xs text-muted-foreground">No linked record destination</p>}</div>} renderDetail={r=>r.destination&&r.kind!=="Person"?<p className="mt-1 text-xs text-muted-foreground">{r.destination}</p>:null} preferenceKey={preferenceKey} compactPanel={drawer} viewScope={{key:"metric",value:metric}} filters={{metric,q}} onApplyFilters={filters=>{if(filters.metric!==metric&&isAuditMetric(filters.metric))window.location.assign(applyCollectionFilters(window.location.href,{view:metric,q},{view:filters.metric,q:filters.q||""}));else setQ(filters.q||"");}} query={q} newViewLabel="Save view" naturalOrderLabel="Title" naturalLabels={{forward:"A–Z",reverse:"Z–A"}} identityLabel="Matching record" noun="matches" defaultView={drawer?"list":"auto"} loadMoreHref={null} searchControls={<label className="mb-3 block text-xs text-muted-foreground">Search loaded matches<Input aria-label="Search loaded matches" value={q} onChange={e=>setQ(e.target.value)} className="mt-1 min-h-11" placeholder="Title, kind or detail"/></label>} emptyState={<p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">{page.total===0?"No records match this metric. Nothing has been hidden or removed.":`No loaded matches contain “${q}”. Clear the search${page.nextOffset!==null?" or load more records":""}.`}</p>}/>}
    {drawer&&page?.total===0&&<p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">No records match this metric. Nothing has been hidden or removed.</p>}
    {page?.nextOffset!==null&&page&&<Button variant="outline" className="mt-4" disabled={pending} onClick={()=>void load(page.nextOffset!)}>{pending?"Loading matches…":"Load more matches"}</Button>}
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">These are current reads, not a frozen historical series. Search and presentation cover loaded matches. Linked destinations open private vault records; unlinked records remain listed here.</p>
  </div>;
}
