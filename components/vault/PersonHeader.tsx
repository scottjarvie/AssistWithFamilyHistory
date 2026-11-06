import type { FunctionReturnType } from "convex/server";
import { SafeAnchor, SafeLink } from "@/components/layout/SafeLink";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import { DossierDetails } from "@/components/records/DossierDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { api } from "@/convex/_generated/api";

type PersonWorkspace = NonNullable<FunctionReturnType<typeof api.vaultReads.getPersonWorkspace>>;
const plural = (count:number,one:string,many:string) => `${count} ${count===1?one:many}`;
type PersonHeaderProps = {
  person:PersonWorkspace["person"];stats:PersonWorkspace["stats"];operations:Pick<PersonWorkspace["operations"],"completionPercent"|"requiredMissingCount"|"recommendedMissingCount"|"staleChecksCount">;routeId:string;researchTaskCount?:number;evidence?:Record<string,{count:number;conflict:boolean;target:string}>;connections?:{id:string;name:string;label:string;href:string}[];
};

/** Compact identity remains visible before phone Contents. Canonical details are not proven claims. */
export function PersonHeader({person,operations,evidence={}}:PersonHeaderProps) {
  const critical=operations.requiredMissingCount;
  return <>
    <SafeLink href="/app/people" className="mb-1 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m7 3-5 5 5 5 M2 8h12"/></svg>Back to People</SafeLink>
    <section className="rounded-lg border border-border bg-card p-3 lg:p-4">
      <div className="flex items-start gap-3"><ArchiveIllustration className="h-14 w-14 shrink-0 rounded bg-muted text-primary lg:h-16 lg:w-16"/><div className="min-w-0"><p className="mb-1 font-mono text-xs uppercase tracking-[.12em] text-annotation">Person dossier</p><h1 className="text-2xl font-semibold leading-tight [overflow-wrap:anywhere] lg:text-3xl">{person.displayName}</h1><p className="mt-1 text-sm text-muted-foreground">{person.fsId || "Research subject"} · {person.living?"Living":"Deceased"}</p></div></div>
      {person.creationProvenance?.evidenceStatus === "unsourced" && <Badge variant="outline" className="mt-2 border-annotation/40 bg-annotation-surface text-annotation">Starting statement · needs a source</Badge>}
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-2 text-sm"><div><dt className="text-xs text-muted-foreground">Birth</dt><dd className="mt-1 font-medium">{person.birth?.date?.original || "Unknown birth"}</dd></div><div><dt className="text-xs text-muted-foreground">Death</dt><dd className="mt-1 font-medium">{person.death?.date?.original || "Unknown death"}</dd></div></dl>
      {Object.values(evidence).some(value=>value.conflict)&&<p className="mt-2 text-sm text-annotation"><SafeAnchor href="#record-section-sources" className="underline">Conflicting source candidates need review</SafeAnchor></p>}
      <p className={`mt-2 text-sm ${critical?"text-annotation":"text-evidence"}`}>{critical?`${plural(critical,"critical gap","critical gaps")} to close`:"No critical gaps"}</p>
    </section>
  </>;
}

/** Full original detail/actions follow Contents on phones; remain expanded in the desktop dossier. */
export function PersonDossierDetails({person,stats,operations,routeId,researchTaskCount=0,evidence={},connections=[]}:PersonHeaderProps) {
  const numbers=[["Imports",stats.imports,"record-stream-imports"],["Context",stats.contextReports,"record-context"],["Research tasks",researchTaskCount,"record-section-research"]] as const;
  return <div className="mt-2 rounded-lg border border-border bg-card px-3 lg:mt-3 lg:p-4">
    <DossierDetails label="Places and source candidates">
      <h2 className="hidden font-sans text-sm font-semibold lg:block">Places and source candidates</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm lg:mt-3">{(["birth","death"] as const).map(kind=><div key={kind}><dt className="text-xs text-muted-foreground">{kind==="birth"?"Birth place":"Death place"}</dt><dd className="mt-1 text-muted-foreground">{person[kind]?.place?.original || "No place recorded"}</dd>{evidence[kind]?.count ? <dd><SafeAnchor href={`#${evidence[kind].target}`} className={`inline-flex min-h-11 items-center text-xs underline ${evidence[kind].conflict?"text-annotation":"text-primary"}`}>{evidence[kind].conflict?"Conflict to review":"Source candidates"} · {evidence[kind].count}</SafeAnchor></dd>:<dd className="mt-1 text-xs text-muted-foreground">No source candidate</dd>}</div>)}</dl>
      {Object.values(evidence).some(value=>value.count>0)&&<SafeAnchor href="#record-section-sources" className="inline-flex min-h-11 items-center text-xs text-primary underline">Compare source-backed candidates</SafeAnchor>}
      {person.creationProvenance?.method === "manual_first_start" && <p className="mt-3 border-l-2 border-annotation pl-3 text-sm leading-6 text-muted-foreground">Added privately by you as part of the first family connection. It is not treated as sourced evidence until a source is linked and reviewed.</p>}
    </DossierDetails>
    <DossierDetails label="Research coverage and connections">
      <p className="text-xs leading-5 text-muted-foreground">Operations status is the auto-inferred research view for this person.</p><p className="mt-1 text-base font-semibold">{operations.completionPercent}% research coverage</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{plural(operations.recommendedMissingCount,"recommended gap","recommended gaps")} · {plural(operations.staleChecksCount,"stale check","stale checks")}</p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Recorded imports, context and follow-up work.</p><dl className="mt-2 grid grid-cols-2 gap-x-4">{numbers.map(([label,count,section])=><div key={label} className="border-t border-border"><dt className="sr-only">{label}</dt><dd><SafeAnchor href={`#${section}`} className="flex min-h-11 items-center justify-between gap-2 text-xs text-primary"><span>{label}</span><span className="font-mono">{count}</span></SafeAnchor></dd></div>)}</dl>
      {connections.length>0&&<section className="mt-3 border-t border-border pt-3"><h2 className="font-sans text-sm font-semibold">Connections</h2>{connections.map(connection=><SafeLink key={connection.id} href={connection.href} className="flex min-h-11 items-center justify-between gap-2 text-sm text-primary"><span>{connection.name}</span><span className="text-xs text-muted-foreground">{connection.label}</span></SafeLink>)}</section>}
    </DossierDetails>
    <DossierDetails label="AI analysis and context-pack downloads"><div className="flex flex-wrap gap-2"><Button asChild className="min-h-11"><SafeLink href={`/app/people/${routeId}/ai`}>Run AI Analysis</SafeLink></Button><p className="w-full pt-1 text-xs text-muted-foreground">Context pack:</p><Button asChild variant="outline" size="sm" className="min-h-11 text-xs"><SafeAnchor href={`/api/people/${routeId}/context-pack?format=markdown`}>Download Context Pack</SafeAnchor></Button><Button asChild variant="outline" size="sm" className="min-h-11 text-xs"><SafeAnchor href={`/api/people/${routeId}/context-pack`}>Structured JSON</SafeAnchor></Button></div></DossierDetails>
  </div>;
}
