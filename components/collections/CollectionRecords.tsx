"use client";

import { Fragment, type ReactNode } from "react";
import { SafeLink } from "@/components/layout/SafeLink";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import type { CollectionColumn } from "./types";
import type { CollectionView } from "./useCollectionPreferences";

/** Same chosen fields in three recognisable presentations; auto uses a clean List on phones. */
function RecordLink({href,children,className}:{href:string|null;children:ReactNode;className?:string}) { return href ? <SafeLink href={href} className={className}>{children}</SafeLink> : <div className={className?.replace("text-primary","text-foreground").replace("hover:underline","")}>{children}</div>; }
export function CollectionRecords<Row>({ grouped, columns, view, compact, rowKey, rowHref, renderIdentity, renderDetail, renderActions, imageSlot, select, identityLabel, primaryColumn, sortKey, descending, onSort }: {
  grouped: [string, Row[]][]; columns: CollectionColumn<Row>[]; view: CollectionView; compact: boolean;
  rowKey: (row: Row) => string; rowHref: (row: Row) => string | null;
  renderIdentity: (row: Row) => ReactNode; renderDetail?: (row: Row, visibleColumnKeys: string[]) => ReactNode; renderActions?: (row: Row) => ReactNode;
  imageSlot?: (row: Row) => ReactNode; select: (row: Row) => ReactNode;
  identityLabel: string; primaryColumn?: string; sortKey?: string; descending: boolean; onSort: (key: string) => void;
}) {
  const picture = (row: Row, grid = false) => <div className={`${grid ? "h-20 w-20" : "h-8 w-8"} text-primary`}>{imageSlot?.(row) || <ArchiveIllustration className="h-full w-full"/>}</div>;
  const labelFor = (column:CollectionColumn<Row>,row:Row) => typeof column.compactLabel === "function" ? column.compactLabel(row) : column.compactLabel ?? column.label;
  const facts = (row: Row, selected: CollectionColumn<Row>[]) => {
    const presented=selected.map(column=>({column,content:column.compactRender?column.compactRender(row):column.render(row)})).filter(value=>value.content!==null);
    if(!presented.length)return null;
    return <div className="text-[13px] leading-6 text-muted-foreground [overflow-wrap:anywhere]">{presented.map(({column,content},index)=>{
      const mode=(typeof column.fact==="function"?column.fact(row):column.fact)||(column.numeric?"suffix":"bare");
      const label=labelFor(column,row);
      return <Fragment key={column.key}>{index>0&&<span aria-hidden="true"> · </span>}<span title={column.label} className={column.numeric||(mode==="prefix"&&typeof content==="string"&&`${label} ${content}`.length<30)?"inline-block whitespace-nowrap":"inline"}>{mode==="prefix"&&`${label} `}<span className="text-foreground tabular-nums">{content}</span>{mode==="suffix"&&` ${label}`}</span></Fragment>;
    })}</div>;
  };
  const weight=(column:CollectionColumn<Row>)=>column.width||(column.numeric?88:128);
  const totalWeight=60+240+columns.reduce((total,column)=>total+weight(column),0);
  const share=(value:number)=>`${100*value/totalWeight}%`;
  const visibleColumnKeys=columns.map(column=>column.key);
  const primary = columns.find((column) => column.key === primaryColumn);
  return <div className="space-y-5">    {(view === "auto" || view === "table") && <div className={`${view === "auto" ? "hidden sm:block" : ""} overflow-x-auto rounded-lg border border-border bg-card`} tabIndex={0} aria-label="Record comparison table">
      <table className={`collection-table w-full table-fixed text-left text-sm ${compact ? "is-compact" : ""}`}>
        <caption className="sr-only">Loaded records · comparison of loaded fields</caption>
        <colgroup className="hidden sm:table-column-group"><col style={{width:share(60)}}/><col style={{width:share(240)}}/>{columns.map(column=><col key={column.key} style={{width:share(weight(column))}}/>)}</colgroup>
        <thead className="bg-muted/60"><tr><th scope="col" className="w-11"><span className="sr-only">Select</span></th><th scope="col">{identityLabel}</th>{columns.map((column) => <th key={column.key} title={column.label} scope="col" className={column.numeric ? "text-right" : ""} aria-sort={sortKey === column.key ? descending ? "descending" : "ascending" : undefined}>
          {column.sortValue ? <button className="min-h-11 text-inherit md:pointer-fine:min-h-9" onClick={() => onSort(column.key)} aria-label={column.label}>{column.headerLabel||column.label}{sortKey === column.key ? descending ? " ↓" : " ↑" : ""}</button> : column.headerLabel||column.label}
        </th>)}</tr></thead>
        {grouped.map(([name,rows])=><tbody key={name}>{name&&<tr className="border-t border-border bg-secondary/60"><th scope="rowgroup" colSpan={columns.length+2}><h2 className="py-1 font-sans text-sm font-semibold">{name}<span className="ml-2 font-mono text-xs">{rows.length}</span></h2></th></tr>}{rows.map((row) => <tr data-row={rowKey(row)} key={rowKey(row)} className="border-t border-border align-top hover:bg-muted/30">
          <td>{select(row)}</td><th scope="row" className="min-w-0 font-normal [overflow-wrap:anywhere]"><div className="flex items-start gap-2"><div className="shrink-0 rounded bg-muted p-1">{picture(row)}</div><div className="min-w-0 flex-1"><RecordLink href={rowHref(row)} className="block min-h-9 text-primary underline-offset-4 hover:underline">{renderIdentity(row)}</RecordLink>{renderDetail?.(row,visibleColumnKeys)}{renderActions?.(row)}</div></div></th>
          {columns.map((column) => <td key={column.key} data-label={column.label} className={`${column.numeric ? "text-right font-mono tabular-nums" : ""} [overflow-wrap:anywhere]`}><span className="text-muted-foreground sm:hidden">{column.label}</span><div>{column.render(row)}</div></td>)}
        </tr>)}</tbody>)}
      </table>
    </div>}
{grouped.map(([name, rows]) => <section key={name} aria-label={name || "Loaded records"} className={view==="table"?"hidden":view==="auto"?"sm:hidden":""}>
    {name && <h2 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold">{name}<span className="rounded-full bg-secondary px-2 py-1 font-mono text-xs">{rows.length}</span></h2>}
    {(view === "auto" || view === "list") && <ul className={`${view === "auto" ? "sm:hidden" : ""} divide-y divide-border rounded-lg border border-border bg-card`}>
      {rows.map((row) => <li data-row={rowKey(row)} key={rowKey(row)} className={`flex items-start gap-1 ${compact ? "px-2 py-2" : "px-3 py-3"}`}>
        {select(row)}<div className="min-w-0 flex-1"><RecordLink href={rowHref(row)} className="block min-h-11 text-primary underline-offset-4 hover:underline">
          <div className="flex items-start gap-3"><div className="mt-1 shrink-0 self-start rounded bg-muted p-1">{picture(row)}</div><div className="min-w-0 flex-1">{renderIdentity(row)}</div>{primary && <p className="shrink-0 text-right font-mono text-sm tabular-nums">{primary.render(row)}<span className="block font-sans text-xs text-muted-foreground">{labelFor(primary,row)}</span></p>}</div><div className="mt-1">{facts(row, columns.filter((column) => column !== primary))}</div>
        </RecordLink>{renderDetail?.(row,visibleColumnKeys)}{renderActions?.(row)}</div>
      </li>)}
    </ul>}
    {view === "grid" && <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <li data-row={rowKey(row)} key={rowKey(row)} className="rounded-lg border border-border bg-card">
      <div className={compact ? "p-3" : "p-4"}><div className="mb-2 flex justify-between">{select(row)}</div><RecordLink href={rowHref(row)} className="block text-primary underline-offset-4 hover:underline"><div className="mb-3 flex h-24 items-center justify-center rounded bg-muted">{picture(row,true)}</div>{renderIdentity(row)}{facts(row,columns)}</RecordLink>{renderDetail?.(row,visibleColumnKeys)}{renderActions?.(row)}</div>
    </li>)}</ul>}
  </section>)}</div>;
}
