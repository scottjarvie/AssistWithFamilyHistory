import {ShieldCheck} from "lucide-react";
import {SafeLink} from "@/components/layout/SafeLink";
import {BaselineAiConnectionCenter as AiConnectionCenter} from "./BaselineAiConnectionCenter";
import type {ConnectionRow,ConnectionActivityRow} from "@/lib/mcp/connectionApi";
/** Original route JSX with invented records; no server/backend reads. */
export function BaselineAiConnectionsView({connections,activity}:{connections:ConnectionRow[];activity:ConnectionActivityRow[]}) {
  return (
    <div className="max-w-4xl px-4 py-6 sm:p-8">
      <header className="mb-8">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-800">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Your AI, on your terms
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-950">
          AI Connections
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
          Signing in gives an AI every current and future tool in your workspace with no end date by default. It can
          publish and unpublish stories after privacy checks, but never permanently delete, merge, invite or export. Choose fewer permissions or an end date here. Turning one
          off stops it on its very next request.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
          New here?{" "}
          <SafeLink href="/ai" className="font-medium text-emerald-800 underline hover:text-emerald-900">
            The setup page
          </SafeLink>{" "}
          explains what a connection is and what it takes to make one.
        </p>
      </header>
      <AiConnectionCenter initialConnections={connections} initialActivity={activity} />
    </div>
  );
}
