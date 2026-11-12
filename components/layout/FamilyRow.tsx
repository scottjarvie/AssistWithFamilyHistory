"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { SafeAnchor } from "./SafeLink";
import { showAppFamilyRow } from "@/lib/family/surfaces";
import { familySpaces, lifeDirectoryHref, type FamilySpace } from "@/lib/family/manifest";

function Dot({ space, current = false }: { space: FamilySpace; current?: boolean }) {
  return <span aria-hidden="true" className={`family-dot${space.status === "In design" ? " family-dot-soon" : ""}`} style={{ "--family-dot": space.color, "--family-dot-dark": contrastOnDark(space.color) < 3 ? "#bec7cc" : space.color, ...(current ? { background: "currentColor" } : {}) } as CSSProperties} />;
}
function contrastOnDark(hex: string) {
  const luminance = (color: string) => {
    const rgb = color.match(/\w\w/g)!.map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  return (luminance(hex.slice(1)) + .05) / (luminance("181d25") + .05);
}
function Entry({ space, roster = false, close }: { space: FamilySpace; roster?: boolean; close?: () => void }) {
  const current = space.slug === "family-history";
  const content = <><Dot space={space} current={current} /><span>{space.subject}{roster ? <small>{current ? "you are here" : space.status === "In design" ? "in the works" : space.status === "Soft launch" ? "soft launch" : "live"}</small> : space.status === "In design" ? <small>soon</small> : null}</span>{current && !roster ? <small className="family-here">HERE</small> : null}</>;
  return current || space.status === "In design" || !space.href
    ? <span className={current ? "family-entry family-current" : "family-entry"} aria-current={current ? "page" : undefined}>{content}</span>
    : <SafeAnchor className="family-entry" href={space.href} onClick={close}>{content}</SafeAnchor>;
}

function FamilyRail() {
  const rail = useRef<HTMLUListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(true);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ width: 560, visibility: "hidden" });
  useLayoutEffect(() => {
    const query = matchMedia("(max-width: 639px)");
    const update = () => { setPhone(query.matches); setOpen(false); };
    update(); query.addEventListener("change", update);
    const list = rail.current!;
    const measure = () => setOverflow(list.scrollWidth - parseFloat(getComputedStyle(list).paddingRight) + 12 > list.clientWidth + 1);
    const observer = new ResizeObserver(measure); observer.observe(list); measure();
    return () => { query.removeEventListener("change", update); observer.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const scroll = (event: Event) => {
      if (!phone && event.target instanceof Node && !surface.current?.contains(event.target)) close();
    };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("hashchange", close);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", scroll, true); window.removeEventListener("hashchange", close); window.removeEventListener("resize", close); };
  }, [open, phone]);
  useLayoutEffect(() => {
    if (open && (phone || position.visibility !== "hidden")) {
      surface.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    }
  }, [open, phone, position]);
  function place() {
    if (phone || !surface.current || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const natural = surface.current.scrollHeight;
    const above = box.top - 12, below = innerHeight - box.bottom - 12;
    const up = natural <= above || above >= below;
    setPosition({ width: Math.min(560, innerWidth - 16), right: Math.max(8, innerWidth - box.right), maxHeight: Math.max(44, up ? above : below), ...(up ? { bottom: innerHeight - box.top + 4 } : { top: box.bottom + 4 }) });
  }
  return <nav className="family-row" aria-label="Assist With family">
    <ul ref={rail} className={`family-rail${overflow ? " family-overflow" : ""}`}>
      <li className="family-kicker">Assist With</li>
      {familySpaces.map((space) => <li key={space.slug}><Entry space={space} /></li>)}
      <li><SafeAnchor className="family-entry" href={lifeDirectoryHref}>Life · all spaces</SafeAnchor></li>
    </ul>
    <Dialog.Root open={open} onOpenChange={setOpen} modal={phone}>
      {overflow && <Dialog.Trigger asChild><button ref={trigger} className="family-all" type="button" aria-expanded={open}>All {familySpaces.length} <span aria-hidden="true">⌃</span></button></Dialog.Trigger>}
      <Dialog.Portal>
        {phone && <Dialog.Overlay className="family-scrim" onClick={() => setOpen(false)} />}
        <Dialog.Content ref={surface} className={`family-roster${phone ? " family-sheet" : ""}`} style={phone ? undefined : position}
          onOpenAutoFocus={(event) => { event.preventDefault(); place(); if (phone) surface.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}
          onPointerDownOutside={(event) => { if (phone) event.preventDefault(); }} aria-describedby={undefined} aria-modal={phone || undefined}>
          <div className="family-roster-heading"><Dialog.Title>Assist With · {familySpaces.length} sites</Dialog.Title><Dialog.Close aria-label="Close family sites">×</Dialog.Close></div>
          <ul className="family-roster-grid">{familySpaces.map((space) => <li key={space.slug}><Entry space={space} roster close={() => setOpen(false)} /></li>)}<li className="family-life"><SafeAnchor className="family-entry" href={lifeDirectoryHref} onClick={() => setOpen(false)}>Life · all spaces</SafeAnchor></li></ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </nav>;
}

export function FamilyRow() {
  const path = usePathname();
  if (path?.startsWith("/stories/")) return null;
  return <FamilyRail key={path} />;
}

/** Only the ordinary app footer surfaces; task/capture/record shells opt out. */
export function AppFamilyRow({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  if (!showAppFamilyRow(path, hash, signedIn)) return null;
  return <FamilyRow />;
}

function subscribeHash(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}
