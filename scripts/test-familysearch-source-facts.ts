import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractFactsFromSource,
  findSourceFactConflicts,
  type SourceBackedFact,
} from "@/lib/familysearch/sourceFacts";
import type { CapturePackage, CaptureSource } from "@/lib/familysearch/capture";

function source(
  fields: CaptureSource["indexed"]["fields"],
  overrides: Partial<CaptureSource> = {},
): CaptureSource {
  return {
    id: "synthetic-source-1",
    orderIndex: 0,
    sourceKey: "synthetic-source-key",
    sourceType: "record",
    title: "Birth Register",
    tags: [],
    indexed: { fields, textBlocks: [] },
    rawText: "",
    expanded: false,
    expansionAttempts: 0,
    expansionSucceeded: true,
    relatedPeople: [],
    placeMentions: [],
    outboundUrls: [],
    ...overrides,
  };
}

function capture(overrides: Partial<CapturePackage["person"]> = {}): CapturePackage {
  return {
    schemaVersion: "2.0",
    captureId: "synthetic-capture",
    capturedAt: "2026-10-22T12:00:00.000Z",
    extractorVersion: "2.0.0",
    extractionDurationMs: 10,
    pageType: "sources",
    pageUrl: "https://www.familysearch.org/en/tree/person/sources/ABCD-123",
    pageTitle: "Synthetic source capture",
    uiLocale: "en",
    person: {
      familySearchId: "ABCD-123",
      name: "John Jarvie",
      birthDate: "1888",
      deathDate: "1950",
      ...overrides,
    },
    sources: [],
    memories: [],
    placeMentions: [],
    diagnostics: {
      mode: "standard",
      totalSources: 0,
      totalMemories: 0,
      expandedSections: 0,
      failedExpansions: 0,
      warnings: [],
      errors: [],
    },
  };
}

function fact(factKey: string, factType: SourceBackedFact["factType"], value: string): SourceBackedFact {
  return {
    factKey,
    factType,
    label: factType,
    value,
    sourceKey: "synthetic-source-key",
    sourceTitle: "Synthetic source",
    confidence: "medium",
  };
}

describe("FamilySearch source-backed fact extraction", () => {
  test("classifies supported labels, trims values, skips empty or unknown fields, and keeps stable keys", () => {
    const input = source([
      { label: "Name", value: " John Jarvie " },
      { label: "Sex", value: " Male " },
      { label: "Birth Date", value: " 3 February 1890 " },
      { label: "Birth Place", value: " Dunedin " },
      { label: "Eye colour", value: "Blue" },
      { label: "Birth Date", value: "   " },
    ]);

    const first = extractFactsFromSource(input);
    const replay = extractFactsFromSource(input);

    assert.deepEqual(first.map((entry) => entry.factType), ["name", "sex", "birth", "birth"]);
    assert.deepEqual(first.map((entry) => entry.value), [
      "John Jarvie",
      "Male",
      "3 February 1890",
      "Dunedin",
    ]);
    assert.equal(first[0]?.factKey, "synthetic-source-key:name:0");
    assert.deepEqual(first.map((entry) => entry.factKey), replay.map((entry) => entry.factKey));
    assert.ok(first.every((entry) => entry.sourceKey === input.sourceKey && entry.sourceTitle === input.title));
  });

  test("recognizes marriage, death, census, residence, and occupation evidence", () => {
    const cases = [
      { title: "Marriage Register", label: "Marriage Date", value: "1910", expected: "marriage" },
      { title: "Burial Register", label: "Burial Date", value: "1950", expected: "death" },
      { title: "1920 United States Census", label: "Age", value: "32", expected: "census_residence" },
      { title: "Place Index", label: "Residence", value: "Dunedin", expected: "residence" },
      { title: "Employment Record", label: "Occupation", value: "Carpenter", expected: "occupation" },
    ] as const;

    for (const entry of cases) {
      const [result] = extractFactsFromSource(source(
        [{ label: entry.label, value: entry.value }],
        { title: entry.title },
      ));
      assert.equal(result?.factType, entry.expected, `${entry.title} / ${entry.label}`);
    }
  });

  test("uses field dates and places first, then inherits the source event context", () => {
    const facts = extractFactsFromSource(source([
      { label: "Event Date", value: "12 May 1910" },
      { label: "Event Place", value: "Dunedin, Otago" },
      { label: "Name", value: "Ada Jarvie" },
      { label: "Birth Date", value: "4 March 1888" },
      { label: "Birth Place", value: "Nelson" },
    ], { title: "Birth Register" }));

    const name = facts.find((entry) => entry.factType === "name");
    const birthDate = facts.find((entry) => entry.label === "Birth Date");
    const birthPlace = facts.find((entry) => entry.label === "Birth Place");

    assert.equal(name?.date, "12 May 1910");
    assert.equal(name?.place, "Dunedin, Otago");
    assert.equal(birthDate?.date, "4 March 1888");
    assert.equal(birthDate?.place, "Dunedin, Otago");
    assert.equal(birthPlace?.date, "12 May 1910");
    assert.equal(birthPlace?.place, "Nelson");
  });

  test("assigns high, medium, and low confidence from expansion evidence", () => {
    const high = extractFactsFromSource(source(
      [{ label: "Name", labelRaw: "Name", value: "Ada Jarvie" }],
      { expanded: true, rawText: "x".repeat(151) },
    ));
    const mediumExpanded = extractFactsFromSource(source(
      [{ label: "Name", value: "Ada Jarvie" }],
      { expanded: true, rawText: "short" },
    ));
    const mediumIndexed = extractFactsFromSource(source([
      { label: "Name", value: "Ada Jarvie" },
      { label: "Sex", value: "Female" },
      { label: "Birth Date", value: "1888" },
    ]));
    const low = extractFactsFromSource(source([{ label: "Name", value: "Ada Jarvie" }]));

    assert.equal(high[0]?.confidence, "high");
    assert.equal(mediumExpanded[0]?.confidence, "medium");
    assert.ok(mediumIndexed.every((entry) => entry.confidence === "medium"));
    assert.equal(low[0]?.confidence, "low");
  });
});

test("source facts flag only substantive name and year conflicts against capture headers", () => {
  const input = capture();
  const conflicts = findSourceFactConflicts(input, [
    fact("name-same", "name", "Jarvie John"),
    fact("name-different", "name", "John Brown"),
    fact("birth-same-year", "birth", "4 March 1888"),
    fact("birth-different-year", "birth", "4 March 1890"),
    fact("death-same-year", "death", "1950"),
    fact("death-different-year", "death", "1951"),
  ]);

  assert.deepEqual(conflicts.map((entry) => entry.factKey), [
    "name-different",
    "birth-different-year",
    "death-different-year",
  ]);
  assert.ok(conflicts.every((entry) => entry.canonicalValue));
});
