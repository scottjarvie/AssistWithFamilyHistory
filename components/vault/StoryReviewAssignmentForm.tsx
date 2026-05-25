"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StoryReviewAssignmentForm({
  storyId,
  assignedReviewer,
  secondReviewRequired,
  secondReviewer,
  secondReviewedAt,
}: {
  storyId: string;
  assignedReviewer?: string;
  secondReviewRequired?: boolean;
  secondReviewer?: string;
  secondReviewedAt?: number;
}) {
  const router = useRouter();
  const [reviewer, setReviewer] = useState(assignedReviewer ?? "");
  const [requiresSecondReview, setRequiresSecondReview] = useState(secondReviewRequired ?? false);
  const [secondReviewerName, setSecondReviewerName] = useState(secondReviewer ?? "");
  const [secondReviewApproved, setSecondReviewApproved] = useState(Boolean(secondReviewedAt));
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveAssignment() {
    const assignedReviewer = reviewer.trim();
    if (!assignedReviewer) {
      toast.error("Reviewer name is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/stories/${storyId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedReviewer,
          secondReviewRequired: requiresSecondReview,
          secondReviewer: requiresSecondReview ? secondReviewerName.trim() || undefined : undefined,
          secondReviewApproved: requiresSecondReview ? secondReviewApproved : false,
          note: note.trim() || undefined,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to assign reviewer");
      }

      toast.success("Reviewer assignment saved");
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign reviewer");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-stone-700" htmlFor="story-reviewer">
        Reviewer
      </label>
      <input
        id="story-reviewer"
        value={reviewer}
        onChange={(event) => setReviewer(event.target.value)}
        placeholder="Assign reviewer"
        className="h-10 w-full border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-600"
      />
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional assignment note"
        className="min-h-20 w-full resize-y border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-600"
      />
      <label className="flex items-start gap-2 border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={requiresSecondReview}
          onChange={(event) => setRequiresSecondReview(event.target.checked)}
          className="mt-1"
        />
        <span>
          Require second approval for high-risk publish
          <span className="block text-xs leading-5 text-stone-500">
            Use this for living/private-risk, weak-evidence, or sensitive family graph stories.
          </span>
        </span>
      </label>
      {requiresSecondReview ? (
        <div className="space-y-3 border border-amber-200 bg-amber-50/60 px-3 py-3">
          <label className="block text-sm font-medium text-stone-700" htmlFor="second-reviewer">
            Second reviewer
          </label>
          <input
            id="second-reviewer"
            value={secondReviewerName}
            onChange={(event) => setSecondReviewerName(event.target.value)}
            placeholder="Assign second reviewer"
            className="h-10 w-full border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-600"
          />
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={secondReviewApproved}
              onChange={(event) => setSecondReviewApproved(event.target.checked)}
            />
            Second approval completed
          </label>
        </div>
      ) : null}
      <Button onClick={saveAssignment} disabled={isSaving} className="w-full bg-stone-900 hover:bg-stone-800">
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
        Save reviewer
      </Button>
    </div>
  );
}
