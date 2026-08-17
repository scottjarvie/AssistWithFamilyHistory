/**
 * AWF-0046: the AI context pack must carry the actual conflicts.
 *
 * This sits on the flagship sourced-branch path, end to end and with no
 * mocking of the parts that matter:
 *
 *   real FamilySearch capture fixture
 *     -> the real conflict detector (`findSourceFactConflicts`)
 *     -> the vault rows the importer writes for a flagged fact
 *        (`lib/familysearch/importer.ts` — confidence "low", status
 *        "conflict", the reason text, and the auto-opened
 *        `conflict_resolution` research task)
 *     -> the real person-workspace assembly (`assemblePersonWorkspaceFromSnapshot`)
 *     -> the real context-pack export (`buildContextPack`)
 *
 * Before this test, `structured.unresolvedConflicts` was assigned
 * `storyClaimReadiness.unresolvedImportWarnings` — an array of import-warning
 * STRINGS. An AI asked to help resolve a conflict was handed a list that
 * contained no conflicts. The assertions below fail loudly against that
 * behavior: they require conflict objects carrying both readings, and they
 * require the import-warning strings to be absent from that field and present
 * under their own honest name.
 *
 * The authority assertions are the other half. Resolving a conflict is the
 * researcher's judgment call, and the consent screen already promises the
 * person that a connected AI "cannot accept a conclusion for you". The pack
 * therefore has to say so where the AI will read it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCapturePackage, type CapturePackage } from "@/lib/familysearch/capture";
import { extractSourceBackedFacts, findSourceFactConflicts } from "@/lib/familysearch/sourceFacts";
import { assemblePersonWorkspaceFromSnapshot } from "@/convex/vault";
import { buildContextPack } from "@/convex/contextPackBuilder";

const OWNER = "local-dev";
const PERSON = "persons:1";
const IMPORT_WARNING = "Capture came from an unverified page and needs a human look.";

let clock = 1_000;
const t = () => ++clock;

/* eslint-disable @typescript-eslint/no-explicit-any */

function row(id: string, fields: Record<string, unknown>) {
  return { _id: id, _creationTime: t(), vaultOwnerId: OWNER, ...fields } as any;
}

// ---------------------------------------------------------------------------
// 1. Real capture, real detector.
// ---------------------------------------------------------------------------

const baseCapture = parseCapturePackage(
  JSON.parse(
    readFileSync(path.join(process.cwd(), "tests", "fixtures", "capture", "valid-source-v2.json"), "utf8")
  )
).capture;

// The classic genealogy disagreement: the person record this vault concluded
// says 1888, and the indexed birth register the researcher just captured says
// 3 February 1890. Same shape as `scripts/check-source-facts.ts`.
const conflictingCapture: CapturePackage = {
  ...baseCapture,
  person: { ...baseCapture.person, birthDate: "1888" },
  sources: [
    {
      ...baseCapture.sources[0],
      title: "Birth Register",
      indexed: {
        ...baseCapture.sources[0].indexed,
        fields: [
          ...baseCapture.sources[0].indexed.fields,
          { label: "Birth Date", value: "3 February 1890" },
        ],
      },
    },
  ],
};

const facts = extractSourceBackedFacts(conflictingCapture);
const conflicts = findSourceFactConflicts(conflictingCapture, facts);
// Pick the date-versus-date disagreement explicitly. The detector also flags
// the source's birth PLACE against the person's birth DATE, because
// `classifyFactField` types a "Birth Place" field as factType "birth" and
// `findSourceFactConflicts` then compares its value to `person.birthDate`
// (`lib/familysearch/sourceFacts.ts`). That false positive is recorded as
// Card AWF-0047 and is not this test's subject.
const birthConflict = conflicts.find((conflict) => conflict.importedValue.includes("1890"));
assert.ok(birthConflict, "fixture precondition: the detector must flag the birth-date conflict");
const conflictingFact = facts.find((fact) => fact.factKey === birthConflict.factKey);
assert.ok(conflictingFact, "fixture precondition: the flagged fact must be one of the extracted facts");
const agreeingFact = facts.find((fact) => !conflicts.some((c) => c.factKey === fact.factKey));
assert.ok(agreeingFact, "fixture precondition: at least one fact must NOT be in conflict");

// ---------------------------------------------------------------------------
// 2. The vault rows the importer writes for that capture.
// ---------------------------------------------------------------------------

