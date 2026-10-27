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
 *     Tenant checks fail closed by default, so this throwaway backend (and only
 *     it) is explicitly opted out with TRUST_BOUNDARY_MODE=shadow.
 *   - Convex URLs are forced to the local backend, overriding `.env.local`.
 *
 * Convex watches `convex/` and re-pushes functions on save; Next.js hot-reloads
 * the pages. Ctrl+C stops both. See docs/operations/local-preview.md.
 *
 * Internal mode: `--next` is what Convex starts once its first push succeeds.
 */

import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE = ".env.preview.local";
const LOCAL_DEPLOYMENT = "anonymous:anonymous-assistwithfamilyhistory";
const isWindows = process.platform === "win32";

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const values = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (match) values[match[1]] = match[2].trim();
    else if (line.trim() && !line.trim().startsWith("#")) throw new Error("[preview:local] invalid local environment file");
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

// Plan and validate before any child process or local environment mutation.
// An anonymous label alone cannot prove that a URL or inherited CLI target is local.
export function previewPlan(file, parentEnv = process.env) {
  const allowedKeys = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_SITE_URL"]);
  if (Object.keys(file).some((key) => !allowedKeys.has(key))) throw new Error("[preview:local] unsupported key in local-only environment file");
  if (file.CONVEX_DEPLOYMENT && file.CONVEX_DEPLOYMENT !== LOCAL_DEPLOYMENT) throw new Error("[preview:local] refusing a different deployment");
  const localUrl = (value, port) => {
    const url = new URL(value);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.port !== String(port) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      throw new Error("[preview:local] refusing a non-loopback backend URL");
    }
    return `http://localhost:${port}`;
  };
  // Validate both aliases, even when one would otherwise be ignored.
  for (const key of ["CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"]) if (file[key]) localUrl(file[key], 3210);
  const convexUrl = localUrl(file.NEXT_PUBLIC_CONVEX_URL || file.CONVEX_URL || "http://127.0.0.1:3210", 3210);
  const siteUrl = localUrl(file.CONVEX_SITE_URL || "http://127.0.0.1:3211", 3211);
  const port = parentEnv.PORT || "3443";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("[preview:local] invalid site port");
  // Keep only process/runtime necessities. Never inherit provider credentials,
  // CLI target selectors, dotenv overrides or Node preload flags into children.
  const env = {};
  for (const key of ["PATH", "HOME", "USERPROFILE", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "APPDATA", "LOCALAPPDATA", "TERM", "LANG", "LC_ALL"]) {
    if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  }
  return { port, convexUrl, siteUrl, env: { ...env, PORT: port, CONVEX_AGENT_MODE: "anonymous", CONVEX_DEPLOYMENT: LOCAL_DEPLOYMENT } };
}

export function startNext({ file = readEnvFile(), parentEnv = process.env, setEnv = spawnSync, launch = run } = {}) {
  const plan = previewPlan(file, parentEnv);
  if (file.CONVEX_DEPLOYMENT !== LOCAL_DEPLOYMENT) throw new Error("[preview:local] local backend must be initialized first");
  const result = setEnv("pnpm", ["exec", "convex", "env", "set", "TRUST_BOUNDARY_MODE", "shadow", "--env-file", ENV_FILE], {
    stdio: "inherit", shell: isWindows, env: plan.env,
  });
  if (result.error || result.status !== 0) throw new Error("[preview:local] could not opt the local backend into shadow mode; preview was not started");
  console.log(`[preview:local] site      http://localhost:${plan.port}`);
  console.log(`[preview:local] convex    ${plan.convexUrl} (local, throwaway)`);
  launch("pnpm", ["exec", "next", "dev", "--webpack", "--port", plan.port], {
    ...plan.env,
    NEXT_PUBLIC_CONVEX_URL: plan.convexUrl,
    CONVEX_SITE_URL: plan.siteUrl,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${plan.port}`,
    DISABLE_CLERK: "true", NEXT_PUBLIC_DISABLE_CLERK: "true",
    ENABLE_CLERK_DEV: "false", NEXT_PUBLIC_ENABLE_CLERK_DEV: "false",
    TRUST_BOUNDARY_MODE: "shadow",
  });
}

function startConvex() {
  const file = readEnvFile();
  const plan = previewPlan(file);
  if (!file.CONVEX_DEPLOYMENT) {
    fs.appendFileSync(ENV_FILE, `# Local-only Convex backend for pnpm preview:local. Safe to delete.\nCONVEX_DEPLOYMENT=${LOCAL_DEPLOYMENT}\n`);
  }
  run("pnpm", [
    "exec", "convex", "dev", "--env-file", ENV_FILE,
    "--codegen", "disable", "--typecheck", "disable",
    "--start", "node scripts/preview-local.mjs --next",
  ], plan.env);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.includes("--next")) startNext();
    else startConvex();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "[preview:local] local setup failed");
    process.exitCode = 1;
  }
}
