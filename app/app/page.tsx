import Link from "next/link";
import { ArrowRight, Compass, Database, FileUp, MapPinned, Sparkles, TableProperties } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPageMetadata } from "@/lib/seo";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getConvexClient,
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

  const client = getConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let summary;

  try {
    summary = await client.query(api.vault.getDashboardSummary, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const quickLinks = [
    {
      title: "People Explorer",
      description: "Browse imported ancestors, their source depth, and the latest research activity.",
      href: "/app/people",
      icon: Compass,
    },
    {
      title: "Imports",
      description: "Bring FamilySearch captures into the vault and track merge history.",
      href: "/app/imports",
      icon: FileUp,
    },
    {
      title: "Operations",
      description: "Work the full research queue across people, provisional relatives, and missing record coverage.",
      href: "/app/operations",
      icon: TableProperties,
    },
    {
      title: "Places",
      description: "Move from a person to the towns, counties, parishes, and countries shaping their story.",
      href: "/app/places",
      icon: MapPinned,
    },
  ];

  return (
    <div className="p-4 sm:p-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-[radial-gradient(circle_at_top_left,_rgba(180,83,9,0.18),_transparent_35%),linear-gradient(135deg,_#1f2937,_#111827_65%,_#292524)] px-6 py-8 text-white shadow-[0_30px_80px_rgba(28,25,23,0.22)] sm:px-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(135deg,transparent,rgba(245,158,11,0.1),transparent)] md:block" />
        <Badge className="mb-4 bg-white/10 text-white hover:bg-white/10">Research Vault V1</Badge>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <h1 className="max-w-3xl font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight sm:text-5xl">
              A workspace for evidence, places, memories, and AI-ready family stories.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-stone-200 sm:text-base">
              Import FamilySearch captures, organize them into a research graph, and assemble context packs that give AI enough material to write better stories, plans, and books.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="bg-amber-600 text-white hover:bg-amber-500">
                <Link href="/app/imports">
                  Open Imports
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link href="/app/people">Browse People</Link>
              </Button>
            </div>
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
              <div key={label} className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-300">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-5 md:grid-cols-3">
          {quickLinks.map((item) => (
            <Card key={item.title} className="border-stone-200 bg-white/90 shadow-sm">
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
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
                <div key={String(run._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
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
                </div>
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
                href={`/app/people/${person.fsId || person._id}`}
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
