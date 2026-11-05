import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

type RawPersonRow = FunctionReturnType<typeof api.vaultReads.getPeopleExplorer>[number];

/** Only fields actually displayed by the client collection. No raw Convex documents. */
export type PeopleCollectionRow = Pick<RawPersonRow, "routeId" | "displayName" | "living" | "researchStatus"> & {
  _id: string;
  birth?: { date: { year?: number } };
  death?: { date: { year?: number } };
  creationProvenance?: { evidenceStatus: NonNullable<RawPersonRow["creationProvenance"]>["evidenceStatus"] };
  stats: Pick<RawPersonRow["stats"], "sources" | "imports" | "memories" | "documents" | "stories">;
  latestImport: { importedAt: number } | null;
};

/** Server boundary: broad discovery must not serialize notes, paths, raw artifacts or unused fields. */
export function projectPeopleCollectionRow(person: RawPersonRow): PeopleCollectionRow {
  return {
    _id: String(person._id),
    routeId: person.routeId,
    displayName: person.displayName,
    living: person.living,
    researchStatus: person.researchStatus,
    birth: person.birth ? { date: { year: person.birth.date?.year } } : undefined,
    death: person.death ? { date: { year: person.death.date?.year } } : undefined,
    creationProvenance: person.creationProvenance ? { evidenceStatus: person.creationProvenance.evidenceStatus } : undefined,
    stats: {
      sources: person.stats.sources,
      imports: person.stats.imports,
      memories: person.stats.memories,
      documents: person.stats.documents,
      stories: person.stats.stories,
    },
    latestImport: person.latestImport ? { importedAt: person.latestImport.importedAt } : null,
  };
}
