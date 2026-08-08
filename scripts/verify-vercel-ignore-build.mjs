#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decideVercelBuild } from "./vercel-ignore-build.mjs";
import {
  hasStateCommitTrailer,
  parseNameStatus,
  rejectedStateChanges,
} from "./lib/state-publication-contract.mjs";

const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
assert.equal(vercelConfig.ignoreCommand, "node scripts/vercel-ignore-build.mjs");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["verify:vercel-ignore-build"], "node scripts/verify-vercel-ignore-build.mjs");

const allowed = parseNameStatus([
  "M\tdocs/tracker/cards/AWF-0001.md",
  "A\tdocs/tracker/work-orders/AWF-WO-003.md",
  "M\tdocs/tracker/GUIDE.md",
  "M\tdocs/tracker/board.html",
  "M\tdocs/tracker/guide.html",
  "M\tdocs/tracker/tracker.json",
  "M\tdocs/planning/assist-with-family-history-project-philosophy.md",
  "M\tdocs/planning/assist-with-family-history-project-philosophy.html",
].join("\n"));
assert.deepEqual(rejectedStateChanges(allowed), []);
assert.equal(hasStateCommitTrailer("Update state\n\nskip-checks: true\n"), true);
assert.equal(hasStateCommitTrailer("Update state\n\nskip-checks:true\n"), false);
assert.equal(hasStateCommitTrailer("skip-checks: true\nNot final"), false);
for (const change of [
  "M\tapp/page.tsx",
  "M\tREADME.md",
  "M\tvercel.json",
  "M\tscripts/tracker-build.mjs",
  "M\tdocs/tracker/SYSTEM.md",
  "R100\tdocs/tracker/cards/AWF-0001.md\tdocs/tracker/cards/AWF-0005.md",
]) assert.equal(rejectedStateChanges(parseNameStatus(change)).length, 1, change);

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
  fs.writeFileSync(path.join(fixture, "app.txt"), "software v1\n");
  fs.writeFileSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), "state v1\n");
  const base = commit(fixture, "base");

  fs.writeFileSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), "state v2\n");
  const stateHead = commit(fixture, "Useful state\n\nskip-checks: true");
  assert.equal(decideVercelBuild({ base, head: stateHead, cwd: fixture, runValidators() {} }).ignore, true);
  assert.equal(decideVercelBuild({ base, head: stateHead, cwd: fixture, runValidators() { throw new Error("invalid state"); } }).reason, "invalid state");
  assert.equal(decideVercelBuild({ base, head: stateHead, cwd: fixture }).ignore, true);

  fs.writeFileSync(path.join(fixture, "app.txt"), "software v2\n");
  const mixedHead = commit(fixture, "Mixed range\n\nskip-checks: true");
  assert.equal(decideVercelBuild({ base: stateHead, head: mixedHead, cwd: fixture }).ignore, false);
  assert.match(decideVercelBuild({ base: stateHead, head: mixedHead, cwd: fixture }).reason, /non-state/);

  fs.renameSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), path.join(fixture, "docs/tracker/cards/AWF-0005.md"));
  const renameHead = commit(fixture, "Rename state\n\nskip-checks: true");
  assert.equal(decideVercelBuild({ base: mixedHead, head: renameHead, cwd: fixture }).ignore, false);
  assert.match(decideVercelBuild({ base: mixedHead, head: renameHead, cwd: fixture }).reason, /renamed/);

  assert.equal(decideVercelBuild({ base: "bad", head: renameHead, cwd: fixture }).ignore, false);
  assert.match(decideVercelBuild({ base: "bad", head: renameHead, cwd: fixture }).reason, /40-character/);
  assert.equal(decideVercelBuild({ base: "", head: renameHead, cwd: fixture }).reason, "VERCEL_GIT_PREVIOUS_SHA is unavailable");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("Vercel ignore-build contract verified: exact marked state history skips; software, config, mixed, renamed, malformed, missing-history, and invalid state build normally.");
