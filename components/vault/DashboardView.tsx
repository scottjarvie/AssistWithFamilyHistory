import { SafeLink as Link } from "@/components/layout/SafeLink";
import type { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import { UtcDate } from "@/components/design/UtcDate";
import { FolioTray } from "@/components/design/FolioTray";
import type { api } from "@/convex/_generated/api";

export type DashboardSummary = FunctionReturnType<typeof api.vaultReads.getDashboardSummary>;

const workflowStations = [
  { title: "Intake", description: "Bring in FamilySearch captures and preserve the raw material before it gets interpreted.", href: "/app/imports" },
  { title: "Vault", description: "Organize people, places, events, sources, memories, and documents into one research graph.", href: "/app/people" },
  { title: "Research", description: "Work gaps and readiness checks so a story is built from evidence, not wishful thinking.", href: "/app/operations" },
  { title: "Stories", description: "Review drafts, publish intentionally, and keep the narrative tied to its supporting data.", href: "/app/stories" },
];

function lifeYears(person: { birth?: { date?: { year?: number } }; death?: { date?: { year?: number } } }) {
  return `${person.birth?.date?.year || "?"} to ${person.death?.date?.year || "?"}`;
}

/** A desk of evidence-first trays, backed only by the existing dashboard summary. */
export function DashboardView({ summary }: { summary: DashboardSummary }) {
  const isEmptyWorkspace = summary.firstStartEligible;
  const gaps = summary.operationsHighlights.filter((person) => person.operations.requiredMissingCount > 0);
  return <div className="min-w-0 p-4 sm:p-8">
    {isEmptyWorkspace ? <section className="rounded-lg border border-primary/30 bg-primary px-6 py-6 text-primary-foreground sm:px-8 sm:py-8">
      <Badge className="mb-4 border-current/20 bg-transparent text-inherit">Your private workspace is ready</Badge>
      <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">Begin with someone you know. Build the evidence from there.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 sm:text-base">Your workspace is empty and private. Start with two people and one known connection. Sources, dates, places, and stories can grow around them when you are ready.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild className="min-h-11 bg-card text-card-foreground hover:bg-card/90"><Link href="/app/people/new">Add your first connection <span aria-hidden="true">→</span></Link></Button>
        <Button asChild variant="outline" className="min-h-11 border-current/30 bg-transparent text-inherit hover:bg-background/10 hover:text-inherit"><Link href="/ai">Connect your AI</Link></Button>
      </div>
      <Link href="/app/imports" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Or bring in a capture you have reviewed</Link>
      <p className="mt-4 max-w-2xl border-l border-current/40 pl-4 text-sm leading-6">Nothing is imported, researched, or published automatically. You choose what enters this family workspace and what may leave it.</p>
    </section> : <>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[.16em] text-annotation">Your research desk</p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Your family workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Pick up a person, work a research gap, or move a finished draft into Story Studio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11"><Link href="/app/people">Find a person <span aria-hidden="true">→</span></Link></Button>
          <Button asChild variant="outline" className="min-h-11"><Link href="/app/operations">Work Research Queue</Link></Button>
          <Button asChild variant="outline" className="min-h-11"><Link href="/app/stories">Open Story Studio</Link></Button>
        </div>
      </header>

      <div className="research-desk mt-8 grid gap-6 lg:grid-cols-3">
        <FolioTray id="recent-people-title" title="Recently touched" count={summary.counts.people} countLabel="people" href="/app/people" linkLabel="All people" className="lg:col-span-2">
          <p className="px-4 pb-3 text-sm text-muted-foreground">Pick up where you left off. People and the evidence around them.</p>
          {summary.recentPeople.length ? <ul className="divide-y divide-border">
            {summary.recentPeople.map((person) => <li key={String(person._id)}>
              <Link href={`/app/people/${person.routeId}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary">
                <ArchiveIllustration className="h-10 w-10 shrink-0 rounded-sm bg-muted text-primary" />
                <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  <p className="font-medium">{person.displayName}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{lifeYears(person)} <span className="capitalize"> · {person.researchStatus.replace(/_/g, " ")}</span></p>
                  {person.operations.requiredMissingCount > 0 && <p className="mt-1 text-sm text-annotation">{person.operations.requiredMissingCount} critical {person.operations.requiredMissingCount === 1 ? "gap" : "gaps"}</p>}
                </div><span aria-hidden="true" className="text-primary">→</span>
              </Link>
            </li>)}
          </ul> : <p className="px-4 pb-5 text-sm text-muted-foreground">No people yet. <Link href="/app/people/new" className="text-primary underline">Add a person</Link> or bring in a capture from Imports.</p>}
        </FolioTray>

        <FolioTray id="research-tray-title" title="Research gaps" count={summary.counts.openTasks} countLabel="open tasks" href="/app/operations" linkLabel="Work the Research Queue">
          <p className="px-4 pb-3 text-sm text-muted-foreground">Source-backed research before the next story. These people have critical gaps.</p>
          {gaps.length ? <ul className="divide-y divide-border">{gaps.map((person) => <li key={String(person._id)}>
            <Link href={`/app/people/${person.routeId}`} className="block px-4 py-3 hover:bg-muted/50"><span className="block break-words font-medium">{person.displayName}</span><span className="mt-1 block text-sm text-annotation">{person.operations.requiredMissingCount} critical {person.operations.requiredMissingCount === 1 ? "gap" : "gaps"}</span></Link>
          </li>)}</ul> : <p className="px-4 pb-4 text-sm text-muted-foreground">No critical gaps in the current highlights. The full queue keeps every research check.</p>}
          <Link href="/app/research" className="mx-4 mb-4 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Open tasks and research log</Link>
          {summary.counts.provisionalRelatives > 0 && <p className="mx-4 mb-4 border-l-2 border-annotation pl-3 text-sm text-annotation">{summary.counts.provisionalRelatives} provisional relatives await review in Research Queue. Connections remain provisional until reviewed.</p>}
        </FolioTray>

        <FolioTray id="ai-tray-title" title="With your AI" href="/app/queue" linkLabel="Open your Queue" className="lg:col-span-2">
          <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">AI context packs.</strong> Every person page can export a Markdown or JSON context pack built from sources, memories, places, relationships, and open research gaps, ready for story-writing or research agents. The staged AI analysis flow stays available inside each person.</p>
          <p className="px-4 pb-4 text-sm text-muted-foreground">Your Queue keeps the handoff visible. <Link href="/app/settings/ai" className="text-primary underline underline-offset-4">Inspect AI connections and permissions</Link>.</p>
        </FolioTray>

        <FolioTray id="recent-imports-title" title="Recent imports" count={summary.counts.imports} countLabel="imports stored" href="/app/imports" linkLabel="Imports workspace">
          <p className="px-4 pb-3 text-sm text-muted-foreground">Latest FamilySearch captures merged into the vault.</p>
          {summary.recentImports.length ? <ul className="divide-y divide-border">{summary.recentImports.map((run) => <li key={String(run._id)}>
            <Link href={run.personRouteId ? `/app/people/${run.personRouteId}` : "/app/imports"} className="flex items-start justify-between gap-2 px-4 py-3 hover:bg-muted/50">
              <div className="min-w-0 break-words [overflow-wrap:anywhere]"><p className="font-medium">{run.personName}</p><p className="mt-1 text-sm text-muted-foreground">{run.pageTypes.join(" + ")} import · <UtcDate value={run.importedAt} withTime/></p></div>
              <Badge variant={run.mergeStatus === "partial" ? "destructive" : "secondary"}>{run.mergeStatus}</Badge>
            </Link>
          </li>)}</ul> : <p className="px-4 pb-4 text-sm text-muted-foreground">{summary.counts.imports ? "No recent imports to show." : "No imports yet."} Start with a reviewed FamilySearch capture in the Imports workspace.</p>}
        </FolioTray>

        <FolioTray id="stories-tray-title" title="Stories" count={summary.counts.stories} countLabel="stories" href="/app/stories" linkLabel="Open Story Studio">
          <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">Review drafts, publish intentionally, and keep the narrative tied to its supporting data.</p>
          <Link href="/app/story-writer" className="mx-4 mb-4 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Choose a person for Story Writer</Link>
        </FolioTray>
        <FolioTray id="places-tray-title" title="Places" count={summary.counts.places} countLabel="places" href="/app/places" linkLabel="Explore places">
          <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">Follow the places connected to people, events, sources, and historical context.</p>
        </FolioTray>
        <FolioTray id="documents-tray-title" title="Documents" count={summary.counts.documents} countLabel="documents" href="/app/people" linkLabel="Browse document counts by person">
          <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">Documents live with their people. Open a person’s Documents section to inspect the preserved material and its context.</p>
        </FolioTray>
      </div>
    </>}

    <section aria-labelledby="workspace-map-title" className="mt-8 border-t border-border pt-5">
      <h2 id="workspace-map-title" className="text-xl font-semibold">Everything in your workspace</h2>
      <dl className="mt-3 divide-y divide-border">{workflowStations.map((item) => <div key={item.title} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
        <dt><Link href={item.href} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">{item.title}<span aria-hidden="true">→</span></Link></dt>
        <dd className="self-center text-sm leading-6 text-muted-foreground">{item.description}</dd>
      </div>)}</dl>
    </section>
  </div>;
}
