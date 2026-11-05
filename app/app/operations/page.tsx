import type { Metadata } from "next";
import { OperationsView } from "@/components/operations/OperationsView";
import { projectOperationRow, normalizeOperationFilters } from "@/lib/vault/operationsRows";
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
  title: "Operations",
  description: "Run research operations across every person and provisional relative in your vault.",
  path: "/app/operations",
});

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const OPERATIONS_PAGE_SIZE = 50;

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const rawParams = await searchParams;
  const params = {...rawParams,...normalizeOperationFilters(rawParams),page:Array.isArray(rawParams.page)?rawParams.page[0]:rawParams.page};
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  // Cap rendered rows. The Convex query slices to `limit` and computes the
  // summary over the visible rows, so the "Visible rows" stat stays consistent
  // with what is shown. Keep the existing cap-based next-page heuristic.
  const visibleCount = OPERATIONS_PAGE_SIZE * page;

  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Operations",
      "The operations console needs the canonical per-user vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const accessContext = await getVaultAccessContext();
  const { vaultOwnerId } = accessContext;
  let queue;

  try {
    queue = await client.action(api.vaultReads.getOperationsQueue, {
      vaultOwnerId,
      search: params.q || undefined,
      rowType: params.type === "person" || params.type === "provisional" ? params.type : undefined,
      storyStatus:
        params.storyStatus === "has_story" || params.storyStatus === "no_story"
          ? params.storyStatus
          : undefined,
      storyWorkflow:
        params.storyWorkflow === "needs_genealogy_evidence" ||
        params.storyWorkflow === "needs_context_research" ||
        params.storyWorkflow === "ready_to_draft" ||
        params.storyWorkflow === "ready_to_review" ||
        params.storyWorkflow === "published"
          ? params.storyWorkflow
          : undefined,
      staleOnly: params.staleOnly === "true" ? true : undefined,
      sortBy:
        params.sortBy === "completion" ||
        params.sortBy === "lastTouched" ||
        params.sortBy === "sourceCount" ||
        params.sortBy === "storyReadiness" ||
        params.sortBy === "newestImport" ||
        params.sortBy === "missingCritical"
          ? params.sortBy
          : "missingCritical",
      sortDirection: params.sortDirection === "asc" || params.sortDirection === "desc" ? params.sortDirection : "desc",
      missingCheck: params.missingCheck || undefined,
      limit: visibleCount,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const hasMore = queue.rows.length >= visibleCount;
  const loadMoreParams = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1]) && entry[0] !== "page"));
  loadMoreParams.set("page", String(page + 1));
  const handoffParams = new URLSearchParams({ format: "handoff" });
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) handoffParams.set(key, value);
  }
  return <OperationsView rows={queue.rows.map(projectOperationRow)} summary={queue.summary}
    filters={normalizeOperationFilters(params)} preferenceKey={`awf.collection.operations.${vaultOwnerId}`}
    loadMoreHref={hasMore ? `/app/operations?${loadMoreParams}` : null}
    handoffHref={`/api/operations/queue?${handoffParams}`} mode={accessContext.mode} />;
}
