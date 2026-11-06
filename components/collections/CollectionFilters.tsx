"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeLink } from "@/components/layout/SafeLink";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CollectionFacet = {
  key: string; label: string; picker?: boolean; count?: number;
  kind?: "filter" | "order"; defaultLabel?: string;
  options: { value: string; label: string; count?: number }[];
};

/** Stage any number of declared facets, then make one GET. Chip removal stays direct. */
export function CollectionFilters({ path, noun, query, queryLabel, placeholder, values = {}, facets = [], searchLabel = "Search" }: {
  path: string; noun: string; query: string; queryLabel: string; placeholder: string;
  values?: Record<string, string>; facets?: CollectionFacet[]; searchLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const [draftQuery, setDraftQuery] = useState(query);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const href = (patch: Record<string, string>) => {
    const search = new URLSearchParams(Object.entries({ q: query, ...values, ...patch }).filter(([, value]) => value));
    return path + (search.size ? `?${search}` : "");
  };
  const pickers = facets.filter(facet => facet.picker !== false);
  const activePickerCount = pickers.filter(facet => facet.kind !== "order" && values[facet.key]).length;
  const active = facets.filter(facet => values[facet.key]);
  const openPicker = () => {
    setDraft({ ...values });
    setDraftQuery(searchInput.current?.value ?? query);
    setOpen(true);
  };
  return <>
    <form key={JSON.stringify({ query, values })} role="search" aria-label={`Find ${noun}`} className="mb-3 flex gap-2" action={path} method="get">
      <Input ref={searchInput} name="q" defaultValue={query} aria-label={queryLabel} placeholder={placeholder} className="h-11 min-w-0 flex-1 bg-card" />
      {Object.entries(values).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
      <Button type="submit" className="min-h-11">{searchLabel}</Button>
      {pickers.length > 0 && <Button ref={filterButton} type="button" variant="outline" className="min-h-11" onClick={openPicker} aria-label={`Filter ${noun}`}>+ Filter{activePickerCount ? ` ${activePickerCount}` : ""}</Button>}
    </form>
    {(query || active.length > 0) && <div aria-label="Active filters and ordering" className="mb-3 flex flex-wrap gap-2 text-sm">
      {query && <SafeLink href={href({ q: "" })} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3" aria-label={`Remove search filter: ${query}`}>Search: {query} ×</SafeLink>}
      {active.map(facet => <SafeLink key={facet.key} href={href({ [facet.key]: "" })} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3" aria-label={`Remove ${facet.label} ${facet.kind === "order" ? "ordering" : "filter"}`}>{facet.label}: {facet.options.find(option => option.value === values[facet.key])?.label || values[facet.key]} ×</SafeLink>)}
      <SafeLink href={path} className="inline-flex min-h-11 items-center px-2 text-primary underline">Clear all</SafeLink>
    </div>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); filterButton.current?.focus(); }} className="fixed bottom-0 top-auto max-h-[85dvh] translate-y-0 overflow-y-auto sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <form action={path} method="get" className="min-w-0 space-y-5">
          <DialogHeader><DialogTitle>Filter {noun}</DialogTitle><DialogDescription>Choose one or more values, then Apply. Counts describe the current load.</DialogDescription></DialogHeader>
          <input type="hidden" name="q" value={draftQuery} disabled={!draftQuery} />
          {Object.keys({ ...values, ...draft }).map(key => <input key={key} type="hidden" name={key} value={draft[key] || ""} disabled={!draft[key]} />)}
          {pickers.map(facet => <fieldset key={facet.key} className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">{facet.label}</legend>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={!draft[facet.key] ? "secondary" : "outline"} aria-pressed={!draft[facet.key]} className="min-h-11" onClick={() => setDraft(current => ({ ...current, [facet.key]: "" }))}>
                {facet.defaultLabel || `Any ${facet.label.toLowerCase()}`}{facet.count !== undefined && <span className="ml-2 font-mono text-xs">{facet.count}</span>}
              </Button>
              {facet.options.map(option => <Button key={option.value} type="button" variant={draft[facet.key] === option.value ? "secondary" : "outline"} aria-pressed={draft[facet.key] === option.value} className="min-h-11" onClick={() => setDraft(current => ({ ...current, [facet.key]: option.value }))}>
                {option.label}{option.count !== undefined && <span className="font-mono text-xs">{option.count}</span>}
              </Button>)}
            </div>
          </fieldset>)}
          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background py-3">
            <Button type="submit" className="min-h-11 flex-1">Apply</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
