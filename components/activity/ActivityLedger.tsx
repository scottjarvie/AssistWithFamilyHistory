"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { ActivityGlyph } from "@/components/design/SectionGlyph";
import { activityKindLabel as kindName,activityAuthorLabel,activityIsAi,activityOriginTitle } from "@/lib/activity/presentation";
import { Button } from "@/components/ui/button";
import { SafeLink } from "@/components/layout/SafeLink";
import { UtcDate } from "@/components/design/UtcDate";
import { activityDate, activityWindow, type ActivityDates, type ActivityPeriod } from "@/lib/activity/window";
import type { ResearchLogRow } from "@/lib/vault/collectionRows";

const isAi=(entry:ResearchLogRow)=>activityIsAi(entry.authorKind);
const authorName=(entry:ResearchLogRow)=>activityAuthorLabel(entry.authorKind);
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const axisFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Recorded updates, never historical family events or inferred AI authorship. */
export function ActivityLedger({ entries }: { entries: ResearchLogRow[] }) {
  const id = useId();
  const [kind, setKind] = useState("");
  const [author, setAuthor] = useState("all");
  const [period, setPeriod] = useState<ActivityPeriod>("all");
  const [dates, setDates] = useState<ActivityDates>({ start: "", end: "" });
  const dragStart = useRef<{date:number;x:number}|null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth,setChartWidth] = useState(600);
  useEffect(()=>{const observer=new ResizeObserver(items=>{const width=items[0]?.contentRect.width;if(width)setChartWidth(width);});if(chartRef.current)observer.observe(chartRef.current);return()=>observer.disconnect();},[]);
  const kinds = [...new Set(entries.map(entry => entry.kind))];
  const latest = entries.reduce((date, entry) => Math.max(date, entry.updatedAt), 0);
  const first = entries.reduce((date, entry) => Math.min(date, entry.updatedAt), latest);
  const window = activityWindow(period, dates, first, latest);
  const rows = entries.filter(entry => (!kind || entry.kind === kind) && (author === "all" || (author === "you" ? entry.authorKind === "user" : isAi(entry))) && (window.invalid || (entry.updatedAt >= window.start && entry.updatedAt <= window.end))).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const months = new Map<string, ResearchLogRow[]>();
  for (const entry of rows) {
    const month = monthFormat.format(entry.updatedAt);
    const list = months.get(month) || [];
    list.push(entry); months.set(month, list);
  }
  const choosePeriod = (value: ActivityPeriod) => { setPeriod(value); setDates({ start: "", end: "" }); };
  const clearDates = () => choosePeriod("all");
  const changeDate = (key: keyof ActivityDates, value: string) => {
    const next = { ...dates, [key]: value };
    setDates(next); setPeriod(next.start || next.end ? "custom" : "all");
  };
  const x = (date: number) => latest === first ? chartWidth/2 : 12 + (date - first) / (latest - first) * (chartWidth-24);
  const pointerDate = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return first + Math.max(0, Math.min(1, (event.clientX - box.left - 12) / Math.max(1,box.width-24))) * (latest - first);
  };
  const dragDates = (start: number, end: number) => { setDates({ start: activityDate(Math.min(start, end)), end: activityDate(Math.max(start, end)) }); setPeriod("custom"); };
  const chip = "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm";
  const countFor = (lane: string) => entries.filter(entry => entry.kind === lane).length;
  return <section className="mt-8 min-w-0 border-t border-border pt-6" aria-labelledby="research-log-title">
    <header className="mb-3"><h2 id="research-log-title" className="text-2xl font-semibold">Research Log</h2><p className="mt-1 text-sm text-muted-foreground">Completed ingestion and context-building activity across the vault.</p><p className="mt-2 font-mono text-xs text-muted-foreground">{entries.length} entries · {kinds.length} lanes · You {entries.filter(entry => entry.authorKind === "user").length} · AI {entries.filter(isAi).length}{entries.some(entry=>entry.authorKind==="system") && ` · System ${entries.filter(entry=>entry.authorKind==="system").length}`}{entries.some(entry=>!entry.authorKind) && ` · Not attributed ${entries.filter(entry=>!entry.authorKind).length}`}</p></header>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Activity author" className="inline-flex rounded-md border border-border bg-card p-1">{[["all", "All"], ["you", "You"], ["ai", "AI"]].map(([value, label]) => <button key={value} className={`${chip} ${author === value ? "bg-secondary font-semibold" : "text-muted-foreground"}`} aria-pressed={author === value} onClick={() => setAuthor(value)}>{label}</button>)}</div>
      <div role="group" aria-label="Activity period" className="inline-flex rounded-md border border-border bg-card p-1">{([["quarter", "3 mo"], ["year", "Year"], ["all", "All"]] as const).map(([value, label]) => <button key={value} className={`${chip} ${period === value ? "bg-secondary font-semibold" : "text-muted-foreground"}`} aria-pressed={period === value} onClick={() => choosePeriod(value)}>{label}</button>)}</div>

      <details className="relative"><summary className={`${chip} cursor-pointer list-none border border-border bg-card`}>Pick dates {period === "custom" ? "· Custom" : "⌄"}</summary><div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-border bg-card p-3"><label className="text-sm">From <input aria-label="Activity range start" aria-describedby={window.invalid ? `${id}-date-error` : undefined} type="date" value={dates.start} onChange={event => changeDate("start", event.target.value)} className="mt-1 block h-11 max-w-full rounded-md border border-border bg-background px-2"/></label><label className="text-sm">To <input aria-label="Activity range end" aria-describedby={window.invalid ? `${id}-date-error` : undefined} type="date" value={dates.end} onChange={event => changeDate("end", event.target.value)} className="mt-1 block h-11 max-w-full rounded-md border border-border bg-background px-2"/></label></div></details>
      {period === "custom" && <Button variant="outline" className="min-h-11" onClick={clearDates}>Clear date range</Button>}
    </div>
    {window.invalid && <p id={`${id}-date-error`} role="alert" className="mb-3 text-sm text-annotation">From must be on or before To. Date filtering is paused until you correct the range; author and kind filters still apply.</p>}
    <div role="group" aria-label="Activity lanes" className="mb-4 flex flex-wrap gap-2 md:hidden"><button className={`${chip} border border-border ${!kind ? "bg-secondary" : "bg-card"}`} aria-pressed={!kind} onClick={() => setKind("")}>All kinds {entries.length}</button>{kinds.map(lane => <button key={lane} className={`${chip} border border-border ${kind === lane ? "bg-secondary" : "bg-card"}`} aria-pressed={kind === lane} onClick={() => setKind(kind === lane ? "" : lane)}>{kindName(lane)} <span className="font-mono">{countFor(lane)}</span></button>)}</div>
    {entries.length > 0 && <div className="mb-3 hidden rounded-lg border border-border bg-card px-3 py-2 md:block">
      <button className="mb-1 inline-flex min-h-11 items-center rounded-md px-1 text-xs text-primary underline" onClick={()=>setKind("")} aria-pressed={!kind}>All kinds {entries.length}</button><div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3"><div className="pt-1">{kinds.map(lane => <button key={lane} aria-pressed={kind === lane} onClick={() => setKind(kind === lane ? "" : lane)} className={`flex h-11 w-full items-center justify-between gap-2 rounded px-1 text-left text-[13px] ${kind === lane ? "bg-secondary" : "text-muted-foreground"}`}><span>{kindName(lane)}</span><span className="font-mono">{countFor(lane)}</span></button>)}</div><div className="min-w-0"><svg ref={chartRef} onPointerDown={event => { if (event.button !== 0) return; const date = pointerDate(event); dragStart.current={date,x:event.clientX}; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (dragStart.current && Math.abs(event.clientX-dragStart.current.x)>=6) dragDates(dragStart.current.date, pointerDate(event)); }} onPointerUp={event => { dragStart.current=null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => {dragStart.current=null;}} style={{ touchAction: "pan-y", height: kinds.length * 44 + 8 }} viewBox={`0 0 ${chartWidth} ${kinds.length * 44 + 8}`} preserveAspectRatio="none" className="w-full cursor-crosshair" role="img" aria-label="Research activity lanes by entry kind; dots show dated stored activity"><title>Recorded updates; drag across dates to select a range. Date inputs provide the same control.</title>{period === "custom" && !window.invalid && <rect x={Math.max(0, x(window.chartStart))} y="0" width={Math.max(2, Math.min(chartWidth, x(window.chartEnd)) - Math.max(0, x(window.chartStart)))} height={kinds.length * 44 + 8} fill="var(--annotation)" opacity=".12"/>}{kinds.map((lane, index) => <g key={lane}><line x1="12" x2={chartWidth-12} y1={26 + index * 44} y2={26 + index * 44} stroke="currentColor" opacity=".15"/>{rows.filter(entry => entry.kind === lane).map(entry => <circle key={entry.id} cx={x(entry.updatedAt)} cy={26 + index * 44} r="4" fill={isAi(entry) ? "var(--annotation)" : entry.authorKind === "user" ? "var(--primary)" : "var(--card)"} stroke="var(--primary)"><title>{`${entry.summary} · ${authorName(entry)} · Updated ${new Date(entry.updatedAt).toISOString()}`}</title></circle>)}</g>)}</svg><div className="flex justify-between gap-2 px-2 font-mono text-[11px] text-muted-foreground"><span>{axisFormat.format(first)}</span>{first !== latest && <><span>{axisFormat.format((first + latest) / 2)}</span><span>{axisFormat.format(latest)}</span></>}</div></div></div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Filled teal: You · rust: AI · hollow: System or not attributed. Lane counts describe all loaded entries; marks and the list follow filters. Drag to pick dates (at least 6px); a click leaves the range unchanged.</p>
    </div>}
    <p className="mb-3 text-xs leading-5 text-muted-foreground">Dates are stored updates, in UTC. Periods end at the latest recorded update{entries.length ? ` (${axisFormat.format(latest)}, ${new Date(latest).getUTCFullYear()})` : ""}.</p>
    {period === "custom" && !window.invalid && <p className="mb-3 text-sm text-muted-foreground">Custom dates: {dates.start || "the beginning"} to {dates.end || "the latest update"} (UTC).</p>}
    {rows.length ? <div data-activity-ledger className="space-y-5">{[...months].map(([month, group]) => <div key={month}><h3 className="mb-2 font-sans text-sm font-semibold">{month} <span className="ml-1 font-mono text-xs text-muted-foreground">{group.length}</span></h3><ol className="divide-y divide-border rounded-lg border border-border bg-card">{group.map(entry => <li key={entry.id} data-activity-entry className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 p-3 md:grid-cols-[9rem_minmax(0,1fr)_auto]">
      <p className="col-span-2 text-xs leading-5 text-muted-foreground md:col-span-1">Updated <UtcDate value={entry.updatedAt} withTime/></p><div className="min-w-0"><p className="break-words text-sm font-medium leading-6">{entry.summary}</p><p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><ActivityGlyph kind={entry.kind}/>{kindName(entry.kind)}</span>{entry.person && <SafeLink href={entry.person.href} className="inline-flex min-h-11 items-center text-primary underline">{entry.person.name}</SafeLink>}</p>{entry.modelHint && <p className="mt-1 text-xs leading-5 text-muted-foreground">Self-reported model hint: {entry.modelHint}. This is not verified provenance.</p>}</div><span className={`mt-1 inline-flex h-fit items-center rounded-full border border-border px-2 py-1 text-xs ${isAi(entry) ? "text-annotation" : "text-foreground"}`} title={activityOriginTitle(entry.method)}>{authorName(entry)}</span>
    </li>)}</ol></div>)}</div> : <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">{entries.length ? "No activity matches these filters. Choose All and All kinds to restore the complete log." : "No research log activity yet. Imports, place work, and stories will create entries here."}</p>}
    <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">{rows.length} of {entries.length} log entries shown. A kind gets a lane when its first activity is recorded.</p>
  </section>;
}
