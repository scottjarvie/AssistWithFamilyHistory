/**
 * Behavioral unit tests for the pure vault-core helpers (owner normalization,
 * owner filtering, operation summary, research-check inference).
 *
 * GEN-101: migrated to the node:test runner (run via `node --import tsx --test`).
 * Every assertion from the original top-level script is preserved verbatim;
 * they are only grouped into named test() cases for better reporting. Uses
 * @/ path aliases (tsx resolves them).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOperationSummary,
  compareOwnerForShadow,
  filterByVaultOwner,
  inferResearchChecks,
  matchesVaultOwner,
  normalizeVaultOwnerId,
} from "@/convex/vaultCore";

const now = Date.now();

test("normalizeVaultOwnerId / matchesVaultOwner default to local-dev", () => {
  assert.equal(normalizeVaultOwnerId(undefined), "local-dev");
  assert.equal(matchesVaultOwner(undefined, "local-dev"), true);
});

test("filterByVaultOwner returns only the owner's rows", () => {
  assert.deepEqual(
    filterByVaultOwner(
      [
        { vaultOwnerId: "owner-a", value: 1 },
        { vaultOwnerId: "owner-b", value: 2 },
        { value: 3 },
      ],
      "owner-a"
    ).map((row) => row.value),
    [1]
  );
});

// GEN-87 Phase 1 (SHADOW): the pure owner-comparison chokepoint. These assert
// the cardinal rule — the supplied owner is ALWAYS returned (shadow never
// switches the owner); mismatch is observe-only and is true only when a
// verified identity is present AND disagrees.
test("compareOwnerForShadow: matching identity -> normalized supplied owner, no mismatch", () => {
  assert.deepEqual(compareOwnerForShadow("user_X", "user_X"), {
    owner: normalizeVaultOwnerId("user_X"),
    mismatch: false,
  });
});

test("compareOwnerForShadow: mismatching identity still returns the SUPPLIED owner (no switch), mismatch:true", () => {
  assert.deepEqual(compareOwnerForShadow("user_X", "user_Y"), {
    owner: normalizeVaultOwnerId("user_Y"),
    mismatch: true,
  });
});

test("compareOwnerForShadow: guest / null / undefined identity never mismatches", () => {
  assert.deepEqual(compareOwnerForShadow(null, "guest_z"), {
    owner: normalizeVaultOwnerId("guest_z"),
    mismatch: false,
  });
  assert.deepEqual(compareOwnerForShadow(undefined, "guest_z"), {
    owner: normalizeVaultOwnerId("guest_z"),
    mismatch: false,
  });
});

test("compareOwnerForShadow: normalization is consistent with matchesVaultOwner", () => {
  // Undefined/empty supplied owner normalizes to the local-dev default. When the
  // verified identity is that same default, there is no mismatch — same rule
  // matchesVaultOwner uses.
  assert.deepEqual(compareOwnerForShadow(undefined, undefined), {
    owner: normalizeVaultOwnerId(undefined),
    mismatch: false,
  });
  assert.deepEqual(compareOwnerForShadow(normalizeVaultOwnerId(undefined), undefined), {
    owner: normalizeVaultOwnerId(undefined),
    mismatch: false,
  });
  // A present identity that differs from the normalized (defaulted) supplied
  // owner is a mismatch, mirroring matchesVaultOwner returning false.
  assert.equal(matchesVaultOwner(undefined, "user_X"), false);
  assert.deepEqual(compareOwnerForShadow("user_X", undefined), {
    owner: normalizeVaultOwnerId(undefined),
    mismatch: true,
  });
});

test("buildOperationSummary aggregates required/recommended/critical and next actions", () => {
  const summary = buildOperationSummary([
    {
      checkKey: "identity_review",
      status: "needs_review",
      applicability: "required",
      summary: "Review identity confidence and import warnings.",
    },
    {
      checkKey: "birth_record",
      status: "complete",
      applicability: "required",
      summary: "Birth evidence is attached.",
    },
    {
      checkKey: "memories",
      status: "missing",
      applicability: "recommended",
      summary: "Look for memories.",
    },
  ]);

  assert.equal(summary.requiredMissingCount, 1);
  assert.equal(summary.recommendedMissingCount, 1);
  assert.deepEqual(summary.criticalMissing, ["identity_review"]);
  assert.deepEqual(summary.nextActions, ["Review identity confidence and import warnings.", "Look for memories."]);
});

const person = {
  _id: "person:1",
  vaultOwnerId: "owner-a",
  fsId: "KWCJ-4XD",
  name: { given: "John", surname: "Jarvie" },
  sex: "male",
  living: false,
  birth: { date: { original: "1890", year: 1890 } },
  death: { date: { original: "1960", year: 1960 } },
  researchStatus: "in_progress",
  createdAt: now,
  updatedAt: now,
} as never;

function getCheck(checks: Array<{ checkKey: string; status: string }>, key: string) {
  const check = checks.find((entry) => entry.checkKey === key);
  assert.ok(check, `Expected ${key} check`);
  return check;
}

test("inferResearchChecks marks checks complete when evidence is present", () => {
  const inferredClean = inferResearchChecks({
    person,
    sources: [
      {
        _id: "source:birth",
        vaultOwnerId: "owner-a",
        title: "Birth and Baptism Register",
        type: "church_record",
        repository: "FamilySearch",
        notes: "Birth evidence",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "source:census",
        vaultOwnerId: "owner-a",
        title: "United States Census, 1910",
        type: "census",
        repository: "FamilySearch",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "source:death",
        vaultOwnerId: "owner-a",
        title: "Death and Burial Record",
        type: "vital_record",
        repository: "FamilySearch",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "source:marriage",
        vaultOwnerId: "owner-a",
        title: "Marriage Record",
        type: "vital_record",
        repository: "FamilySearch",
        createdAt: now,
        updatedAt: now,
      },
    ] as never,
    events: [
      { _id: "event:birth", type: "birth", vaultOwnerId: "owner-a", createdAt: now, updatedAt: now },
      { _id: "event:census", type: "census", vaultOwnerId: "owner-a", createdAt: now, updatedAt: now },
      { _id: "event:death", type: "death", vaultOwnerId: "owner-a", createdAt: now, updatedAt: now },
    ] as never,
    relationships: [
      {
        _id: "relationship:1",
        vaultOwnerId: "owner-a",
        type: "Couple",
        person1: "person:1",
        person2: "person:2",
        createdAt: now,
        updatedAt: now,
      },
    ] as never,
    media: [{ _id: "media:1", vaultOwnerId: "owner-a", type: "photo", title: "Portrait" }] as never,
    documents: [{ _id: "document:1", vaultOwnerId: "owner-a", type: "PS", title: "Person Sheet" }] as never,
    stories: [] as never,
    places: [{ _id: "place:1", vaultOwnerId: "owner-a", name: "Ogden", fullName: "Ogden, Utah, United States" }] as never,
    importRuns: [
      {
        _id: "import:1",
        vaultOwnerId: "owner-a",
        personFsId: "KWCJ-4XD",
        personName: "John Jarvie",
        warnings: [],
        createdAt: now,
        updatedAt: now,
      },
    ] as never,
    provisionalRelatives: [] as never,
  });

  assert.equal(getCheck(inferredClean, "identity_review").status, "complete");
  assert.equal(getCheck(inferredClean, "birth_record").status, "complete");
  assert.equal(getCheck(inferredClean, "death_record").status, "complete");
  assert.equal(getCheck(inferredClean, "census").status, "complete");
  assert.equal(getCheck(inferredClean, "relationships").status, "complete");
  assert.equal(getCheck(inferredClean, "memories").status, "complete");
});

test("inferResearchChecks flags identity_review when import warnings exist", () => {
  const inferredWithWarnings = inferResearchChecks({
    person,
    sources: [{ title: "Census", type: "census", notes: "" }] as never,
    events: [] as never,
    relationships: [] as never,
    media: [] as never,
    documents: [] as never,
    stories: [] as never,
    places: [] as never,
    importRuns: [{ warnings: ["Duplicate sourceKey detected."] }] as never,
    provisionalRelatives: [] as never,
  });

  assert.equal(getCheck(inferredWithWarnings, "identity_review").status, "needs_review");
});
