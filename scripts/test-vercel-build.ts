/**
 * GEN-110: unit contract for the Vercel build decision (scripts/vercel-build.mjs).
 *
 * Pins the deploy-coordination behavior so it cannot regress silently:
 *   - without a deploy key the build never touches Convex (CI/local/preview stay green);
 *   - a production key coordinates the frontend build and production Convex deploy;
 *   - mismatched or unsupported key/environment pairs fail closed to a plain build;
 *   - a preview key deploys the preview deployment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveBuildPlan } from "./vercel-build.mjs";

test("no deploy key → plain next build, no Convex deploy", () => {
  const plan = resolveBuildPlan({});
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "npx --no-install next build");
});

test("empty / whitespace deploy key is treated as absent", () => {
  const plan = resolveBuildPlan({ CONVEX_DEPLOY_KEY: "   ", VERCEL_ENV: "production" });
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "npx --no-install next build");
});

test("production build with a prod deploy key → coordinated build/deploy command", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "prod:some-secret",
    VERCEL_ENV: "production",
  });
  assert.equal(plan.deployConvex, true);
  assert.equal(
    plan.command,
    "npx --no-install convex deploy --cmd 'npx --no-install next build'"
  );
});

test("preview build with a PROD key is refused → plain next build (guards prod)", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "prod:some-secret",
    VERCEL_ENV: "preview",
  });
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "npx --no-install next build");
});

test("preview build with a PREVIEW key → deploy the preview deployment", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "preview:some-secret",
    VERCEL_ENV: "preview",
  });
  assert.equal(plan.deployConvex, true);
  assert.equal(
    plan.command,
    "npx --no-install convex deploy --cmd 'npx --no-install next build'"
  );
});

test("build-plan metadata never contains the deploy-key value", () => {
  const sentinel = "prod:synthetic-secret-value-must-not-appear";
  const plans = [
    resolveBuildPlan({ CONVEX_DEPLOY_KEY: sentinel, VERCEL_ENV: "production" }),
    resolveBuildPlan({ CONVEX_DEPLOY_KEY: sentinel, VERCEL_ENV: "preview" }),
  ];

  for (const plan of plans) {
    assert.equal(JSON.stringify(plan).includes(sentinel), false);
  }
});

for (const vercelEnv of [undefined, "development", "staging"] as const) {
  test(`production key outside production (${vercelEnv ?? "undefined"}) → plain build`, () => {
    const plan = resolveBuildPlan({
      CONVEX_DEPLOY_KEY: "prod:some-secret",
      VERCEL_ENV: vercelEnv,
    });
    assert.equal(plan.deployConvex, false);
    assert.equal(plan.command, "npx --no-install next build");
  });
}

test("preview key on a production build → plain build", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "preview:some-secret",
    VERCEL_ENV: "production",
  });
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "npx --no-install next build");
});

for (const key of [
  "dev:some-secret",
  "project:some-secret",
  "admin-key-without-a-recognized-prefix",
] as const) {
  test(`unsupported deploy-key type (${key.split(":", 1)[0]}) → plain build`, () => {
    const plan = resolveBuildPlan({
      CONVEX_DEPLOY_KEY: key,
      VERCEL_ENV: "production",
    });
    assert.equal(plan.deployConvex, false);
    assert.equal(plan.command, "npx --no-install next build");
  });
}
