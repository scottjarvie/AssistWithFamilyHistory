"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";

export type CollectionView = "table" | "list" | "grid";
export type CollectionPreferences = {
  activeViewId?: string | null; view?: CollectionView; compact?: boolean; columns?: string[]; group?: string; sort?: string; descending?: boolean;
  saved?: { id: string; name: string; view: CollectionView; compact: boolean; columns: string[]; group: string; sort: string; descending: boolean; query: string; status: string }[];
};
const eventName = "awf-collection-preferences";
const emptySnapshot = () => "";
const memory = new Map<string, string>();
const savedSchema = z.object({ id: z.string(), name: z.string(), view: z.enum(["table", "list", "grid"]), compact: z.boolean(), columns: z.array(z.string()), group: z.string(), sort: z.string(), descending: z.boolean(), query: z.string(), status: z.string() });
const preferenceSchema = z.object({ activeViewId: z.string().nullable().optional(), view: z.enum(["table", "list", "grid"]).optional(), compact: z.boolean().optional(), columns: z.array(z.string()).optional(), group: z.string().optional(), sort: z.string().optional(), descending: z.boolean().optional(), saved: z.array(savedSchema).optional() });

/** Browser-local, owner-scoped preferences. Search terms persist only when a person saves a view; no record objects are copied. */
export function useCollectionPreferences(key: string) {
  const subscribe = useCallback((notify: () => void) => {
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) { memory.delete(key); notify(); } };
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, notify);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(eventName, notify); };
  }, [key]);
  const snapshot = useCallback(() => { if (memory.has(key)) return memory.get(key)!; try { return localStorage.getItem(key) || ""; } catch { return ""; } }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, emptySnapshot);
  const preferences: CollectionPreferences = useMemo(() => {
    try { const parsed = preferenceSchema.safeParse(JSON.parse(raw || "{}")); return parsed.success ? parsed.data : {}; } catch { return {}; }
  }, [raw]);
  const update = useCallback((value: CollectionPreferences) => {
    const encoded = JSON.stringify(value);
    memory.set(key, encoded);
    let persisted = true;
    try { localStorage.setItem(key, encoded); } catch { persisted = false; }
    window.dispatchEvent(new Event(eventName));
    return persisted;
  }, [key]);
  return [preferences, update] as const;
}
