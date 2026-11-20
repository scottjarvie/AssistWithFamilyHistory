"use client";

import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { loadPersonHistory } from "@/app/app/people/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Id } from "@/convex/_generated/dataModel";
import { personHistoryFields, type PersonHistoryPage } from "@/lib/vault/personHistory";

export function PersonHistory({ personId }: { personId: Id<"persons"> }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menuOpeningHistory = useRef(false);
  const request = useRef(0);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PersonHistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load(before: number | null) {
    const current = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const next = await loadPersonHistory(personId, before);
      if (current !== request.current) return;
      setPage(previous => ({
        ...next,
        rows: before === null ? next.rows : [...(previous?.rows ?? []), ...next.rows],
      }));
    } catch {
      if (current !== request.current) return;
      setPage(null);
      setError(true);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Person actions" variant="ghost" size="icon" className="size-11 shrink-0" ref={trigger}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={event => {
          if (menuOpeningHistory.current) event.preventDefault();
          menuOpeningHistory.current = false;
        }}>
          <DropdownMenuItem className="min-h-11" onSelect={() => {
            menuOpeningHistory.current = true;
            setOpen(true);
            void load(null);
          }}>
            History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Sheet open={open} onOpenChange={next => {
        setOpen(next);
        if (!next) {
          request.current++;
          setPage(null);
          setError(false);
          setLoading(false);
        }
      }}>
        <SheetContent className="w-full gap-0 sm:max-w-md" onCloseAutoFocus={event => {
          event.preventDefault();
          trigger.current?.focus();
        }}>
          <SheetHeader className="border-b border-border p-5 pr-16">
            <SheetTitle className="text-2xl">Person history</SheetTitle>
            <SheetDescription>Recent saved changes. Earlier edits may be missing.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-5 pb-5">
            {error && <div className="space-y-2 py-4">
              <p role="alert" className="text-sm">Person history is unavailable.</p>
              <Button variant="outline" onClick={() => void load(null)}>Try again</Button>
            </div>}
            <ol className="divide-y divide-border">
              {page?.rows.map((row, index) => (
                <li key={index} className="space-y-1 py-4">
                  <p className="text-sm font-semibold">{row.action}</p>
                  <time dateTime={new Date(row.at).toISOString()} className="block text-xs text-muted-foreground">
                    {new Date(row.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                  <p className="text-sm text-muted-foreground">{row.actor} · {row.source}</p>
                  {row.fields.length > 0 && <details className="mt-2 text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 text-primary">Changed fields</summary>
                    <ul className="list-disc space-y-1 pl-5">
                      {row.fields.map(field => <li key={field}>{personHistoryFields[field]}</li>)}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">Evidence for this edit was unrecorded.</p>
                  </details>}
                </li>
              ))}
            </ol>
            {loading && <p className="py-3 text-sm text-muted-foreground" role="status">Loading history…</p>}
            {page && page.before !== null && (
              <Button variant="outline" className="mt-3 min-h-11" aria-disabled={loading}
                onClick={() => { if (!loading) void load(page.before); }}>
                Older changes
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
