"use client";
import {useState} from "react";
import {StoriesCollectionView} from "@/components/vault/StoriesCollectionView";
import {Button} from "@/components/ui/button";
import type {StoryCollectionRow} from "@/lib/vault/collectionRows";
import {loadStories} from "./actions";

type Page = {page: StoryCollectionRow[]; continueCursor: string; isDone: boolean};
export function PagedStories({initial, owner, ...props}: {initial: Page; owner: string; query?: string; status?: string; workflow?: string; preferenceKey: string}) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function more() {
    setPending(true); setError("");
    try {
      const next = await loadStories(state.continueCursor, owner);
      setState(previous => ({...next, page: [...new Map([...previous.page, ...next.page].map(row => [row.id, row])).values()]}));
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Could not load stories.");}
    finally {setPending(false);}
  }
  return <><StoriesCollectionView {...props} stories={state.page} loadedOnly/>
    <div className="px-6 pb-8"><p className="mb-3 text-sm text-muted-foreground">{state.page.length} stories loaded. Search, filters, counts and sorting cover loaded stories.</p>
      {error && <p role="alert">{error}</p>}
      {!state.isDone && <Button disabled={pending} onClick={() => void more()}>{pending ? "Loading…" : "Load more stories"}</Button>}
    </div></>;
}
