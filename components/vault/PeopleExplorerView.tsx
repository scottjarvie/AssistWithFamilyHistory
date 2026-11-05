"use client";

import { SafeLink as Link } from "@/components/layout/SafeLink";
import { UtcDate } from "@/components/design/UtcDate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import type { PeopleCollectionRow } from "@/lib/vault/peopleCollection";

export type PeopleExplorerRow = PeopleCollectionRow;
const columns: CollectionColumn<PeopleExplorerRow>[] = [
  { key: "name", label: "Name", sortOnly: true, render: (p) => p.displayName, sortValue: (p) => p.displayName },
  { key: "lifespan", introducedVersion: 2, label: "Born–died", compactLabel: "", render: p => `${p.birth?.date?.year || "?"}–${p.death?.date?.year || "?"}`, sortValue: p => p.birth?.date?.year || 0 },
  { key: "state", introducedVersion: 2, label: "Research state", compactLabel: "research", render: p => p.researchStatus.replace(/_/g," "), sortValue: p => ["not_started","basic","in_progress","thorough","complete"].indexOf(p.researchStatus) },
  { key: "sources", numeric: true, label: "Sources", render: (p) => p.stats.sources, sortValue: (p) => p.stats.sources },
  { key: "imports", numeric: true, label: "Imports", render: (p) => p.stats.imports, sortValue: (p) => p.stats.imports },
  { key: "memories", numeric: true, label: "Memories", render: (p) => p.stats.memories, sortValue: (p) => p.stats.memories },
  { key: "documents", numeric: true, label: "Documents", render: (p) => p.stats.documents, sortValue: (p) => p.stats.documents },
  { key: "stories", numeric: true, label: "Story outputs", render: (p) => p.stats.stories, sortValue: (p) => p.stats.stories },
  { key: "lastImport", label: "Last import (UTC)", render: (p) => p.latestImport ? <UtcDate value={p.latestImport.importedAt}/> : "No imports yet", sortValue: (p) => p.latestImport?.importedAt || 0 },
];
const researchStates = [["not_started", "Not started"], ["basic", "Basic"], ["in_progress", "In progress"], ["thorough", "Thorough"], ["complete", "Complete"]];

/** Search across the vault; compare and arrange its bounded loaded result without dropping fields. */
export function PeopleExplorerView({ people, firstStartEligible, query, status, loadMoreHref, preferenceKey = "awf.collection.people.local" }: {
  people: PeopleExplorerRow[]; firstStartEligible: boolean; query?: string; status?: string; loadMoreHref: string | null; preferenceKey?: string;
}) {
  const action = firstStartEligible ? <Button asChild variant="outline" className="min-h-11"><Link href="/app/people/new">Start with two people</Link></Button> : <Button asChild variant="outline" className="min-h-11"><Link href="/app/imports">Import FamilySearch Capture</Link></Button>;
  const clearQuery = new URLSearchParams();
  // The route keeps search/filter in the URL. This link clears only those facets, not the presentation.
  if (status) clearQuery.set("status", status);
  return <div className="min-w-0 p-4 sm:p-8">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>
      <p className="mb-2 font-mono text-xs uppercase tracking-[.16em] text-annotation">The family vault</p>
      <h1 className="text-4xl font-semibold sm:text-5xl">People</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Each ancestor is a research workspace with sources, places, memories, documents, and AI context packs.</p>
    </div>{action}</header>
    <CollectionWorkspace
      rows={people} columns={columns} preferenceKey={preferenceKey} query={query} status={status} noun="people" identityLabel="Person" defaultGroup="" columnVersion={2} primaryColumn="sources" loadMoreHref={loadMoreHref}
      groups={[
        { key: "living", label: "Living / deceased", value: (p) => p.living ? "Living" : "Deceased" },
        { key: "state", label: "Research state", value: (p) => p.researchStatus.replace(/_/g, " ") },
      ]}
      rowKey={(p) => String(p._id)} rowTitle={(p) => p.displayName} rowHref={(p) => `/app/people/${p.routeId}`}
      renderIdentity={(p) => <><span className="block text-base font-semibold leading-snug [overflow-wrap:anywhere]">{p.displayName}</span></>}
      renderDetail={(p) => <div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant="secondary">{p.living ? "Living" : "Deceased"}</Badge>{p.creationProvenance?.evidenceStatus === "unsourced" && <span className="text-sm text-annotation">Starting statement · needs a source</span>}</div>}
      searchControls={<>
        <form key={`${query || ""}:${status || ""}`} role="search" aria-label="Find people" className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-[minmax(12rem,1fr)_auto_auto]">
          <Input name="q" defaultValue={query} aria-label="Search people" placeholder="Search by name, FamilySearch ID, or years" className="col-span-2 h-11 bg-card lg:col-span-1" />
          <select name="status" aria-label="Research state" defaultValue={status || ""} className="h-11 min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground"><option value="">All research states</option>{researchStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <Button type="submit" className="min-h-11">Filter</Button>
        </form>
        {(query || status) && <div className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Active filters">
          {query && <Link href={`/app/people${clearQuery.size ? `?${clearQuery}` : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3">Name / ID / years: {query} ×</Link>}
          {status && <Link href={`/app/people${query ? `?q=${encodeURIComponent(query)}` : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3">Research state: {researchStates.find(([value]) => value === status)?.[1] || status} ×</Link>}
          <Link href="/app/people" className="inline-flex min-h-11 items-center px-2 text-primary underline">Clear all</Link>
        </div>}
      </>}
      emptyState={<div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-muted-foreground">
        {firstStartEligible ? <><p>No people are here yet. Begin privately with two people and one known relationship.</p><Button asChild className="mt-4 min-h-11"><Link href="/app/people/new">Start your first connection</Link></Button></> : <p>No people match this filter. Widen the search or clear the research-state filter.</p>}
      </div>}
    />
  </div>;
}
