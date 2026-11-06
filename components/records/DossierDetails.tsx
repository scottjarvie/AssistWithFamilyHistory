"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const subscribe = (changed: () => void) => {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};
const desktopSnapshot = () => window.matchMedia("(min-width: 1024px)").matches;
const initialSnapshot = () => false;

/** Secondary dossier detail is one labelled step away on phones, expanded on desktop.
 * Children stay mounted: resizing or closing a group must never discard a draft.
 */
export function DossierDetails({ label, children }: { label: string; children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, initialSnapshot);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = desktop || phoneOpen;
  }, [desktop, phoneOpen]);
  return <details ref={ref} open={desktop || phoneOpen} onToggle={event => {
    if (!desktop) setPhoneOpen(event.currentTarget.open);
  }} className="border-t border-border lg:mt-4 lg:border-0">
    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm font-semibold lg:hidden">{label}<span aria-hidden="true" className="text-muted-foreground">⌄</span></summary>
    <div className="pb-3 lg:pb-0">{children}</div>
  </details>;
}
