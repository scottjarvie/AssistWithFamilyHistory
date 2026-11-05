"use client";

import { useId, useState, type ReactNode } from "react";
import { SafeLink } from "@/components/layout/SafeLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import { useCollectionPreferences, type CollectionView } from "./useCollectionPreferences";

export type CollectionColumn<Row> = { key: string; label: string; render: (row: Row) => ReactNode; sortValue?: (row: Row) => string | number; sortOnly?: boolean };
export type CollectionGroup<Row> = { key: string; label: string; value: (row: Row) => string };

/** Full collection presentation over the bounded rows the route has loaded. Never implies whole-vault sorting. */
export function CollectionWorkspace<Row>({ rows, columns, groups = [], rowKey, rowTitle, rowHref, renderIdentity, renderDetail, searchControls, preferenceKey, query = "", status = "", loadMoreHref, noun = "records", identityLabel = "Record", emptyState }: {
  rows: Row[]; columns: CollectionColumn<Row>[]; groups?: CollectionGroup<Row>[];
  rowKey: (row: Row) => string; rowTitle: (row: Row) => string; rowHref: (row: Row) => string;
  renderIdentity: (row: Row) => ReactNode; renderDetail?: (row: Row) => ReactNode; searchControls: ReactNode;
  preferenceKey: string; query?: string; status?: string; loadMoreHref: string | null; noun?: string; identityLabel?: string; emptyState: ReactNode;
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
  const view: CollectionView = settings.view === "grid" || settings.view === "list" ? settings.view : "table";
  const compact = Boolean(settings.compact);
  const availableColumns = columns.filter((c) => !c.sortOnly);
  const visibleKeys = Array.isArray(settings.columns) ? settings.columns.filter((key) => availableColumns.some((c) => c.key === key)) : availableColumns.map((c) => c.key);
  const visibleColumns = availableColumns.filter((column) => visibleKeys.includes(column.key));
  const group = groups.find((option) => option.key === (settings.group ?? groups[0]?.key));
  const sort = columns.find((column) => column.key === settings.sort && column.sortValue);
  const saved = Array.isArray(settings.saved) ? settings.saved.filter((v) => v && typeof v.id === "string" && typeof v.name === "string") : [];
  const active = saved.find((v) => v.id === activeView);
  const current = { view, compact, columns: visibleKeys, group: group?.key || "", sort: sort?.key || "", descending: Boolean(settings.descending), query, status };
  const edited = Boolean(active && JSON.stringify(current) !== JSON.stringify({ view: active.view, compact: active.compact, columns: active.columns, group: active.group, sort: active.sort, descending: active.descending, query: active.query, status: active.status }));
  const update = (patch: Partial<typeof settings>) => { if (!saveSettings({ ...settings, ...patch })) setMessage("Browser storage is unavailable. This view could not be remembered."); };
  const applyView = (value: typeof saved[number]) => {
    update({ view: value.view, compact: value.compact, columns: value.columns, group: value.group, sort: value.sort, descending: value.descending, activeViewId: value.id });
    if (value.query !== query || value.status !== status) {
      const url = new URL(window.location.href);
      if (value.query) url.searchParams.set("q", value.query); else url.searchParams.delete("q");
      if (value.status) url.searchParams.set("status", value.status); else url.searchParams.delete("status");
      url.searchParams.delete("page");
      window.location.assign(url.toString());
    }
  };
  const visibleRows = rows.filter((row) => !onlySelected || selected.includes(rowKey(row)));
  if (sort?.sortValue) visibleRows.sort((a, b) => {
    const left = sort.sortValue!(a), right = sort.sortValue!(b);
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
    return (settings.descending ? -order : order) || rowKey(a).localeCompare(rowKey(b));
  });
  if (!sort && settings.descending) visibleRows.reverse();
  const grouped = new Map<string, Row[]>();
  for (const row of visibleRows) { const name = group ? group.value(row) : ""; grouped.set(name, [...(grouped.get(name) || []), row]); }
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(rowKey(row)));
  const toggle = (row: Row) => setSelected((previous) => previous.includes(rowKey(row)) ? previous.filter((key) => key !== rowKey(row)) : [...previous, rowKey(row)]);
  const select = (row: Row) => <label className="flex min-h-11 w-6 items-center justify-center"><input type="checkbox" checked={selected.includes(rowKey(row))} onChange={() => toggle(row)} aria-label={`Select ${rowTitle(row)}`} className="h-4 w-4 accent-primary" /></label>;
  const control = "min-h-11 max-w-full rounded-md border border-border bg-card px-3 text-sm text-foreground";
  return <div className="min-w-0">
    <div aria-label="Saved views" className="mb-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-border pb-2">
      <Button variant={activeView ? "ghost" : "secondary"} className="min-h-11" onClick={() => { setActiveView(null); setOnlySelected(false); }}>All loaded {noun} <span className="font-mono">{rows.length}</span></Button>
      {saved.map((value) => <Button key={value.id} variant={activeView === value.id ? "secondary" : "ghost"} className="min-h-11" onClick={() => applyView(value)}>{value.name}{activeView === value.id && edited ? " · edited" : ""}</Button>)}
      <Button variant="ghost" className="min-h-11 text-primary" onClick={() => { setNewName(""); setSaveOpen(true); }}>+ New view</Button>
      <Button variant="ghost" className="hidden min-h-11 sm:inline-flex" onClick={() => setManageOpen(true)}>Manage views</Button>
      {edited && <><Button variant="outline" className="min-h-11" onClick={() => active && applyView(active)}>Discard changes</Button><Button variant="outline" className="min-h-11" onClick={() => { setNewName(""); setSaveOpen(true); }}>Save as a view</Button></>}
    </div>
    {searchControls}
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Collection presentation">
      <label className="hidden items-center gap-2 text-sm sm:flex">Group <select aria-label="Group records" className={control} value={group?.key || ""} onChange={(e) => update({ group: e.target.value })}><option value="">None</option>{groups.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <label className="hidden items-center gap-2 text-sm sm:flex">Sort <select aria-label="Sort loaded records" className={control} value={sort?.key || ""} onChange={(e) => update({ sort: e.target.value })}><option value="">Recently touched</option>{columns.filter((c) => c.sortValue).map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <Button variant="outline" className="hidden min-h-11 sm:inline-flex" aria-label="Reverse sort direction" aria-pressed={Boolean(settings.descending)} onClick={() => update({ descending: !settings.descending })}>{settings.descending ? "Descending ↓" : "Ascending ↑"}</Button>
      <details onKeyDown={(e) => { if(e.key === "Escape") { e.currentTarget.removeAttribute("open"); e.currentTarget.querySelector("summary")?.focus(); } }} name={`${id}-menu`} className="relative sm:hidden"><summary className={`${control} flex cursor-pointer list-none items-center gap-2`}>Group ⌄</summary><fieldset className="fixed inset-x-4 bottom-4 z-30 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-lg"><legend className="sr-only">Group loaded records</legend>{[{key:"",label:"None"},...groups].map((option) => <label key={option.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`${id}-group`} checked={(group?.key || "") === option.key} onChange={() => update({group:option.key})} />{option.label}</label>)}<Button variant="outline" className="mt-2 min-h-11" onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>Close group choices</Button></fieldset></details>
      <details onKeyDown={(e) => { if(e.key === "Escape") { e.currentTarget.removeAttribute("open"); e.currentTarget.querySelector("summary")?.focus(); } }} name={`${id}-menu`} className="relative sm:hidden"><summary className={`${control} flex cursor-pointer list-none items-center gap-2`}>Sort ⌄</summary><div className="fixed inset-x-4 bottom-4 z-30 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-lg"><fieldset><legend className="sr-only">Sort loaded records</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`${id}-sort`} checked={!sort} onChange={() => update({sort:""})} />Recently touched</label>{columns.filter(c=>c.sortValue).map((column) => <label key={column.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`${id}-sort`} checked={sort?.key===column.key} onChange={() => update({sort:column.key})} />{column.label}</label>)}</fieldset><Button variant="outline" className="min-h-11" onClick={() => update({descending:!settings.descending})}>{settings.descending ? "Descending ↓" : "Ascending ↑"}</Button><Button variant="ghost" className="ml-2 min-h-11" onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>Close sort choices</Button></div></details>
      <div className="ml-auto hidden gap-1 sm:flex" role="group" aria-label="View">{(["table", "list", "grid"] as const).map((option) => <Button key={option} className="min-h-11 capitalize" variant={view === option ? "secondary" : "ghost"} aria-pressed={view === option} onClick={() => update({ view: option })}>{option}</Button>)}</div>
      <details onKeyDown={(e) => { if(e.key === "Escape") { e.currentTarget.removeAttribute("open"); e.currentTarget.querySelector("summary")?.focus(); } }} name={`${id}-menu`} className="relative sm:ml-0"><summary className={`${control} flex cursor-pointer list-none items-center gap-2`}>Options <span aria-hidden="true">⌄</span></summary><div className="fixed inset-x-4 bottom-4 z-30 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-popover p-4 shadow-lg sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64">
        <Button className="sticky top-0 z-10 ml-auto flex min-h-11 bg-popover" variant="ghost" onClick={(e) => { const details=e.currentTarget.closest("details"); details?.removeAttribute("open"); details?.querySelector("summary")?.focus(); }}>Close options</Button>
        <fieldset className="sm:hidden"><legend className="mb-1 text-sm font-semibold">View</legend>{(["table", "list", "grid"] as const).map((option) => <label key={option} className="flex min-h-11 items-center gap-2 text-sm capitalize"><input type="radio" name={`${id}-view`} checked={view === option} onChange={() => update({ view: option })} />{option}</label>)}</fieldset>
        <Button className="min-h-11 sm:hidden" variant="ghost" onClick={() => setManageOpen(true)}>Manage views</Button>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={compact} onChange={() => update({ compact: !compact })} />Compact density</label>
        <fieldset><legend className="mt-2 text-sm font-semibold">Columns · identity always visible</legend>{availableColumns.map((column) => <label key={column.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={visibleKeys.includes(column.key)} onChange={() => update({ columns: visibleKeys.includes(column.key) ? visibleKeys.filter((key) => key !== column.key) : [...visibleKeys, column.key] })} />{column.label}</label>)}</fieldset>
        <Button className="mt-2 min-h-11" variant="outline" onClick={() => update({ columns: availableColumns.map((c) => c.key), compact: false })}>Show all columns</Button>
      </div></details>
    </div>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map(rowKey))} />Select all {rows.length} loaded</label>
      {selected.length > 0 && <><span role="status">{selected.length} selected</span><Button variant="outline" className="min-h-11" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>{onlySelected ? "Show all loaded" : "Show selected"}</Button><Button variant="ghost" className="min-h-11" onClick={() => { setSelected([]); setOnlySelected(false); }}>Clear selection</Button></>}
      <span className="text-xs">Loaded records only</span>
    </div>
    {message && <p role="status" className="mb-3 text-sm text-annotation">{message}</p>}
    {rows.length === 0 ? emptyState : visibleRows.length === 0 ? <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm">No selected {noun} in this page. <Button variant="link" onClick={() => setOnlySelected(false)}>Show all loaded</Button></p> : <div className="space-y-5">
      {[...grouped].map(([name, groupRows]) => <section key={name} aria-label={name || `Loaded ${noun}`}>
        {name && <h2 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold capitalize">{name}<span className="rounded-full bg-secondary px-2 py-1 font-mono text-xs">{groupRows.length}</span></h2>}
        {view === "table" ? <div className="overflow-x-auto rounded-lg border border-border bg-card" tabIndex={0} aria-label="Record comparison table">
          <table className={`collection-table w-full text-left text-sm ${compact ? "is-compact" : ""}`}>
            <caption className="sr-only">{name || "Loaded records"} · all details remain on each record</caption>
            <thead className="bg-muted/60"><tr><th scope="col" className="w-11"><span className="sr-only">Select</span></th><th scope="col">{identityLabel}</th>{visibleColumns.map((column) => <th key={column.key} scope="col">{column.sortValue ? <button className="min-h-11 text-left" onClick={() => update({ sort: column.key, descending: sort?.key === column.key ? !settings.descending : false })}>{column.label}{sort?.key === column.key ? settings.descending ? " ↓" : " ↑" : ""}</button> : column.label}</th>)}</tr></thead>
            <tbody>{groupRows.map((row) => <tr key={rowKey(row)} className="border-t border-border align-top hover:bg-muted/30"><td>{select(row)}</td><th scope="row" className="min-w-52 font-normal"><SafeLink href={rowHref(row)} className="block min-h-11 text-primary underline-offset-4 hover:underline">{renderIdentity(row)}</SafeLink>{renderDetail?.(row)}</th>{visibleColumns.map((column) => <td key={column.key} data-label={column.label} className="tabular-nums"><span className="text-muted-foreground sm:hidden">{column.label}</span><span>{column.render(row)}</span></td>)}</tr>)}</tbody>
          </table>
        </div> : <ul className={view === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "divide-y divide-border rounded-lg border border-border bg-card"}>
          {groupRows.map((row) => <li key={rowKey(row)} className={view === "grid" ? "rounded-lg border border-border bg-card" : ""}>
            <div className={compact ? "p-3" : "p-4"}>
              <div className="flex items-start gap-3">{select(row)}{view === "grid" && <ArchiveIllustration className="h-14 w-14 shrink-0 rounded bg-muted text-primary" />}<div className="min-w-0 flex-1"><SafeLink href={rowHref(row)} className="block break-words text-primary underline-offset-4 hover:underline">{renderIdentity(row)}</SafeLink>{renderDetail?.(row)}</div></div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">{visibleColumns.map((column) => <div key={column.key}><dt className="text-muted-foreground">{column.label}</dt><dd className="mt-0.5 break-words tabular-nums">{column.render(row)}</dd></div>)}</dl>
            </div>
          </li>)}
        </ul>}
      </section>)}
    </div>}
    <p className="mt-4 text-sm text-muted-foreground">Group, sort and selection apply to loaded {noun}{loadMoreHref ? "; load more to include the next page." : "."}</p>
    <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">{visibleRows.length} of {rows.length} loaded {noun} shown{onlySelected ? ` · ${rows.length - visibleRows.length} hidden by selection` : ""}{loadMoreHref ? " · more records available" : ""}.</p>
    {loadMoreHref && <div className="mt-4"><Button asChild variant="outline" className="min-h-11"><SafeLink href={loadMoreHref}>Load more {noun}</SafeLink></Button></div>}
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent><DialogHeader><DialogTitle>Save a view</DialogTitle><DialogDescription>Remember these filters and presentation in this browser, for this account. No records are copied.</DialogDescription></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); if (!newName.trim()) return; const value = { ...current, id: crypto.randomUUID(), name: newName.trim() }; const persisted = saveSettings({ ...settings, activeViewId: value.id, saved: [...saved, value] }); setSaveOpen(false); setMessage(persisted ? `Saved view “${value.name}” in this browser.` : "View available for this session only. Browser storage is unavailable; it will not survive reload."); }} className="space-y-4">
        <label htmlFor={`${id}-name`} className="block text-sm font-medium">View name</label><Input id={`${id}-name`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} required autoFocus /><Button type="submit" className="min-h-11">Save view</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={manageOpen} onOpenChange={setManageOpen}><DialogContent><DialogHeader><DialogTitle>Manage views</DialogTitle><DialogDescription>These named views belong to this account in this browser. Removing a view keeps every record.</DialogDescription></DialogHeader>
      {saved.length ? <ul className="divide-y divide-border">{saved.map((value) => <li key={value.id} className="flex items-center justify-between gap-3 py-2"><span className="break-words text-sm">{value.name}</span><Button variant="outline" className="min-h-11" onClick={() => { update({ saved: saved.filter((v) => v.id !== value.id), activeViewId: activeView === value.id ? null : activeView }); }}>Remove view</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No saved views yet. Use “+ New view” to keep a useful arrangement.</p>}
    </DialogContent></Dialog>
  </div>;
}
