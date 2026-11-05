import { WritingCandidatesView } from "@/components/vault/WritingCandidatesView";
import { projectWritingCandidate } from "@/lib/vault/collectionRows";
import type { Metadata } from "next";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, getConvexUnavailableState, isConvexConfigured } from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Story Writer",
  description: "Choose a person and draft a story from the Research Vault context pack.",
  path: "/app/story-writer",
});

export const dynamic = "force-dynamic";

export default async function StoryWriterPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Story Writer",
      "Story Writer needs the canonical vault backend and person context packs."
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

  try {
    people = await client.action(api.vaultReads.getStoryReadinessCandidates, {
      vaultOwnerId,
      limit: 24,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return <WritingCandidatesView people={people.map(projectWritingCandidate)} preferenceKey={`awf.collection.writing.${vaultOwnerId}`} />;
}
