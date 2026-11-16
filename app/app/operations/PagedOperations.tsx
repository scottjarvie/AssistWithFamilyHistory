"use client";
import { useState } from "react";
import { OperationsView, type OperationsViewProps } from "@/components/operations/OperationsView";
import { Button } from "@/components/ui/button";
import { loadOperations } from "./actions";
type Page = Awaited<ReturnType<typeof loadOperations>>;
export function PagedOperations({ owner, initial, ...props }: Omit<OperationsViewProps, "rows" | "summary" | "loadMoreHref"> & {
    owner: string;
    initial: Page;
}) {
    const [state, setState] = useState(initial), [pending, setPending] = useState(false), [error, setError] = useState("");
    async function more() { setPending(true); setError(""); try {
        const next = await loadOperations(state.continueCursor, owner, props.filters);
        setState(old => ({ ...next, rows: [...new Map([...old.rows, ...next.rows].map(r => [`${r.rowType}:${r.id}`, r])).values()] }));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not load operations");
    }
    finally {
        setPending(false);
    } }
    return <><OperationsView {...props} rows={state.rows} summary={state.summary} summaryScope={state.summaryScope} exact={state.exact} loadMoreHref={null}/><div className="px-6 pb-8">{error && <p role="alert">{error}</p>}{!state.isDone && <Button disabled={pending} onClick={() => void more()}>{pending ? "Loading…" : "Load more operations"}</Button>}{!state.isDone && <p className="mt-2 text-sm text-muted-foreground">More records remain to search, even when this page has no matches.</p>}</div></>;
}
