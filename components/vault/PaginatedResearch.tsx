"use client";
import { useEffect, useRef, useState } from "react";
import { loadResearchTasks, loadResearchLog } from "@/app/app/research/actions";
import { ResearchOverviewView } from "./ResearchOverviewView";
type Initial = {tasks: Awaited<ReturnType<typeof loadResearchTasks>>; log: Awaited<ReturnType<typeof loadResearchLog>>};
export function PaginatedResearch({initial, query, status, vaultOwnerId, preferenceKey}: {initial: Initial; query?: string; status?: Parameters<typeof loadResearchTasks>[0]["status"]; vaultOwnerId: string; preferenceKey: string}) {
  const [tasks, setTasks] = useState(initial.tasks);
  const [log, setLog] = useState(initial.log);
  const [target, setTarget] = useState(50);
  const [busyLog, setBusyLog] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false), alive = useRef(true);
  const searching = !tasks.isDone && tasks.page.length < target;
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  useEffect(() => {
    if (!searching || error || busy.current) return;
    busy.current = true;
    loadResearchTasks({expectedOwner: vaultOwnerId, search: query, status, cursor: tasks.continueCursor}).then(next => {
      busy.current = false;
      if (alive.current) setTasks(old => ({...next, page: [...new Map([...old.page, ...next.page].map(r => [r.id, r])).values()]}));
    }).catch(() => {busy.current = false; if (alive.current) setError("Could not finish loading tasks. Reload if you changed trees.");});
  }, [searching, error, query, status, tasks.continueCursor, vaultOwnerId]);
  const moreLog = async () => {
    if (busyLog) return;
    setBusyLog(true);
    try {const next = await loadResearchLog({expectedOwner: vaultOwnerId, cursor: log.continueCursor}); if (alive.current) setLog(old => ({...next, page: [...new Map([...old.page, ...next.page].map(r => [r.id, r])).values()]}));}
    catch {if (alive.current) setError("Could not load research log entries. Reload if you changed trees.");}
    finally {if (alive.current) setBusyLog(false);}
  };
  return <>
    <ResearchOverviewView tasks={tasks.page} log={log.page} query={query} status={status} preferenceKey={preferenceKey} taskTotals={tasks.totals} logTotals={log.totals} onLoadTasks={!tasks.isDone && !searching ? () => setTarget(target + 50) : undefined} onLoadLog={!log.isDone ? moreLog : undefined} busyLog={busyLog}/>
    {searching && !error && <p role="status" className="px-4 pb-6 sm:px-8">Searching tasks… {tasks.page.length} found so far.</p>}
    {error && <p role="alert" className="px-4 pb-6 sm:px-8">{error} <button className="underline" onClick={() => setError("")}>Try again</button></p>}
  </>;
}
