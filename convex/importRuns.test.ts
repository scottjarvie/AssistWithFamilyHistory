import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("recent imports merge owner, legacy FamilySearch and internal ID matches in stable order", async () => {
  const t = convexTest(schema, modules);
  const owner = "user_import_owner";
  const { personId, byPerson, byLegacyKey, otherOwned, byFsKey } = await t.run(async ctx => {
    const personId = await ctx.db.insert("persons", {
      vaultOwnerId: owner, name: { given: "Invented", surname: "Ancestor" }, living: false,
      sex: "unknown", researchStatus: "basic", createdAt: 1, updatedAt: 1,
    });
    const shared = {
      vaultOwnerId: owner, personFsId: "FS-OLD", personName: "Invented Ancestor",
      captureVersion: "1", capturedAt: 1, importedAt: 5, pageTypes: ["person" as const],
      sourceUrls: [], mergeStatus: "created" as const, compatibilityMode: false,
      counts: { sources: 0, citations: 0, memories: 0, relationships: 0, places: 0, events: 0, warnings: 0 },
      warnings: [], artifactPaths: {},
    };
    const byPerson = await ctx.db.insert("importRuns", { ...shared, captureId: "internal", personId });
    const byLegacyKey = await ctx.db.insert("importRuns", { ...shared, captureId: "old", personFsId: String(personId) });
    await ctx.db.insert("importRuns", { ...shared, captureId: "foreign", vaultOwnerId: "other", personId, importedAt: 20 });
    const otherOwned = await ctx.db.insert("importRuns", { ...shared, captureId: "other", personFsId: "FS-OTHER", importedAt: 10 });
    const byFsKey = await ctx.db.insert("importRuns", { ...shared, captureId: "fs", importedAt: 2 });
    return { personId, byPerson, byLegacyKey, otherOwned, byFsKey };
  });
  const recent = (personIdentifier?: string, limit?: number) =>
    t.query(internal.importRuns.listRecentInternal, { vaultOwnerId: owner, personIdentifier, limit })
      .then(rows => rows.map(row => row._id));
  expect(await recent(String(personId), 1)).toEqual([byLegacyKey]);
  expect(await recent(String(personId))).toEqual([byLegacyKey, byPerson]);
  expect(await recent("FS-OLD")).toEqual([byPerson, byFsKey]);
  expect(await recent(undefined, 2)).toEqual([otherOwned, byLegacyKey]);
});
