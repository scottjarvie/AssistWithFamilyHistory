import type { CaptureImportPreviewResponse } from "@/features/capture/importContract";

export type CaptureImportTone = "ready" | "warning" | "blocked";

export type CaptureImportReviewState = {
  status: "needs_preview" | "ready" | "human_review" | "blocked";
  tone: CaptureImportTone;
  title: string;
  description: string;
  canMerge: boolean;
};

export type CaptureImportMergeRecovery = {
  previewResult: null;
  previewPayload: null;
  canMerge: false;
  refreshRecentImports: true;
};

export function getAcceptedCaptureImportMergeRecovery(): CaptureImportMergeRecovery {
  return {
    previewResult: null,
    previewPayload: null,
    canMerge: false,
    refreshRecentImports: true,
  };
}

export function getCaptureImportReviewState(
  preview: CaptureImportPreviewResponse | null,
): CaptureImportReviewState {
  if (!preview) {
    return {
      status: "needs_preview",
      tone: "warning",
      title: "Review package first",
      description: "Preview validation must finish before any artifact save or vault merge.",
      canMerge: false,
    };
  }

  const action = preview.review?.recommendedAction;
  if (!preview.canImport || action === "fix_package") {
    return {
      status: "blocked",
      tone: "blocked",
      title: "Fix package before import",
      description: "Blocking validation errors must be resolved before any artifact save or vault merge.",
      canMerge: false,
    };
  }

  if (action === "human_review" || preview.validation.warnings.length > 0) {
    return {
      status: "human_review",
      tone: "warning",
      title: "Human review before merge",
      description: "The package can import, but warnings should be reviewed before it becomes trusted vault context.",
      canMerge: true,
    };
  }

  return {
    status: "ready",
    tone: "ready",
    title: "Ready to merge",
    description: "No blocking errors or review warnings were reported by the preview.",
    canMerge: true,
  };
}