const snapshot = {
  people: [
    row(PERSON, {
      fsId: conflictingCapture.person.familySearchId,
      name: { given: "John", surname: "Jarvie" },
      living: false,
      birth: { date: { original: conflictingCapture.person.birthDate, year: 1888 } },
      death: { date: { original: conflictingCapture.person.deathDate, year: 1960 } },
      researchStatus: "in_progress",
      createdAt: t(),
      updatedAt: t(),
    }),
  ],
  sources: [
    row("sources:1", { title: "Birth Register", type: "church_record", repository: "FamilySearch", createdAt: t(), updatedAt: t() }),
    // The record on the other side of the argument: the source the vault's
    // current 1888 conclusion rests on.
    row("sources:2", { title: "Family Bible Transcript", type: "book", createdAt: t(), updatedAt: t() }),
  ],
  citations: [
    row("citations:1", {
      sourceId: "sources:1",
      isEvidence: true,
      confidence: "high",
      extractedText: "Birth Register entry: born 3 February 1890.",
      // `conflictsWith` has been written and never read since the model landed.
      conflictsWith: ["citations:2"],
      createdAt: t(),
      updatedAt: t(),
    }),
    row("citations:2", {
      sourceId: "sources:2",
      isEvidence: true,
      confidence: "medium",
      extractedText: "Family Bible: born 1888.",
      createdAt: t(),
      updatedAt: t(),
    }),
  ],
  citationLinks: [
    row("citationLinks:1", { citationId: "citations:1", targetType: "person", targetId: PERSON, field: "imported_source", createdAt: t() }),
    row("citationLinks:2", { citationId: "citations:2", targetType: "person", targetId: PERSON, field: "birth", createdAt: t() }),
  ],
  sourceFacts: [
    // Exactly what `importer.ts` writes when the detector flags a fact:
    // confidence downgraded to "low", status "conflict", reason recorded.
    row("sourceFacts:1", {
      personId: PERSON,
      sourceId: "sources:1",
      citationId: "citations:1",
      importKey: `fs-fact:${conflictingCapture.person.familySearchId}:${conflictingFact.factKey}`,
      factType: conflictingFact.factType,
      label: conflictingFact.label,
      value: conflictingFact.value,
      date: conflictingFact.date,
      place: conflictingFact.place,
      confidence: "low",
      status: "conflict",
      conflictReason: birthConflict.reason,
      createdAt: t(),
      updatedAt: t(),
    }),
    // A fact from the same import that does NOT disagree. It must not be
    // reported as a conflict.
    row("sourceFacts:2", {
      personId: PERSON,
      sourceId: "sources:1",
      citationId: "citations:1",
      importKey: `fs-fact:${conflictingCapture.person.familySearchId}:${agreeingFact.factKey}`,
      factType: agreeingFact.factType,
      label: agreeingFact.label,
      value: agreeingFact.value,
      confidence: agreeingFact.confidence,
      status: "candidate",
      createdAt: t(),
      updatedAt: t(),
    }),
  ],
  importRuns: [
    row("importRuns:1", {
      personId: PERSON,
      personFsId: conflictingCapture.person.familySearchId,
      personName: "John Jarvie",
      captureId: "c1",
      captureVersion: "2",
      pageTypes: ["sources"],
      sourceUrls: [],
      capturedAt: t(),
      importedAt: t(),
      compatibilityMode: false,
      mergeStatus: "created",
      counts: { sources: 1, citations: 1, memories: 0, relationships: 0, places: 0, events: 0, warnings: 1 },
      // A real import warning. It is NOT a conflict, and the whole defect was
      // that this string was what the AI received when it asked for conflicts.
      warnings: [IMPORT_WARNING],
      artifactPaths: {},
    }),
  ],
  researchTasks: [
    row("researchTasks:1", {
      personId: PERSON,
      type: "conflict_resolution",
      title: "Review source-backed fact conflicts",
      description: `${birthConflict.factType}: source says "${birthConflict.importedValue}" while the current person fact is "${birthConflict.canonicalValue}".`,
      status: "todo",
      priority: "high",
      aiSuggested: false,
      createdAt: t(),
      updatedAt: t(),
    }),
  ],
  relationships: [],
  events: [],
  personEvents: [],
  places: [],
  media: [],
  contextItems: [],
  researchLog: [],
  documents: [],
  stories: [],
  storyReviewEvents: [],
  historicalContext: [],
  researchChecks: [],
  provisionalRelatives: [],
} as any;

const workspace = assemblePersonWorkspaceFromSnapshot(snapshot, PERSON);
assert.ok(workspace, "fixture precondition: the person workspace must assemble");

// The fixture carries no media or loose context, so the media/context privacy
// gates are not under test here; `scripts/test-context-gates.ts` owns those.
const pack = buildContextPack(workspace as any, {
  isContextPackEligibleMedia: () => false,
  isContextPackEligibleContextItem: () => false,
  isPublicStoryMedia: () => false,
});

const { structured, markdown } = pack;

// ---------------------------------------------------------------------------
// 3. Assertions.
// ---------------------------------------------------------------------------

test("unresolvedConflicts carries conflicts, not import warnings", () => {
  assert.equal(
    structured.unresolvedConflicts.length,
    1,
    "the one sourceFact with status 'conflict' must be the one entry"
  );
  assert.ok(
    structured.unresolvedConflicts.every((entry) => typeof entry === "object" && entry !== null),
    "conflicts must be objects; an array of strings means the field is still aliased to import warnings"
  );
  assert.ok(
    !JSON.stringify(structured.unresolvedConflicts).includes(IMPORT_WARNING),
    "an import warning must never appear in unresolvedConflicts"
  );
});

