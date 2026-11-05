/**
 * GEN-110: unit contract for the Vercel build decision (scripts/vercel-build.mjs).
 *
 * Pins the deploy-coordination behavior so it cannot regress silently:
 *   - without a deploy key offline CI/local/preview builds never touch Convex;
 *   - a production key coordinates the frontend build and production Convex deploy;
 *   - hosted production refuses missing/mismatched backend configuration;
 *   - a preview key deploys the preview deployment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveBuildPlan, runBuild } from "./vercel-build.mjs";

test("no deploy key → plain next build, no Convex deploy", () => {
  const plan = resolveBuildPlan({});
  assert.equal(plan.deployConvex, false);
  assert.equal(plan.command, "npx --no-install next build");
});

test("empty production key holds the build", () => {
  assert.throws(() => resolveBuildPlan({ CONVEX_DEPLOY_KEY: "   ", VERCEL_ENV: "production" }), /held/);
});

test("production build with a prod deploy key → coordinated build/deploy command", () => {
  const plan = resolveBuildPlan({
    CONVEX_DEPLOY_KEY: "prod:accomplished-dodo-308|synthetic",
    NEXT_PUBLIC_CONVEX_URL: "https://accomplished-dodo-308.convex.cloud",
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
  const sentinel = "prod:accomplished-dodo-308|synthetic-secret-value-must-not-appear";
  const plans = [
    resolveBuildPlan({ CONVEX_DEPLOY_KEY: sentinel, VERCEL_ENV: "production", NEXT_PUBLIC_CONVEX_URL: "https://accomplished-dodo-308.convex.cloud" }),
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

for (const key of [undefined, "", "preview:synthetic", "dev:synthetic", "project:synthetic", "unsupported", "prod:foreign-backend|synthetic", "prod:accomplished-dodo-308|"]) {
  test(`production refuses missing or mismatched key (${key?.split(":")[0] ?? "absent"}) without invoking runner`, () => {
    const calls: string[] = [];
    assert.throws(() => runBuild({ VERCEL_ENV: "production", CONVEX_DEPLOY_KEY: key, NEXT_PUBLIC_CONVEX_URL: "https://accomplished-dodo-308.convex.cloud" }, (command: string) => calls.push(command)), /held/);
    assert.deepEqual(calls, []);
  });
}

test("production refuses absent or foreign frontend binding before running any command", () => {
  for (const url of [undefined, "https://foreign.convex.cloud"]) {
    assert.throws(() => runBuild({ VERCEL_ENV: "production", CONVEX_DEPLOY_KEY: "prod:accomplished-dodo-308|synthetic", NEXT_PUBLIC_CONVEX_URL: url }, () => assert.fail("must not run")), /held/);
  }
});

test("coordinated build runs once and propagates deploy/build failure without fallback", () => {
  const env = { VERCEL_ENV: "production", CONVEX_DEPLOY_KEY: "prod:accomplished-dodo-308|synthetic", NEXT_PUBLIC_CONVEX_URL: "https://accomplished-dodo-308.convex.cloud" };
  const calls: string[] = [];
  const failure = new Error("synthetic backend deployment failure");
  assert.throws(() => runBuild(env, (command: string) => { calls.push(command); throw failure; }), (error) => error === failure);
  assert.deepEqual(calls, ["npx --no-install convex deploy --cmd 'npx --no-install next build'"]);
});

test("offline plain build is usable through the runner without deploy", () => {
  const calls: string[] = [];
  runBuild({}, (command: string) => calls.push(command));
  assert.deepEqual(calls, ["npx --no-install next build"]);
});
