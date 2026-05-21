import { readFileSync } from "fs";
import path from "path";
import { assessStoryPublishReadiness, type StoryPublishSafetyInput } from "../lib/stories/publishSafety";

type FixtureExpectation = {
  file: string;
  expectedCanPublish: boolean;
  expectedBlockers: string[];
};

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "stories");
const manifest = JSON.parse(readFileSync(path.join(fixtureRoot, "manifest.json"), "utf8")) as {
  fixtures: FixtureExpectation[];
};
const expectations = manifest.fixtures;

function readFixture(file: string): StoryPublishSafetyInput {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), "utf8")) as StoryPublishSafetyInput;
}

const failures: string[] = [];

for (const expectation of expectations) {
  const readiness = assessStoryPublishReadiness(readFixture(expectation.file));
  const blockerKeys = new Set(readiness.blockers.map((blocker) => blocker.key));

  if (readiness.canPublish !== expectation.expectedCanPublish) {
    failures.push(
      `${expectation.file}: expected canPublish=${expectation.expectedCanPublish}, received ${readiness.canPublish}`
    );
  }

  for (const key of expectation.expectedBlockers) {
    if (!blockerKeys.has(key)) {
      failures.push(`${expectation.file}: missing blocker ${key}`);
    }
  }

  if (readiness.provenance.citations < 0 || readiness.score < 0 || readiness.score > 100) {
    failures.push(`${expectation.file}: readiness metrics are outside expected bounds`);
  }

  if (blockerKeys.has("privacy_living_status") && readiness.privacyRisk.reasons.length === 0) {
    failures.push(`${expectation.file}: privacy blockers must include explainable reasons`);
  }
}

if (failures.length > 0) {
  console.error("Story publish safety assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Story publish safety assertions passed");
