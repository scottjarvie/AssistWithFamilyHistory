import { notFound } from "next/navigation";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

import { PlaceWorkspaceView } from "@/components/vault/PlaceWorkspaceView";

interface PageProps {
  params: Promise<{ placeId: string }>;
}

export const dynamic = "force-dynamic";

export default async function PlaceWorkspacePage({ params }: PageProps) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Place workspace",
      "The place workspace needs the canonical vault graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { placeId } = await params;
  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let workspace;

  try {
    workspace = await client.action(api.vaultReads.getPlaceWorkspace, {
      vaultOwnerId,
      placeId: placeId as never,
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
  return <PlaceWorkspaceView workspace={workspace}/>;
}
