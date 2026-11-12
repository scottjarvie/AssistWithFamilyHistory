import assert from "node:assert/strict";
import { familySpaces, lifeDirectoryHref, validateFamilyManifest } from "../lib/family/manifest";
import snapshot from "../lib/family/manifest-2026-11-12.json";
// Fable rollout contract, 2026-11-12: statuses are manifest-owned, not launch guesses.
assert.equal(familySpaces.length, 20);
assert.equal(familySpaces[0].slug, "family-history");
assert.equal(lifeDirectoryHref, "https://assistwithlife.com#all-spaces");
assert.equal(validateFamilyManifest({ ...snapshot, spaces: [...snapshot.spaces, snapshot.spaces[0]] }), null);
const invalidLink = validateFamilyManifest({ ...snapshot, spaces: [{ ...snapshot.spaces[0], href: "javascript:alert(1)" }] });
assert.equal(invalidLink?.spaces[0].href, undefined);
assert.equal(validateFamilyManifest({ ...snapshot, version: 2 }), null);
console.log("family manifest contracts passed");

import { showAppFamilyRow } from "../lib/family/surfaces";
assert.equal(showAppFamilyRow("/app", "", true), true);
assert.equal(showAppFamilyRow("/app", "", false), false);
for (const path of ["/app/imports", "/app/people/new", "/app/people/synthetic", "/app/api/admin", "/app/settings", "/app/queue"]) assert.equal(showAppFamilyRow(path, "", true), false);
for (const hash of ["#settings", "#files", "#connection", "#activity", "#library", "#preferences", "#upload"]) assert.equal(showAppFamilyRow("/app", hash, true), false);
assert.deepEqual(familySpaces.slice(1).map((s) => s.slug), snapshot.spaces.filter((s) => s.slug !== "family-history").map((s) => s.slug));
for (const slug of ["people", "animals", "food", "code", "hive"]) {
  assert.equal(familySpaces.find((s) => s.slug === slug)?.status, "In design");
  assert.equal(familySpaces.find((s) => s.slug === slug)?.href, undefined);
}
