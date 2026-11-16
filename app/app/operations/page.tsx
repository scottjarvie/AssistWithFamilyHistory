import { operationQueryArguments } from "@/lib/operations/query";
import type { Metadata } from "next";
import { PagedOperations } from "./PagedOperations";
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



export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const rawParams = await searchParams;
  const params = {...rawParams,...normalizeOperationFilters(rawParams),page:Array.isArray(rawParams.page)?rawParams.page[0]:rawParams.page};

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
      ...operationQueryArguments(normalizeOperationFilters(params)),

    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const handoffParams = new URLSearchParams({ format: "handoff" });
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) handoffParams.set(key, value);
  }
  return <PagedOperations key={JSON.stringify([vaultOwnerId,normalizeOperationFilters(params)])} owner={vaultOwnerId} initial={{...queue,rows:queue.rows.map(projectOperationRow)}}
    filters={normalizeOperationFilters(params)} preferenceKey={`awf.collection.operations.${vaultOwnerId}`}
    handoffHref={`/api/operations/queue?${handoffParams}`} mode={accessContext.mode} />;
}
