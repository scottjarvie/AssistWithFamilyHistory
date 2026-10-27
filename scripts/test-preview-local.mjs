import test from "node:test";
import assert from "node:assert/strict";
import { previewPlan, startNext } from "./preview-local.mjs";

const deployment = "anonymous:anonymous-assistwithfamilyhistory";
const local = { CONVEX_DEPLOYMENT: deployment, CONVEX_URL: "http://127.0.0.1:3210", CONVEX_SITE_URL: "http://127.0.0.1:3211" };

for (const file of [
  { ...local, CONVEX_DEPLOYMENT: "prod:synthetic" },
  { ...local, CONVEX_DEPLOYMENT: "anonymous:another-backend" },
  { ...local, NEXT_PUBLIC_CONVEX_URL: "https://synthetic.convex.cloud" },
  { ...local, CONVEX_URL: "https://synthetic.convex.cloud", NEXT_PUBLIC_CONVEX_URL: "http://localhost:3210" },
  { ...local, CONVEX_SITE_URL: "https://synthetic.convex.site" },
  { ...local, CONVEX_URL: "http://localhost:4323" },
  { ...local, CONVEX_URL: "http://localhost:3210/private" },
  { ...local, CONVEX_URL: "http://synthetic:secret@localhost:3210" },
  { ...local, CONVEX_DEPLOY_KEY: "synthetic-not-a-secret" },
  { ...local, CLERK_SECRET_KEY: "synthetic-not-a-secret" },
]) {
  test(`unsafe preview target is refused before subprocesses: ${JSON.stringify(file)}`, () => {
    let calls = 0;
    assert.throws(() => startNext({ file, parentEnv: {}, setEnv: () => { calls++; }, launch: () => { calls++; } }), /refusing|unsupported/);
    assert.equal(calls, 0);
  });
}

test("preview strips inherited selectors, credentials and preloads; pins an explicit local env file", () => {
  const calls = [];
  startNext({ file: local, parentEnv: {
    PATH: "/synthetic/bin", HOME: "/synthetic/home", PORT: "3444",
    CONVEX_DEPLOYMENT: "prod:synthetic", CONVEX_DEPLOY_KEY: "synthetic-not-a-secret", CONVEX_URL: "https://synthetic.convex.cloud",
    CLERK_SECRET_KEY: "synthetic-not-a-secret", NODE_OPTIONS: "--require synthetic", DOTENV_CONFIG_PATH: ".env.local",
  }, setEnv: (...args) => { calls.push(args); return { status: 0 }; }, launch: (...args) => calls.push(args) });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1], ["exec", "convex", "env", "set", "TRUST_BOUNDARY_MODE", "shadow", "--env-file", ".env.preview.local"]);
  const cliEnv = calls[0][2].env;
  assert.deepEqual(cliEnv, { PATH: "/synthetic/bin", HOME: "/synthetic/home", PORT: "3444", CONVEX_AGENT_MODE: "anonymous", CONVEX_DEPLOYMENT: deployment });
  const nextEnv = calls[1][2];
  assert.equal(nextEnv.NEXT_PUBLIC_CONVEX_URL, "http://localhost:3210");
  assert.equal(nextEnv.CONVEX_SITE_URL, "http://localhost:3211");
  assert.equal(nextEnv.TRUST_BOUNDARY_MODE, "shadow");
  assert.equal(nextEnv.DISABLE_CLERK, "true");
  assert.equal(nextEnv.CLERK_SECRET_KEY, undefined);
});

for (const result of [{ status: 1 }, { status: null, error: new Error("synthetic launch error") }]) {
  test(`local shadow setup failure prevents Next startup (${result.status})`, () => {
    let launched = false;
    assert.throws(() => startNext({ file: local, parentEnv: {}, setEnv: () => result, launch: () => { launched = true; } }), /preview was not started/);
    assert.equal(launched, false);
  });
}

test("local defaults are anonymous loopback only; uninitialized next mode and bad ports fail closed", () => {
  assert.equal(previewPlan({}, {}).convexUrl, "http://localhost:3210");
  assert.throws(() => startNext({ file: {}, parentEnv: {}, setEnv: () => assert.fail("must not spawn") }), /initialized first/);
  for (const PORT of ["0", "65536", "host:3443", "3443;unsafe"]) assert.throws(() => previewPlan(local, { PORT }), /invalid site port/);
});


test("validated custom port survives the Convex child to --next handoff", () => {
  const first = previewPlan(local, { PORT: "3444" });
  const second = previewPlan(local, first.env);
  assert.equal(first.env.PORT, "3444");
  assert.equal(second.port, "3444");
});
