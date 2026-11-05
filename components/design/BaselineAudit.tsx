import {SafeLink as Link} from "@/components/layout/SafeLink";
import {AlertTriangle,ArrowRight,Database,FileSearch,Landmark,ScrollText,type LucideIcon} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";
import type {auditFixture} from "./auditFixture";
const workflowLabels:Record<string,string>={needs_genealogy_evidence:"Needs genealogy evidence",needs_context_research:"Needs context research",ready_to_draft:"Ready to draft",ready_to_review:"Ready to review",published:"Published"};
/** Original Audit route JSX, reconstructed with invented data/current shared runtime. */
export function BaselineAudit({audit}:{audit:ReturnType<typeof auditFixture>["legacy"]}) {
  return (
    <div className="p-4 sm:p-8">
      <section className="mb-8 border border-stone-200 bg-white px-6 py-7 shadow-sm">
        <Badge variant="secondary" className="mb-4">Convex vault audit</Badge>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-stone-950 sm:text-5xl">
              Find the data gaps before writing the story.
            </h1>
            <p className="mt-3 max-w-3xl text-stone-600">
              This audit reads the canonical Convex vault and separates operating genealogy data from the contextual research needed for stronger ancestor stories.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Button asChild className="bg-amber-700 hover:bg-amber-800">
              <Link href="/app/operations">Work Queue</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/places">Add Context</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          { label: "People", value: audit.counts.people, Icon: Database },
          { label: "Sources/Citations", value: `${audit.counts.sources}/${audit.counts.citations}`, Icon: ScrollText },
          { label: "Context Reports", value: audit.counts.historicalContext, Icon: Landmark },
          { label: "Stories", value: `${audit.counts.stories} (${audit.counts.publishedStories} public)`, Icon: FileSearch },
        ] satisfies Array<{ label: string; value: string | number; Icon: LucideIcon }>).map(({ label, value, Icon }) => (
          <Card key={label} className="border-stone-200">
            <CardContent className="py-5">
              <Icon className="h-5 w-5 text-amber-700" />
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-stone-400">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
              Major Gaps
            </CardTitle>
            <CardDescription>Counts that should drive the next research pass.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["People without sources", audit.gaps.peopleWithoutSources],
              ["People without context", audit.gaps.peopleWithoutContext],
              ["People without stories", audit.gaps.peopleWithoutStories],
              ["Places without context", audit.gaps.placesWithoutContext],
              ["Open research tasks", audit.gaps.openResearchTasks],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between border border-stone-200 px-4 py-3">
                <p className="text-sm text-stone-600">{label}</p>
                <p className="font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Story Workflow Distribution</CardTitle>
            <CardDescription>Where people sit in the path from data to context to published story.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Object.entries(workflowLabels).map(([key, label]) => (
              <Link
                key={key}
                href={`/app/operations?storyWorkflow=${key}`}
                className="border border-stone-200 px-4 py-4 transition hover:border-amber-300 hover:bg-amber-50/40"
              >
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{audit.storyWorkflowCounts[key] || 0}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Priority People</CardTitle>
            <CardDescription>Closest candidates for drafting or review after current evidence and context gaps are addressed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.priorityPeople.length === 0 ? (
              <p className="text-sm text-stone-500">No candidate people found in this vault yet.</p>
            ) : (
              audit.priorityPeople.map((person) => (
                <Link
                  key={String(person._id)}
                  href={`/app/people/${person.routeId}`}
                  className="grid gap-3 border border-stone-200 px-4 py-4 transition hover:border-amber-300 hover:bg-amber-50/30 md:grid-cols-[1fr_160px_120px_24px] md:items-center"
                >
                  <div>
                    <p className="font-medium text-stone-900">{person.displayName}</p>
                    <p className="text-sm text-stone-500">{workflowLabels[person.storyWorkflow]}</p>
                  </div>
                  <p className="text-sm text-stone-600">{person.sourceCount} sources · {person.contextReportCount} context</p>
                  <p className="text-sm font-medium text-stone-900">{person.completionPercent}% ready</p>
                  <ArrowRight className="h-4 w-4 text-stone-400" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
