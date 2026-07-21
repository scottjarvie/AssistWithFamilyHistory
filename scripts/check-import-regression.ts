import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import { assessCapturePackageForImport, parseCapturePackage, type CapturePackage } from "@/lib/familysearch/capture";
import { buildCaptureImportReview } from "@/lib/familysearch/importReview";
import { checkCaptureImportMergeResponseBehavior } from "./check-capture-import-surface";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "capture");

function loadFixture(file: string) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), "utf8"));
}

function parseFixture(file: string) {
  const parsed = parseCapturePackage(loadFixture(file));
  const readiness = assessCapturePackageForImport(parsed.capture, {
    compatibilityMode: parsed.compatibilityMode,
  });
  const review = buildCaptureImportReview({
    capture: parsed.capture,
    readiness,
    compatibilityMode: parsed.compatibilityMode,
    reviewedAt: "2026-05-21T12:00:00.000Z",
  });

  return {
    ...parsed,
    readiness,
    review,
  };
}

function sourceImportKeys(capture: CapturePackage) {
  return capture.sources.map((source) => ({
    source: `fs-source:${capture.person.familySearchId}:${source.sourceKey}`,
    citation: `fs-citation:${capture.person.familySearchId}:${source.sourceKey}`,
    event: `fs-event:${source.sourceKey}`,
  }));
}

function memoryImportKeys(capture: CapturePackage) {
  return capture.memories.map((memory) => `fs-memory:${capture.person.familySearchId}:${memory.id}`);
}

const validSource = parseFixture("valid-source-v2.json");
assert.equal(validSource.readiness.canImport, true);
assert.equal(validSource.review.recommendedAction, "merge");
assert.equal(validSource.capture.sources.length > 0, true);
assert.equal(new Set(sourceImportKeys(validSource.capture).map((entry) => entry.source)).size, validSource.capture.sources.length);
assert.deepEqual(sourceImportKeys(validSource.capture), sourceImportKeys(parseFixture("valid-source-v2.json").capture));

const validMemories = parseFixture("valid-memories-v2.json");
assert.equal(validMemories.readiness.canImport, true);
assert.equal(validMemories.capture.memories.length > 0, true);
assert.equal(new Set(memoryImportKeys(validMemories.capture)).size, validMemories.capture.memories.length);

const duplicateSource = parseFixture("duplicate-source-key-warning.json");
assert.equal(duplicateSource.readiness.canImport, true);
assert.equal(duplicateSource.review.recommendedAction, "human_review");
assert.ok(
  duplicateSource.readiness.warnings.some((warning) => warning.includes("Duplicate sourceKey")),
  "Duplicate source keys should force human review."
);
assert.notEqual(
  new Set(sourceImportKeys(duplicateSource.capture).map((entry) => entry.source)).size,
  duplicateSource.capture.sources.length,
  "Duplicate source fixture must prove deterministic duplicate keys."
);

const livingPrivate = parseFixture("living-private-warning.json");
assert.equal(livingPrivate.readiness.canImport, true);
assert.equal(livingPrivate.review.recommendedAction, "human_review");
assert.ok(
  livingPrivate.readiness.warnings.some((warning) => warning.includes("living or private")),
  "Living/private-risk fixture should force review."
);

const adminMode = parseFixture("admin-mode-warning.json");
assert.equal(adminMode.readiness.canImport, true);
assert.equal(adminMode.review.recommendedAction, "human_review");
assert.ok(
  adminMode.readiness.warnings.some((warning) => warning.includes("admin mode")),
  "Admin-mode fixture should force review."
);

void checkCaptureImportMergeResponseBehavior()
  .then(() => console.log("Capture import regression checks passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
