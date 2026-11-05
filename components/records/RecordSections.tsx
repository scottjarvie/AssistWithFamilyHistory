"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { SectionGlyph } from "@/components/design/SectionGlyph";
import { recordFragment,initialRecordFragment,subscribeRecordFragment,navigateRecord,recordSectionFromFragment } from "@/lib/records/navigation";
import { VisitedRecordPanel } from "./VisitedRecordPanel";
import { FitSticky } from "./FitSticky";
import { UtcDate } from "@/components/design/UtcDate";

export type RecordSection = { id: string; label: string; count: number | null; detail?:string; updatedAt?: number; content: ReactNode };

/** Server-rendered section content crosses this boundary; never pass the raw record. */
export function RecordSections({ aside, overview, sections }: { aside: ReactNode; overview: ReactNode; sections: RecordSection[] }) {
  const id = useId();
  const fragment = useSyncExternalStore(subscribeRecordFragment,recordFragment,initialRecordFragment);
  const hash=recordSectionFromFragment(fragment);
  const active = ["overview",...sections.map(section=>section.id)].includes(hash) ? hash : "overview";
  const allMenu = useRef<HTMLDetailsElement>(null);
  const tabs = [{ id: "overview", label: "Overview", count: undefined }, ...sections];
  const bar=useRef<HTMLDivElement>(null);
  const choose = (key:string,replace=false) => {navigateRecord(`record-section-${key}`,replace);allMenu.current?.removeAttribute("open");};
  useEffect(()=>{
    if(!fragment)return;
    const frame=requestAnimationFrame(()=>{
      const target=document.getElementById(fragment.startsWith("record-stream")?"record-stream":fragment)||document.getElementById(`record-section-${active}`);
      if(!target)return;
      const top=target.getBoundingClientRect().top,offset=(bar.current?.getBoundingClientRect().height||60)+8;
      if(top<offset||top>innerHeight-80)window.scrollBy({top:top-offset,behavior:"auto"});
    });
    return()=>cancelAnimationFrame(frame);
  },[fragment,active]);
  return <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]">
    <aside className="min-w-0 self-stretch"><FitSticky>{aside}</FitSticky></aside>
    <div className="min-w-0">
      <div ref={bar} className="sticky top-0 z-20 mb-5 flex min-w-0 gap-2 border-b border-border bg-background/95 py-2 backdrop-blur">
        <div role="tablist" aria-label="Record sections" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">{tabs.map((tab, index) => <button key={tab.id} id={`${id}-tab-${tab.id}`} role="tab" aria-selected={active === tab.id} aria-controls={`record-section-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => choose(tab.id)} onKeyDown={event => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault(); choose(tabs[next].id,true); document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
        }} className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm ${active === tab.id ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-muted"}`}><SectionGlyph kind={tab.id}/>{tab.label}{tab.count !== undefined && <span className="font-mono text-xs">{tab.count===null?"Unavailable":tab.count}</span>}</button>)}</div>
        <details ref={allMenu} className="shrink-0" onKeyDown={event => { if (event.key === "Escape") { allMenu.current?.removeAttribute("open"); allMenu.current?.querySelector("summary")?.focus(); } }}><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold">All {tabs.length} ⌄</summary><div className="absolute right-0 top-full max-h-[70dvh] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg" aria-label="All record sections"><button onClick={() => { choose("overview"); document.getElementById(`${id}-tab-overview`)?.focus(); }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-muted">Overview<span className="text-xs text-muted-foreground">Dossier and evidence stream</span></button>{sections.map(section => <button key={section.id} onClick={() => { choose(section.id); document.getElementById(`${id}-tab-${section.id}`)?.focus(); }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-muted"><span>{section.label}<span className="block text-xs text-muted-foreground">{section.count===null?"Load unavailable":section.updatedAt ? <>Updated <UtcDate value={section.updatedAt}/></> : section.count ? "No update date recorded" : "None yet"}</span>{section.detail && <span className="block text-xs text-muted-foreground">{section.detail}</span>}</span><span className="font-mono">{section.count===null?"Unavailable":section.count}</span></button>)}</div></details>
      </div>
      <section id="record-section-overview" role="tabpanel" aria-labelledby={`${id}-tab-overview`} hidden={active !== "overview"} tabIndex={0}>
        <nav aria-label="Contents" className="mb-5 lg:hidden"><h2 className="mb-2 font-sans text-sm font-semibold">Contents</h2><div className="grid grid-cols-2 gap-x-4">{sections.map(section => <button key={section.id} onClick={() => { choose(section.id); document.getElementById(`${id}-tab-${section.id}`)?.focus(); }} className="flex min-h-11 min-w-0 items-center justify-between gap-2 border-b border-border text-left text-sm"><span className="whitespace-nowrap">{section.label}</span><span className={`shrink-0 font-mono text-xs ${section.count ? "text-foreground" : "text-muted-foreground"}`}>{section.count===null?"Unavailable":section.count || "none yet"}</span></button>)}</div></nav>
        {overview}
      </section>
      {sections.map(section => <VisitedRecordPanel active={active===section.id} key={section.id} id={`record-section-${section.id}`} role="tabpanel" aria-labelledby={`${id}-tab-${section.id}`} tabIndex={0}>{section.content}</VisitedRecordPanel>)}
    </div>
  </div>;
}
