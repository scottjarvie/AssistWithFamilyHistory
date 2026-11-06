import { StoriesCollectionView } from "@/components/vault/StoriesCollectionView";
import { projectStoryRow } from "@/lib/vault/collectionRows";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { getAuthedConvexClient, getConvexRuntimeIssue, getConvexUnavailableState, isConvexConfigured } from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Story Studio",
  description: "Review, publish, and manage ancestor story drafts from the research vault.",
  path: "/app/stories",
});

export const dynamic = "force-dynamic";

export default async function StoriesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; workflow?: string }>;
}) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Story Studio",
      "Story Studio needs the canonical vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { vaultOwnerId } = await getVaultAccessContext();
  const client = await getAuthedConvexClient();
  let stories;

  try {
    stories = await client.action(api.vaultReads.getStoriesIndex, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const params = await searchParams;
  return <StoriesCollectionView stories={stories.map(projectStoryRow)} query={params.q} status={params.status} workflow={params.workflow} preferenceKey={`awf.collection.stories.${vaultOwnerId}`} />;
}
