"use client";

import { SafeLink as Link } from "@/components/layout/SafeLink";
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
  compact = false,
}: {
  compact?: boolean;
  storyId: string;
  publicIdentifier?: string;
  status: StoryStatus;
  publishReadiness?: Pick<StoryPublishReadiness, "canPublish" | "summary">;
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
    <div className={compact?"grid grid-cols-3 items-stretch gap-1 [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal [&_button]:px-2 [&_button]:text-xs [&_svg:not(.animate-spin)]:hidden lg:flex lg:flex-wrap lg:gap-2 lg:[&_svg]:block":"flex flex-wrap gap-3"}>
      {status === "draft" ? (
        <Button aria-label="Mark ready for review" onClick={() => updateStatus("review")} disabled={pending} className="min-h-11 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100">
          {pendingAction === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {compact?<><span className="lg:hidden">Send to review</span><span className="hidden lg:inline">Mark ready for review</span></>:"Mark ready for review"}
        </Button>
      ) : null}
      {status !== "published" ? (
        <>
          <Button aria-label="Preview publish gates" onClick={previewPublishGates} disabled={pending} variant="outline">
            {pendingAction === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {compact?<><span className="lg:hidden">Preview gates</span><span className="hidden lg:inline">Preview publish gates</span></>:"Preview publish gates"}
          </Button>
          <Button
            aria-label="Publish public page"
            onClick={() => updateStatus("published")}
            disabled={pending || publishBlocked}
            className="min-h-11 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {pendingAction === "published" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {compact?<><span className="lg:hidden">Publish</span><span className="hidden lg:inline">Publish public page</span></>:"Publish public page"}
          </Button>
        </>
      ) : (
        <>
          <Button asChild className="min-h-11">
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
        <p className="col-span-3 basis-full text-xs text-annotation">{publishReadiness?.summary}</p>
      ) : null}
    </div>
  );
}
