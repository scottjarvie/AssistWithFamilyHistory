import { readFileSync } from "node:fs";
import path from "node:path";
import { assessCapturePackageForImport, parseCapturePackage } from "@/lib/familysearch/capture";
import { buildCaptureImportReview } from "@/lib/familysearch/importReview";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "capture");
const cases = [
  {
    file: "valid-source-v2.json",
    canImport: true,
    compatibilityMode: false,
    warnings: [],
  },
  {
    file: "valid-memories-v2.json",
    canImport: true,
    compatibilityMode: false,
    warnings: [],
  },
  {
    file: "legacy-evidence-pack-v1.json",
    canImport: true,
    compatibilityMode: true,
    warnings: ["Legacy evidence-pack compatibility mode"],
  },
  {
    file: "bad-url.json",
    canImport: false,
    errors: ["familysearch.org"],
  },
  {
    file: "missing-person.json",
    canImport: false,
    errors: ["FamilySearch person ID", "person name"],
  },
  {
    file: "empty-package.json",
    canImport: false,
    errors: ["no sources or memories"],
  },
  {
    file: "admin-mode-warning.json",
    canImport: true,
    warnings: ["admin mode"],
  },
  {
    file: "living-private-warning.json",
    canImport: true,
    warnings: ["living or private"],
  },
  {
    file: "duplicate-source-key-warning.json",
    canImport: true,
    warnings: ["Duplicate sourceKey"],
  },
] as const;

for (const testCase of cases) {
  const input = JSON.parse(readFileSync(path.join(fixtureRoot, testCase.file), "utf8"));
  const parsed = parseCapturePackage(input);
  const readiness = assessCapturePackageForImport(parsed.capture, {
    compatibilityMode: parsed.compatibilityMode,
  });
  const review = buildCaptureImportReview({
    capture: parsed.capture,
    readiness,
    compatibilityMode: parsed.compatibilityMode,
    reviewedAt: "2026-05-21T12:00:00.000Z",
  });

  assert(
    parsed.compatibilityMode === (testCase.compatibilityMode ?? false),
    `${testCase.file}: expected compatibilityMode=${testCase.compatibilityMode ?? false}.`,
  );

  assert(
    readiness.canImport === testCase.canImport,
    `${testCase.file}: expected canImport=${testCase.canImport}, got errors: ${readiness.errors.join(" ")}`,
  );

  for (const expectedError of testCase.errors ?? []) {
    assert(
      readiness.errors.some((error) => error.includes(expectedError)),
      `${testCase.file}: expected error containing "${expectedError}".`,
    );
  }

  for (const expectedWarning of testCase.warnings ?? []) {
    assert(
      readiness.warnings.some((warning) => warning.includes(expectedWarning)),
      `${testCase.file}: expected warning containing "${expectedWarning}".`,
    );
  }

  assert(review.canImport === readiness.canImport, `${testCase.file}: review canImport drifted.`);
  assert(review.package.personId === parsed.capture.person.familySearchId, `${testCase.file}: review person mismatch.`);
  assert(review.summary.length > 20, `${testCase.file}: review summary is too short.`);
}

console.log("Capture package validation checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
