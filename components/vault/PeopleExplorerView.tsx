import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ArrowRight, Plus, Search } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { api } from "@/convex/_generated/api";

export type PeopleExplorerRow = FunctionReturnType<typeof api.vaultReads.getPeopleExplorer>[number];

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** People list: search first, then one compact row per person so a phone shows several at once. */
export function PeopleExplorerView({
  people,
  firstStartEligible,
  query,
  status,
  loadMoreHref,
}: {
  people: PeopleExplorerRow[];
  firstStartEligible: boolean;
  query?: string;
  status?: string;
  loadMoreHref: string | null;
}) {
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">People</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500 sm:text-base">
            Each ancestor is a research workspace with sources, places, memories, documents, and AI context packs.
          </p>
        </div>
        {firstStartEligible ? (
          <Button asChild className="min-h-11 bg-[#234d5e] hover:bg-[#173c49]">
            <Link href="/app/people/new"><Plus className="mr-2 h-4 w-4" /> Start with two people</Link>
          </Button>
        ) : (
          <Button asChild className="min-h-11 bg-amber-700 hover:bg-amber-800">
            <Link href="/app/imports">Import FamilySearch Capture</Link>
          </Button>
        )}
      </div>

      <form role="search" aria-label="Find people" className="mb-5 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <Input
            name="q"
            defaultValue={query}
            aria-label="Search people"
            placeholder="Search by name, FamilySearch ID, or years"
            className="h-11 bg-white pl-9 md:h-10"
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:contents">
          <select
            name="status"
            aria-label="Research state"
            defaultValue={status || ""}
            className="h-11 rounded-md border border-stone-200 bg-white px-3 text-base text-stone-700 md:h-10 md:text-sm"
          >
            <option value="">All research states</option>
            <option value="not_started">Not started</option>
            <option value="basic">Basic</option>
            <option value="in_progress">In progress</option>
            <option value="thorough">Thorough</option>
            <option value="complete">Complete</option>
          </select>
          <Button type="submit" className="h-11 bg-stone-900 hover:bg-stone-800 md:h-10">Filter</Button>
        </div>
      </form>

      {people.length === 0 ? (
        <div className="border border-dashed border-stone-300 bg-white px-4 py-12 text-center text-stone-500">
          {firstStartEligible ? (
            <>
              <p>No people are here yet. Begin privately with two people and one known relationship.</p>
              <Button asChild className="mt-5 min-h-11 bg-[#234d5e] hover:bg-[#173c49]">
                <Link href="/app/people/new">Start your first connection</Link>
              </Button>
            </>
          ) : (
            <p>No people match this filter. Widen the search or clear the research-state filter.</p>
          )}
        </div>
      ) : (
        <ul className="grid gap-px overflow-hidden border border-stone-200 bg-stone-200 shadow-sm xl:grid-cols-2">
          {people.map((person) => (
            <li key={String(person._id)} className="bg-white">
              <Link
                href={`/app/people/${person.routeId}`}
                className="flex h-full items-start justify-between gap-3 px-4 py-3 transition hover:bg-amber-50/50 sm:px-5 sm:py-4"
              >
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-snug text-stone-900">{person.displayName}</p>
                  <p className="mt-0.5 text-sm text-stone-600">
                    {person.birth?.date?.year || "?"} to {person.death?.date?.year || "?"}
                    <span className="capitalize"> · {person.researchStatus.replace(/_/g, " ")}</span>
                  </p>
                  {person.creationProvenance?.evidenceStatus === "unsourced" ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">Starting statement · needs a source</p>
                  ) : null}
                  <p className="mt-1.5 text-xs leading-5 text-stone-500">
                    {plural(person.stats.sources, "source", "sources")} · {plural(person.stats.imports, "import", "imports")} ·{" "}
                    {plural(person.stats.memories, "memory", "memories")} · {plural(person.stats.documents, "document", "documents")} ·{" "}
                    {plural(person.stats.stories, "story output", "story outputs")}
                  </p>
                  <p className="text-xs leading-5 text-stone-400">
                    {person.latestImport ? `Last import ${new Date(person.latestImport.importedAt).toLocaleDateString()}` : "No imports yet"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{person.living ? "Living" : "Deceased"}</Badge>
                  <ArrowRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {loadMoreHref ? (
        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={loadMoreHref}>Load more people</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
