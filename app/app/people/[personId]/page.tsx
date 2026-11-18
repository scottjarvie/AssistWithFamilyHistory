import { notFound } from "next/navigation";
import { PersonWorkspaceView } from "@/components/vault/PersonWorkspaceView";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { getAuthedConvexClient, getConvexUnavailableState, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { api } from "@/convex/_generated/api";

interface PageProps {
  params: Promise<{ personId: string }>;
}

export const dynamic = "force-dynamic";

export default async function PersonWorkspacePage({ params }: PageProps) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Person workspace",
      "The person workspace needs the canonical vault graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { personId } = await params;
  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let workspace;

  try {
    workspace = await client.action(api.vaultReads.getPersonWorkspace, {
      vaultOwnerId,
      personIdentifier: personId,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  if (!workspace) {
    notFound();
  }

  // The owner-scoped person snapshot already contains these PS/CST records.
  // Keep the Documents tab's order and send only the fields the viewer uses.
  const documents = [...workspace.documents]
    .sort((a, b) => a.type.localeCompare(b.type) || a._creationTime - b._creationTime)
    .map(({ _id, type, title, contentMarkdown, updatedAt }) => ({ _id, type, title, contentMarkdown, updatedAt }));

  return <PersonWorkspaceView workspace={workspace} personId={personId} documents={documents} documentsError={null} />;
}
