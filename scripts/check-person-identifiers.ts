import assert from "node:assert/strict";
import {
  getPersonRouteId,
  matchesPersonIdentifier,
  stringifyPersonIdentifier,
} from "../lib/vault/personIdentifier";

assert.equal(getPersonRouteId("KWZ1-ABC", "person_123"), "KWZ1-ABC");
assert.equal(getPersonRouteId(undefined, "person_123"), "person_123");
assert.equal(stringifyPersonIdentifier({ toString: () => "person_456" }), "person_456");

assert.equal(
  matchesPersonIdentifier("KWZ1-ABC", { fsId: "KWZ1-ABC", id: "person_123" }),
  true
);
assert.equal(
  matchesPersonIdentifier("person_123", { fsId: "KWZ1-ABC", id: "person_123" }),
  true
);
assert.equal(
  matchesPersonIdentifier("different", { fsId: "KWZ1-ABC", id: "person_123" }),
  false
);

console.log("Person identifier checks passed");
