import type { ReactNode } from "react";
import { SafeLink } from "@/components/layout/SafeLink";

/** A labelled paper tray: one count, a useful excerpt, and a named way into the records. */
export function FolioTray({ id, title, count, countLabel, summary, children, href, linkLabel, className = "" }: {
  id: string; title: string; count?: number; countLabel?: string; summary?: ReactNode; children: ReactNode;
  href: string; linkLabel: string; className?: string;
}) {
  return <section aria-labelledby={id} className={`folio-tray ${className}`}>
    <header className="folio-tray-header">
      <div className="min-w-0 flex-1"><h2 id={id} className="folio-tray-tab inline-block">{title}</h2>{summary && <p className="mt-2 text-sm leading-6 text-muted-foreground">{summary}</p>}</div>
      {count !== undefined && <p className="ml-auto text-right">
        <span className="block font-display text-4xl leading-none tabular-nums">{count}</span>
        <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{countLabel}</span>
      </p>}
    </header>
    <div className="min-w-0 flex-1">{children}</div>
    <SafeLink href={href} className="folio-tray-footer">{linkLabel}<span aria-hidden="true"> →</span></SafeLink>
  </section>;
}
