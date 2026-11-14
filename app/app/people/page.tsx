import type { Metadata } from "next";

import { PaginatedPeopleExplorer } from "@/components/vault/PaginatedPeopleExplorer";
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

export default async function PeoplePage({searchParams}: {searchParams: Promise<{q?: string; status?: string}>}) {
  const params = await searchParams;
  const status = params.status === "not_started" || params.status === "basic" || params.status === "in_progress" || params.status === "thorough" || params.status === "complete" ? params.status : undefined;
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
  let firstStartEligible = false;

  try {
    const [peopleResult, eligibility] = await Promise.all([
      client.action(api.vaultReads.getPeopleExplorerPage, {
        vaultOwnerId,
        search: params.q || undefined,
        researchStatus: status,
        cursor: null,
      }),
      client.action(api.vaultReads.getFirstStartEligibility, { vaultOwnerId }),
    ]);
    people = peopleResult;
    firstStartEligible = eligibility.firstStartEligible;
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return <PaginatedPeopleExplorer key={`${vaultOwnerId}:${params.q || ""}:${status || ""}`} initial={people} firstStartEligible={firstStartEligible} query={params.q} status={status} preferenceKey={`awf.collection.people.${vaultOwnerId}`}/>;
}
