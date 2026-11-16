"use client";
import { useState } from "react";
import { WritingCandidatesView } from "@/components/vault/WritingCandidatesView";
import { Button } from "@/components/ui/button";
import { loadWritingCandidates } from "./actions";
type Page = Awaited<ReturnType<typeof loadWritingCandidates>>;
export function PagedWriting({ owner, initial, preferenceKey }: {
    owner: string;
    initial: Page;
    preferenceKey: string;
}) {
    const [state, setState] = useState(initial), [pending, setPending] = useState(false), [error, setError] = useState("");
    async function more() { setPending(true); setError(""); try {
        const next = await loadWritingCandidates(state.continueCursor, owner);
        setState(old => ({ ...next, page: [...new Map([...old.page, ...next.page].map(r => [r.id, r])).values()] }));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not load candidates");
    }
    finally {
        setPending(false);
    } }
    return <WritingCandidatesView people={state.page} preferenceKey={preferenceKey} loadMore={<div className="mt-4">{error && <p role="alert">{error}</p>}{!state.isDone && <Button disabled={pending} onClick={() => void more()}>{pending ? "Loading…" : "Load more candidates"}</Button>}</div>}/>;
}
