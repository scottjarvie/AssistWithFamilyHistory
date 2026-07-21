import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CaptureImportMergeResponseSchema,
  CaptureImportPreviewResponseSchema,
  classifyCaptureImportMergeResponse,
  getCaptureImportErrorMessage,
} from "@/features/capture/importContract";
import {
  getAcceptedCaptureImportMergeRecovery,
  getCaptureImportReviewState,
} from "@/features/capture/importModel";

const reviewedAt = "2026-07-18T07:30:00.000Z";

function previewFixture(options: {
  canImport: boolean;
  recommendedAction: "merge" | "fix_package" | "human_review";
  errors?: string[];
  warnings?: string[];
}) {
  const errors = options.errors ?? [];
  const warnings = options.warnings ?? [];

  return {
    success: true,
    preview: true,
    canImport: options.canImport,
    compatibilityMode: false,
    personId: "TEST-001",
    personName: "Anonymized Ancestor",
    pageType: "sources",
    sourceCount: 2,
    memoryCount: 0,
    validation: { canImport: options.canImport, errors, warnings },
    review: {
      reportVersion: "2026-05-21",
      reviewedAt,
      canImport: options.canImport,
      recommendedAction: options.recommendedAction,
      summary: "Synthetic capture review fixture for the response contract.",
      package: {
        captureId: "synthetic-capture-001",
        schemaVersion: "2.0",
        compatibilityMode: false,
        personId: "TEST-001",
        personName: "Anonymized Ancestor",
        pageType: "sources",
        pageUrl: "https://www.familysearch.org/tree/person/sources/TEST-001",
        sourceCount: 2,
        memoryCount: 0,
        diagnosticsMode: "standard",
      },
      errors,
      warnings,
    },
  };
}

const readyPreview = CaptureImportPreviewResponseSchema.parse(
  previewFixture({ canImport: true, recommendedAction: "merge" }),
);
assert.deepEqual(getCaptureImportReviewState(readyPreview), {
  status: "ready",
  tone: "ready",
  title: "Ready to merge",
  description: "No blocking errors or review warnings were reported by the preview.",
  canMerge: true,
});

for (const warning of [
  "Person may be living or private; review before importing or exposing generated work.",
  "Capture package was produced in admin mode and needs explicit review before merge.",
]) {
  const reviewPreview = CaptureImportPreviewResponseSchema.parse(
    previewFixture({ canImport: true, recommendedAction: "human_review", warnings: [warning] }),
  );
  const state = getCaptureImportReviewState(reviewPreview);
  assert.equal(state.status, "human_review");
  assert.equal(state.canMerge, true, "Warnings stay review-visible but do not change existing merge eligibility.");
}

const blockedPreview = CaptureImportPreviewResponseSchema.parse(
  previewFixture({
    canImport: false,
    recommendedAction: "fix_package",
    errors: ["Capture package is missing the FamilySearch person ID."],
  }),
);
assert.equal(getCaptureImportReviewState(blockedPreview).status, "blocked");
assert.equal(getCaptureImportReviewState(blockedPreview).canMerge, false);

assert.throws(
  () => CaptureImportPreviewResponseSchema.parse({ success: true, preview: true }),
  "An incomplete preview envelope must fail loudly instead of silently weakening the client gate.",
);

const mergeResponse = CaptureImportMergeResponseSchema.parse({
  success: true,
  compatibilityMode: false,
  personId: "TEST-001",
  runId: "synthetic-run-001",
  pageType: "sources",
  sourceCount: 2,
  memoryCount: 0,
  importRunId: null,
  mergeStatus: "partial",
  warnings: ["Structured vault merge is pending in this synthetic fixture."],
  validation: { canImport: true, errors: [], warnings: [] },
  review: previewFixture({ canImport: true, recommendedAction: "merge" }).review,
  backendState: "missing",
  backendTitle: "Vault backend unavailable",
  backendDescription: "Synthetic backend state; no real vault was accessed.",
  vaultMerged: false,
});
assert.equal(mergeResponse.mergeStatus, "partial");
assert.equal(mergeResponse.vaultMerged, false);
assert.equal(mergeResponse.warnings.length, 1);

