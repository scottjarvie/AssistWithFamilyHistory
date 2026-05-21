"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck, ExternalLink, Eye, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StoryPublishReadiness } from "@/lib/stories/publishSafety";
import { publicStoryPath } from "@/lib/stories/slug";

type StoryStatus = "draft" | "review" | "published";
type PendingAction = StoryStatus | "preview";

export function StoryStatusActions({
  storyId,
  publicIdentifier,
  status,
  publishReadiness,
}: {
  storyId: string;
  publicIdentifier?: string;
  status: StoryStatus;
  publishReadiness?: Pick<StoryPublishReadiness, "canPublish" | "summary" | "blockers">;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  async function previewPublishGates() {
    setPendingAction("preview");
    try {
      const response = await fetch(`/api/stories/${storyId}/status?format=handoff&record=true`);
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to preview publish gates");
      }

      const readiness = payload.publishReadiness as StoryPublishReadiness | undefined;
      if (!readiness) {
        throw new Error("Publish preview did not return readiness details");
      }

      if (readiness.canPublish) {
        toast.success("Publish gates are clear for trusted publisher review");
      } else {
        toast.error(readiness.summary, {
          description: readiness.blockers.slice(0, 2).map((blocker) => blocker.label).join(", "),
        });
      }

      return readiness;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to preview publish gates");
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  async function updateStatus(nextStatus: StoryStatus) {
    if (nextStatus === "published") {
      const readiness = await previewPublishGates();
      if (!readiness?.canPublish) return;
    }

    if (
      nextStatus === "published" &&
      !window.confirm("Publish this story publicly? Confirm that a human reviewed evidence, privacy, and story quality.")
    ) {
      return;
    }

    setPendingAction(nextStatus);
    try {
      const response = await fetch(`/api/stories/${storyId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          humanReviewConfirmed: nextStatus === "published" ? true : undefined,
          humanReviewNote:
            nextStatus === "published"
              ? "Human operator reviewed evidence, privacy, and story quality before public publish."
              : undefined,
        }),
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
      setPendingAction(null);
    }
  }

  const publishBlocked = status !== "published" && publishReadiness?.canPublish === false;
  const pending = pendingAction !== null;

  return (
    <div className="flex flex-wrap gap-3">
      {status === "draft" ? (
        <Button onClick={() => updateStatus("review")} disabled={pending} className="bg-stone-900 hover:bg-stone-800">
          {pendingAction === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Mark ready for review
        </Button>
      ) : null}
      {status !== "published" ? (
        <>
          <Button onClick={previewPublishGates} disabled={pending} variant="outline">
            {pendingAction === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Preview publish gates
          </Button>
          <Button
            onClick={() => updateStatus("published")}
            disabled={pending || publishBlocked}
            className="bg-amber-700 hover:bg-amber-800 disabled:bg-stone-300"
          >
            {pendingAction === "published" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Publish public page
          </Button>
        </>
      ) : (
        <>
          <Button asChild className="bg-amber-700 hover:bg-amber-800">
            <Link href={publicStoryPath(publicIdentifier ?? storyId)} target="_blank">
              <ExternalLink className="h-4 w-4" />
              Open public page
            </Link>
          </Button>
          <Button onClick={() => updateStatus("review")} disabled={pending} variant="outline">
            {pendingAction === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Unpublish to review
          </Button>
        </>
      )}
      {publishBlocked ? (
        <p className="basis-full text-xs text-amber-800">{publishReadiness?.summary}</p>
      ) : null}
    </div>
  );
}
