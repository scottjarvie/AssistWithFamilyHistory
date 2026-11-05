"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeLink } from "@/components/layout/SafeLink";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CollectionFacet = { key: string; label: string; options: { value: string; label: string; count?: number }[] };

/** Declared URL facets only. Original search stays direct; every facet is one sheet deep, without nested menus. */
export function CollectionFilters({ path, noun, query, queryLabel, placeholder, values = {}, facets = [], searchLabel = "Search" }: {
  path: string; noun: string; query: string; queryLabel: string; placeholder: string; values?: Record<string, string>; facets?: CollectionFacet[]; searchLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const href = (patch: Record<string, string>) => {
    const search = new URLSearchParams(Object.entries({ q: query, ...values, ...patch }).filter(([, value]) => value));
    return path + (search.size ? `?${search}` : "");
  };
  const active = facets.filter(facet => values[facet.key]);
  return <>
    <form key={JSON.stringify({ query, values })} role="search" aria-label={`Find ${noun}`} className="mb-3 flex gap-2">
      <Input name="q" defaultValue={query} aria-label={queryLabel} placeholder={placeholder} className="h-11 min-w-0 flex-1 bg-card"/>
      {Object.entries(values).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value}/> : null)}
      <Button type="submit" className="min-h-11">{searchLabel}</Button>
      {facets.length > 0 && <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)} aria-label={`Filter ${noun}`}>+ Filter{active.length ? ` ${active.length}` : ""}</Button>}
    </form>
    {(query || active.length > 0) && <div aria-label="Active filters" className="mb-3 flex flex-wrap gap-2 text-sm">
      {query && <SafeLink href={href({ q: "" })} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3" aria-label={`Remove search filter: ${query}`}>Search: {query} ×</SafeLink>}
      {active.map(facet => <SafeLink key={facet.key} href={href({ [facet.key]: "" })} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3" aria-label={`Remove ${facet.label} filter`}>{facet.label}: {facet.options.find(option => option.value === values[facet.key])?.label || values[facet.key]} ×</SafeLink>)}
      <SafeLink href={path} className="inline-flex min-h-11 items-center px-2 text-primary underline">Clear all</SafeLink>
    </div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="fixed bottom-0 top-auto max-h-[85dvh] translate-y-0 overflow-y-auto sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"><DialogHeader><DialogTitle>Filter {noun}</DialogTitle><DialogDescription>Choose a value to apply it. Other filters stay in place. Counts, when available, describe the loaded collection.</DialogDescription></DialogHeader>
      {facets.map(facet => <fieldset key={facet.key} className="min-w-0"><legend className="mb-2 text-sm font-semibold">{facet.label}</legend><div className="flex flex-wrap gap-2"><SafeLink href={href({ [facet.key]: "" })} aria-current={!values[facet.key] ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm ${!values[facet.key] ? "bg-secondary font-semibold" : "bg-card"}`}>All {facet.label.toLowerCase()}</SafeLink>{facet.options.map(option => <SafeLink key={option.value} href={href({ [facet.key]: option.value })} aria-current={values[facet.key] === option.value ? "true" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm ${values[facet.key] === option.value ? "bg-secondary font-semibold" : "bg-card text-primary"}`}>{option.label}{option.count !== undefined && <span className="font-mono text-xs">{option.count}</span>}</SafeLink>)}</div></fieldset>)}
      <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Close filters</Button>
    </DialogContent></Dialog>
  </>;
}
