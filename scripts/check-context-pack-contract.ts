/**
 * Context pack contract check.
 *
 * Mix of three assertion styles, labeled below:
 *
 * 1. Behavioral: imports the actual gate functions from convex/vault.ts and
 *    runs them against fixture entries. A behavior-preserving refactor (rename
 *    a constant, extract a helper) does NOT break these. A semantic change
 *    (e.g. accepting `family_review` privacy for AI) WILL.
 *
 * 2. Doc contract: the docs are the source of truth for some invariants.
 *    String-match against `docs/` is appropriate because the doc text itself
 *    is what we're enforcing.
 *
 * 3. UI surface contract: the user-visible wording on Story Review is
 *    part of the agent handoff contract. String-match against `app/app/`
 *    TSX is acceptable here but should be migrated as the UI testing
 *    story grows (see GEN-63 description).
 */

import { readFileSync } from "node:fs";
import {
  isContextPackEligibleHistoricalContext,
  isPublishablePublicHistoricalContext,
} from "../convex/vault";

// -- 1. Behavioral assertions on the actual gate functions ----------------

type HistoricalContextFixture = Parameters<typeof isContextPackEligibleHistoricalContext>[0];

function fixture(overrides: Partial<HistoricalContextFixture>): HistoricalContextFixture {
  return {
    _id: "fixture" as HistoricalContextFixture["_id"],
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
  } as HistoricalContextFixture;
}

const aiEligibleCases: Array<{ name: string; entry: HistoricalContextFixture; expected: boolean }> = [
  {
    name: "reviewed + family_review + aiAllowed → eligible",
    entry: fixture({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: true }),
    expected: true,
  },
  {
    name: "redacted + publish_candidate + aiAllowed → eligible",
    entry: fixture({ reviewStatus: "redacted", privacyLevel: "publish_candidate", aiUseAllowed: true }),
    expected: true,
  },
  {
    name: "reviewed + private + aiAllowed → NOT eligible (private blocked)",
    entry: fixture({ reviewStatus: "reviewed", privacyLevel: "private", aiUseAllowed: true }),
    expected: false,
  },
  {
    name: "reviewed + family_review + aiUseAllowed=false → NOT eligible",
    entry: fixture({ reviewStatus: "reviewed", privacyLevel: "family_review", aiUseAllowed: false }),
    expected: false,
  },
  {
    name: "unreviewed + family_review + aiAllowed → NOT eligible",
    entry: fixture({ reviewStatus: "unreviewed", privacyLevel: "family_review", aiUseAllowed: true }),
    expected: false,
  },
  {
    name: "disputed + family_review + aiAllowed → NOT eligible",
    entry: fixture({ reviewStatus: "disputed", privacyLevel: "family_review", aiUseAllowed: true }),
    expected: false,
  },
  {
    name: "missing all gate fields → NOT eligible (safe default)",
    entry: fixture({}),
    expected: false,
  },
];

for (const tc of aiEligibleCases) {
  const actual = isContextPackEligibleHistoricalContext(tc.entry);
  assert(actual === tc.expected, `AI gate: ${tc.name} (expected ${tc.expected}, got ${actual})`);
}

const publishableCases: Array<{ name: string; entry: HistoricalContextFixture; expected: boolean }> = [
  {
    name: "publish_candidate + reviewed → publishable",
    entry: fixture({ privacyLevel: "publish_candidate", reviewStatus: "reviewed" }),
    expected: true,
  },
  {
    name: "public_source + redacted → publishable",
    entry: fixture({ privacyLevel: "public_source", reviewStatus: "redacted" }),
    expected: true,
  },
  {
    name: "family_review + reviewed → NOT publishable (AI ok, public NOT ok)",
    entry: fixture({ privacyLevel: "family_review", reviewStatus: "reviewed" }),
    expected: false,
  },
  {
    name: "public_source + unreviewed → NOT publishable",
    entry: fixture({ privacyLevel: "public_source", reviewStatus: "unreviewed" }),
    expected: false,
  },
  {
    name: "publish_candidate + disputed → NOT publishable",
    entry: fixture({ privacyLevel: "publish_candidate", reviewStatus: "disputed" }),
    expected: false,
  },
  {
    name: "missing all gate fields → NOT publishable (safe default)",
    entry: fixture({}),
    expected: false,
  },
];

for (const tc of publishableCases) {
  const actual = isPublishablePublicHistoricalContext(tc.entry);
  assert(actual === tc.expected, `Publish gate: ${tc.name} (expected ${tc.expected}, got ${actual})`);
}

// -- 2. Doc contract assertions ------------------------------------------

const docSource = readFileSync("docs/context/place-era-research-packs.md", "utf8");
for (const token of [
  "reviewed, non-private",
  "Gate Semantics By Surface",
  "aiEligibleEntries",
  "publishableEntries",
]) {
  assert(docSource.includes(token), `Place-era doc missing required term: ${token}`);
}

// -- 3. UI surface contract assertions (string-match against TSX) --------

const contextPackSource = readFileSync("convex/vault.ts", "utf8");
for (const token of [
  // These describe the structured/markdown context-pack export shape.
  // Behavior-level assertions for these would require a Convex query
  // harness; tracked under GEN-63.
  "evidenceTrace",
  "storyClaimReadiness",
  "## Evidence Trace",
  "## Story Claim Readiness",
  "completionSource",
  "lastReviewedAt",
  "unresolvedProvisionalRelatives",
  "mediaNeedingPrivacyReview",
  "aiUseAllowed",
  "Media/privacy review needed",
  "missingContextPlaces",
  "Research pack:",
  "Review/privacy:",
  "categoryBlocks",
]) {
  assert(contextPackSource.includes(token), `Context pack export is missing ${token}`);
}

const storyReviewSource = readFileSync("app/app/stories/[storyId]/page.tsx", "utf8");
for (const token of [
  "Research Pack Provenance",
  "contextPackIds",
  "categoryBlocks",
  "sourcedClaims",
  "Synthesis:",
  "Person-specific claims still need source facts or citations",
  // GEN-65: provenance fallback must distinguish "attached at save time"
  // from "currently available" so a draft saved before tracking landed
  // can't be confused with a draft that recorded its own provenance.
  "hasRecordedProvenance",
  "saved before pack provenance was tracked",
  "available, not attached",
]) {
  assert(storyReviewSource.includes(token), `Story review is missing ${token}`);
}

console.log("Context pack contract checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