export async function checkCaptureImportMergeResponseBehavior() {
  const verifiedMerge = await classifyCaptureImportMergeResponse(
    new Response(JSON.stringify(mergeResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(verifiedMerge.status, "verified", "A valid JSON success keeps its normal verified semantics.");

  const rejectedMerge = await classifyCaptureImportMergeResponse(
    new Response(JSON.stringify({ error: "Capture package failed import safety checks" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(rejectedMerge.status, "rejected", "A non-2xx JSON response keeps its normal error semantics.");
  if (rejectedMerge.status === "rejected") {
    assert.equal(
      getCaptureImportErrorMessage(rejectedMerge.payload, "Import failed"),
      "Capture package failed import safety checks",
    );
  }

  const unverifiableMerge = await classifyCaptureImportMergeResponse(
    new Response("possibly committed", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }),
  );
  assert.deepEqual(unverifiableMerge, {
    status: "accepted_unverifiable",
  });

  const recovery = getAcceptedCaptureImportMergeRecovery();
  assert.deepEqual(recovery, {
    previewResult: null,
    previewPayload: null,
    canMerge: false,
    refreshRecentImports: true,
  });

  let retryPreview: typeof readyPreview | null = readyPreview;
  let retryPayload: unknown | null = { synthetic: true };
  let recentImportsRefreshes = 0;
  retryPreview = recovery.previewResult;
  retryPayload = recovery.previewPayload;
  if (recovery.refreshRecentImports) recentImportsRefreshes += 1;
  assert.equal(
    Boolean(retryPreview && retryPayload && getCaptureImportReviewState(retryPreview).canMerge),
    false,
    "A non-JSON 2xx must make a duplicate merge retry impossible until a new preview succeeds.",
  );
  assert.equal(recentImportsRefreshes, 1, "An unverifiable accepted merge must refresh Recent Imports once.");
}

assert.equal(
  getCaptureImportErrorMessage(
    {
      error: "Capture package failed import safety checks",
      validation: { errors: ["FamilySearch person ID is required."], warnings: [] },
    },
    "Import failed",
  ),
  "Capture package failed import safety checks: FamilySearch person ID is required.",
);

const pageSource = readFileSync("app/app/imports/page.tsx", "utf8");
for (const stableRoute of ['fetch("/api/import?preview=true"', 'fetch("/api/import"']) {
  assert(pageSource.includes(stableRoute), `Imports page changed stable endpoint: ${stableRoute}`);
}
assert(
  pageSource.includes('from "@/features/capture/importContract"'),
  "Imports page must consume the shared Capture response contract.",
);
assert(
  pageSource.includes('from "@/features/capture/importModel"'),
  "Imports page must consume the pure Capture review-state model.",
);
assert(
  pageSource.includes("The server accepted the import, but its response could not be verified."),
  "A successful merge with an unrecognized response must block a blind duplicate retry.",
);

const importRouteSource = readFileSync("app/api/import/route.ts", "utf8");
for (const envelopeField of [
  "preview: true",
  "canImport: readiness.canImport",
  "compatibilityMode",
  "validation: readiness",
  "importRunId:",
  "mergeStatus:",
  "backendState:",
  "vaultMerged:",
]) {
  assert(importRouteSource.includes(envelopeField), `Import route envelope drifted: ${envelopeField}`);
}

const importerSource = readFileSync("lib/familysearch/importer.ts", "utf8");
assert(importerSource.includes("api.vaultMutations.upsertPerson"), "Stable api.vaultMutations identifiers drifted.");
assert(importerSource.includes("api.vaultMutations.bulkRefreshResearchChecks"), "Stable vault refresh facade drifted.");
