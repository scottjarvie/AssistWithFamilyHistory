import { StoryReviewView } from "@/components/vault/StoryReviewView";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Review Story",
  description: "Review an ancestor story draft and decide whether it is ready to publish.",
  path: "/app/stories",
});

export const dynamic = "force-dynamic";


export default async function StoryReviewPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Story Review",
      "Story review needs the canonical vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { storyId } = await params;
  const { vaultOwnerId } = await getVaultAccessContext();
  const client = await getAuthedConvexClient();
  let bundle;

  try {
    bundle = await client.action(api.vaultReads.getStoryReview, {
      vaultOwnerId,
      storyId: storyId as Id<"stories">,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  if (!bundle) notFound();

  return <StoryReviewView bundle={bundle}/>;
}
