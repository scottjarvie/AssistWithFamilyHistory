import type { Metadata } from "next";
import { QueueWorkspace } from "@/components/queue/QueueWorkspace";
import {normalizeQueueFilters} from "@/lib/queue/viewFilters";
import { getVaultAccessContext } from "@/lib/vault/server";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Your Queue",
  description: "Keep family-history directives, handoffs, next steps, and results continuous across sessions.",
  path: "/app/queue",
});

export const dynamic = "force-dynamic";

export default async function QueuePage({searchParams}:{searchParams:Promise<{suggestions?:string;archived?:string;q?:string;state?:string;view?:string;item?:string;priority?:string;condition?:string;actor?:string}>}) {
  const {vaultOwnerId}=await getVaultAccessContext();
  return <QueueWorkspace key={vaultOwnerId} preferenceKey={`awf.collection.queue.${vaultOwnerId}`} initialFilters={normalizeQueueFilters(await searchParams)}/>;
}
