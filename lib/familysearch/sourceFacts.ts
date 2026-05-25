import type { CapturePackage, CaptureSource } from "@/lib/familysearch/capture";

export type SourceFactType =
  | "name"
  | "sex"
  | "birth"
  | "death"
  | "marriage"
  | "census_residence"
  | "residence"
  | "occupation"
  | "other";

export type SourceBackedFact = {
  factKey: string;
  factType: SourceFactType;
  label: string;
  value: string;
  date?: string;
  place?: string;
  sourceKey: string;
  sourceTitle: string;
  confidence: "high" | "medium" | "low";
};

export type SourceFactConflict = {
  factKey: string;
  factType: SourceFactType;
  importedValue: string;
  canonicalValue?: string;
  reason: string;
};

type IndexedField = CaptureSource["indexed"]["fields"][number];

export function extractSourceBackedFacts(capture: CapturePackage): SourceBackedFact[] {
  return capture.sources.flatMap((source) => extractFactsFromSource(source));
}

export function extractFactsFromSource(source: CaptureSource): SourceBackedFact[] {
  const eventDate = firstFieldValue(source, [
    /event date/i,
    /^date$/i,
    /birth date/i,
    /death date/i,
    /marriage date/i,
  ]);
  const eventPlace = firstFieldValue(source, [
    /event place/i,
    /^place$/i,
    /birth place/i,
    /death place/i,
    /marriage place/i,
    /residence/i,
  ]);

  return source.indexed.fields
    .map((field, index) => {
      const value = field.value.trim();
      if (!value) return null;

      const factType = classifyFactField(field, source);
      if (!factType) return null;

      return {
        factKey: `${source.sourceKey}:${normalizeFieldLabel(field.label)}:${index}`,
        factType,
        label: field.label,
        value,
        date: pickFieldDate(field, eventDate, source.date),
        place: pickFieldPlace(field, eventPlace),
        sourceKey: source.sourceKey,
        sourceTitle: source.title,
        confidence: inferFactConfidence(source, field),
      } satisfies SourceBackedFact;
    })
    .filter(Boolean) as SourceBackedFact[];
}

export function findSourceFactConflicts(
  capture: CapturePackage,
  facts: SourceBackedFact[]
): SourceFactConflict[] {
  const canonicalName = normalizeComparable(capture.person.name);
  const canonicalBirth = normalizeComparable(capture.person.birthDate);
  const canonicalDeath = normalizeComparable(capture.person.deathDate);

  const conflicts: SourceFactConflict[] = [];

  for (const fact of facts) {
    if (fact.factType === "name" && canonicalName && !sameLooseName(fact.value, capture.person.name)) {
      conflicts.push({
        factKey: fact.factKey,
        factType: fact.factType,
        importedValue: fact.value,
        canonicalValue: capture.person.name,
        reason: "Indexed source name differs from the capture header name.",
      });
      continue;
    }

    if (fact.factType === "birth" && canonicalBirth && !sameYearOrText(fact.value, capture.person.birthDate)) {
      conflicts.push({
        factKey: fact.factKey,
        factType: fact.factType,
        importedValue: fact.value,
        canonicalValue: capture.person.birthDate,
        reason: "Indexed source birth value differs from the capture header birth fact.",
      });
      continue;
    }

    if (fact.factType === "death" && canonicalDeath && !sameYearOrText(fact.value, capture.person.deathDate)) {
      conflicts.push({
        factKey: fact.factKey,
        factType: fact.factType,
        importedValue: fact.value,
        canonicalValue: capture.person.deathDate,
        reason: "Indexed source death value differs from the capture header death fact.",
      });
    }
  }

  return conflicts;
}

function classifyFactField(field: IndexedField, source: CaptureSource): SourceFactType | null {
  const label = field.label.toLowerCase();
  const title = source.title.toLowerCase();
  const eventType = firstFieldValue(source, [/event type/i])?.toLowerCase() ?? "";
  const combined = `${label} ${title} ${eventType}`;

  if (/^(name|principal|deceased|bride|groom)$/i.test(field.label)) return "name";
  if (/sex|gender/i.test(label)) return "sex";
  if (/birth/i.test(combined) && /date|place|birth/i.test(label)) return "birth";
  if (/death|burial/i.test(combined) && /date|place|death|burial/i.test(label)) return "death";
  if (/marriage/i.test(combined) && /date|place|marriage|spouse|bride|groom/i.test(label)) {
    return "marriage";
  }
  if (/census/i.test(combined) && /place|residence|location|date|age|occupation/i.test(label)) {
    return "census_residence";
  }
  if (/residence|event place|location|place/i.test(label)) return "residence";
  if (/occupation/i.test(label)) return "occupation";
  return null;
}

function firstFieldValue(source: CaptureSource, patterns: RegExp[]) {
  return source.indexed.fields.find((field) => patterns.some((pattern) => pattern.test(field.label)))?.value.trim();
}

function pickFieldDate(field: IndexedField, eventDate?: string, sourceDate?: string) {
  if (/date/i.test(field.label)) return field.value.trim();
  return eventDate || sourceDate;
}

function pickFieldPlace(field: IndexedField, eventPlace?: string) {
  if (/place|location|residence/i.test(field.label)) return field.value.trim();
  return eventPlace;
}

function inferFactConfidence(source: CaptureSource, field: IndexedField) {
  if (source.expanded && source.rawText.length > 150 && field.labelRaw) return "high" as const;
  if (source.expanded || source.indexed.fields.length >= 3) return "medium" as const;
  return "low" as const;
}

function normalizeFieldLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field";
}

function normalizeComparable(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function sameLooseName(candidate: string, canonical: string) {
  const candidateParts = new Set(normalizeComparable(candidate).split(" ").filter(Boolean));
  const canonicalParts = normalizeComparable(canonical).split(" ").filter(Boolean);
  return canonicalParts.every((part) => candidateParts.has(part));
}

function sameYearOrText(candidate: string, canonical?: string) {
  const candidateYear = extractYear(candidate);
  const canonicalYear = extractYear(canonical);
  if (candidateYear && canonicalYear) return candidateYear === canonicalYear;
  return normalizeComparable(candidate) === normalizeComparable(canonical);
}

function extractYear(value?: string) {
  return value?.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1] ?? null;
}
