/**
 * GEN-110: unit contract for the Vercel build decision (scripts/vercel-build.mjs).
 *
 * Pins the desync-prevention behavior so it cannot regress silently:
 *   - without a deploy key the build never touches Convex (CI/local/preview stay green);
 *   - a production key deploys Convex prod atomically with the build;
 *   - a production key on a PREVIEW build is refused (prod cannot be polluted from preview);
 *   - a preview key deploys the preview deployment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveBuildPlan } from "./vercel-build.mjs";

test("no deploy key → plain next build, no Convex deploy", () => {
  const plan = resolveBuildPlan({});
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "next build");
});

test("empty / whitespace deploy key is treated as absent", () => {
  const plan = resolveBuildPlan({ CONVEX_DEPLOY_KEY: "   ", VERCEL_ENV: "production" });
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "next build");
});

test("production build with a prod deploy key → deploy Convex then build", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "prod:some-secret",
    VERCEL_ENV: "production",
  });
  assert.equal(plan.deployConvex, true);
  assert.equal(plan.command, "npx convex deploy --cmd 'next build'");
});

test("preview build with a PROD key is refused → plain next build (guards prod)", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "prod:some-secret",
    VERCEL_ENV: "preview",
  });
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "next build");
});

test("preview build with a PREVIEW key → deploy the preview deployment", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "preview:some-secret",
    VERCEL_ENV: "preview",
  });
  assert.equal(plan.deployConvex, true);
  assert.equal(plan.command, "npx convex deploy --cmd 'next build'");
});
