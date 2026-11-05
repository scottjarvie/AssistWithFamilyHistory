import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ArrowRight, BookOpen, Database, FileUp, Sparkles, TableProperties, UsersRound } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import type { api } from "@/convex/_generated/api";

export type DashboardSummary = FunctionReturnType<typeof api.vaultReads.getDashboardSummary>;

const workflowStations = [
  {
    title: "Intake",
    description: "Bring in FamilySearch captures and preserve the raw material before it gets interpreted.",
    href: "/app/imports",
    icon: FileUp,
  },
  {
    title: "Vault",
    description: "Organize people, places, events, sources, memories, and documents into one research graph.",
    href: "/app/people",
    icon: Database,
  },
  {
    title: "Research",
    description: "Work gaps and readiness checks so a story is built from evidence, not wishful thinking.",
    href: "/app/operations",
    icon: TableProperties,
  },
  {
    title: "Stories",
    description: "Review drafts, publish intentionally, and keep the narrative tied to its supporting data.",
    href: "/app/stories",
    icon: BookOpen,
  },
];

function lifeYears(person: { birth?: { date?: { year?: number } }; death?: { date?: { year?: number } } }) {
  return `${person.birth?.date?.year || "?"} to ${person.death?.date?.year || "?"}`;
}

/** The signed-in dashboard: what to pick up first, then the numbers, then the map of the workspace. */
export function DashboardView({ summary }: { summary: DashboardSummary }) {
  const isEmptyWorkspace = summary.firstStartEligible;

  return (
    <div className="p-4 sm:p-8">
      {isEmptyWorkspace ? (
        <section className="border border-border bg-[#1f2f35] px-6 py-8 text-white shadow-[0_24px_60px_rgba(28,25,23,0.18)] sm:px-8">
          <Badge className="mb-4 bg-white/10 text-white hover:bg-white/10">Your private workspace is ready</Badge>
          <h1 className="max-w-3xl font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight sm:text-5xl">
            Begin with someone you know. Build the evidence from there.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-200 sm:text-base">
            Your workspace is empty and private. Start with two people and one known connection. Sources, dates, places, and stories can grow around them when you are ready.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="min-h-11 bg-amber-600 text-white hover:bg-amber-500">
              <Link href="/app/people/new">
                <UsersRound className="mr-2 h-4 w-4" />
                Add your first connection
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/ai">
                <Sparkles className="mr-2 h-4 w-4" />
                Connect your AI
              </Link>
            </Button>
          </div>
          <div className="mt-3">
            <Link href="/app/imports" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-stone-200 underline decoration-white/30 underline-offset-4 hover:text-white">
              <FileUp className="h-4 w-4" /> Or bring in a capture you have reviewed
            </Link>
          </div>
          <p className="mt-5 max-w-2xl border-l border-amber-400/45 pl-4 text-xs leading-6 text-stone-300">
            Nothing is imported, researched, or published automatically. You choose what enters this family workspace and what may leave it.
          </p>
        </section>
      ) : (
        <>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-[.16em] text-primary">Your research desk</p>
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                Your family workspace
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Pick up a person, work a research gap, or move a finished draft into Story Studio.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href="/app/stories">
                  Open Story Studio
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/app/operations">Work Research Queue</Link>
              </Button>
            </div>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section aria-labelledby="recent-people-title" className="folio-tray">
              <div className="folio-tray-heading flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <h2 id="recent-people-title" className="text-lg font-semibold text-foreground">Pick up where you left off</h2>
                <Link href="/app/people" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
                  All people <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              {summary.recentPeople.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                  No people yet. <Link href="/app/people/new" className="font-medium text-primary underline underline-offset-4">Add a person</Link> or bring in a capture from Imports.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {summary.recentPeople.map((person) => (
                    <li key={String(person._id)}>
                      <Link
                        href={`/app/people/${person.routeId}`}
                        className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/60 sm:px-5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ArchiveIllustration className="h-14 w-14 shrink-0 rounded-sm bg-muted text-primary" />
                          <div>
                          <p className="font-medium text-foreground">{person.displayName}</p>
                          <p className="text-sm text-muted-foreground">
                            {lifeYears(person)}
                            <span className="capitalize"> · {person.researchStatus.replace(/_/g, " ")}</span>
                            {person.operations.requiredMissingCount > 0 ? (
                              <span className="text-primary">
                                {" "}· {person.operations.requiredMissingCount} critical {person.operations.requiredMissingCount === 1 ? "gap" : "gaps"}
                              </span>
                            ) : null}
                          </p>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-6">
              <section aria-label="Workspace counts" className="grid grid-cols-3 folio-tray">
                {[
                  ["People", summary.counts.people, "/app/people"],
                  ["Places", summary.counts.places, "/app/places"],
                  ["Stories", summary.counts.stories, "/app/stories"],
                  ["Imports", summary.counts.imports, "/app/imports"],
                  ["Documents", summary.counts.documents, "/app/people"],
                  ["Open tasks", summary.counts.openTasks, "/app/research"],
                ].map(([label, value, href], index) => (
                  <Link
                    href={String(href)}
                    key={label}
                    className={`px-3 py-3 sm:px-4 ${index % 3 !== 0 ? "border-l border-border" : ""} ${index >= 3 ? "border-t border-border" : ""}`}
                  >
                    <p className="text-2xl font-semibold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </Link>
                ))}
              </section>

              <section aria-labelledby="recent-imports-title" className="folio-tray">
                <div className="folio-tray-heading px-4 py-3 sm:px-5">
                  <h2 id="recent-imports-title" className="text-lg font-semibold text-foreground">Recent imports</h2>
                  <p className="text-sm text-muted-foreground">Latest FamilySearch captures merged into the vault.</p>
                </div>
                {summary.recentImports.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
                    No imports yet. Start with a FamilySearch capture in the <Link href="/app/imports" className="font-medium text-primary underline underline-offset-4">Imports workspace</Link>.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {summary.recentImports.map((run) => (
                      <li key={String(run._id)}>
                        <Link
                          href={run.personRouteId ? `/app/people/${run.personRouteId}` : "/app/imports"}
                          className="flex min-h-14 items-start justify-between gap-3 px-4 py-3 transition hover:bg-muted/60 sm:px-5"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{run.personName}</p>
                            <p className="text-sm text-muted-foreground">
                              {run.pageTypes.join(" + ")} import · {new Date(run.importedAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant={run.mergeStatus === "partial" ? "destructive" : "secondary"}>{run.mergeStatus}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      <section aria-labelledby="workspace-map-title" className="mt-8">
        <h2 id="workspace-map-title" className="text-lg font-semibold text-foreground">Everything in your workspace</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {workflowStations.map((item) => (
            <li key={item.title}>
              <Link
                href={item.href}
                className="folio-tray flex h-full items-start gap-3 px-4 py-4 transition hover:border-primary/40 hover:bg-muted/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{item.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.description}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        {!isEmptyWorkspace ? (
          <p className="mt-4 flex max-w-3xl gap-2 text-sm leading-6 text-muted-foreground">
            <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">AI context packs.</span> Every person page can export a Markdown or JSON context pack built from sources, memories, places, relationships, and open research gaps, ready for story-writing or research agents. The staged AI analysis flow stays available inside each person.
            </span>
          </p>
        ) : null}
      </section>
    </div>
  );
}
