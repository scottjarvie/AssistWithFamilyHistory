import type { ReactNode } from "react";
import { SafeLink } from "@/components/layout/SafeLink";

/** A labelled paper tray: one count, a useful excerpt, and a named way into the records. */
export function FolioTray({ id, title, count, countLabel, children, href, linkLabel, className = "" }: {
  id: string; title: string; count?: number; countLabel?: string; children: ReactNode;
  href: string; linkLabel: string; className?: string;
}) {
  return <section aria-labelledby={id} className={`folio-tray ${className}`}>
    <header className="folio-tray-header">
      <h2 id={id} className="folio-tray-tab">{title}</h2>
      {count !== undefined && <p className="ml-auto text-right">
        <span className="block font-display text-4xl leading-none tabular-nums">{count}</span>
        <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{countLabel}</span>
      </p>}
    </header>
    <div className="min-w-0 flex-1">{children}</div>
    <SafeLink href={href} className="folio-tray-footer">{linkLabel}<span aria-hidden="true"> →</span></SafeLink>
  </section>;
}
