import { readFileSync } from "fs";
import path from "path";
import {
  canPerformStoryAction,
  getStoryCapabilities,
  requireStoryAction,
  type StoryActorRole,
} from "../lib/stories/capabilities";
import { buildPublicStoryMetadata, buildPublicStorySharePreview } from "../lib/stories/publicStoryPolicy";
import { assessStoryPublishReadiness, type StoryPublishSafetyInput } from "../lib/stories/publishSafety";
import { buildStoryPublicSlug, publicStoryPath } from "../lib/stories/slug";

type StoryFixtureManifest = {
  schemaVersion: string;
  route: string;
  linearIssues: string[];
  fixtures: Array<{
    id: string;
    file: string;
    category: string;
    storyId: string;
    expectedCanPublish: boolean;
    expectedBlockers: string[];
    notes: string;
  }>;
};

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "stories");
const manifest = JSON.parse(readFileSync(path.join(fixtureRoot, "manifest.json"), "utf8")) as StoryFixtureManifest;
const failures: string[] = [];

const requiredLinearIssues = ["GEN-3", "GEN-48", "GEN-18", "GEN-44", "GEN-47", "GEN-46", "GEN-23", "GEN-45", "GEN-19"];
const requiredCategories = [
  "publishable",
  "weak-story",
  "living-risk",
  "private-note",
  "unresolved-relative",
  "missing-context",
  "old-missing-death",
  "private-source",
];

function readFixture(file: string): StoryPublishSafetyInput {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), "utf8")) as StoryPublishSafetyInput;
}

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

assert(manifest.schemaVersion === "2026-05-21", "Fixture manifest schema version should match this beta route");
assert(manifest.route === "Repo-Backed Fixture And Agent QA Harness", "Fixture manifest route label is stale");

for (const issue of requiredLinearIssues) {
  assert(manifest.linearIssues.includes(issue), `Fixture manifest missing Linear issue ${issue}`);
}

const categories = new Set(manifest.fixtures.map((fixture) => fixture.category));
for (const category of requiredCategories) {
  assert(categories.has(category), `Fixture manifest missing category ${category}`);
}

const fixtureIds = new Set<string>();
const storyIds = new Set<string>();
let publishableFixtureCount = 0;
let blockedFixtureCount = 0;

for (const fixture of manifest.fixtures) {
  assert(!fixtureIds.has(fixture.id), `Duplicate fixture id ${fixture.id}`);
  assert(!storyIds.has(fixture.storyId), `Duplicate fixture storyId ${fixture.storyId}`);
  fixtureIds.add(fixture.id);
  storyIds.add(fixture.storyId);

  const input = readFixture(fixture.file);
  const readiness = assessStoryPublishReadiness(input);
  const blockerKeys = new Set(readiness.blockers.map((blocker) => blocker.key));

  if (fixture.expectedCanPublish) publishableFixtureCount += 1;
  else blockedFixtureCount += 1;

  assert(
    readiness.canPublish === fixture.expectedCanPublish,
    `${fixture.file}: expected canPublish=${fixture.expectedCanPublish}, received ${readiness.canPublish}`
  );

  for (const blocker of fixture.expectedBlockers) {
    assert(blockerKeys.has(blocker), `${fixture.file}: missing expected blocker ${blocker}`);
  }

  assert(readiness.score >= 0 && readiness.score <= 100, `${fixture.file}: readiness score out of bounds`);
  assert(readiness.provenance.citations >= 0, `${fixture.file}: citation count out of bounds`);

  if (blockerKeys.has("privacy_living_status")) {
    assert(readiness.privacyRisk.reasons.length > 0, `${fixture.file}: privacy blocker needs explainable reasons`);
  }

  if (fixture.expectedCanPublish) {
    const slug = buildStoryPublicSlug({
      storyId: fixture.storyId,
      title: input.story.title ?? "Fixture story",
      personName: input.person?.displayName,
    });
    const metadata = buildPublicStoryMetadata({
      story: {
        status: "published",
        title: input.story.title ?? "Fixture story",
        content: input.story.content,
      },
      person: { displayName: input.person?.displayName },
    });
    const preview = buildPublicStorySharePreview({
      story: {
        status: "published",
        title: input.story.title ?? "Fixture story",
        content: input.story.content,
      },
      person: { displayName: input.person?.displayName },
    });

    assert(publicStoryPath(slug).startsWith("/stories/"), `${fixture.file}: slug path should use public story route`);
    assert(metadata.robots.index === false, `${fixture.file}: fixture metadata should be noindex by default`);
    assert(preview.title !== "Story not available", `${fixture.file}: publishable fixture should build share preview`);
  }
}

assert(publishableFixtureCount >= 2, "At least two publishable/allowed fixtures should exist");
assert(blockedFixtureCount >= 5, "Blocked fixtures should cover the main beta risk routes");

const roleExpectations: Array<{ role: StoryActorRole; publishAllowed: boolean }> = [
  { role: "story_writer", publishAllowed: false },
  { role: "reviewer", publishAllowed: false },
  { role: "trusted_publisher", publishAllowed: true },
  { role: "first_party_owner", publishAllowed: true },
];

for (const expectation of roleExpectations) {
  assert(
    canPerformStoryAction(expectation.role, "story:publish") === expectation.publishAllowed,
    `${expectation.role}: publish authority mismatch`
  );

  if (!expectation.publishAllowed) {
    const denial = requireStoryAction(expectation.role, "story:publish");
    assert(Boolean(denial), `${expectation.role}: denied publish role should receive a denial payload`);
    assert(
      !getStoryCapabilities(expectation.role).includes("story:publish"),
      `${expectation.role}: denied role should not advertise story:publish`
    );
  }
}

if (failures.length > 0) {
  console.error("Story fixture harness assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Story fixture harness assertions passed");
