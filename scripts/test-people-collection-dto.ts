import { test } from "node:test";
import assert from "node:assert/strict";
import { projectPeopleCollectionRow } from "../lib/vault/peopleCollection";

test("People discovery serializes only displayed fields, excluding private notes and internal artifacts", () => {
  const raw = {
    _id: "synthetic-person", routeId: "synthetic-person", displayName: "Synthetic Person", living: true, researchStatus: "basic",
    vaultOwnerId: "PRIVATE_owner", notes: "PRIVATE_living_notes", alternateNames: ["PRIVATE_alt"], futureBackendField: "PRIVATE_future",
    birth: { date: { year: 1970, original: "PRIVATE_full_date" }, place: { original: "PRIVATE_place" } },
    death: undefined,
    creationProvenance: { evidenceStatus: "unsourced", method: "PRIVATE_provenance", operatorNote: "PRIVATE_note" },
    stats: { sources: 2, imports: 1, memories: 3, documents: 4, stories: 0, tasks: 9, privateExtra: "PRIVATE_extra" },
    latestImport: { importedAt: 1000, artifactPaths: { rawDocumentPath: "PRIVATE_server_path" }, sourceUrls: ["PRIVATE_url"], warnings: ["PRIVATE_warning"], metadata: "PRIVATE_metadata" },
    operations: { nextActions: ["PRIVATE_action"], criticalMissing: ["PRIVATE_check"] },
    researchChecks: ["PRIVATE_research"], keyPlaces: ["PRIVATE_location"], contextCoverage: "PRIVATE_context",
  };
  const result = projectPeopleCollectionRow(raw as unknown as Parameters<typeof projectPeopleCollectionRow>[0]);
  assert.deepEqual(result, {
    _id: "synthetic-person", routeId: "synthetic-person", displayName: "Synthetic Person", living: true, researchStatus: "basic",
    birth: { date: { year: 1970 } }, death: undefined,
    creationProvenance: { evidenceStatus: "unsourced" },
    stats: { sources: 2, imports: 1, memories: 3, documents: 4, stories: 0 },
    latestImport: { importedAt: 1000 },
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  assert.notEqual(result.stats, raw.stats);
  assert.notEqual(result.latestImport, raw.latestImport);
});

test("People discovery preserves missing dates, provenance and import states", () => {
  const raw = { _id: "synthetic-empty", routeId: "synthetic-empty", displayName: "Synthetic Empty", living: false, researchStatus: "not_started", stats: { sources: 0, imports: 0, memories: 0, documents: 0, stories: 0 }, latestImport: null };
  const result = projectPeopleCollectionRow(raw as unknown as Parameters<typeof projectPeopleCollectionRow>[0]);
  assert.equal(result.birth, undefined);
  assert.equal(result.death, undefined);
  assert.equal(result.creationProvenance, undefined);
  assert.equal(result.latestImport, null);
});
