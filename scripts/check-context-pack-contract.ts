import { readFileSync } from "node:fs";

const contextPackSource = readFileSync("convex/vault.ts", "utf8");

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

console.log("Context pack contract checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
