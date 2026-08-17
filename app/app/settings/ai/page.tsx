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
import { ShieldCheck } from "lucide-react";

import { AiConnectionCenter } from "@/components/ai/AiConnectionCenter";
import { SafeLink } from "@/components/layout/SafeLink";
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

  let connections: ConnectionRow[] = [];
  let activity: ConnectionActivityRow[] = [];
  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const listing = await client.action(listConnectionsRef, { vaultOwnerId });
    connections = listing.connections;
    activity = await client.action(recentConnectionActivityRef, { vaultOwnerId, limit: 25 });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl px-4 py-6 sm:p-8">
      <header className="mb-8">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-800">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Your AI, on your terms
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-950">
          AI Connections
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
          Signing in proves whose workspace this is. It does not decide what an AI may do — you do,
          here, one connection at a time. Nothing works until you approve it, everything is limited
          to exactly what you tick, and turning a connection off stops it on its very next request.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
          New here?{" "}
          <SafeLink href="/ai" className="font-medium text-emerald-800 underline hover:text-emerald-900">
            The setup page
          </SafeLink>{" "}
          explains what a connection is and what it takes to make one.
        </p>
      </header>
      <AiConnectionCenter initialConnections={connections} initialActivity={activity} />
    </div>
  );
}
