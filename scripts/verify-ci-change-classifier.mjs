#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  changesForRange,
  classifyCommitRange,
  classifyStatePush,
} from "./classify-ci-change.mjs";
import { parseNameStatus } from "./lib/state-publication-contract.mjs";

const allowed = parseNameStatus([
  "M\tdocs/tracker/cards/AWF-0001.md",
  "A\tdocs/tracker/work-orders/AWF-WO-002.md",
  "M\tdocs/tracker/GUIDE.md",
  "M\tdocs/tracker/board.html",
  "M\tdocs/tracker/guide.html",
  "M\tdocs/tracker/tracker.json",
  "M\tdocs/planning/assist-with-family-history-project-philosophy.md",
  "M\tdocs/planning/assist-with-family-history-project-philosophy.html",
].join("\n"));
assert.equal(classifyStatePush({ eventName: "push", changes: allowed, message: "State\n\nskip-checks: true" }).runFull, false);
assert.equal(classifyStatePush({ eventName: "pull_request", changes: allowed, message: "State\n\nskip-checks: true" }).runFull, true);
assert.equal(classifyStatePush({ eventName: "push", changes: allowed, message: "State" }).runFull, true);
for (const change of [
  "M\tapp/page.tsx",
  "M\tREADME.md",
  "M\tdocs/tracker/SYSTEM.md",
  "M\tscripts/tracker-build.mjs",
  "M\t.github/workflows/ci.yml",
  "M\tvercel.json",
  "R100\tdocs/tracker/cards/AWF-0001.md\tdocs/tracker/cards/AWF-0005.md",
]) {
  assert.equal(classifyStatePush({ eventName: "push", changes: parseNameStatus(change), message: "State\n\nskip-checks: true" }).runFull, true, change);
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
function commit(cwd, message) {
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "awf-ci-scope-"));
try {
  git(fixture, ["init", "--quiet"]);
  git(fixture, ["config", "user.email", "ci@example.invalid"]);
  git(fixture, ["config", "user.name", "CI fixture"]);
  fs.mkdirSync(path.join(fixture, "docs/tracker/cards"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "app.txt"), "v1\n");
  fs.writeFileSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), "state v1\n");
  const base = commit(fixture, "base");
  fs.writeFileSync(path.join(fixture, "docs/tracker/cards/AWF-0001.md"), "state v2\n");
  const stateHead = commit(fixture, "Useful state\n\nskip-checks: true");
  assert.equal(classifyCommitRange({ eventName: "push", base, head: stateHead, cwd: fixture }).runFull, false);
  assert.deepEqual(changesForRange({ base, head: stateHead, cwd: fixture }).map(({ status, path }) => [status, path]), [["M", "docs/tracker/cards/AWF-0001.md"]]);
  fs.writeFileSync(path.join(fixture, "app.txt"), "v2\n");
  const mixedHead = commit(fixture, "Mixed\n\nskip-checks: true");
  assert.equal(classifyCommitRange({ eventName: "push", base: stateHead, head: mixedHead, cwd: fixture }).runFull, true);
  assert.throws(() => changesForRange({ base: "bad", head: mixedHead, cwd: fixture }), /40-character/);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
assert.match(workflow, /fetch-depth:\s*0/);
assert.match(workflow, /node scripts\/classify-ci-change\.mjs/);
assert.match(workflow, /Verify canonical state/);
assert.match(workflow, /if: steps\.ci_scope\.outputs\.run_full == 'true'/);
assert.match(workflow, /if: steps\.ci_scope\.outputs\.run_full != 'true'/);

console.log("CI state classifier verified: only marked direct-main exact state ranges use the lightweight path; PR, mixed, software, config, rename, malformed, and uncertain ranges run full CI.");
