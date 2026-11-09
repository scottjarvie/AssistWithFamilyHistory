/**
 * /app/settings/ai — the chosen-AI connection centre.
 *
 * This is where a person decides what their AI may do, sees what it has done,
 * and turns it off. It reads the owner-scoped grant lifecycle in
 * `convex/mcpGrants.ts` and renders its consent copy from `lib/mcp/catalog.ts`,
 * the same module `convex/httpRoutes/mcp.ts` enforces with.
 *
 * Auth is handled by `app/app/layout.tsx`, so this page only derives the vault
 * owner and reads. Follows the server-component pattern in `app/app/api/page.tsx`.
 */
import type { Metadata } from "next";
import {AiConnectionsView} from "@/components/ai/AiConnectionsView";
import {isAdminUser} from "@/lib/auth/admin";

import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getAuthedConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import {
  listConnectionsRef,
  recentConnectionActivityRef,
  type ConnectionActivityRow,
  type ConnectionRow,
} from "@/lib/mcp/connectionApi";
import { getVaultAccessContext } from "@/lib/vault/server";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "AI Connections",
  description:
    "See, narrow, and turn off every AI connected to your private family-history workspace.",
  path: "/app/settings/ai",
});

export default async function AiConnectionsPage() {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "AI Connections",
      "Connection approvals live in the canonical vault backend.",
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  let ownerKey="unresolved";
  let operator=false;
  let connections: ConnectionRow[] = [];
  let activity: ConnectionActivityRow[] = [];
  let supersededConnections: ConnectionRow[] = [];
  let preparing = false;
  try {
    const { vaultOwnerId,userId } = await getVaultAccessContext();
    ownerKey=vaultOwnerId;operator=isAdminUser(userId);
    const client = await getAuthedConvexClient();
    const listing = await client.action(listConnectionsRef, { vaultOwnerId });
    connections = listing.connections;
    supersededConnections = listing.supersededConnections ?? [];
    preparing = listing.preparing ?? false;
    activity = await client.action(recentConnectionActivityRef, { vaultOwnerId, limit: 25 });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return <AiConnectionsView connections={connections} activity={activity} supersededConnections={supersededConnections} preparing={preparing} ownerKey={ownerKey} operator={operator}/>;
}
