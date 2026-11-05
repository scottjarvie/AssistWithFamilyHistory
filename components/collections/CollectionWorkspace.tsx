"use client";

import { useId, useState, type ReactNode } from "react";
import { SafeLink } from "@/components/layout/SafeLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CollectionRecords } from "./CollectionRecords";
import { resolveCollectionColumns } from "@/lib/collections/columnPreferences";
import { canonicalFilters, applyCollectionFilters } from "@/lib/collections/viewFilters";
import type { CollectionColumn, CollectionGroup, BuiltInCollectionView } from "./types";
export type { CollectionColumn, CollectionGroup } from "./types";
import { useCollectionPreferences, type CollectionView } from "./useCollectionPreferences";

/** Full presentation over bounded, minimal server-projected DTOs.
 * Never pass raw Convex documents here: the entire rows prop is serialized to the browser.
 * Sorting/grouping/selection cover loaded rows, never imply whole-vault operations.
 */
export function CollectionWorkspace<Row>({ rows, columns, groups = [], rowKey, rowTitle, rowHref, renderIdentity, renderDetail, renderActions, imageSlot, primaryColumn, searchControls, preferenceKey, query = "", status = "", loadMoreHref, noun = "records", identityLabel = "Record", naturalDirection = "desc", naturalOrderLabel = "Recently touched", defaultGroup = "", columnVersion = 1, naturalLabels, filters, builtInViews = [], emptyState }: {
  rows: Row[]; columns: CollectionColumn<Row>[]; groups?: CollectionGroup<Row>[];
  rowKey: (row: Row) => string; rowTitle: (row: Row) => string; rowHref: (row: Row) => string | null;
  renderIdentity: (row: Row) => ReactNode; renderDetail?: (row: Row) => ReactNode; renderActions?: (row: Row) => ReactNode; imageSlot?: (row: Row) => ReactNode; primaryColumn?: string; searchControls: ReactNode;
  preferenceKey: string; query?: string; status?: string; loadMoreHref: string | null; noun?: string; identityLabel?: string; naturalDirection?: "asc" | "desc"; naturalOrderLabel?: string; defaultGroup?: string; columnVersion?: number; naturalLabels?: {forward:string;reverse:string}; filters?: Record<string, string>; builtInViews?: BuiltInCollectionView[]; emptyState: ReactNode;
}) {
  const [settings, saveSettings] = useCollectionPreferences(preferenceKey);
  const [selected, setSelected] = useState<string[]>([]);
  const [onlySelected, setOnlySelected] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const activeView = settings.activeViewId || null;
  const setActiveView = (activeViewId: string | null) => update({ activeViewId });
  const id = useId();
  const view: CollectionView = settings.view || "auto";
  const compact = Boolean(settings.compact);
  const availableColumns = columns.filter((c) => !c.sortOnly);
  const visibleKeys = resolveCollectionColumns(availableColumns, settings.columns, settings.columnVersion);
  const visibleColumns = availableColumns.filter((column) => visibleKeys.includes(column.key));
  const group = groups.find((option) => option.key === (settings.group ?? defaultGroup));
  const sort = columns.find((column) => column.key === settings.sort && column.sortValue);
  const saved = Array.isArray(settings.saved) ? settings.saved.filter((v) => v && typeof v.id === "string" && typeof v.name === "string") : [];
  const active = saved.find((v) => v.id === activeView);
  const current = { view, compact, columns: visibleKeys, group: group?.key || "", sort: sort?.key || "", descending: Boolean(settings.descending), query, status, filters: canonicalFilters(filters || {q:query,status}) };
  const edited = Boolean(active && JSON.stringify(current) !== JSON.stringify({ view: active.view, compact: active.compact, columns: resolveCollectionColumns(availableColumns, active.columns, active.columnVersion), group: active.group, sort: active.sort, descending: active.descending, query: active.query, status: active.status, filters: canonicalFilters(Object.fromEntries(Object.keys(current.filters).map(key => [key,canonicalFilters(active.filters || {q:active.query,status:active.status})[key] || ""]))) }));
  const update = (patch: Partial<typeof settings>) => { if (!saveSettings({ ...settings, columns: visibleKeys, columnVersion, ...patch })) setMessage("Browser storage is unavailable. This view could not be remembered."); };
  const applyView = (value: typeof saved[number]) => {
    update({ view: value.view, compact: value.compact, columns: resolveCollectionColumns(availableColumns,value.columns,value.columnVersion), group: value.group, sort: value.sort, descending: value.descending, activeViewId: value.id });
    const savedFilters: Record<string, string> = value.filters || {q:value.query,status:value.status};
    const controlled = canonicalFilters(Object.fromEntries(Object.keys(current.filters).map(key => [key,savedFilters[key] || ""])));
    if (JSON.stringify(controlled) !== JSON.stringify(current.filters)) window.location.assign(applyCollectionFilters(window.location.href,current.filters,controlled));
  };
  const visibleRows = rows.filter((row) => !onlySelected || selected.includes(rowKey(row)));
  if (sort?.sortValue) visibleRows.sort((a, b) => {
    const left = sort.sortValue!(a), right = sort.sortValue!(b);
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
    return (settings.descending ? -order : order) || rowKey(a).localeCompare(rowKey(b));
  });
  if (!sort && settings.descending) visibleRows.reverse();
  const naturalText = naturalLabels || (naturalOrderLabel === "Recently touched" ? {forward:"Newest first ↓",reverse:"Oldest first ↑"} : {forward:"Original order",reverse:"Reverse original order"});
  const directionLabel = sort ? (settings.descending ? "Descending ↓" : "Ascending ↑") : settings.descending ? naturalText.reverse : naturalText.forward;
  const grouped = new Map<string, Row[]>();
  for (const row of visibleRows) { const name = group ? group.value(row) : ""; grouped.set(name, [...(grouped.get(name) || []), row]); }
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(rowKey(row)));
  const toggle = (row: Row) => setSelected((previous) => previous.includes(rowKey(row)) ? previous.filter((key) => key !== rowKey(row)) : [...previous, rowKey(row)]);
  const select = (row: Row) => <label className="flex min-h-11 w-11 items-center justify-center"><input type="checkbox" checked={selected.includes(rowKey(row))} onChange={() => toggle(row)} aria-label={`Select ${rowTitle(row)}`} className="h-4 w-4 accent-primary" /></label>;
  const control = "min-h-11 max-w-full rounded-md border border-border bg-card px-3 text-sm text-foreground";
  return <div className="collection-workspace min-w-0">
    <div aria-label="Saved views" className="mb-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-border pb-2">
      <Button variant={activeView ? "ghost" : "secondary"} className="min-h-11" onClick={() => { setActiveView(null); setOnlySelected(false); }}>{builtInViews.length ? "This result" : `All loaded ${noun}`} <span className="font-mono">{rows.length}</span></Button>
      {builtInViews.map(value => <SafeLink key={value.href} href={value.href} aria-current={value.active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm ${value.active ? "bg-secondary font-semibold" : "text-primary"}`}>{value.label}{value.count !== undefined && <span className="font-mono">{value.count}</span>}</SafeLink>)}
      {saved.map((value) => <Button key={value.id} variant={activeView === value.id ? "secondary" : "ghost"} className="min-h-11" onClick={() => applyView(value)}>{value.name}{activeView === value.id && edited ? " · edited" : ""}</Button>)}
      <Button variant="ghost" className="min-h-11 text-primary" onClick={() => { setNewName(""); setSaveOpen(true); }}>+ New view</Button>
      <Button variant="ghost" className="hidden min-h-11 sm:inline-flex" onClick={() => setManageOpen(true)}>Manage views</Button>
      {edited && <><Button variant="outline" className="min-h-11" onClick={() => active && applyView(active)}>Discard changes</Button><Button variant="outline" className="min-h-11" onClick={() => { setNewName(""); setSaveOpen(true); }}>Save as a view</Button></>}
    </div>
    <div className="collection-toolbar"><div className="min-w-0 flex-1">{searchControls}</div>
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Collection presentation">
      <label className="hidden items-center gap-2 text-sm sm:flex">Group <select aria-label="Group records" className={control} value={group?.key || ""} onChange={(e) => update({ group: e.target.value })}><option value="">None</option>{groups.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <label className="hidden items-center gap-2 text-sm sm:flex">Sort <select aria-label="Sort loaded records" className={control} value={sort?.key || ""} onChange={(e) => update({ sort: e.target.value })}><option value="">{naturalOrderLabel}</option>{columns.filter((c) => c.sortValue).map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <Button variant="outline" className="hidden min-h-11 sm:inline-flex" aria-label="Reverse sort direction" aria-pressed={Boolean(settings.descending)} onClick={() => update({ descending: !settings.descending })}>{directionLabel}</Button>
      <details onKeyDown={(e) => { if(e.key === "Escape") { e.currentTarget.removeAttribute("open"); e.currentTarget.querySelector("summary")?.focus(); } }} name={`${id}-menu`} className="relative sm:hidden"><summary className={`${control} flex cursor-pointer list-none items-center gap-2`}>Group ⌄</summary><fieldset className="fixed inset-x-4 bottom-4 z-30 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-lg"><legend className="sr-only">Group loaded records</legend>{[{key:"",label:"None"},...groups].map((option) => <label key={option.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`${id}-group`} checked={(group?.key || "") === option.key} onChange={() => update({group:option.key})} />{option.label}</label>)}<Button variant="outline" className="mt-2 min-h-11" onClick={(e) => { const details=e.currentTarget.closest("details"); details?.removeAttribute("open"); details?.querySelector("summary")?.focus(); }}>Close group choices</Button></fieldset></details>
      <details onKeyDown={(e) => { if(e.key === "Escape") { e.currentTarget.removeAttribute("open"); e.currentTarget.querySelector("summary")?.focus(); } }} name={`${id}-menu`} className="relative sm:hidden"><summary className={`${control} flex cursor-pointer list-none items-center gap-2`}>Sort ⌄</summary><div className="fixed inset-x-4 bottom-4 z-30 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-lg"><fieldset><legend className="sr-only">Sort loaded records</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`${id}-sort`} checked={!sort} onChange={() => update({sort:""})} />{naturalOrderLabel}</label>{columns.filter(c=>c.sortValue).map((column) => <label key={column.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`${id}-sort`} checked={sort?.key===column.key} onChange={() => update({sort:column.key})} />{column.label}</label>)}</fieldset><Button variant="outline" className="min-h-11" onClick={() => update({descending:!settings.descending})}>{directionLabel}</Button><Button variant="ghost" className="ml-2 min-h-11" onClick={(e) => { const details=e.currentTarget.closest("details"); details?.removeAttribute("open"); details?.querySelector("summary")?.focus(); }}>Close sort choices</Button></div></details>
      <div className="ml-auto hidden gap-1 sm:flex" role="group" aria-label="View">{(["table", "list", "grid"] as const).map((option) => <Button key={option} className="min-h-11 capitalize" variant={view === option || (view === "auto" && option === "table") ? "secondary" : "ghost"} aria-pressed={view === option || (view === "auto" && option === "table")} onClick={() => update({ view: option })}>{option}</Button>)}</div>
      <details onKeyDown={(e) => { if(e.key === "Escape") { e.currentTarget.removeAttribute("open"); e.currentTarget.querySelector("summary")?.focus(); } }} name={`${id}-menu`} className="relative sm:ml-0"><summary className={`${control} flex cursor-pointer list-none items-center gap-2`}>Options <span aria-hidden="true">⌄</span></summary><div className="fixed inset-x-4 bottom-4 z-30 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-popover p-4 shadow-lg sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64">
        <Button className="sticky top-0 z-10 ml-auto flex min-h-11 bg-popover" variant="ghost" onClick={(e) => { const details=e.currentTarget.closest("details"); details?.removeAttribute("open"); details?.querySelector("summary")?.focus(); }}>Close options</Button>
        <fieldset className="sm:hidden"><legend className="mb-1 text-sm font-semibold">View</legend>{(["table", "list", "grid"] as const).map((option) => <label key={option} className="flex min-h-11 items-center gap-2 text-sm capitalize"><input type="radio" name={`${id}-view`} checked={view === option || (view === "auto" && option === "list")} onChange={() => update({ view: option })} />{option}</label>)}</fieldset>
        <Button className="min-h-11 sm:hidden" variant="ghost" onClick={() => setManageOpen(true)}>Manage views</Button>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={compact} onChange={() => update({ compact: !compact })} />Compact density</label>
        <fieldset><legend className="mt-2 text-sm font-semibold">Columns · identity always visible</legend>{availableColumns.map((column) => <label key={column.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={visibleKeys.includes(column.key)} onChange={() => update({ columns: visibleKeys.includes(column.key) ? visibleKeys.filter((key) => key !== column.key) : [...visibleKeys, column.key] })} />{column.label}</label>)}</fieldset>
        <Button className="mt-2 min-h-11" variant="outline" onClick={() => update({ columns: availableColumns.map((c) => c.key), compact: false })}>Show all columns</Button>
      </div></details>
    </div>
    </div>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" ref={(node) => { if(node) node.indeterminate = !allSelected && rows.some((row) => selected.includes(rowKey(row))); }} checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map(rowKey))} />Select all {rows.length} loaded</label>
      {selected.length > 0 && <><span role="status">{selected.length} selected</span><Button variant="outline" className="min-h-11" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>{onlySelected ? "Show all loaded" : "Show selected"}</Button><Button variant="ghost" className="min-h-11" onClick={() => { setSelected([]); setOnlySelected(false); }}>Clear selection</Button></>}
      <span className="text-xs">Loaded records only</span>
    </div>
    {message && <p role="status" className="mb-3 text-sm text-annotation">{message}</p>}
    {rows.length === 0 ? emptyState : visibleRows.length === 0 ? <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm">No selected {noun} in this page. <Button variant="link" onClick={() => setOnlySelected(false)}>Show all loaded</Button></p> : <CollectionRecords grouped={[...grouped].sort(([a],[b]) => group?.order?.(a,b) || 0)} columns={visibleColumns} view={view} compact={compact} rowKey={rowKey} rowHref={rowHref} renderIdentity={renderIdentity} renderDetail={renderDetail} renderActions={renderActions} imageSlot={imageSlot} primaryColumn={primaryColumn} select={select} identityLabel={identityLabel} sortKey={sort?.key} descending={Boolean(settings.descending)} onSort={(key) => update({sort:key,descending:sort?.key === key ? !settings.descending : false})} />}
    <p className="mt-4 text-sm text-muted-foreground">Group, sort and selection apply to loaded {noun}{loadMoreHref ? "; load more to include the next page." : "."}</p>
    <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">{visibleRows.length} of {rows.length} loaded {noun} shown{onlySelected ? ` · ${rows.length - visibleRows.length} hidden by selection` : ""}{loadMoreHref ? " · more records available" : ""}.</p>
    {loadMoreHref && <div className="mt-4"><Button asChild variant="outline" className="min-h-11"><SafeLink href={loadMoreHref}>Load more {noun}</SafeLink></Button></div>}
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent><DialogHeader><DialogTitle>Save a view</DialogTitle><DialogDescription>Remember these filters and presentation in this browser, for this account. Saved search text stays here after sign-out until you remove the view. No record objects are copied.</DialogDescription></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); if (!newName.trim()) return; const value = { ...current, columnVersion, id: globalThis.crypto?.randomUUID?.() || `view-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: newName.trim() }; const persisted = saveSettings({ ...settings, activeViewId: value.id, saved: [...saved, value] }); setSaveOpen(false); setMessage(persisted ? `Saved view “${value.name}” in this browser.` : "View available for this session only. Browser storage is unavailable; it will not survive reload."); }} className="space-y-4">
        <label htmlFor={`${id}-name`} className="block text-sm font-medium">View name</label><Input id={`${id}-name`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} required autoFocus /><Button type="submit" className="min-h-11">Save view</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={manageOpen} onOpenChange={setManageOpen}><DialogContent><DialogHeader><DialogTitle>Manage views</DialogTitle><DialogDescription>These named views belong to this account in this browser. Removing a view keeps every record.</DialogDescription></DialogHeader>
      {saved.length ? <ul className="divide-y divide-border">{saved.map((value) => <li key={value.id} className="flex items-center justify-between gap-3 py-2"><span className="break-words text-sm">{value.name}</span><Button variant="outline" className="min-h-11" onClick={() => { update({ saved: saved.filter((v) => v.id !== value.id), activeViewId: activeView === value.id ? null : activeView }); }}>Remove view</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No saved views yet. Use “+ New view” to keep a useful arrangement.</p>}
    </DialogContent></Dialog>
  </div>;
}
