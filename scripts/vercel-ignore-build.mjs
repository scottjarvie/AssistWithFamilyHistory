#!/usr/bin/env node

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
  const output = execFileSync("git", args, { cwd, encoding: "utf8", ...options });
  return typeof output === "string" ? output.trim() : "";
}
function assertCommit(cwd, value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full 40-character commit SHA`);
  git(cwd, ["cat-file", "-e", `${value}^{commit}`], { stdio: "ignore" });
}

export function decideVercelBuild({ base, head, cwd = process.cwd(), runValidators } = {}) {
  if (!base) return { ignore: false, reason: "VERCEL_GIT_PREVIOUS_SHA is unavailable", changes: [] };
  try {
    assertCommit(cwd, base, "base");
    assertCommit(cwd, head, "head");
    git(cwd, ["merge-base", "--is-ancestor", base, head], { stdio: "ignore" });
    const message = git(cwd, ["show", "--no-patch", "--format=%B", head]);
    if (!hasStateCommitTrailer(message)) return { ignore: false, reason: "commit is not marked as a verified state publication", changes: [] };
    const changes = parseNameStatus(git(cwd, ["diff", "--name-status", "--find-renames", base, head]));
    if (!changes.length) return { ignore: false, reason: "commit range has no changed paths", changes };
    const rejected = rejectedStateChanges(changes);
    if (rejected.length) return { ignore: false, reason: `mixed, renamed, or non-state paths: ${rejected.map(({ raw }) => raw).join(", ")}`, changes };
    if (runValidators) runValidators();
    return { ignore: true, reason: `${changes.length} verified state-only change(s)`, changes };
  } catch (error) {
    return { ignore: false, reason: error instanceof Error ? error.message : String(error), changes: [] };
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--base", "--head"].includes(flag) || !value) throw new Error("Usage: vercel-ignore-build.mjs [--base SHA --head SHA]");
    options[flag.slice(2)] = value;
  }
  if ((options.base && !options.head) || (!options.base && options.head)) throw new Error("--base and --head must be supplied together");
  return options;
}

export function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`Vercel build required: ${error.message}\n`);
    return 1;
  }
  const result = decideVercelBuild({
    base: options.base || process.env.VERCEL_GIT_PREVIOUS_SHA?.trim(),
    head: options.head || process.env.VERCEL_GIT_COMMIT_SHA?.trim(),
    runValidators: () => {
      execFileSync(process.execPath, ["scripts/verify-tracker.mjs"], { stdio: "inherit" });
      execFileSync(process.execPath, ["scripts/check-family-history-project-philosophy.mjs"], { stdio: "inherit" });
    },
  });
  if (result.ignore) {
    process.stdout.write(`Vercel build ignored: ${result.reason}.\n`);
    return 0;
  }
  process.stderr.write(`Vercel build required: ${result.reason}\n`);
  return 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exitCode = runCli();
