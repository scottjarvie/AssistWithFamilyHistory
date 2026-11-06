import { ResearchOverviewView } from "@/components/vault/ResearchOverviewView";
import { projectResearchTask, projectResearchLog } from "@/lib/vault/collectionRows";
import type { Metadata } from "next";
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

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let overview;

  try {
    overview = await client.action(api.vaultReads.getResearchOverview, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const params = await searchParams;
  return <ResearchOverviewView tasks={overview.tasks.map(projectResearchTask)} log={overview.logEntries.map(projectResearchLog)} query={params.q} status={params.status} preferenceKey={`awf.collection.research.${vaultOwnerId}`} />;
}
