import type { Metadata } from "next";
import { QueueWorkspace } from "@/components/queue/QueueWorkspace";
import {normalizeQueueFilters} from "@/lib/queue/viewFilters";
import { getVaultAccessContext } from "@/lib/vault/server";
import { createPageMetadata } from "@/lib/seo";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { loadInitialWebsiteQueue } from "@/lib/queue/websiteReads";

export const metadata: Metadata = createPageMetadata({
  title: "Your Queue",
  description: "Keep family-history directives, handoffs, next steps, and results continuous across sessions.",
  path: "/app/queue",
});

export const dynamic = "force-dynamic";

export default async function QueuePage({searchParams}:{searchParams:Promise<{suggestions?:string;archived?:string;q?:string;state?:string;view?:string;item?:string;priority?:string;condition?:string;actor?:string}>}) {
  const [{ vaultOwnerId }, input] = await Promise.all([getVaultAccessContext(), searchParams]);
  const filters = normalizeQueueFilters(input);
  const initial = isConvexConfigured()
    ? await getAuthedConvexClient().then(client => loadInitialWebsiteQueue(client, vaultOwnerId, filters)).catch(() => undefined)
    : undefined;
  return <QueueWorkspace key={vaultOwnerId} preferenceKey={`awf.collection.queue.${vaultOwnerId}`}
    initialFilters={filters} initial={initial}/>;
}
