import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ArrowRight, BookOpen, Database, FileUp, Sparkles, TableProperties, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPageMetadata } from "@/lib/seo";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Workspace",
  description: "Navigate your research vault, imports, places, and AI-ready context packs.",
  path: "/app",
});

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Dashboard",
      "The dashboard needs the canonical people, places, imports, and context-pack graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let summary;

  try {
    summary = await client.action(api.vaultReads.getDashboardSummary, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const isEmptyWorkspace = summary.firstStartEligible;

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

  return (
    <div className="p-4 sm:p-8">
      <section className="relative overflow-hidden border border-stone-200 bg-[#1f2f35] px-6 py-8 text-white shadow-[0_24px_60px_rgba(28,25,23,0.18)] sm:px-8">
        <Badge className="mb-4 bg-white/10 text-white hover:bg-white/10">
          {isEmptyWorkspace ? "Your private workspace is ready" : "Story-first research workspace"}
        </Badge>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            {isEmptyWorkspace ? (
              <>
                <h1 className="max-w-3xl font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight sm:text-5xl">
                  Begin with someone you know. Build the evidence from there.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-200 sm:text-base">
                  Your workspace is empty and private. Start with two people and one known connection. Sources, dates, places, and stories can grow around them when you are ready.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild className="bg-amber-600 text-white hover:bg-amber-500">
                    <Link href="/app/people/new">
                      <UsersRound className="mr-2 h-4 w-4" />
                      Add your first connection
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
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
              </>
            ) : (
              <>
                <h1 className="max-w-3xl font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight sm:text-5xl">
                  Collect the operating data, understand the context, then tell the story well.
                </h1>
                <p className="mt-4 max-w-2xl text-sm text-stone-200 sm:text-base">
                  This dashboard is the working room: intake records, build the vault, chase the research gaps, and move finished drafts into Story Studio for review and explicit publishing.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild className="bg-amber-600 text-white hover:bg-amber-500">
                    <Link href="/app/stories">
                      Open Story Studio
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                    <Link href="/app/operations">Work Research Queue</Link>
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ["People", summary.counts.people],
              ["Places", summary.counts.places],
              ["Stories", summary.counts.stories],
              ["Imports", summary.counts.imports],
              ["Documents", summary.counts.documents],
              ["Open Tasks", summary.counts.openTasks],
            ].map(([label, value]) => (
              <div key={label} className="border border-white/10 bg-white/6 px-4 py-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-300">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-5 md:grid-cols-2">
          {workflowStations.map((item) => (
            <Card key={item.title} className="border-stone-200 bg-white/90 shadow-sm">
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                  <item.icon className="h-5 w-5" />
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={item.href}>
                    Open
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-stone-200 bg-white/90 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Recent Imports</CardTitle>
              <CardDescription>Latest FamilySearch captures merged into the vault.</CardDescription>
            </div>
            <Database className="h-5 w-5 text-stone-400" />
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentImports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">
                No imports yet. Start with a FamilySearch capture in the Imports workspace.
              </div>
            ) : (
              summary.recentImports.map((run) => (
                <Link
                  key={String(run._id)}
                  href={run.personRouteId ? `/app/people/${run.personRouteId}` : "/app/imports"}
                  className="block rounded-2xl border border-stone-200 px-4 py-4 transition hover:border-amber-300 hover:bg-amber-50/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">{run.personName}</p>
                      <p className="text-sm text-stone-500">{run.pageTypes.join(" + ")} import</p>
                    </div>
                    <Badge variant={run.mergeStatus === "partial" ? "destructive" : "secondary"}>
                      {run.mergeStatus}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-stone-400">
                    {new Date(run.importedAt).toLocaleString()}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="border-stone-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Recently Updated People</CardTitle>
            <CardDescription>Pick up where the latest research left off.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentPeople.map((person) => (
              <Link
                key={String(person._id)}
                href={`/app/people/${person.routeId}`}
                className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/40"
              >
                <div>
                  <p className="font-medium text-stone-900">{person.displayName}</p>
                  <p className="text-sm text-stone-500">
                    {person.birth?.date?.year || "?"} to {person.death?.date?.year || "?"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-stone-400" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-gradient-to-br from-white to-amber-50/50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-700" />
              <CardTitle>AI Context Packs</CardTitle>
            </div>
            <CardDescription>
              Every person workspace now feeds an agent-ready package built from sources, memories, places, relationships, and open research gaps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-stone-600">
              Use the person workspace to export structured JSON or Markdown context packs before running deeper story-writing or research agents. The staged AI analysis flow remains available as a derived-output tool inside each person.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
