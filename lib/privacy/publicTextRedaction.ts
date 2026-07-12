/**
 * Deterministic public-boundary text redaction.
 *
 * This helper deliberately returns only the redacted string. It never builds an
 * audit trail containing the sensitive values it removed, so callers cannot
 * accidentally persist those values in logs, public DTOs, or analytics.
 */

export const PUBLIC_REDACTION_MARKERS = {
  email: "[EMAIL REDACTED]",
  phone: "[PHONE REDACTED]",
  ssn: "[SSN REDACTED]",
  address: "[ADDRESS REDACTED]",
} as const;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const PHONE_PATTERN =
  /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

// The separated form intentionally accepts a two- or three-digit first group.
// That lets the replacer distinguish real calendar dates such as 12-31-1899
// from SSN-shaped identifiers such as 123-45-1987. Compact nine-digit values
// are unambiguously treated as identifiers.
const SSN_OR_DATE_PATTERN =
  /(?<!\d)(?:(\d{2,3})([-.\s])(\d{2})\2(\d{4})|(\d{9}))(?!\d)/g;

const STREET_ADDRESS_PATTERN =
  /\b\d{1,6}\s+(?:[A-Z0-9][A-Z0-9.'-]*\s+){0,6}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Boulevard|Blvd|Highway|Hwy|Way|Place|Pl|Terrace|Ter|Parkway|Pkwy)\b\.?(?:\s*,?\s*(?:Apt|Apartment|Unit|Suite|Ste)\.?\s*#?[A-Z0-9-]+)?/gi;

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isCalendarDateOrder(month: number, day: number, year: number) {
  return (
    year >= 1500 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function isLikelyHistoricalDate(first: string, second: string, yearText: string) {
  // A standard SSN has a three-digit first group. Never reinterpret one as a
  // date merely because its final four digits happen to look like a year.
  if (first.length !== 2) return false;

  const firstNumber = Number(first);
  const secondNumber = Number(second);
  const year = Number(yearText);

  // Preserve both common month-day-year and day-month-year historical dates.
  return (
    isCalendarDateOrder(firstNumber, secondNumber, year) ||
    isCalendarDateOrder(secondNumber, firstNumber, year)
  );
}

function redactSsnWithoutRedactingDates(value: string) {
  return value.replace(
    SSN_OR_DATE_PATTERN,
    (match, first: string | undefined, _separator: string | undefined, second: string | undefined, year: string | undefined) => {
      if (first && second && year && isLikelyHistoricalDate(first, second, year)) {
        return match;
      }
      return PUBLIC_REDACTION_MARKERS.ssn;
    }
  );
}

/**
 * Remove common direct identifiers from text before it crosses a public data
 * boundary. The transformation is deterministic and idempotent.
 */
export function redactPublicText(value: string): string {
  const withoutEmails = value.replace(EMAIL_PATTERN, PUBLIC_REDACTION_MARKERS.email);
  const withoutPhones = withoutEmails.replace(PHONE_PATTERN, PUBLIC_REDACTION_MARKERS.phone);
  const withoutSsn = redactSsnWithoutRedactingDates(withoutPhones);
  return withoutSsn.replace(STREET_ADDRESS_PATTERN, PUBLIC_REDACTION_MARKERS.address);
}
