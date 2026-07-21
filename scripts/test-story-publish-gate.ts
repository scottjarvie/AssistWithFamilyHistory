/**
 * GEN-88 §A: tests for `evaluateStoryPublishGate`, the pure decision the Convex
 * writer (`updateStoryStatus`) now enforces so a direct Convex caller cannot
 * publish a story past the readiness / privacy / second-review / human-review
 * gates by bypassing the Next API route.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateStoryPublishGate,
  type StoryPublishGateDecisionInput,
  type StoryPublishSafetyInput,
} from "@/lib/stories/publishSafety";

const NOW_YEAR = 2026;

// A fully publish-ready bundle: every gate in assessStoryPublishReadiness passes.
function readyBundle(): StoryPublishSafetyInput {
  return {
    story: {
      status: "review",
      title: "A Grounded Life",
      content: "x".repeat(500), // >= 400 chars for story_context_strength
      citationIds: ["c1", "c2"],
    },
    person: {
      displayName: "John Smith",
      living: false,
      birth: { date: { year: 1850 } },
      death: { date: { year: 1920 } },
    },
    readiness: { requiredMissingCount: 0 },
    researchChecks: [],
    contextCoverage: { publishableCount: 1, missingPlaces: [] },
    evidence: [{ source: { title: "Parish Register" }, citations: [{}, {}] }],
    events: [],
    places: [{}],
    relationships: [],
    provisionalRelatives: [],
    nowYear: NOW_YEAR,
  };
}

function gateInput(overrides: Partial<StoryPublishGateDecisionInput> = {}): StoryPublishGateDecisionInput {
  return {
    story: { secondReviewRequired: false, secondReviewedAt: undefined },
    readiness: readyBundle(),
    humanReviewConfirmed: true,
    humanReviewNote: "Reviewed by a human editor for living-person risk.",
    ...overrides,
  };
}

describe("evaluateStoryPublishGate", () => {
  test("a fully ready + reviewed + human-confirmed story is allowed", () => {
    const errors = evaluateStoryPublishGate(gateInput());
    assert.deepEqual(errors, [], `expected no blockers, got: ${errors.join(" | ")}`);
  });

  test("second review required but not done is blocked", () => {
    const errors = evaluateStoryPublishGate(
      gateInput({ story: { secondReviewRequired: true, secondReviewedAt: undefined } }),
    );
    assert.ok(errors.some((e) => e.includes("Second review required")), errors.join(" | "));
  });

  test("second review required AND satisfied is not blocked on that gate", () => {
    const errors = evaluateStoryPublishGate(
      gateInput({ story: { secondReviewRequired: true, secondReviewedAt: 1_700_000_000_000 } }),
    );
    assert.ok(!errors.some((e) => e.includes("Second review required")), errors.join(" | "));
  });

  test("missing human-review confirmation is blocked", () => {
    const errors = evaluateStoryPublishGate(gateInput({ humanReviewConfirmed: false }));
    assert.ok(errors.some((e) => /human review/i.test(e)), errors.join(" | "));
  });

  test("too-short human-review note is blocked", () => {
    const errors = evaluateStoryPublishGate(gateInput({ humanReviewNote: "ok" }));
    assert.ok(errors.some((e) => /review note/i.test(e)), errors.join(" | "));
  });

  test("an unready bundle (no person, no evidence) is publish-blocked", () => {
    const bare: StoryPublishSafetyInput = {
      story: { status: "draft", title: "Thin", content: "short", citationIds: [] },
      person: null,
      nowYear: NOW_YEAR,
    };
    const errors = evaluateStoryPublishGate(gateInput({ readiness: bare }));
    assert.ok(errors.some((e) => e.includes("Story publish blocked")), errors.join(" | "));
  });

  test("a living source person is publish-blocked on privacy", () => {
    const bundle = readyBundle();
    bundle.person = { displayName: "Living Kin", living: true, birth: { date: { year: 1990 } } };
    const errors = evaluateStoryPublishGate(gateInput({ readiness: bundle }));
    assert.ok(errors.some((e) => e.includes("Story publish blocked")), errors.join(" | "));
  });
});

test("route and writer retain the same authoritative publish-gate contract", () => {
  const route = readFileSync("app/api/stories/[id]/status/route.ts", "utf8");
  const writer = readFileSync("convex/vaultMutations.ts", "utf8");

  assert.ok(writer.includes("evaluateStoryPublishGate({"));
  assert.ok(writer.includes("buildStoryBundle(snapshot, currentStory)"));
  assert.ok(writer.includes("enforceStoryPolicyViolation("));
  assert.ok(writer.includes("humanReviewConfirmed: args.humanReviewConfirmed"));
  assert.ok(writer.includes("humanReviewNote: args.humanReviewNote"));
  assert.ok(route.includes("humanReviewConfirmed:"));
  assert.ok(route.includes("humanReviewNote:"));
  assert.ok(route.includes('if (body.status !== "published")'));
});
