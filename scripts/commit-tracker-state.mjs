#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  parseNameStatus,
  rejectedStateChanges,
  STATE_COMMIT_TRAILER,
} from "./lib/state-publication-contract.mjs";

function git(args) { return execFileSync("git", args, { encoding: "utf8" }).trim(); }

const staged = parseNameStatus(
  git([
    "diff",
    "--cached",
    "--name-status",
    "--find-renames",
    "--diff-filter=ACMRD",
  ]),
);
if (!staged.length) throw new Error("No staged tracker state to publish.");
const rejected = rejectedStateChanges(staged);
if (rejected.length) {
  throw new Error(
    `State-only commit rejected mixed or unrelated paths:\n${rejected.map(({ raw }) => raw).join("\n")}`,
  );
}

execFileSync(process.execPath, ["scripts/verify-tracker.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/check-family-history-project-philosophy.mjs"], { stdio: "inherit" });

if (process.argv.includes("--check")) {
  console.log(`state-only index verified: ${staged.length} change(s)`);
  process.exit(0);
}
const branch = git(["branch", "--show-current"]);
if (branch !== "main") throw new Error(`Direct state publication requires local main; current branch is ${branch || "detached"}.`);
const subject = process.argv.slice(2).join(" ").trim() || "Update Family History tracker state";
execFileSync("git", ["commit", "-m", `${subject}\n\n${STATE_COMMIT_TRAILER}`], { stdio: "inherit" });
