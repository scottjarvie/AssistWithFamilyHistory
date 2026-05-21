import type { CaptureImportReadiness, CapturePackage } from "@/lib/familysearch/capture";

export type CaptureImportReview = {
  reportVersion: "2026-05-21";
  reviewedAt: string;
  canImport: boolean;
  recommendedAction: "merge" | "fix_package" | "human_review";
  summary: string;
  package: {
    captureId: string;
    schemaVersion: string;
    compatibilityMode: boolean;
    personId: string;
    personName: string;
    pageType: CapturePackage["pageType"];
    pageUrl: string;
    sourceCount: number;
    memoryCount: number;
    diagnosticsMode: CapturePackage["diagnostics"]["mode"];
  };
  errors: string[];
  warnings: string[];
};

export function buildCaptureImportReview(args: {
  capture: CapturePackage;
  readiness: CaptureImportReadiness;
  compatibilityMode: boolean;
  reviewedAt?: string;
}): CaptureImportReview {
  const { capture, readiness, compatibilityMode } = args;
  const recommendedAction = getRecommendedAction(readiness);

  return {
    reportVersion: "2026-05-21",
    reviewedAt: args.reviewedAt ?? new Date().toISOString(),
    canImport: readiness.canImport,
    recommendedAction,
    summary: buildSummary(capture, readiness, recommendedAction),
    package: {
      captureId: capture.captureId,
      schemaVersion: capture.schemaVersion,
      compatibilityMode,
      personId: capture.person.familySearchId,
      personName: capture.person.name,
      pageType: capture.pageType,
      pageUrl: capture.pageUrl,
      sourceCount: capture.sources.length,
      memoryCount: capture.memories.length,
      diagnosticsMode: capture.diagnostics.mode,
    },
    errors: readiness.errors,
    warnings: readiness.warnings,
  };
}

function getRecommendedAction(readiness: CaptureImportReadiness): CaptureImportReview["recommendedAction"] {
  if (!readiness.canImport) return "fix_package";
  return readiness.warnings.length > 0 ? "human_review" : "merge";
}

function buildSummary(
  capture: CapturePackage,
  readiness: CaptureImportReadiness,
  recommendedAction: CaptureImportReview["recommendedAction"],
) {
  const counts = `${capture.sources.length} source(s), ${capture.memories.length} memory item(s)`;

  if (recommendedAction === "fix_package") {
    return `Blocked ${capture.pageType} capture for ${capture.person.name || "unknown person"}: ${readiness.errors.length} validation error(s), ${counts}.`;
  }

  if (recommendedAction === "human_review") {
    return `Review ${capture.pageType} capture for ${capture.person.name}: ${readiness.warnings.length} warning(s), ${counts}.`;
  }

  return `Ready to merge ${capture.pageType} capture for ${capture.person.name}: ${counts}.`;
}
