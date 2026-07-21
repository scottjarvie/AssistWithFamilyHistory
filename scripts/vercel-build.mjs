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
 *   - No CONVEX_DEPLOY_KEY            → plain `next build` (local, CI, and any
 *                                       env without the secret stay green — the
 *                                       Convex step is a safe no-op).
 *   - PROD key in production          → repository-local Convex deploy command.
 *   - PREVIEW key in preview          → the same command, targeting an isolated
 *                                       preview deployment.
 *   - Any key/environment mismatch    → plain `next build` (fail closed: an
 *                                       incorrectly scoped key cannot deploy).
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

function main() {
  const plan = resolveBuildPlan(process.env);
  console.log(`[vercel-build] ${plan.reason}`);
  console.log(`[vercel-build] $ ${plan.command}`);
  execSync(plan.command, { stdio: "inherit", env: process.env });
}

// Run only when invoked directly (`node scripts/vercel-build.mjs`), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
