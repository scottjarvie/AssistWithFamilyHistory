/**
 * Redactor
 * 
 * Purpose: Redact sensitive information before AI processing
 * 
 * Key Elements:
 * - Email redaction
 * - Phone number redaction
 * - Address redaction
 * - Living person indicators
 * 
 * Dependencies:
 * - ./schemas (types)
 * 
 * Last Updated: Initial setup
 */

import type { EvidencePack, Source } from "./schemas";

// Patterns for sensitive information
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_PATTERN = /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_PATTERN = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g;
const ADDRESS_PATTERN = /\b\d{2,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Circle|Cir\.?|Boulevard|Blvd\.?|Way|Place|Pl\.)\b(?:\s*(?:Apt|Apartment|Unit|Suite|Ste)\.?\s*[A-Za-z0-9-]+)?/gi;

// Living indicators
const LIVING_INDICATORS = [
  "living",
  "private",
  "current address",
  "home address",
  "mailing address",
  "contact info",
  "contact information",
  "phone number",
  "email address",
  "text me",
  "cell phone",
  "living relative",
  "living cousin",
  "living grandchild",
  "private note",
  "do not publish",
  "unlisted",
];

export interface RedactionResult {
  redactedPack: EvidencePack;
  redactions: Redaction[];
  hasLivingIndicators: boolean;
}

export interface Redaction {
  sourceId: string;
  field: string;
  originalValue: string;
  redactedValue: string;
  type: "email" | "phone" | "ssn" | "address" | "living";
}

/**
 * Redact sensitive information from an Evidence Pack
 */
export function redactEvidencePack(pack: EvidencePack): RedactionResult {
  const redactions: Redaction[] = [];
  let hasLivingIndicators = false;

  // Deep clone the pack
  const redactedPack: EvidencePack = JSON.parse(JSON.stringify(pack));

  // Redact each source
  redactedPack.sources = redactedPack.sources.map((source) => {
    const sourceRedactions = redactSource(source);
    redactions.push(...sourceRedactions.redactions);
    
    if (sourceRedactions.hasLivingIndicators) {
      hasLivingIndicators = true;
    }

    return sourceRedactions.source;
  });

  return {
    redactedPack,
    redactions,
    hasLivingIndicators,
  };
}

/**
 * Redact a single source
 */
function redactSource(source: Source): {
  source: Source;
  redactions: Redaction[];
  hasLivingIndicators: boolean;
} {
  const redactions: Redaction[] = [];
  let hasLivingIndicators = false;
  const redactedSource = { ...source };

  // Check for living indicators
  const fullText = [
    source.title,
    source.citation,
    source.reasonAttached,
    source.rawText,
    ...source.indexed.fields.map(f => `${f.label} ${f.value}`),
    ...source.indexed.textBlocks,
  ].join(" ").toLowerCase();

  for (const indicator of LIVING_INDICATORS) {
    if (fullText.includes(indicator)) {
      hasLivingIndicators = true;
      break;
    }
  }

  // Redact citation
  if (source.citation) {
    const result = redactText(source.citation, source.id, "citation");
    redactedSource.citation = result.text;
    redactions.push(...result.redactions);
  }

  // Redact reason attached
  if (source.reasonAttached) {
    const result = redactText(source.reasonAttached, source.id, "reasonAttached");
    redactedSource.reasonAttached = result.text;
    redactions.push(...result.redactions);
  }

  // Redact raw text
  if (source.rawText) {
    const result = redactText(source.rawText, source.id, "rawText");
    redactedSource.rawText = result.text;
    redactions.push(...result.redactions);
  }

  // Redact indexed fields
  redactedSource.indexed = {
    ...source.indexed,
    fields: source.indexed.fields.map((field, idx) => {
      const result = redactText(field.value, source.id, `indexed.fields[${idx}].value`);
      redactions.push(...result.redactions);
      return { ...field, value: result.text };
    }),
    textBlocks: source.indexed.textBlocks.map((block, idx) => {
      const result = redactText(block, source.id, `indexed.textBlocks[${idx}]`);
      redactions.push(...result.redactions);
      return result.text;
    }),
  };

  return { source: redactedSource, redactions, hasLivingIndicators };
}

/**
 * Redact sensitive patterns from text
 */
function redactText(
  text: string,
  sourceId: string,
  field: string
): { text: string; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  let result = text;

  // Redact emails
  const emails = text.match(EMAIL_PATTERN) || [];
  for (const email of emails) {
    redactions.push({
      sourceId,
      field,
      originalValue: email,
      redactedValue: "[EMAIL REDACTED]",
      type: "email",
    });
    result = result.replace(email, "[EMAIL REDACTED]");
  }

  // Redact phone numbers
  const phones = text.match(PHONE_PATTERN) || [];
  for (const phone of phones) {
    redactions.push({
      sourceId,
      field,
      originalValue: phone,
      redactedValue: "[PHONE REDACTED]",
      type: "phone",
    });
    result = result.replace(phone, "[PHONE REDACTED]");
  }

  // Redact SSNs
  const ssns = text.match(SSN_PATTERN) || [];
  for (const ssn of ssns) {
    // Make sure it's not a date or other number
    if (!isLikelyDate(ssn)) {
      redactions.push({
        sourceId,
        field,
        originalValue: ssn,
        redactedValue: "[SSN REDACTED]",
        type: "ssn",
      });
      result = result.replace(ssn, "[SSN REDACTED]");
    }
  }

  // Redact street addresses after narrower identifiers so phone/SSN spans do not interfere.
  const addresses = text.match(ADDRESS_PATTERN) || [];
  for (const address of addresses) {
    redactions.push({
      sourceId,
      field,
      originalValue: address,
      redactedValue: "[ADDRESS REDACTED]",
      type: "address",
    });
    result = result.replace(address, "[ADDRESS REDACTED]");
  }

  return { text: result, redactions };
}

/**
 * Check if a pattern might be a date rather than SSN
 */
function isLikelyDate(text: string): boolean {
  // SSN pattern can match dates like 123-45-6789
  // Dates are more likely if they're in a context with months
  const cleaned = text.replace(/[-.\s]/g, "");
  const year = parseInt(cleaned.slice(-4));
  
  // If the last 4 digits look like a year between 1800-2100, it's probably a date
  return year >= 1800 && year <= 2100;
}

/**
 * Get a summary of redactions
 */
export function getRedactionSummary(redactions: Redaction[]): string {
  const counts = {
    email: 0,
    phone: 0,
    ssn: 0,
    address: 0,
    living: 0,
  };

  for (const r of redactions) {
    counts[r.type]++;
  }

  const parts: string[] = [];
  if (counts.email > 0) parts.push(`${counts.email} email(s)`);
  if (counts.phone > 0) parts.push(`${counts.phone} phone number(s)`);
  if (counts.ssn > 0) parts.push(`${counts.ssn} SSN(s)`);
  if (counts.address > 0) parts.push(`${counts.address} address(es)`);

  return parts.length > 0 ? `Redacted: ${parts.join(", ")}` : "No sensitive information found";
}
