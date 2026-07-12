/**
 * GEN-88 §C: unit tests for the server-side living-person / PII scanner used by
 * `/api/process` to stop a client from forwarding unredacted data to the
 * external AI while falsely declaring it "redacted".
 *
 * Bias is precision over recall, so these assert both that real PII trips the
 * scanner and that ordinary genealogy prose does NOT.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hasVerifiedOriginalReviewAuthority,
  scanAiEgressForLivingPersonPII,
  scanForLivingPersonPII,
} from "@/lib/ai/redaction";

const NOW_YEAR = 2026;

describe("scanForLivingPersonPII — flags real PII", () => {
  const cases: Array<{ label: string; text: string; indicator: string }> = [
    { label: "email", text: "Contact jane.doe@example.com for records.", indicator: "email_address" },
    { label: "SSN", text: "Her SSN was 123-45-6789 on the form.", indicator: "us_ssn" },
    { label: "phone", text: "Call him at (801) 555-1234 tomorrow.", indicator: "phone_number" },
    { label: "street address", text: "They lived at 742 Evergreen Terrace before moving.", indicator: "street_address" },
    { label: "living marker", text: "This subject is still living — do not publish.", indicator: "living_person_marker" },
    { label: "recent birth year", text: "The grandson, born 1998, still lives nearby.", indicator: "recent_birth_year" },
  ];

  for (const c of cases) {
    test(c.label, () => {
      const scan = scanForLivingPersonPII(c.text, NOW_YEAR);
      assert.equal(scan.hasPII, true, `expected PII for: ${c.text}`);
      assert.ok(scan.indicators.includes(c.indicator), `expected indicator ${c.indicator}, got ${scan.indicators.join(",")}`);
    });
  }
});

describe("scanForLivingPersonPII — passes clean historical prose", () => {
  const clean = [
    "John Smith was born in 1842 in Philadelphia and died in 1911.",
    "The family emigrated from County Cork sometime after the famine.",
    "Census records from 1880 list six children in the household.",
    "",
  ];
  for (const text of clean) {
    test(JSON.stringify(text.slice(0, 40)), () => {
      const scan = scanForLivingPersonPII(text, NOW_YEAR);
      assert.equal(scan.hasPII, false, `unexpected PII ${scan.indicators.join(",")} for: ${text}`);
      assert.deepEqual(scan.indicators, []);
    });
  }
});

describe("scanForLivingPersonPII — birth-year recency respects the 110y window", () => {
  test("a birth year older than 110 years is not living PII", () => {
    // 1900 is >110y before 2026, so it must NOT flag as recent.
    const scan = scanForLivingPersonPII("Ancestor born 1900, long deceased.", NOW_YEAR);
    assert.equal(scan.hasPII, false);
  });
  test("a birth year within 110 years flags", () => {
    const scan = scanForLivingPersonPII("Relative born 1950.", NOW_YEAR);
    assert.ok(scan.indicators.includes("recent_birth_year"));
  });
});

describe("scanAiEgressForLivingPersonPII — covers every provider-bound text surface", () => {
  for (const field of ["prompt", "serializedData", "systemPrompt"] as const) {
    test(`detects PII embedded in ${field}`, () => {
      const input = { prompt: "clean", serializedData: "clean", systemPrompt: "clean" };
      input[field] = "Contact living.relative@example.com";
      const scan = scanAiEgressForLivingPersonPII(input, NOW_YEAR);
      assert.equal(scan.hasPII, true);
      assert.ok(scan.indicators.includes("email_address"));
    });
  }

  test("passes clean provider-bound historical content", () => {
    const scan = scanAiEgressForLivingPersonPII(
      {
        systemPrompt: "Analyze the supplied historical source.",
        prompt: "Summarize this 1880 census record.",
        serializedData: '{"ancestor":"John Smith","birthYear":1842}',
      },
      NOW_YEAR,
    );
    assert.equal(scan.hasPII, false);
  });
});

describe("hasVerifiedOriginalReviewAuthority", () => {
  test("accepts only a Clerk-backed signed-in user context", () => {
    assert.equal(
      hasVerifiedOriginalReviewAuthority({ mode: "user", userId: "user_synthetic" }),
      true,
    );
  });

  for (const access of [
    null,
    { mode: "user" as const, userId: null },
    { mode: "user" as const, userId: "   " },
    { mode: "local" as const, userId: null },
    { mode: "anonymous" as const, userId: null },
  ]) {
    test(`refuses ${access?.mode ?? "missing"} authority`, () => {
      assert.equal(hasVerifiedOriginalReviewAuthority(access), false);
    });
  }
});
