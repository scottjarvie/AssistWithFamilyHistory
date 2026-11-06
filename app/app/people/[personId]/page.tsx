import { notFound } from "next/navigation";
import { PersonWorkspaceView } from "@/components/vault/PersonWorkspaceView";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { getAuthedConvexClient, getConvexUnavailableState, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

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

  // Documents (PS/CST) are loaded server-side here and passed into the
  // DocumentsViewer as a prop. Previously the viewer re-fetched them over REST
  // in a client useEffect, duplicating work the server can do during render.
  const documentsPersonId = workspace.person.fsId || String(workspace.person._id);
  let documents: FunctionReturnType<typeof api.documents.getDocumentsByPerson> = [];
  let documentsError: string | null = null;
  try {
    documents = await client.action(api.documents.getDocumentsByPerson, {
      vaultOwnerId,
      personId: documentsPersonId,
    });
  } catch {
    documentsError = "Could not load Convex documents";
  }

  return <PersonWorkspaceView workspace={workspace} personId={personId} documents={documents} documentsError={documentsError}/>;
}