test("import warnings remain, under their own honest name", () => {
  assert.deepEqual(
    structured.unresolvedImportWarnings,
    [IMPORT_WARNING],
    "import warnings must still reach the AI, just not as conflicts"
  );
  assert.deepEqual(
    structured.storyClaimReadiness.unresolvedImportWarnings,
    [IMPORT_WARNING],
    "the Story Writer reads this field; it must not change shape"
  );
});

test("a conflict carries both readings and the citation behind the disagreeing one", () => {
  const [conflict] = structured.unresolvedConflicts;
  assert.equal(conflict.factType, "birth");
  assert.equal(conflict.sourceReading, "3 February 1890", "the reading the source carries");
  assert.equal(conflict.canonicalReading, "1888", "the reading this vault currently concludes");
  assert.equal(conflict.confidence, "low", "the importer downgrades a flagged fact");
  assert.equal(conflict.conflictReason, birthConflict.reason);
  assert.equal(String(conflict.sourceFactId), "sourceFacts:1", "the row a resolution would act on");
  assert.equal(conflict.evidence.sourceTitle, "Birth Register");
  assert.ok(conflict.evidence.text?.includes("3 February 1890"), "the cited text must travel with the claim");
});

test("citations.conflictsWith is finally read, so the losing reading stays visible", () => {
  const [conflict] = structured.unresolvedConflicts;
  assert.equal(conflict.conflictsWith.length, 1, "the opposing citation must be carried, not dropped");
  assert.equal(conflict.conflictsWith[0].sourceTitle, "Family Bible Transcript");
  assert.ok(
    conflict.conflictsWith[0].text?.includes("1888"),
    "the record decided against must remain readable"
  );
});

test("facts that do not disagree are not reported as conflicts", () => {
  assert.ok(
    structured.sourceFacts.length > structured.unresolvedConflicts.length,
    "the fixture must contain a non-conflicting fact for this to mean anything"
  );
  assert.ok(
    !structured.unresolvedConflicts.some((entry) => String(entry.sourceFactId) === "sourceFacts:2"),
    "a candidate fact is not a conflict"
  );
});

test("the pack states who may settle a conflict", () => {
  assert.equal(structured.conflictResolutionAuthority.decidedBy, "person");
  assert.match(structured.conflictResolutionAuthority.aiMay, /propose/);
  assert.match(structured.conflictResolutionAuthority.aiMayNot, /accept, reject, or otherwise settle/);
  assert.equal(
    structured.unresolvedConflicts[0].authority.decidedBy,
    "person",
    "authority must travel on the conflict itself, not only at the top of the pack"
  );
});

test("the markdown pack shows the conflict and separates it from import warnings", () => {
  assert.ok(markdown.includes("## Unresolved Conflicts"), "markdown must have a conflicts section");
  assert.ok(markdown.includes("## Unresolved Import Warnings"), "markdown must keep the warnings section");
  const conflictSection = markdown.slice(
    markdown.indexOf("## Unresolved Conflicts"),
    markdown.indexOf("## Unresolved Import Warnings")
  );
  assert.ok(conflictSection.includes("3 February 1890"), "the source reading must be shown");
  assert.ok(conflictSection.includes("1888"), "the vault's reading must be shown beside it");
  assert.ok(conflictSection.includes("Family Bible Transcript"), "the losing reading must stay visible");
  assert.ok(
    !conflictSection.includes(IMPORT_WARNING),
    "an import warning must not be rendered as a conflict"
  );
  assert.ok(
    markdown.slice(markdown.indexOf("## Unresolved Import Warnings")).includes(IMPORT_WARNING),
    "the import warning still belongs in its own section"
  );
  assert.ok(
    conflictSection.includes("Never delete the record you decided against."),
    "the pack must tell a reader not to discard the losing record"
  );
});

test("a vault with no conflicts says so plainly", () => {
  const clean = {
    ...snapshot,
    sourceFacts: [snapshot.sourceFacts[1]],
  };
  const cleanWorkspace = assemblePersonWorkspaceFromSnapshot(clean, PERSON);
  const cleanPack = buildContextPack(cleanWorkspace as any, {
    isContextPackEligibleMedia: () => false,
    isContextPackEligibleContextItem: () => false,
    isPublicStoryMedia: () => false,
  });
  assert.deepEqual(cleanPack.structured.unresolvedConflicts, []);
  assert.ok(
    cleanPack.markdown.includes("No source-backed facts are currently flagged as conflicting."),
    "an empty conflict list must not read as an empty import-warning list"
  );
  assert.deepEqual(
    cleanPack.structured.unresolvedImportWarnings,
    [IMPORT_WARNING],
    "warnings are independent of conflicts"
  );
});
