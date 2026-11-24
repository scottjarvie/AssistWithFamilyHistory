"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type QueueCounts = { suggestions: number; needsInput: number } | null;
const QueueCountsContext = createContext({
  counts: null as QueueCounts,
  publish: (_counts: QueueCounts) => {},
});

export function QueueNavCountsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<QueueCounts>(null);
  const received = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const publish = useCallback((next: QueueCounts) => {
    inFlight.current?.abort();
    inFlight.current = null;
    received.current = true;
    setCounts(next);
  }, []);
  const refresh = useCallback(() => {
    if (inFlight.current) return;
    const request = new AbortController();
    inFlight.current = request;
    void fetch("/api/queue?counts=true", { cache: "no-store", signal: request.signal })
      .then(response => response.json())
      .then(payload => {
        if (!request.signal.aborted) publish(payload.success && payload.counts?.available ? payload.counts : null);
      })
      .catch(() => { if (!request.signal.aborted) publish(null); });
  }, [publish]);
  useEffect(() => {
    if (pathname !== "/app/queue" && !received.current) refresh();
  }, [pathname, refresh]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [refresh]);
  const value = useMemo(() => ({ counts, publish }), [counts, publish]);
  return <QueueCountsContext.Provider value={value}>{children}</QueueCountsContext.Provider>;
}

export function usePublishQueueCounts() {
  return useContext(QueueCountsContext).publish;
}

export function QueueNavCounts(){
 const { counts } = useContext(QueueCountsContext);
 if(!counts)return null;
 return <span className="ml-auto inline-flex gap-2">{counts.needsInput>0&&<span aria-label={`${counts.needsInput} need your input`} className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{counts.needsInput}</span>}<span aria-label={`${counts.suggestions} AI suggestions`} className="text-xs text-muted-foreground">{counts.suggestions}</span></span>;
}
