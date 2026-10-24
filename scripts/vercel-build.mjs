/**
 * GEN-110: Vercel build entrypoint that keeps production Convex in sync with
 * production Next.js builds.
 *
 * Root cause of GEN-79: there was no `convex deploy` step in the Vercel build,
 * so a PR that changed a Convex function could ship to prod Next.js while prod
 * Convex stayed stale — the classic `"Could not find function"` desync that
 * surfaced as a production 500.
 *
 * This wrapper is the Vercel `buildCommand` (see vercel.json). It decides
 * whether to coordinate a Convex deploy with the build, then runs the build:
 *
 *   - Hosted production must deploy the documented production backend; absent
 *     or mismatched configuration is an operational hold before any build.
 *   - Offline/local/CI builds remain plain builds without a deploy key.
 *   - Preview keys deploy only in preview; mismatches never deploy.
 *
 * Repository-local binaries are invoked with `npx --no-install`: this avoids
 * depending on a caller-provided `node_modules/.bin` PATH and prevents package
 * downloads. The Next.js command remains direct rather than `npm run build`, so
 * it cannot recurse into this wrapper if build wiring changes.
 *
 * Kept as plain ESM node (no tsx) so it never needs a toolchain bootstrapped
 * before the build runs. The decision logic lives in the exported, dependency-
 * free `resolveBuildPlan` so it is unit-testable under `node --test`.
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const NEXT_BUILD = "npx --no-install next build";
const CONVEX_DEPLOY =
  "npx --no-install convex deploy --cmd 'npx --no-install next build'";

/**
 * Decide how to build for the given environment. Pure and side-effect free.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ command: string, deployConvex: boolean, reason: string }}
 */
export function resolveBuildPlan(env = process.env) {
  const key = (env.CONVEX_DEPLOY_KEY ?? "").trim();
  const hasKey = key.length > 0;
  const vercelEnv = env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const isProductionKey = key.startsWith("prod:");
  const isPreviewKey = key.startsWith("preview:");

  if (vercelEnv === "production") {
    if (!hasKey) throw new Error("Production build held: required Convex deployment key is missing");
    if (!key.startsWith("prod:accomplished-dodo-308|") || !key.split("|", 2)[1]) {
      throw new Error("Production build held: deploy key must target the documented production backend");
    }
    if (env.NEXT_PUBLIC_CONVEX_URL !== "https://accomplished-dodo-308.convex.cloud") {
      throw new Error("Production build held: frontend backend binding must match the documented production backend");
    }
  }

  if (!hasKey) {
    return {
      command: NEXT_BUILD,
      deployConvex: false,
      reason: "no CONVEX_DEPLOY_KEY — skipping Convex deploy, plain next build",
    };
  }

  if (isProductionKey && vercelEnv === "production") {
    return {
      command: CONVEX_DEPLOY,
      deployConvex: true,
      reason: "production deploy key in production — building, then deploying Convex prod",
    };
  }

  if (isPreviewKey && vercelEnv === "preview") {
    return {
      command: CONVEX_DEPLOY,
      deployConvex: true,
      reason: "preview deploy key in preview — building, then deploying Convex preview",
    };
  }

  return {
    command: NEXT_BUILD,
    deployConvex: false,
    reason: "deploy key type/environment mismatch — skipping Convex deploy, plain next build",
  };
}

export function runBuild(env, runner = execSync) {
  const plan = resolveBuildPlan(env);
  console.log(`[vercel-build] ${plan.reason}`);
  console.log(`[vercel-build] $ ${plan.command}`);
  runner(plan.command, { stdio: "inherit", env });
}

// Run only when invoked directly (`node scripts/vercel-build.mjs`), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBuild(process.env);
}
