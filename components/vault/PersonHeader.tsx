import { ArrowLeft, Download } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { SafeAnchor, SafeLink } from "@/components/layout/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { api } from "@/convex/_generated/api";

type PersonWorkspace = NonNullable<FunctionReturnType<typeof api.vaultReads.getPersonWorkspace>>;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Person page summary: who this is, where the research stands, then the actions. */
export function PersonHeader({
  person,
  stats,
  operations,
  routeId,
}: {
  person: PersonWorkspace["person"];
  stats: PersonWorkspace["stats"];
  operations: Pick<PersonWorkspace["operations"], "completionPercent" | "requiredMissingCount">;
  routeId: string;
}) {
  const criticalGaps = operations.requiredMissingCount;

  return (
    <>
      <SafeLink
        href="/app/people"
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-stone-500 hover:text-stone-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to People
      </SafeLink>

      <section className="border border-stone-200 bg-white px-4 py-5 shadow-sm sm:px-8 sm:py-6">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{person.fsId || "Research subject"}</Badge>
          <Badge variant="outline">{person.living ? "Living" : "Deceased"}</Badge>
          {person.creationProvenance?.evidenceStatus === "unsourced" ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Starting statement · needs a source</Badge>
          ) : null}
        </div>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-stone-900 sm:text-5xl">
          {person.displayName}
        </h1>
        <p className="mt-2 max-w-3xl text-stone-600">
          {person.birth?.date?.original || "Unknown birth"} {person.birth?.place?.original ? `· ${person.birth.place.original}` : ""}
          {"  "}
          {person.death?.date?.original ? `to ${person.death.date.original}` : ""}
          {person.death?.place?.original ? ` · ${person.death.place.original}` : ""}
        </p>

        <p className="mt-4 text-base font-medium text-stone-900">
          {operations.completionPercent}% research coverage
          <span className={criticalGaps > 0 ? "text-amber-800" : "text-emerald-700"}>
            {" "}· {criticalGaps > 0 ? `${plural(criticalGaps, "critical gap", "critical gaps")} to close` : "no critical gaps"}
          </span>
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {plural(stats.sources, "source", "sources")} · {plural(stats.memories, "memory", "memories")} ·{" "}
          {plural(stats.places, "place", "places")} · {plural(stats.imports, "import", "imports")}
        </p>

        {person.creationProvenance?.method === "manual_first_start" ? (
          <p className="mt-4 max-w-2xl border-l-2 border-amber-500 pl-4 text-sm leading-6 text-stone-600">
            Added privately by you as part of the first family connection. It is not treated as sourced evidence until a source is linked and reviewed.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button asChild className="min-h-11 bg-amber-700 hover:bg-amber-800">
            <SafeLink href={`/app/people/${routeId}/ai`}>Run AI Analysis</SafeLink>
          </Button>
          <span className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Context pack:</span>
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <SafeAnchor href={`/api/people/${routeId}/context-pack?format=markdown`}>Download Context Pack</SafeAnchor>
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <SafeAnchor href={`/api/people/${routeId}/context-pack`}>Structured JSON</SafeAnchor>
            </Button>
          </span>
        </div>
      </section>
    </>
  );
}
