import type { Metadata } from "next";
import { ArrowRight, Beaker, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Timeline",
  description: "Synthesize a person's events and contextual reports into a research or story timeline.",
  path: "/app/timeline",
});

// Placeholder for GEN-24 (Timeline Builder). The sidebar shows this with a
// "Coming Soon" badge and `comingSoon: true` should preventDefault navigation,
// but the link still resolved publicly — better to land here than 404.
export default function TimelinePlaceholderPage() {
  return (
    <div className="p-4 sm:p-8">
      <section className="border border-stone-200 bg-white px-6 py-7 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Coming soon
            </Badge>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-stone-950 sm:text-5xl">
              Timeline Builder
            </h1>
            <p className="mt-3 max-w-3xl text-stone-600">
              The Timeline Builder will synthesize a person&apos;s events, places, and reviewed
              context reports into a chronological view — useful for finding research gaps and
              telling a life as a sequence of sourced events.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-stone-500">
              <Badge variant="outline">GEN-24</Badge>
              <Badge variant="outline">area:story-studio</Badge>
              <Badge variant="outline">area:vault</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 border border-stone-200">
            <div className="border-r border-stone-200 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Status</p>
              <p className="mt-2 text-lg font-semibold text-stone-950">In design</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Track</p>
              <p className="mt-2 text-lg font-semibold text-stone-950">Backlog</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>What this will do</CardTitle>
            <CardDescription>The intended first cut.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Pull every event with a date from the person workspace, sort chronologically, and
              annotate each with the source citation and any overlapping reviewed historical
              context report.
            </p>
            <p>
              Highlight gaps where there&apos;s a long stretch between events with no supporting
              source, so the operator knows where to dig next.
            </p>
            <p>Two modes under consideration:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>Research mode — emphasises gaps and missing-evidence prompts.</li>
              <li>Story mode — emphasises narrative arc for the writer.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>What it won&apos;t do (yet)</CardTitle>
            <CardDescription>Scoped out to keep the first version honest.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-stone-600">
            <ul className="ml-5 list-disc space-y-1">
              <li>No interactive editing — read-only view.</li>
              <li>No public-facing timeline page until publish-safety gates land.</li>
              <li>No automatic event creation from AI; only existing sourced events.</li>
              <li>No multi-person comparison view.</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 border border-dashed border-stone-300 bg-stone-50 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <Beaker className="h-4 w-4 text-amber-700" />
            <span>Want to influence the design? See the Timeline Builder proposal document.</span>
          </div>
          <Button asChild variant="outline">
            <Link href="/app/experiments">
              Experiments lab
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
