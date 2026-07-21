// GEN-88 §C: server-side redaction / living-person PII scanner.
//
// `/api/process` forwards user `data` to an external AI (OpenRouter). The client
// declares a `redactionMode`, but that label is untrusted — a client can send
// living-person original data while claiming it is "redacted". This module is
// the server-side check: when the caller claims "redacted", we scan the payload
// for high-precision PII / living-person indicators and refuse to forward on a
// hit.
//
// Design bias: PRECISION over recall. A false positive rejects a legitimate
// request, so every detector below targets an unambiguous, structured pattern
// (email, phone, SSN, street address, explicit living markers, or an explicit
// recent birth-year label). This is not a full PII engine — it is a targeted
// guard against the "I said it was redacted but it wasn't" egress path. It never
// makes a network call and is fully deterministic (pass `nowYear` for tests).

export type LivingPersonPiiScan = {
  hasPII: boolean;
  indicators: string[];
};

export type AiEgressPrivacyInput = {
  prompt: string;
  serializedData: string;
  systemPrompt: string;
};

export type AiOriginalReviewAccess = {
  mode: "user" | "local" | "anonymous";
  userId: string | null;
};

// Someone born within this many years is treated as potentially living, matching
// the livingPrivacyAgeThreshold used by lib/stories/publishSafety.ts.
const LIVING_BIRTH_YEAR_WINDOW = 110;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
// North American phone numbers with common separators. Anchored on the 3-3-4
// shape so bare 10-digit ids (e.g. record numbers) do not trip it.
const PHONE_RE = /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const STREET_ADDRESS_RE =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Place|Pl|Terrace|Ter|Highway|Hwy)\b\.?/i;
// Explicit "do not publish this / this person is living" phrasing. Deliberately
// NOT a bare /living/ — that word appears in ordinary genealogy prose.
const LIVING_MARKER_RE =
  /\b(?:do[\s-]?not[\s-]?publish|still living|currently living|is living|living relative|living person|confidential|redact(?:ed)? per|private[\s-]?do not)\b/i;
// A birth-year LABEL followed by a 4-digit year (e.g. "born 1990", "b. 1990",
// "DOB: 1990", "date of birth 1990"). The year recency is checked in code.
const BIRTH_YEAR_LABEL_RE = /\b(?:born|b\.|dob|date of birth|birth)\b[^\d]{0,12}((?:19|20)\d{2})/gi;

function hasRecentBirthYear(text: string, nowYear: number): boolean {
  BIRTH_YEAR_LABEL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BIRTH_YEAR_LABEL_RE.exec(text)) !== null) {
    const year = Number(match[1]);
    if (Number.isFinite(year) && nowYear - year < LIVING_BIRTH_YEAR_WINDOW) {
      return true;
    }
  }
  return false;
}

/**
 * Scan text for high-precision living-person / PII indicators. Returns the list
 * of indicator keys found (empty when clean). Deterministic — `nowYear` defaults
 * to the current year but tests should pass a fixed value.
 */
export function scanForLivingPersonPII(text: string, nowYear: number = new Date().getFullYear()): LivingPersonPiiScan {
  const indicators: string[] = [];
  if (typeof text !== "string" || text.length === 0) {
    return { hasPII: false, indicators };
  }

  if (EMAIL_RE.test(text)) indicators.push("email_address");
  if (SSN_RE.test(text)) indicators.push("us_ssn");
  if (PHONE_RE.test(text)) indicators.push("phone_number");
  if (STREET_ADDRESS_RE.test(text)) indicators.push("street_address");
  if (LIVING_MARKER_RE.test(text)) indicators.push("living_person_marker");
  if (hasRecentBirthYear(text, nowYear)) indicators.push("recent_birth_year");

  return { hasPII: indicators.length > 0, indicators };
}

/**
 * Scan the exact text surfaces sent to the provider. Source-document workflows
 * embed their family-history data directly in `prompt`, while Story Writer uses
 * `data`; scanning only one field leaves a route-level egress bypass.
 */
export function scanAiEgressForLivingPersonPII(
  input: AiEgressPrivacyInput,
  nowYear: number = new Date().getFullYear(),
): LivingPersonPiiScan {
  return scanForLivingPersonPII(
    [input.systemPrompt, input.prompt, input.serializedData].filter(Boolean).join("\n\n"),
    nowYear,
  );
}

/**
 * `original_reviewed` requires Clerk-backed user authority. A local fallback or
 * anonymous/guest vault identifier is not evidence that a signed-in person
 * reviewed private human-subject data.
 */
export function hasVerifiedOriginalReviewAuthority(
  access: AiOriginalReviewAccess | null,
): boolean {
  return access?.mode === "user" && typeof access.userId === "string" && access.userId.trim().length > 0;
}
