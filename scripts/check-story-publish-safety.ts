import { readFileSync } from "fs";
import path from "path";
import { assessStoryPublishReadiness, type StoryPublishSafetyInput } from "../lib/stories/publishSafety";

type FixtureExpectation = {
  file: string;
  canPublish: boolean;
  requiredBlockers: string[];
};

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "stories");
const expectations: FixtureExpectation[] = [
  {
    file: "ready-review-story.json",
    canPublish: true,
    requiredBlockers: [],
  },
  {
    file: "blocked-missing-evidence.json",
    canPublish: false,
    requiredBlockers: ["evidence", "context", "review_status", "story_context_strength"],
  },
  {
    file: "blocked-living-risk.json",
    canPublish: false,
    requiredBlockers: ["privacy_living_status"],
  },
  {
    file: "blocked-provisional-relative.json",
    canPublish: false,
    requiredBlockers: ["provisional_relatives"],
  },
];

function readFixture(file: string): StoryPublishSafetyInput {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), "utf8")) as StoryPublishSafetyInput;
}

const failures: string[] = [];

for (const expectation of expectations) {
  const readiness = assessStoryPublishReadiness(readFixture(expectation.file));
  const blockerKeys = new Set(readiness.blockers.map((blocker) => blocker.key));

  if (readiness.canPublish !== expectation.canPublish) {
    failures.push(
      `${expectation.file}: expected canPublish=${expectation.canPublish}, received ${readiness.canPublish}`
    );
  }

  for (const key of expectation.requiredBlockers) {
    if (!blockerKeys.has(key)) {
      failures.push(`${expectation.file}: missing blocker ${key}`);
    }
  }

  if (readiness.provenance.citations < 0 || readiness.score < 0 || readiness.score > 100) {
    failures.push(`${expectation.file}: readiness metrics are outside expected bounds`);
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
