/**
 * GEN-110: Vercel build entrypoint that keeps production Convex in sync with
 * production Next.js.
 *
 * Root cause of GEN-79: there was no `convex deploy` step in the Vercel build,
 * so a PR that changed a Convex function could ship to prod Next.js while prod
 * Convex stayed stale — the classic `"Could not find function"` desync that
 * surfaced as a production 500.
 *
 * This wrapper is the Vercel `buildCommand` (see vercel.json). It decides
 * whether to deploy Convex atomically with the build, then runs the build:
 *
 *   - No CONVEX_DEPLOY_KEY            → plain `next build` (local, CI, and any
 *                                       env without the secret stay green — the
 *                                       Convex step is a safe no-op).
 *   - Key present, prod build         → `npx convex deploy --cmd 'next build'`
 *                                       (deploys Convex, then builds the app).
 *   - Preview build with a PROD key   → plain `next build` (guardrail: a prod
 *                                       deploy key must never fire on a preview
 *                                       deployment and pollute production).
 *   - Preview build with a PREVIEW key→ `npx convex deploy --cmd 'next build'`
 *                                       (targets the preview deployment).
 *
 * `next build` is invoked directly (not `npm run build`) to avoid any chance of
 * recursing back into this wrapper if the build command wiring changes.
 *
 * Kept as plain ESM node (no tsx) so it never needs a toolchain bootstrapped
 * before the build runs. The decision logic lives in the exported, dependency-
 * free `resolveBuildPlan` so it is unit-testable under `node --test`.
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const NEXT_BUILD = "next build";
const CONVEX_DEPLOY = "npx convex deploy --cmd 'next build'";

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
  const isPreviewKey = key.startsWith("preview:");

  if (!hasKey) {
    return {
      command: NEXT_BUILD,
      deployConvex: false,
      reason: "no CONVEX_DEPLOY_KEY — skipping Convex deploy, plain next build",
    };
  }

  // Guardrail: a production deploy key must never run on a preview build, or a
  // preview deploy would overwrite the production Convex deployment.
  if (vercelEnv === "preview" && !isPreviewKey) {
    return {
      command: NEXT_BUILD,
      deployConvex: false,
      reason:
        "preview build with a production deploy key — skipping Convex deploy to protect prod",
    };
  }

  return {
    command: CONVEX_DEPLOY,
    deployConvex: true,
    reason: isPreviewKey
      ? "preview deploy key — deploying Convex preview, then building"
      : "production deploy key — deploying Convex prod, then building",
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
