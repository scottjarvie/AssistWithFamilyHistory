import { readFileSync } from "node:fs";

const contextPackSource = readFileSync("convex/vault.ts", "utf8");
const storyReviewSource = readFileSync("app/app/stories/[storyId]/page.tsx", "utf8");

for (const token of [
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
  "isContextPackEligibleHistoricalContext",
  "entry.aiUseAllowed === true",
  "reviewStatus === \"reviewed\" || reviewStatus === \"redacted\"",
  "privacyLevel !== \"private\"",
  "Research pack:",
  "Review/privacy:",
  "categoryBlocks",
]) {
  assert(contextPackSource.includes(token), `Context pack is missing ${token}`);
}

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
