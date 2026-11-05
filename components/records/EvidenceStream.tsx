"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { UtcDate } from "@/components/design/UtcDate";

export type EvidenceStreamEntry = { id: string; kind: string; kindLabel: string; date: number; dateLabel: string; author: string; content: ReactNode };

/** Minimal dated metadata and server-rendered content, never raw imported artifacts. */
export function EvidenceStream({ entries }: { entries: EvidenceStreamEntry[] }) {
  const [kind, setKind] = useState("");
  const [all, setAll] = useState(false);
  const kinds = [...new Set(entries.map(entry => entry.kind))];
  const matching = entries.filter(entry => !kind || entry.kind === kind).sort((a, b) => b.date - a.date || a.id.localeCompare(b.id));
  const visible = all ? matching : matching.slice(0, 6);
  return <section aria-labelledby="evidence-stream-title" className="min-w-0"><header className="mb-3"><h2 id="evidence-stream-title" className="text-2xl font-semibold">Evidence stream</h2><p className="mt-1 text-sm text-muted-foreground">Stored imports and research updates, newest first. Historical life events stay in Timeline.</p></header><div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Evidence kinds"><Button variant={!kind ? "secondary" : "outline"} className="min-h-11" aria-pressed={!kind} onClick={() => { setKind(""); setAll(false); }}>All {entries.length}</Button>{kinds.map(value => <Button key={value} variant={kind === value ? "secondary" : "outline"} className="min-h-11" aria-pressed={kind === value} onClick={() => { setKind(value); setAll(false); }}>{entries.find(entry => entry.kind === value)?.kindLabel} <span className="font-mono">{entries.filter(entry => entry.kind === value).length}</span></Button>)}</div>
    {visible.length ? <ol className="divide-y divide-border rounded-lg border border-border bg-card">{visible.map(entry => <li key={entry.id} className="p-4"><div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true"><path d="M3 2h7l3 3v9H3z M10 2v4h3 M5 8h6 M5 11h4"/></svg>{entry.kindLabel}</span><span>{entry.dateLabel} <UtcDate value={entry.date} withTime/></span><span className="ml-auto rounded-full border border-border px-2 py-1 text-foreground">{entry.author}</span></div>{entry.content}</li>)}</ol> : <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No stored imports or research updates yet. Sources, memories, documents and current research controls remain in their sections.</p>}
    {matching.length > visible.length && <Button variant="outline" className="mt-3 min-h-11" onClick={() => setAll(true)}>{matching.length - visible.length} earlier entries · Show all</Button>}
  </section>;
}
