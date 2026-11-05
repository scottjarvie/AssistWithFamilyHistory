"use client";

import { SafeLink as Link } from "@/components/layout/SafeLink";
import { UtcDate } from "@/components/design/UtcDate";
import { Button } from "@/components/ui/button";
import { CollectionFilters } from "@/components/collections/CollectionFilters";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import type { PeopleCollectionRow } from "@/lib/vault/peopleCollection";

export type PeopleExplorerRow = PeopleCollectionRow;
const columns: CollectionColumn<PeopleExplorerRow>[] = [
  { key: "name", label: "Name", sortOnly: true, render: (p) => p.displayName, sortValue: (p) => p.displayName },
  { key: "lifespan", introducedVersion: 2, label: "Born–died", compactLabel: "", render: p => `${p.birth?.date?.year || "?"}–${p.death?.date?.year || "?"}`, sortValue: p => p.birth?.date?.year || 0 },
  { key: "state", introducedVersion: 2, label: "Research state", compactLabel: "research", render: p => p.researchStatus.replace(/_/g," "), sortValue: p => ["not_started","basic","in_progress","thorough","complete"].indexOf(p.researchStatus) },
  { key: "sources", numeric: true, compactLabel: p => p.stats.sources === 1 ? "source" : "sources", label: "Sources", render: (p) => p.stats.sources, sortValue: (p) => p.stats.sources },
  { key: "imports", numeric: true, compactLabel: p => p.stats.imports === 1 ? "import" : "imports", label: "Imports", render: (p) => p.stats.imports, sortValue: (p) => p.stats.imports },
  { key: "memories", numeric: true, compactLabel: p => p.stats.memories === 1 ? "memory" : "memories", label: "Memories", render: (p) => p.stats.memories, sortValue: (p) => p.stats.memories },
  { key: "documents", numeric: true, compactLabel: p => p.stats.documents === 1 ? "doc" : "docs", label: "Documents", headerLabel: "Docs", render: (p) => p.stats.documents, sortValue: (p) => p.stats.documents },
  { key: "stories", numeric: true, compactLabel: p => p.stats.stories === 1 ? "story" : "stories", label: "Story outputs", headerLabel: "Stories", render: (p) => p.stats.stories, sortValue: (p) => p.stats.stories },
  { key: "lastImport", fact: p => p.latestImport ? "prefix" : "bare", compactLabel: "Imported", label: "Last import (UTC)", render: (p) => p.latestImport ? <UtcDate value={p.latestImport.importedAt}/> : "Never imported", sortValue: (p) => p.latestImport?.importedAt || 0 },
];
const researchStates = [["not_started", "Not started"], ["basic", "Basic"], ["in_progress", "In progress"], ["thorough", "Thorough"], ["complete", "Complete"]];

/** Search across the vault; compare and arrange its bounded loaded result without dropping fields. */
export function PeopleExplorerView({ people, firstStartEligible, query, status:requestedStatus, loadMoreHref, preferenceKey = "awf.collection.people.local" }: {
  people: PeopleExplorerRow[]; firstStartEligible: boolean; query?: string; status?: string; loadMoreHref: string | null; preferenceKey?: string;
}) {
  const status = researchStates.some(([value]) => value === requestedStatus) ? requestedStatus : "";
  const action = firstStartEligible ? <Button asChild className="min-h-11"><Link href="/app/people/new">Start with two people</Link></Button> : <Button asChild className="min-h-11"><Link href="/app/imports">Import FamilySearch Capture</Link></Button>;
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
      renderIdentity={(p) => <><span className="block text-base font-semibold leading-snug [overflow-wrap:anywhere]">{p.displayName}</span><span className="text-xs font-normal text-muted-foreground">{p.living ? "Living" : "Deceased"}</span></>}
      renderDetail={(p) => p.creationProvenance?.evidenceStatus === "unsourced" ? <p className="mt-1 text-sm text-annotation">Starting statement · needs a source</p> : null}
      searchControls={<CollectionFilters path="/app/people" noun="people" query={query || ""} queryLabel="Search people" placeholder="Name, FamilySearch ID, or years" values={{status:status || ""}} facets={[{key:"status",label:"Research state",options:researchStates.map(([value,label])=>({value,label}))}]}/>}
      emptyState={<div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-muted-foreground">
        {firstStartEligible ? <><p>No people are here yet. Begin privately with two people and one known relationship.</p><Button asChild className="mt-4 min-h-11"><Link href="/app/people/new">Start your first connection</Link></Button></> : <p>No people match this filter. Widen the search or clear the research-state filter.</p>}
      </div>}
    />
  </div>;
}
