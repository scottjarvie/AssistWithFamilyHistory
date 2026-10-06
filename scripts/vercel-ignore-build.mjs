#!/usr/bin/env node

import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

// Paths no part of the running site reads: product and agent documentation,
// the tracker, and root-level Markdown. A range that touches only these
// produces a byte-identical site, so Vercel skips the build (preview or
// production). Everything else, including any file the build or runtime could
// read, builds normally.
const DOCS_ONLY_PATHS = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.claude\//,
];

export function nonDocsPaths(paths) {
  return paths.filter((file) => !DOCS_ONLY_PATHS.some((pattern) => pattern.test(file)));
}

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
    // --no-renames lists both sides of a move, so a file moved out of docs/
    // counts as a non-docs change.
    const changes = git(cwd, ["diff", "--name-only", "--no-renames", base, head]).split("\n").filter(Boolean);
    if (!changes.length) return { ignore: false, reason: "commit range has no changed paths", changes };
    const rejected = nonDocsPaths(changes);
    if (rejected.length) return { ignore: false, reason: `site paths changed: ${rejected.slice(0, 5).join(", ")}${rejected.length > 5 ? ", ..." : ""}`, changes };
    if (runValidators) runValidators();
    return { ignore: true, reason: `${changes.length} docs-only change(s)`, changes };
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
