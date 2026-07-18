/**
 * GEN-79 regression test — the public /stories/<id> route must never rethrow a
 * Convex error (which renders a production 500). It degrades every error to
 * notFound(); known bad-identifier shapes are a quiet 404, everything else is a
 * loud-logged 404.
 *
 * This locks the classifier that drives that decision. The critical case is the
 * Convex deploy desync ("Could not find function ...") — it must be classified
 * `recognized: false` so the route takes the log-then-notFound() path instead
 * of the old `throw error` that produced the 500.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { classifyPublicStoryError } from "../lib/stories/publicStoryError";

test("known bad-identifier errors are recognized as a quiet 404", () => {
  const known = [
    new Error("ArgumentValidationError: expected Id<'stories'>"),
    new Error("Value does not match validator for storyIdentifier"),
    new Error("Invalid id: not a convex id"),
    new Error("NotFoundError: story missing"),
    new Error("Document not found"),
    new Error("Document does not exist"),
  ];
  for (const error of known) {
    const result = classifyPublicStoryError(error);
    assert.equal(result.recognized, true, `expected recognized for: ${error.message}`);
  }
});

test("Convex deploy desync ('Could not find function') is NOT quietly recognized", () => {
  // This is the exact production failure from GEN-79. It must fall through to
  // the loud-log-then-404 path, not be silently swallowed — and above all it
  // must never rethrow (a 500).
  const desync = new Error(
    "Could not find public function for 'vault:getPublishedStoryByIdentifier'",
  );
  const result = classifyPublicStoryError(desync);
  assert.equal(result.recognized, false);
});

test("unexpected and non-Error values are classified as unrecognized (still a 404, never a throw)", () => {
  const unexpected: unknown[] = [
    new Error("boom: something unexpected"),
    new TypeError("cannot read properties of undefined"),
    "a string, not an Error",
    { message: "an object" },
    null,
    undefined,
  ];
  for (const error of unexpected) {
    const result = classifyPublicStoryError(error);
    assert.equal(result.recognized, false, `expected unrecognized for: ${String(error)}`);
  }
});
