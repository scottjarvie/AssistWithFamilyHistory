"use client";
import { useEffect, useRef, useState } from "react";
import { loadPeoplePage } from "@/app/app/people/actions";
import { PeopleExplorerView } from "./PeopleExplorerView";
type Page = Awaited<ReturnType<typeof loadPeoplePage>>;
export function PaginatedPeopleExplorer({initial, firstStartEligible, query, status, preferenceKey}: {initial: Page; firstStartEligible: boolean; query?: string; status?: Parameters<typeof loadPeoplePage>[0]["researchStatus"]; preferenceKey: string}) {
  const [result, setResult] = useState(initial);
  const [target, setTarget] = useState(50);
  const [error, setError] = useState(false);
  const fetching = useRef(false);
  const alive = useRef(true);
  const searching = !result.isDone && result.page.length < target;
  useEffect(() => { alive.current = true; return () => {alive.current = false;}; }, []);
  useEffect(() => {
    if (!searching || error || fetching.current) return;
    fetching.current = true;
    loadPeoplePage({search: query, researchStatus: status, cursor: result.continueCursor}).then(next => {
      if (alive.current) setResult(previous => ({...next, page: [...new Map([...previous.page, ...next.page].map(row => [row._id, row])).values()]}));
    }).catch(() => {if (alive.current) setError(true);}).finally(() => {fetching.current = false;});
  }, [searching, error, query, status, result.continueCursor]);
  return <>
    <PeopleExplorerView people={result.page.slice(0, target)} firstStartEligible={firstStartEligible} query={query} status={status} preferenceKey={preferenceKey} loadMoreHref={null} onLoadMore={(!result.isDone || result.page.length > target) && !searching ? () => setTarget(target + 50) : undefined} searching={searching}/>
    {searching && !error && <p role="status" className="px-4 pb-6 sm:px-8">Searching people… {result.page.length} found so far.</p>}
    {error && <p role="alert" className="px-4 pb-6 sm:px-8">Could not finish loading. <button className="underline" onClick={() => setError(false)}>Try again</button></p>}
  </>;
}
