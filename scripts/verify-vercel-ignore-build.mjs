#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decideVercelBuild, nonDocsPaths } from "./vercel-ignore-build.mjs";

const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
assert.equal(vercelConfig.ignoreCommand, "node scripts/vercel-ignore-build.mjs");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["verify:vercel-ignore-build"], "node scripts/verify-vercel-ignore-build.mjs");

assert.deepEqual(nonDocsPaths([
  "docs/tracker/cards/AWF-0001.md",
  "docs/tracker/board.html",
  "docs/planning/assist-with-family-history-project-philosophy.md",
  "docs/api/capability-manifest.json",
  "README.md",
  "AGENTS.md",
  ".claude/settings.local.json",
]), []);
for (const file of [
  "app/page.tsx",
  "lib/releases.ts",
  "convex/schema.ts",
  "vercel.json",
  "package.json",
  "scripts/vercel-build.mjs",
  "public/robots.txt",
  "convex/README.md",
  ".github/workflows/ci.yml",
]) assert.deepEqual(nonDocsPaths([file]), [file], file);

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
function commit(cwd, message) {
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "awf-vercel-ignore-"));
try {
  git(fixture, ["init", "--quiet"]);
  git(fixture, ["config", "user.email", "vercel@example.invalid"]);
  git(fixture, ["config", "user.name", "Vercel fixture"]);
  fs.mkdirSync(path.join(fixture, "docs/tracker/cards"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "app"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "app/page.tsx"), "software v1\n");
  fs.writeFileSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), "state v1\n");
  const base = commit(fixture, "base");

  fs.writeFileSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), "state v2\n");
  fs.writeFileSync(path.join(fixture, "README.md"), "notes\n");
  const docsHead = commit(fixture, "Docs only");
  assert.equal(decideVercelBuild({ base, head: docsHead, cwd: fixture, runValidators() {} }).ignore, true);
  assert.equal(decideVercelBuild({ base, head: docsHead, cwd: fixture, runValidators() { throw new Error("invalid state"); } }).reason, "invalid state");
  assert.equal(decideVercelBuild({ base, head: docsHead, cwd: fixture }).ignore, true);

  fs.writeFileSync(path.join(fixture, "app/page.tsx"), "software v2\n");
  const mixedHead = commit(fixture, "Mixed range");
  assert.equal(decideVercelBuild({ base: docsHead, head: mixedHead, cwd: fixture }).ignore, false);
  assert.match(decideVercelBuild({ base: docsHead, head: mixedHead, cwd: fixture }).reason, /site paths changed: app\/page\.tsx/);
  // A docs-only head commit still builds when the range since the last
  // successful deployment includes a site change.
  fs.writeFileSync(path.join(fixture, "README.md"), "notes v2\n");
  const docsAfterMixed = commit(fixture, "Docs after software");
  assert.equal(decideVercelBuild({ base: docsHead, head: docsAfterMixed, cwd: fixture }).ignore, false);

  fs.renameSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), path.join(fixture, "app/AWF-0001.md"));
  const renameHead = commit(fixture, "Move a doc into the app");
  assert.equal(decideVercelBuild({ base: docsAfterMixed, head: renameHead, cwd: fixture }).ignore, false);

  assert.equal(decideVercelBuild({ base: "bad", head: renameHead, cwd: fixture }).ignore, false);
  assert.match(decideVercelBuild({ base: "bad", head: renameHead, cwd: fixture }).reason, /40-character/);
  assert.equal(decideVercelBuild({ base: "", head: renameHead, cwd: fixture }).reason, "VERCEL_GIT_PREVIOUS_SHA is unavailable");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("Vercel ignore-build contract verified: docs-only ranges skip after validators pass; site, config, mixed, moved-out, malformed, missing-history, and invalid-state ranges build normally.");
