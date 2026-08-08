#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  hasStateCommitTrailer,
  parseNameStatus,
  rejectedStateChanges,
} from "./lib/state-publication-contract.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function git(cwd, args, options = {}) {
  const output = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    ...options,
  });
  return typeof output === "string" ? output.trim() : "";
}

function assertCommit(cwd, value, label) {
  if (!SHA_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be a full 40-character commit SHA`);
  }
  git(cwd, ["cat-file", "-e", `${value}^{commit}`], { stdio: "ignore" });
}

export function changesForRange({ base, head, cwd = process.cwd() }) {
  assertCommit(cwd, base, "base");
  assertCommit(cwd, head, "head");
  git(cwd, ["merge-base", "--is-ancestor", base, head], { stdio: "ignore" });
  return parseNameStatus(
    git(cwd, ["diff", "--name-status", "--find-renames", base, head]),
  );
}

export function classifyStatePush({ eventName, changes, message }) {
  if (eventName !== "push") {
    return { runFull: true, mode: "full", reason: "pull-request-or-manual", changes };
  }
  if (!changes.length) {
    return { runFull: true, mode: "full", reason: "empty-range", changes };
  }
  if (!hasStateCommitTrailer(message)) {
    return { runFull: true, mode: "full", reason: "missing-state-trailer", changes };
  }
  const rejected = rejectedStateChanges(changes);
  if (rejected.length) {
    return { runFull: true, mode: "full", reason: "mixed-or-non-state", changes, rejected };
  }
  return { runFull: false, mode: "state-only", reason: "validated-state-range", changes };
}

export function classifyCommitRange({ eventName, base, head, cwd = process.cwd() }) {
  const changes = changesForRange({ base, head, cwd });
  const message = git(cwd, ["show", "--no-patch", "--format=%B", head]);
  return classifyStatePush({ eventName, changes, message });
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument sequence near ${flag ?? "<end>"}`);
    }
    values.set(flag.slice(2), value);
  }
  return {
    eventName: values.get("event-name"),
    base: values.get("base"),
    head: values.get("head"),
    githubOutput: values.get("github-output"),
  };
}

function writeGitHubOutput(outputPath, result) {
  fs.appendFileSync(
    outputPath,
    [
      `run_full=${result.runFull}`,
      `mode=${result.mode}`,
      `reason=${result.reason}`,
      `changed_count=${result.changes.length}`,
    ].join("\n") + "\n",
    "utf8",
  );
}

export function runCli(argv = process.argv.slice(2)) {
  const { eventName, base, head, githubOutput } = parseArgs(argv);
  if (!githubOutput) throw new Error("--github-output is required so CI can fail closed");
  let result;
  try {
    result = classifyCommitRange({ eventName, base, head });
  } catch (error) {
    result = {
      runFull: true,
      mode: "full",
      reason: "classification-error",
      changes: [],
    };
    console.warn(`CI scope classification failed closed: ${error.message}`);
  }
  writeGitHubOutput(githubOutput, result);
  console.log(`CI scope: ${result.mode} (${result.reason}); ${result.changes.length} changed path(s)`);
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    runCli();
  } catch (error) {
    console.error(`CI scope classifier failed: ${error.message}`);
    process.exitCode = 1;
  }
}
