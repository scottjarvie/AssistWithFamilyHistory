import type { FunctionReturnType } from "convex/server";
import { SafeAnchor, SafeLink } from "@/components/layout/SafeLink";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { api } from "@/convex/_generated/api";

type PersonWorkspace = NonNullable<FunctionReturnType<typeof api.vaultReads.getPersonWorkspace>>;
const plural = (count:number,one:string,many:string) => `${count} ${count===1?one:many}`;

/** The identity dossier is server-rendered. Canonical details are not represented as proven source claims. */
export function PersonHeader({person,stats,operations,routeId,researchTaskCount=0}:{
  person:PersonWorkspace["person"];stats:PersonWorkspace["stats"];operations:Pick<PersonWorkspace["operations"],"completionPercent"|"requiredMissingCount"|"recommendedMissingCount"|"staleChecksCount">;routeId:string;researchTaskCount?:number;
}) {
  const critical=operations.requiredMissingCount;
  const numbers=[
    ["Imports",stats.imports,"overview"],["Context",stats.contextReports,"overview"],["Research tasks",researchTaskCount,"research"],
  ] as const;
  return <>
    <SafeLink href="/app/people" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m7 3-5 5 5 5 M2 8h12"/></svg>Back to People</SafeLink>
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3"><ArchiveIllustration className="h-16 w-16 shrink-0 rounded bg-muted text-primary"/><div className="min-w-0"><p className="mb-1 font-mono text-xs uppercase tracking-[.12em] text-annotation">Person dossier</p><h1 className="text-3xl font-semibold leading-tight [overflow-wrap:anywhere]">{person.displayName}</h1><p className="mt-2 text-sm text-muted-foreground">{person.fsId || "Research subject"} · {person.living?"Living":"Deceased"}</p></div></div>
      {person.creationProvenance?.evidenceStatus === "unsourced" && <Badge variant="outline" className="mt-3 border-annotation/40 bg-annotation-surface text-annotation">Starting statement · needs a source</Badge>}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">Birth</dt><dd className="mt-1 font-medium">{person.birth?.date?.original || "Unknown birth"}</dd>{person.birth?.place?.original && <dd className="mt-1 text-muted-foreground">{person.birth.place.original}</dd>}</div>
        <div><dt className="text-xs text-muted-foreground">Death</dt><dd className="mt-1 font-medium">{person.death?.date?.original || "Unknown death"}</dd>{person.death?.place?.original && <dd className="mt-1 text-muted-foreground">{person.death.place.original}</dd>}</div>
      </dl>
      <SafeAnchor href="#record-section-sources" className="inline-flex min-h-11 items-center text-xs text-primary underline">Compare source-backed candidates</SafeAnchor>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Operations status is the auto-inferred research view for this person.</p><div className="mt-1"><p className="text-base font-semibold">{operations.completionPercent}% research coverage</p><p className={`mt-1 text-sm ${critical?"text-annotation":"text-evidence"}`}>{critical?`${plural(critical,"critical gap","critical gaps")} to close`:"No critical gaps"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{operations.recommendedMissingCount} recommended gaps · {operations.staleChecksCount} stale checks</p></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">The vault pieces most useful to an AI story workflow.</p><dl className="mt-2 grid grid-cols-2 gap-x-4">{numbers.map(([label,count,section])=><div key={label} className="border-t border-border"><dt className="sr-only">{label}</dt><dd><SafeAnchor href={`#record-section-${section}`} className="flex min-h-11 items-center justify-between gap-2 text-xs text-primary"><span>{label}</span><span className="font-mono">{count}</span></SafeAnchor></dd></div>)}</dl>
      {person.creationProvenance?.method === "manual_first_start" && <p className="mt-3 border-l-2 border-annotation pl-3 text-sm leading-6 text-muted-foreground">Added privately by you as part of the first family connection. It is not treated as sourced evidence until a source is linked and reviewed.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><Button asChild className="min-h-11"><SafeLink href={`/app/people/${routeId}/ai`}>Run AI Analysis</SafeLink></Button><p className="w-full pt-1 text-xs text-muted-foreground">Context pack:</p><Button asChild variant="outline" size="sm" className="min-h-11 text-xs"><SafeAnchor href={`/api/people/${routeId}/context-pack?format=markdown`}>Download Context Pack</SafeAnchor></Button><Button asChild variant="outline" size="sm" className="min-h-11 text-xs"><SafeAnchor href={`/api/people/${routeId}/context-pack`}>Structured JSON</SafeAnchor></Button></div>
    </section>
  </>;
}
