import type { Metadata } from "next";
import { QueueWorkspace } from "@/components/queue/QueueWorkspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Your Queue",
  description: "Keep family-history directives, handoffs, next steps, and results continuous across sessions.",
  path: "/app/queue",
});

export const dynamic = "force-dynamic";

export default function QueuePage() {
  return <QueueWorkspace />;
}
