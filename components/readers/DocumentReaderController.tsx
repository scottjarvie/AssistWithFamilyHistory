"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {SafeLink} from "@/components/layout/SafeLink";
import {Button} from "@/components/ui/button";
import {FamilySymbol} from "@/components/ui/FamilySymbol";
import type {EvidencePack} from "@/features/source-docs/lib/schemas";
import {generateRawDocument} from "@/features/source-docs/lib/rawDocGenerator";
import {DocumentReader,type DocumentReaderProps} from "./DocumentReader";

type ReaderKind="raw"|"contextualized";
type Ready={phase:"ready";personName:string;document:Pick<DocumentReaderProps,"markdown"|"sources"|"provenance"|"rawHref">};
type State={phase:"loading"}|Ready|{phase:"unavailable";title:string;description:string;status?:string};
export function DocumentReaderController(props:{personId:string;runId:string|null;kind:ReaderKind;focusSource?:string}) {
 // Reset private content synchronously when identity or read-run changes, before a new effect starts.
 return <BoundedDocumentReader key={JSON.stringify([props.kind,props.personId,props.runId])} {...props}/>;
}
function BoundedDocumentReader({personId,runId,kind,focusSource}:{personId:string;runId:string|null;kind:ReaderKind;focusSource?:string}) {
 const router=useRouter(),[state,setState]=useState<State>({phase:"loading"}),[attempt,setAttempt]=useState(0);
 const path=`/api/people/${encodeURIComponent(personId)}`,personHref=`/app/people/${encodeURIComponent(personId)}`;
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  const fetchRead=(url:string)=>fetch(url,{signal:controller.signal,cache:"no-store"});
  const commit=(next:State)=>{if(active&&!controller.signal.aborted)setState(next);};
  commit({phase:"loading"});
  async function read() {
   try {
    if(kind==="contextualized") {
     const response=await fetchRead(`${path}/contextualized${runId?`?run=${encodeURIComponent(runId)}`:""}`);
     const payload=await response.json().catch(()=>null);
     if(!response.ok||!payload?.success) {commit({phase:"unavailable",title:"Dossier Not Available",description:payload?.error||(!response.ok?"Failed to load contextualized dossier":"Contextualized dossier not found"),status:response.ok?payload?.status:undefined});return;}
     const activeRunId=payload.runId||runId;
     commit({phase:"ready",personName:payload.personName||personId,document:{markdown:payload.markdown||"",provenance:{runId:activeRunId},rawHref:`${personHref}/raw${activeRunId?`?run=${encodeURIComponent(activeRunId)}`:""}`}});return;
    }
    const personResponse=await fetchRead(path),personData=await personResponse.json();
    if(!personData.success){if(active&&!controller.signal.aborted)router.push("/app/people");return;}
    const targetRunId=runId||personData.latestRunId;
    if(!targetRunId){commit({phase:"unavailable",title:"Raw document needs a stored capture run",description:personData.vaultOnly?"This person exists in the canonical vault, but the legacy raw-evidence document flow only works when a stored FamilySearch capture run is available.":"Import a FamilySearch capture package first so the legacy raw document flow has a stored run to work from."});return;}
    const packResponse=await fetchRead(`${path}/runs/${encodeURIComponent(targetRunId)}/pack`);
    if(!packResponse.ok) {
     const fallback=await fetchRead(`${path}/raw?run=${encodeURIComponent(targetRunId)}`),payload=await fallback.json().catch(()=>null);
     if(!fallback.ok||typeof payload?.markdown!=="string"){commit({phase:"unavailable",title:"Raw document unavailable",description:payload?.error||"Could not load the legacy source capture for this run."});return;}
     commit({phase:"ready",personName:payload.personName||personId,document:{markdown:payload.markdown,provenance:{runId:targetRunId}}});return;
    }
    const pack=(await packResponse.json()).pack as EvidencePack;
    commit({phase:"ready",personName:pack.person.name||personId,document:{markdown:generateRawDocument(pack),provenance:{runId:targetRunId,capturedAt:pack.capturedAt,extractorVersion:pack.extractorVersion,formatter:true},sources:pack.sources.map(source=>({id:source.id,title:source.title,attachedBy:source.attachedBy,attachedAt:source.attachedAt,webPageUrl:source.webPageUrl}))}});
   }catch(error) {
    if(controller.signal.aborted||!active)return;
    commit({phase:"unavailable",title:kind==="raw"?"Raw document unavailable":"Dossier Not Available",description:kind==="raw"?"Error generating raw document.":error instanceof Error?error.message:"Failed to load dossier"});
   }
  }
  void read();return()=>{active=false;controller.abort();};
 },[path,personId,personHref,runId,kind,attempt,router]);
 if(state.phase==="loading")return <p role="status" aria-live="polite" className="p-8 text-center text-muted-foreground">{kind==="raw"?"Generating raw document...":"Loading contextualized dossier..."}</p>;
 if(state.phase==="unavailable")return <div className="mx-auto max-w-5xl p-4 sm:p-8"><section className="rounded-lg border border-annotation/40 bg-card p-5 sm:p-6"><FamilySymbol name="alert" className="size-6 text-annotation"/><h1 className="mt-3 font-serif text-2xl font-semibold">{state.title}</h1><p role="status" className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{state.description}</p><div className="mt-5 flex flex-wrap gap-3">{kind==="raw"||state.status==="vault_only"?<><Button asChild className="min-h-11"><SafeLink href={`${path}/context-pack?format=markdown`}>Download Context Pack</SafeLink></Button><Button asChild variant="outline" className="min-h-11"><SafeLink href={`${personHref}/story-writer`}>Open Story Writer</SafeLink></Button></>:<Button asChild className="min-h-11"><SafeLink href={`${personHref}/ai${runId?`?run=${encodeURIComponent(runId)}`:""}`}>Generate in AI Analysis</SafeLink></Button>}<Button asChild variant="outline" className="min-h-11"><SafeLink href={personHref}>Back to Person Workspace</SafeLink></Button><Button variant="ghost" className="min-h-11" onClick={()=>setAttempt(attempt+1)}>Try again</Button></div></section></div>;
 return <div className="mx-auto max-w-[1200px] p-4 sm:p-6 lg:p-8"><SafeLink href={personHref} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-primary"><FamilySymbol name="back"/>Back to {state.personName}</SafeLink><DocumentReader {...state.document} title={kind==="raw"?"Raw Evidence Document":"Contextualized Dossier"} filename={`${(state.personName||personId).replace(/\s+/g,"-")}-${kind==="raw"?"raw-evidence":"contextualized"}.md`} prefix={kind==="raw"?"raw-document":"contextualized-document"} kind={kind} focusSource={focusSource}/></div>;
}
