#!/usr/bin/env node
/**
 * `pnpm preview:local` — the fast feedback loop.
 *
 * Runs the whole site on this computer against a private, throwaway Convex
 * backend that also runs on this computer. Nothing here can reach production
 * data, the production Convex deployment, Clerk, or Vercel:
 *
 *   - Convex runs as an anonymous *local* deployment (CONVEX_AGENT_MODE=
 *     anonymous), chosen by `.env.preview.local`, never by `.env.local`. It
 *     needs no Convex login and is not the `convex dev` the deploy doc warns
 *     about: that one resolves to whatever cloud project the machine is logged
 *     into.
 *   - Code generation is off, so `convex/_generated` stays exactly as checked in.
 *   - Clerk is forced off, so the app uses its signed-out "local" vault owner.
 *   - Convex URLs are forced to the local backend, overriding `.env.local`.
 *
 * Convex watches `convex/` and re-pushes functions on save; Next.js hot-reloads
 * the pages. Ctrl+C stops both. See docs/operations/local-preview.md.
 *
 * Internal mode: `--next` is what Convex starts once its first push succeeds.
 */

import fs from "node:fs";
import { spawn } from "node:child_process";

const ENV_FILE = ".env.preview.local";
const LOCAL_DEPLOYMENT = "anonymous:anonymous-assistwithfamilyhistory";
const PORT = process.env.PORT || "3443";
const isWindows = process.platform === "win32";

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const values = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function run(command, args, env) {
  const child = spawn(command, args, { stdio: "inherit", env, shell: isWindows });
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

function startNext() {
  const file = readEnvFile();
  const convexUrl = (file.NEXT_PUBLIC_CONVEX_URL || file.CONVEX_URL || "http://127.0.0.1:3210")
    .replace("127.0.0.1", "localhost");
  const parsed = new URL(convexUrl);
  const siteUrl = file.CONVEX_SITE_URL
    || `${parsed.protocol}//${parsed.hostname}:${Number(parsed.port || 3210) + 1}`;

  console.log(`[preview:local] site      http://localhost:${PORT}`);
  console.log(`[preview:local] convex    ${convexUrl} (local, throwaway)`);
  run("pnpm", ["exec", "next", "dev", "--webpack", "--port", PORT], {
    ...process.env,
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
    CONVEX_SITE_URL: siteUrl,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    DISABLE_CLERK: "true",
    NEXT_PUBLIC_DISABLE_CLERK: "true",
    ENABLE_CLERK_DEV: "false",
    NEXT_PUBLIC_ENABLE_CLERK_DEV: "false",
  });
}

function startConvex() {
  const file = readEnvFile();
  if (!file.CONVEX_DEPLOYMENT) {
    fs.appendFileSync(ENV_FILE, `# Local-only Convex backend for pnpm preview:local. Safe to delete.\nCONVEX_DEPLOYMENT=${LOCAL_DEPLOYMENT}\n`);
  } else if (!file.CONVEX_DEPLOYMENT.startsWith("anonymous:")) {
    console.error(`[preview:local] ${ENV_FILE} points at ${file.CONVEX_DEPLOYMENT}, which is not a local deployment. Delete that line and run again.`);
    process.exit(1);
  }
  const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
  // Never let a shell-level deploy key or deployment steer this at the cloud.
  delete env.CONVEX_DEPLOY_KEY;
  delete env.CONVEX_DEPLOYMENT;
  run("pnpm", [
    "exec", "convex", "dev",
    "--env-file", ENV_FILE,
    "--codegen", "disable",
    "--typecheck", "disable",
    "--start", "node scripts/preview-local.mjs --next",
  ], env);
}

if (process.argv.includes("--next")) startNext();
else startConvex();
