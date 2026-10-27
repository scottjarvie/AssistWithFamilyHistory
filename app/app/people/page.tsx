import type { Metadata } from "next";
import { PeopleExplorerView } from "@/components/vault/PeopleExplorerView";
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
  let firstStartEligible = false;

  try {
    const [peopleResult, summary] = await Promise.all([
      client.action(api.vaultReads.getPeopleExplorer, {
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
      }),
      client.action(api.vaultReads.getDashboardSummary, { vaultOwnerId }),
    ]);
    people = peopleResult;
    firstStartEligible = summary.firstStartEligible;
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
    <PeopleExplorerView
      people={visiblePeople}
      firstStartEligible={firstStartEligible}
      query={params.q}
      status={params.status}
      loadMoreHref={hasMore ? `/app/people?${loadMoreParams.toString()}` : null}
    />
  );
}
