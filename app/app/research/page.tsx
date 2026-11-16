import { PaginatedResearch } from "@/components/vault/PaginatedResearch";
import { loadResearchTasks, loadResearchLog } from "./actions";

import type { Metadata } from "next";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { createPageMetadata } from "@/lib/seo";
import {
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Research",
  description: "Review AI-suggested tasks and research log activity across the vault.",
  path: "/app/research",
});

export const dynamic = "force-dynamic";

export default async function ResearchPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Research",
      "The research overview needs the canonical vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const params = await searchParams;
  const status = (["todo", "in_progress", "blocked", "done"] as const).find(s => s === params.status);
  const { vaultOwnerId } = await getVaultAccessContext();
  let overview;

  try {
    const [tasks, log] = await Promise.all([loadResearchTasks({expectedOwner: vaultOwnerId, cursor: null, search: params.q, status}), loadResearchLog({expectedOwner: vaultOwnerId, cursor: null})]);
    overview = {tasks, log};
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return <PaginatedResearch key={`${vaultOwnerId}:${params.q}:${status}`} initial={overview} query={params.q} status={status} vaultOwnerId={vaultOwnerId} preferenceKey={`awf.collection.research.${vaultOwnerId}`} />;
}
