import { readFileSync } from "fs";
import path from "path";

type FixtureManifest = {
  linearIssues?: string[];
  fixtures?: Array<{
    category?: string;
    expectedCanPublish?: boolean;
  }>;
};

const root = process.cwd();
const failures: string[] = [];
const requiredIssues = ["GEN-3", "GEN-48", "GEN-18", "GEN-44", "GEN-47", "GEN-46", "GEN-23", "GEN-45", "GEN-19"];

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
const manifest = JSON.parse(read("tests/fixtures/stories/manifest.json")) as FixtureManifest;
const checklist = read("docs/product/public-beta-publishing-launch-checklist.md");
const readinessDoc = read("docs/operations/story-public-beta-readiness.md");
const privacyChecklist = read("docs/operations/public-story-privacy-sweep-checklist.md");
const normalizedPrivacyChecklist = privacyChecklist.toLowerCase();
const qaReport = read("docs/operations/public-beta-launch-qa-report.md");
const openApiSkeleton = read("docs/api/story-agent-openapi-skeleton.yaml");
const capabilityManifest = read("docs/api/capability-manifest.json");
const scriptsReadme = read("scripts/README.md");

assert(packageJson.scripts?.["check:story-fixtures"] === "tsx scripts/check-story-fixtures.ts", "package.json missing check:story-fixtures");
assert(packageJson.scripts?.["check:public-beta-launch"] === "tsx scripts/check-public-beta-launch.ts", "package.json missing check:public-beta-launch");

for (const issue of requiredIssues) {
  assert(manifest.linearIssues?.includes(issue) === true, `Fixture manifest missing ${issue}`);
  assert(checklist.includes(issue), `Public beta checklist missing ${issue}`);
}

const categories = new Set((manifest.fixtures ?? []).map((fixture) => fixture.category));
for (const category of [
  "publishable",
  "weak-story",
  "living-risk",
  "private-note",
  "unresolved-relative",
  "missing-context",
  "private-source",
]) {
  assert(categories.has(category), `Fixture manifest missing launch category ${category}`);
}

assert((manifest.fixtures ?? []).some((fixture) => fixture.expectedCanPublish), "Fixture manifest needs at least one publishable story");
assert((manifest.fixtures ?? []).some((fixture) => fixture.expectedCanPublish === false), "Fixture manifest needs at least one blocked story");

for (const token of [
  "pnpm check:story-fixtures",
  "pnpm check:story-publish",
  "pnpm check:public-story-e2e",
  "pnpm check:story-slugs",
  "pnpm check:api-inventory",
]) {
  assert(checklist.includes(token) || readinessDoc.includes(token) || scriptsReadme.includes(token), `Runbook missing ${token}`);
}

for (const token of ["public story pages", "OG images", "story APIs", "vault APIs", "FamilySearch Capture", "agent handoff"]) {
  assert(normalizedPrivacyChecklist.includes(token.toLowerCase()), `Privacy sweep checklist missing ${token}`);
}

for (const token of ["story_writer", "reviewer", "trusted_publisher", "/api/stories/{id}/status", "/api/stories/{id}/review", "x-dts-agent-scope"]) {
  assert(openApiSkeleton.includes(token), `Story OpenAPI skeleton missing ${token}`);
}

assert(openApiSkeleton.includes("story:publish"), "Story OpenAPI skeleton must document publish authority");
assert(openApiSkeleton.includes("403"), "Story OpenAPI skeleton must document denied capability responses");
assert(capabilityManifest.includes("story_writer") && capabilityManifest.includes("trusted_publisher"), "Capability manifest missing story roles");
assert(capabilityManifest.includes("publicIndexing") && capabilityManifest.includes("noindex"), "Capability manifest missing indexing policy notes");
assert(qaReport.includes("GEN-23") && qaReport.includes("GEN-3"), "Latest QA report should link remaining fixture/privacy work");

if (failures.length > 0) {
  console.error("Public beta launch harness assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Public beta launch harness assertions passed");
