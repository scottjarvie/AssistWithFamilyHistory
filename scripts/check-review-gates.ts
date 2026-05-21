import { requireHumanReviewConfirmation } from "@/lib/operations/reviewGates";

assert(
  requireHumanReviewConfirmation({
    actionName: "Provisional relative merge",
    confirmed: false,
    note: "",
  }).length === 2,
  "Missing human review should fail both gates.",
);

assert(
  requireHumanReviewConfirmation({
    actionName: "Story publish",
    confirmed: true,
    note: "Human reviewed evidence and privacy before publishing.",
  }).length === 0,
  "Explicit human review should pass.",
);

console.log("Review gate checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
