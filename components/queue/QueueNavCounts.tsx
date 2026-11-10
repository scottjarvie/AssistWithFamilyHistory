"use client";
import {useEffect,useState} from "react";
export function QueueNavCounts(){
 const [counts,setCounts]=useState<{suggestions:number;needsInput:number}|null>(null);
 useEffect(()=>{let alive=true;const load=()=>{if(location.pathname==="/design-council-preview")return;void fetch("/api/queue?counts=true",{cache:"no-store"}).then(r=>r.json()).then(p=>{if(alive)setCounts(p.success&&p.counts?.available?p.counts:null);}).catch(()=>{if(alive)setCounts(null);});};const received=(event:Event)=>{setCounts((event as CustomEvent<{suggestions:number;needsInput:number}>).detail);};load();window.addEventListener("queue-counts",received);window.addEventListener("queue-changed",load);window.addEventListener("focus",load);return()=>{alive=false;window.removeEventListener("queue-counts",received);window.removeEventListener("queue-changed",load);window.removeEventListener("focus",load);};},[]);
 if(!counts)return null;
 return <span className="ml-auto inline-flex gap-2">{counts.needsInput>0&&<span aria-label={`${counts.needsInput} need your input`} className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{counts.needsInput}</span>}<span aria-label={`${counts.suggestions} AI suggestions`} className="text-xs text-muted-foreground">{counts.suggestions}</span></span>;
}
