import type { Metadata } from "next";
import { DashboardView } from "@/components/vault/DashboardView";
import { createPageMetadata } from "@/lib/seo";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Workspace",
  description: "Navigate your research vault, imports, places, and AI-ready context packs.",
  path: "/app",
});

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Dashboard",
      "The dashboard needs the canonical people, places, imports, and context-pack graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const client = await getAuthedConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let summary;

  try {
    summary = await client.action(api.vaultReads.getDashboardSummary, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return <DashboardView summary={summary} />;
}
