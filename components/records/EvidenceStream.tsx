"use client";
import {useState,useSyncExternalStore,type ReactNode} from "react";
import {Button} from "@/components/ui/button";
import {UtcDate} from "@/components/design/UtcDate";
import {ActivityGlyph} from "@/components/design/SectionGlyph";
import {activityAuthorLabel,activityKindLabel,activityOriginTitle} from "@/lib/activity/presentation";
import {recordFragment,initialRecordFragment,subscribeRecordFragment,navigateRecord} from "@/lib/records/navigation";

export type EvidenceStreamEntry={id:string;kind:string;date:number;dateLabel:string;authorKind?:string|null;method?:string|null;modelHint?:string|null;content:ReactNode};

/** Displayed metadata and server-rendered content only; no raw imported artifacts. */
export function EvidenceStream({entries}:{entries:EvidenceStreamEntry[]}) {
 const fragment=useSyncExternalStore(subscribeRecordFragment,recordFragment,initialRecordFragment);
 const [localGroup,setLocalGroup]=useState("all");
 const [kind,setKind]=useState("");
 const [all,setAll]=useState(false);
 const group=fragment==="record-stream-imports"?"imports":fragment.startsWith("record-stream-research")?"research":localGroup;
 const kinds=[...new Set(entries.filter(entry=>entry.kind!=="imports").map(entry=>entry.kind))];
 const selectedKind=fragment.startsWith("record-stream-research")?new URLSearchParams(fragment.split("?")[1]||"").get("kind")||"":kind;
 const activeKind=kinds.includes(selectedKind)?selectedKind:"";
 const matching=entries.filter(entry=>(group==="all"||(group==="imports"?entry.kind==="imports":entry.kind!=="imports"))&&(!activeKind||group!=="research"||entry.kind===activeKind)).sort((a,b)=>b.date-a.date||a.id.localeCompare(b.id));
 const visible=all||group!=="all"?matching:matching.slice(0,6);
 const choose=(value:string)=>{setLocalGroup(value);setKind("");setAll(false);navigateRecord(value==="all"?"record-stream":`record-stream-${value}`);};
 return <section id="record-stream" aria-labelledby="evidence-stream-title" className="min-w-0">
  <header className="mb-3"><h2 id="evidence-stream-title" className="text-2xl font-semibold">Evidence stream</h2><p className="mt-1 text-sm text-muted-foreground">Stored imports and research updates, newest first. Historical life events stay in Timeline.</p></header>
  <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Evidence groups">{[["all","All entries",entries.length],["imports","Imports",entries.filter(entry=>entry.kind==="imports").length],["research","Research log",entries.filter(entry=>entry.kind!=="imports").length]].map(([value,label,count])=><Button key={value} variant={group===value?"secondary":"outline"} className="min-h-11" aria-pressed={group===value} onClick={()=>choose(String(value))}>{label} <span className="font-mono">{count}</span></Button>)}</div>
  {group==="research"&&kinds.length>1&&<div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Research entry kinds"><Button variant={!activeKind?"secondary":"ghost"} className="min-h-11" onClick={()=>{setKind("");navigateRecord("record-stream-research");}}>All research kinds</Button>{kinds.map(value=><Button key={value} variant={activeKind===value?"secondary":"ghost"} className="min-h-11" onClick={()=>{setKind(value);navigateRecord(`record-stream-research?kind=${encodeURIComponent(value)}`);}}><ActivityGlyph kind={value}/>{activityKindLabel(value)}</Button>)}</div>}
  {visible.length?<ol className="divide-y divide-border rounded-lg border border-border bg-card">{visible.map(entry=><li key={entry.id} className="p-4"><div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><ActivityGlyph kind={entry.kind}/>{activityKindLabel(entry.kind)}</span><span>{entry.dateLabel} <UtcDate value={entry.date} withTime/></span><span className="ml-auto rounded-full border border-border px-2 py-1 text-foreground" title={entry.kind==="imports"?"Capture runs record no author":activityOriginTitle(entry.method)}>{entry.kind==="imports"?"Capture":activityAuthorLabel(entry.authorKind)}</span></div>{entry.content}{entry.modelHint&&<p className="mt-2 text-xs leading-5 text-muted-foreground">Self-reported model hint: {entry.modelHint}. This is not verified provenance.</p>}</li>)}</ol>:<p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No stored imports or research updates match this view. Sources, memories, documents and current research controls remain in their sections.</p>}
  {matching.length>visible.length&&<Button variant="outline" className="mt-3 min-h-11" onClick={()=>setAll(true)}>{matching.length-visible.length} earlier entries · Show all</Button>}
 </section>;
}
