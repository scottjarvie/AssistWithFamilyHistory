import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PARTS, KEEPS, MOTTO } from "../components/marketing/drawn/content";
import { IDEAS } from "../lib/site/ideas";
test("home parts cover every live idea exactly once", () => {
  assert.equal(PARTS.length, 6);
  assert.equal(KEEPS.length, 7);
  assert.deepEqual(
    PARTS.map((x) => x.id).sort(),
    IDEAS.map((x) => x.id).sort(),
  );
  for (const p of PARTS) {
    assert.ok(p.ai.split(/\s+/).length <= 8, p.name);
    assert.ok(p.kept.split(/\s+/).length <= 9, p.name);
    for (const tag of p.tags)
      assert.ok(
        KEEPS.some((k) => k.name === tag),
        tag,
      );
  }
});
test("family motto stays aligned with the guide and public metadata", () => {
  assert.equal(MOTTO, "Assisting your AI to assist you with Family History.");
  for (const path of [
    "lib/site.ts",
    "app/opengraph-image.tsx",
    "docs/planning/site-guide.md",
  ])
    assert.ok(readFileSync(path, "utf8").includes(MOTTO), path);
});
