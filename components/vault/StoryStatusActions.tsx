"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Eye, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type StoryStatus = "draft" | "review" | "published";

export function StoryStatusActions({
  storyId,
  status,
}: {
  storyId: string;
  status: StoryStatus;
}) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<StoryStatus | null>(null);

  async function updateStatus(nextStatus: StoryStatus) {
    setPendingStatus(nextStatus);
    try {
      const response = await fetch(`/api/stories/${storyId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to update story status");
      }

      toast.success(nextStatus === "published" ? "Story published" : "Story status updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update story status");
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {status === "draft" ? (
        <Button onClick={() => updateStatus("review")} disabled={pendingStatus !== null} className="bg-stone-900 hover:bg-stone-800">
          {pendingStatus === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Mark ready for review
        </Button>
      ) : null}
      {status !== "published" ? (
        <Button onClick={() => updateStatus("published")} disabled={pendingStatus !== null} className="bg-amber-700 hover:bg-amber-800">
          {pendingStatus === "published" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Publish public page
        </Button>
      ) : (
        <>
          <Button asChild className="bg-amber-700 hover:bg-amber-800">
            <Link href={`/stories/${storyId}`} target="_blank">
              <ExternalLink className="h-4 w-4" />
              Open public page
            </Link>
          </Button>
          <Button onClick={() => updateStatus("review")} disabled={pendingStatus !== null} variant="outline">
            {pendingStatus === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Unpublish to review
          </Button>
        </>
      )}
    </div>
  );
}
