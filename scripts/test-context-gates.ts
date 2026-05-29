/**
 * Behavioral tests for the AI/publish gate split added in commit 9246cb2.
 *
 * Covers:
 * 1. The two predicate gates (privacy/review/AI matrix) — also covered by
 *    `check:context-pack-contract`, repeated here so the gate behavior is
 *    asserted under the test suite too.
 * 2. `assessStoryPublishReadiness` consuming `publishableCount` when the
 *    caller supplies it, with the new blocker message firing only when
 *    context exists but none is publish-ready.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isContextPackEligibleContextItem,
  isContextPackEligibleHistoricalContext,
  isContextPackEligibleMedia,
  isPublishablePublicHistoricalContext,
} from "@/convex/vault";
import { assessStoryPublishReadiness, type StoryPublishSafetyInput } from "@/lib/stories/publishSafety";

// -- 1. Predicate gates -------------------------------------------------

type GateEntry = Parameters<typeof isContextPackEligibleHistoricalContext>[0];

function entry(overrides: Partial<GateEntry>): GateEntry {
  return {
    _id: "fixture" as GateEntry["_id"],
    _creationTime: 0,
    vaultOwnerId: "fixture",
    timePeriod: { startYear: 1900, endYear: 1950 },
    topic: "daily_life",
    title: "fixture",
    content: "fixture",
    sources: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as GateEntry;
}

describe("historicalContext gates (AI vs publish)", () => {
  test("AI gate accepts only reviewed/redacted + non-private + aiUseAllowed", () => {
    assert.equal(
      isContextPackEligibleHistoricalContext(
        entry({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: true })
      ),
      true,
      "AI gate: reviewed + family_review + aiAllowed should pass"
    );
    assert.equal(
      isContextPackEligibleHistoricalContext(
        entry({ reviewStatus: "reviewed", privacyLevel: "private", aiUseAllowed: true })
      ),
      false,
      "AI gate: reviewed + private should NOT pass even with aiAllowed"
    );
    assert.equal(
      isContextPackEligibleHistoricalContext(
        entry({ reviewStatus: "unreviewed", privacyLevel: "family_review", aiUseAllowed: true })
      ),
      false,
      "AI gate: unreviewed should NOT pass"
    );
    assert.equal(
      isContextPackEligibleHistoricalContext(entry({})),
      false,
      "AI gate: missing fields should default to NOT eligible"
    );
  });

  test("Public gate is strictly tighter: only publish_candidate or public_source", () => {
    assert.equal(
      isPublishablePublicHistoricalContext(
        entry({ privacyLevel: "publish_candidate", reviewStatus: "reviewed" })
      ),
      true,
      "Publish gate: publish_candidate + reviewed should pass"
    );
    assert.equal(
      isPublishablePublicHistoricalContext(
        entry({ privacyLevel: "family_review", reviewStatus: "reviewed" })
      ),
      false,
      "Publish gate: family_review should NOT pass (allowed for AI, not public)"
    );
    assert.equal(
      isPublishablePublicHistoricalContext(
        entry({ privacyLevel: "public_source", reviewStatus: "unreviewed" })
      ),
      false,
      "Publish gate: unreviewed should NOT pass even with public_source"
    );
  });
});

// -- 1b. ContextItem AI gate (GEN-71) -----------------------------------

type ContextItemEntry = Parameters<typeof isContextPackEligibleContextItem>[0];

function ctxItem(overrides: Partial<ContextItemEntry>): ContextItemEntry {
  return {
    _id: "fixture" as ContextItemEntry["_id"],
    _creationTime: 0,
    vaultOwnerId: "fixture",
    title: "fixture",
    itemType: "note",
    evidenceRole: "raw_material",
    content: "fixture",
    personIds: [],
    privacyLevel: "private",
    reviewStatus: "unreviewed",
    aiUseAllowed: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as ContextItemEntry;
}

test("ContextItem AI gate (GEN-71) requires reviewed + non-private + aiUseAllowed", () => {
  assert.equal(
    isContextPackEligibleContextItem(
      ctxItem({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: true })
    ),
    true,
    "ContextItem gate: reviewed + family_review + aiAllowed should pass"
  );
  assert.equal(
    isContextPackEligibleContextItem(
      ctxItem({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: false })
    ),
    false,
    "ContextItem gate: aiUseAllowed:false must block even when reviewed + non-private (the GEN-71 fix)"
  );
  assert.equal(
    isContextPackEligibleContextItem(
      ctxItem({ reviewStatus: "reviewed", privacyLevel: "private", aiUseAllowed: true })
    ),
    false,
    "ContextItem gate: private must block even when reviewed + aiAllowed"
  );
  assert.equal(
    isContextPackEligibleContextItem(
      ctxItem({ reviewStatus: "unreviewed", privacyLevel: "family_review", aiUseAllowed: true })
    ),
    false,
    "ContextItem gate: unreviewed must block even when non-private + aiAllowed"
  );
});

// -- 1c. Media AI gate (GEN-72) -----------------------------------------

type MediaEntry = Parameters<typeof isContextPackEligibleMedia>[0];

function media(overrides: Partial<MediaEntry>): MediaEntry {
  return {
    _id: "fixture" as MediaEntry["_id"],
    _creationTime: 0,
    vaultOwnerId: "fixture",
    title: "fixture",
    type: "photo",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as MediaEntry;
}

test("Media AI gate (GEN-72) requires reviewed + non-private + aiUseAllowed", () => {
  assert.equal(
    isContextPackEligibleMedia(
      media({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: true })
    ),
    true,
    "Media AI gate: reviewed + family_review + aiAllowed should pass"
  );
  assert.equal(
    isContextPackEligibleMedia(
      media({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: false })
    ),
    false,
    "Media AI gate: aiUseAllowed:false must block (the GEN-72 fix)"
  );
  assert.equal(
    isContextPackEligibleMedia(
      media({ reviewStatus: "reviewed", privacyLevel: "private", aiUseAllowed: true })
    ),
    false,
    "Media AI gate: private must block"
  );
  assert.equal(
    isContextPackEligibleMedia(media({})),
    false,
    "Media AI gate: missing fields default to NOT eligible"
  );
});

// -- 2. Publish safety with publishableCount ----------------------------

function baseInput(coverage: NonNullable<StoryPublishSafetyInput["contextCoverage"]>): StoryPublishSafetyInput {
  return {
    story: {
      content: "A".repeat(400),
      status: "review",
    },
    person: { displayName: "Test", living: false, lifespan: "1800-1880" },
    readiness: { requiredMissingCount: 0 },
    researchChecks: [],
    contextCoverage: coverage,
    evidence: [{ source: { title: "Census" }, citations: [{}] }],
    events: [{ type: "birth", date: { year: 1800 } }],
    places: [],
    relationships: [],
    provisionalRelatives: [],
    publishWarnings: [],
    nowYear: 2026,
  };
}

describe("assessStoryPublishReadiness consumes publishableCount", () => {
  test("publishableCount=0 with contextReports>0 fires a clearer context blocker", () => {
    const blockedNoPublishable = assessStoryPublishReadiness(
      baseInput({ count: 3, publishableCount: 0, missingPlaces: [] })
    );
    const contextGate = blockedNoPublishable.blockers.find((b) => b.key === "context");
    assert.ok(contextGate, "publishableCount=0 with contextReports>0 should produce a context blocker");
    assert.match(
      contextGate!.detail,
      /none are reviewed at publish-candidate or public-source/,
      "Context blocker should explain that no context is publish-ready"
    );
  });

  test("publishableCount>0 passes the context gate regardless of total count", () => {
    const allowed = assessStoryPublishReadiness(
      baseInput({ count: 5, publishableCount: 2, missingPlaces: [] })
    );
    const allowedContext = allowed.blockers.find((b) => b.key === "context");
    assert.equal(
      allowedContext,
      undefined,
      "publishableCount>0 should not produce a context blocker"
    );
  });

  test("missing publishableCount falls back to count (backwards compat)", () => {
    const legacyAllowed = assessStoryPublishReadiness(
      baseInput({ count: 3, missingPlaces: [] })
    );
    const legacyContext = legacyAllowed.blockers.find((b) => b.key === "context");
    assert.equal(
      legacyContext,
      undefined,
      "Missing publishableCount should fall back to count for backwards compat"
    );
  });

  test("both zero keeps the original 'add at least one' blocker wording", () => {
    const blockedNoContext = assessStoryPublishReadiness(
      baseInput({ count: 0, publishableCount: 0, missingPlaces: [] })
    );
    const noContextGate = blockedNoContext.blockers.find((b) => b.key === "context");
    assert.ok(noContextGate, "Zero context should still block publish");
    assert.match(
      noContextGate!.detail,
      /Add at least one place/,
      "Zero-context blocker should retain the original 'Add at least one' wording"
    );
  });
});
