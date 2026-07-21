import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_REDACTION_MARKERS,
  redactPublicText,
} from "../lib/privacy/publicTextRedaction";

test("redactPublicText removes public-boundary direct identifiers", () => {
  const sensitiveValues = [
    "Ada.Example+family@example.org",
    "+1 (602) 555-0199",
    "480.555.0123",
    "123-45-6789",
    "987654321",
    "1234 Fictional Valley Road, Apt 5B",
  ];
  const input = [
    `Email ${sensitiveValues[0]}.`,
    `Call ${sensitiveValues[1]} or ${sensitiveValues[2]}.`,
    `Identifiers: ${sensitiveValues[3]} and ${sensitiveValues[4]}.`,
    `Address: ${sensitiveValues[5]}.`,
  ].join(" ");

  const redacted = redactPublicText(input);

  for (const sensitiveValue of sensitiveValues) {
    assert.equal(redacted.includes(sensitiveValue), false);
  }
  assert.match(redacted, /\[EMAIL REDACTED\]/);
  assert.equal(redacted.match(/\[PHONE REDACTED\]/g)?.length, 2);
  assert.equal(redacted.match(/\[SSN REDACTED\]/g)?.length, 2);
  assert.match(redacted, /\[ADDRESS REDACTED\]/);
});

test("redactPublicText preserves valid historical calendar dates", () => {
  const historicalText =
    "Born 12-31-1899, indexed again as 31-12-1899 and 01/02/1901; ISO date 1899-12-31.";

  assert.equal(redactPublicText(historicalText), historicalText);
});

test("an SSN remains redacted when its final digits look like a year", () => {
  const redacted = redactPublicText("Sensitive identifier 123-45-1987.");

  assert.equal(redacted, `Sensitive identifier ${PUBLIC_REDACTION_MARKERS.ssn}.`);
});

test("redaction is deterministic, idempotent, and leaves ordinary text unchanged", () => {
  const ordinary = "Mary crossed the valley in 1899 and kept a careful family journal.";
  assert.equal(redactPublicText(ordinary), ordinary);

  const first = redactPublicText("Contact person@example.com at 602-555-0199.");
  const second = redactPublicText("Contact person@example.com at 602-555-0199.");
  assert.equal(first, second);
  assert.equal(redactPublicText(first), first);
});
