import { SafeLink as Link } from "@/components/layout/SafeLink";
import { Search, UserRound, FileText, Images, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "People",
  description: "Search the research vault by person, import status, and story depth.",
  path: "/app/people",
});

export const dynamic = "force-dynamic";

const PEOPLE_PAGE_SIZE = 50;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  // Cap how many rows we render. We request one extra row beyond the visible
  // window so we can tell whether a "Load more" link should appear without a
  // second query. Small vaults are unaffected (page 1 shows up to 50 people).
  const visibleCount = PEOPLE_PAGE_SIZE * page;

  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "People Explorer",
      "The people explorer needs the canonical research graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let people;

  try {
    people = await client.action(api.vaultReads.getPeopleExplorer, {
      vaultOwnerId,
      search: params.q || undefined,
      researchStatus:
        params.status === "not_started" ||
        params.status === "basic" ||
        params.status === "in_progress" ||
        params.status === "thorough" ||
        params.status === "complete"
          ? params.status
          : undefined,
      limit: visibleCount + 1,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const hasMore = people.length > visibleCount;
  const visiblePeople = hasMore ? people.slice(0, visibleCount) : people;
  const loadMoreParams = new URLSearchParams();
  if (params.q) loadMoreParams.set("q", params.q);
  if (params.status) loadMoreParams.set("status", params.status);
  loadMoreParams.set("page", String(page + 1));

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="secondary" className="mb-3">Research Vault</Badge>
          <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">People Explorer</h1>
          <p className="mt-2 max-w-2xl text-stone-500">
            Browse each ancestor as a living research workspace with sources, places, memories, documents, and AI context packs.
          </p>
        </div>
        <Button asChild className="bg-amber-700 hover:bg-amber-800">
          <Link href="/app/imports">Import FamilySearch Capture</Link>
        </Button>
      </div>

      <form className="mb-6 rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input name="q" defaultValue={params.q} placeholder="Search by name, FamilySearch ID, or years" className="pl-9" />
          </div>
          <select
            name="status"
            defaultValue={params.status || ""}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          >
            <option value="">All research states</option>
            <option value="not_started">Not started</option>
            <option value="basic">Basic</option>
            <option value="in_progress">In progress</option>
            <option value="thorough">Thorough</option>
            <option value="complete">Complete</option>
          </select>
          <Button type="submit" className="bg-stone-900 hover:bg-stone-800">Filter</Button>
        </div>
      </form>

      <div className="grid gap-5 xl:grid-cols-2">
        {visiblePeople.length === 0 ? (
          <Card className="col-span-full border-dashed">
            <CardContent className="py-14 text-center text-stone-500">
              No people match this filter yet. Try importing a FamilySearch capture or widening the search.
            </CardContent>
          </Card>
        ) : (
          visiblePeople.map((person) => (
            <Link key={String(person._id)} href={`/app/people/${person.routeId}`}>
              <Card className="h-full border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-xl text-stone-900">{person.displayName}</CardTitle>
                      <CardDescription className="mt-1">
                        {person.birth?.date?.year || "?"} to {person.death?.date?.year || "?"}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">{person.fsId || "No FS ID"}</Badge>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-400">
                        {person.researchStatus.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-stone-50 px-3 py-3">
                      <p className="text-stone-500">Sources</p>
                      <p className="mt-1 text-lg font-semibold text-stone-900">{person.stats.sources}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 px-3 py-3">
                      <p className="text-stone-500">Imports</p>
                      <p className="mt-1 text-lg font-semibold text-stone-900">{person.stats.imports}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 px-3 py-3">
                      <div className="flex items-center gap-2 text-stone-500">
                        <Images className="h-4 w-4" />
                        <span>Memories</span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-stone-900">{person.stats.memories}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 px-3 py-3">
                      <div className="flex items-center gap-2 text-stone-500">
                        <FileText className="h-4 w-4" />
                        <span>Documents</span>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-stone-900">{person.stats.documents}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
                    <span>{person.latestImport ? new Date(person.latestImport.importedAt).toLocaleDateString() : "No imports yet"}</span>
                    <div className="flex items-center gap-1 text-amber-700">
                      <Sparkles className="h-4 w-4" />
                      <span>{person.stats.stories} story outputs</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/app/people?${loadMoreParams.toString()}`}>Load more people</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
