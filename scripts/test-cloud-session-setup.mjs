import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync, appendFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("../.claude/hooks/cloud-session-setup.sh", import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function fixture(t, version = "22.23.4") {
  const root = mkdtempSync(path.join(tmpdir(), "family-history-cloud-hook-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const bin = path.join(root, "bin");
  // Include shell metacharacters: saving PATH must never execute these words.
  const selected = path.join(root, "selected ' $(touch unexpected-command) bin");
  const nvm = path.join(root, "nvm");
  const temp = path.join(root, "temp");
  for (const dir of [project, bin, selected, nvm, temp]) mkdirSync(dir);
  // No system PATH: even the missing-Corepack test cannot reach a real tool.
  for (const name of ["bash", "cat", "tr", "dirname", "rm", "mkdir", "chmod"]) {
    const utility = [path.join("/bin", name), path.join("/usr/bin", name)].find(existsSync);
    assert.ok(utility, `basic utility ${name} must exist`);
    symlinkSync(utility, path.join(bin, name));
  }
  const callsFile = path.join(root, "calls");
  const envFile = path.join(root, "session-env");
  const stamp = path.join(project, "node_modules/.cloud-session-setup");
  const log = path.join(temp, "cloud-session-setup.log");
  writeFileSync(callsFile, "");
  writeFileSync(envFile, "export PRESERVED_SESSION_VALUE=kept\n");
  writeFileSync(path.join(project, ".nvmrc"), "22.23.4\n");
  writeFileSync(path.join(project, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(path.join(project, "package.json"), JSON.stringify({ packageManager: "pnpm@10.26.0+sha512.synthetic", dependencies: {} }));
  const executable = (file, contents) => writeFileSync(file, `#!/bin/bash\n${contents}\n`, { mode: 0o755 });
  for (const [dir, initial] of [[bin, version], [selected, "22.23.4"]]) {
    writeFileSync(path.join(dir, "version"), initial);
    executable(path.join(dir, "node"), `
case "$1:$2" in
  '-p:process.versions.node') cat ${quote(path.join(dir, "version"))}; printf '\\n' ;;
  *) exec ${quote(process.execPath)} "$@" ;;
esac`);
  }
  executable(path.join(bin, "corepack"), `
printf '%s\\n' "corepack $*" >> "$FAKE_CALLS"
case "$*" in
  'pnpm --version') printf '%s\\n' "\${FAKE_PNPM_VERSION:-10.26.0}" ;;
  'pnpm install --frozen-lockfile --prod=false')
    if [ "\${FAKE_INSTALL_STATUS:-0}" != 0 ]; then
      echo 'simulated dependency failure' >&2
      exit "$FAKE_INSTALL_STATUS"
    fi
    mkdir -p node_modules
    if [ "\${FAKE_STAMP_DIRECTORY:-0}" = 1 ]; then mkdir -p node_modules/.cloud-session-setup; fi
    printf 'stub dependencies\\n' > node_modules/installed-by-test
    ;;
  *) echo 'Unexpected Corepack command' >&2; exit 99 ;;
esac`);
  symlinkSync(path.join(bin, "corepack"), path.join(selected, "corepack"));
  // These traps prevent an accidental fallback from escaping the stub harness.
  for (const name of ["npm", "pnpm"]) {
    executable(path.join(bin, name), `printf '%s\\n' 'unexpected ${name}' >> "$FAKE_CALLS"; exit 98`);
  }
  writeFileSync(path.join(nvm, "nvm.sh"), `
nvm() {
  printf '%s\\n' "nvm $*" >> "$FAKE_CALLS"
  case "$1" in
    install) return "\${FAKE_NVM_INSTALL_STATUS:-0}" ;;
    use) export PATH="$FAKE_SELECTED_BIN:$PATH"; return 0 ;;
    *) return 97 ;;
  esac
}
`);
  const run = (overrides = {}) => {
    const result = spawnSync("/bin/bash", [hook], {
      cwd: root,
      timeout: 10_000,
      encoding: "utf8",
      env: {
        HOME: process.env.HOME,
        PATH: bin,
        TMPDIR: temp,
        CLAUDE_CODE_REMOTE: "true",
        CLAUDE_PROJECT_DIR: project,
        CLAUDE_ENV_FILE: envFile,
        NVM_DIR: nvm,
        FAKE_SELECTED_BIN: selected,
        FAKE_CALLS: callsFile,
        ...overrides,
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "", "hook diagnostics belong in its setup log");
    assert.ok(result.stdout.trim().split("\n").length <= 1, "context summary must fit one line");
    return result.stdout;
  };
  const calls = () => readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean);
  const installs = () => calls().filter((line) => line === "corepack pnpm install --frozen-lockfile --prod=false").length;
  return { root, project, bin, selected, nvm, callsFile, envFile, stamp, log, run, calls, installs };
}

test("local and desktop sessions are complete no-ops", (t) => {
  const f = fixture(t, "24.0.0");
  const original = readFileSync(f.envFile, "utf8");
  for (const value of ["", "false", "TRUE"]) {
    assert.equal(f.run({ CLAUDE_CODE_REMOTE: value, CLAUDE_PROJECT_DIR: "/missing-project" }), "");
  }
  assert.deepEqual(f.calls(), []);
  assert.equal(readFileSync(f.envFile, "utf8"), original);
  assert.equal(existsSync(f.log), false);
  assert.equal(existsSync(f.stamp), false);
});

test("exact Node installs with pinned Corepack pnpm and records input content", (t) => {
  const f = fixture(t);
  assert.match(f.run(), /installed dependencies.*Node 22\.23\.4 with pnpm 10\.26\.0/);
  assert.deepEqual(f.calls(), ["corepack pnpm --version", "corepack pnpm install --frozen-lockfile --prod=false"]);
  assert.match(readFileSync(f.stamp, "utf8"), /^[a-f0-9]{64}\n$/);
  assert.ok(readFileSync(f.envFile, "utf8").startsWith("export PRESERVED_SESSION_VALUE=kept\n"));
});

test("missing session environment file fails before nvm or package-manager work", (t) => {
  const f = fixture(t, "24.0.0");
  assert.match(f.run({ CLAUDE_ENV_FILE: "" }), /failed: the session environment file is unavailable/);
  assert.deepEqual(f.calls(), []);
  assert.equal(existsSync(f.stamp), false);
});

test("same-major patch mismatch selects the exact pin and safely persists PATH", (t) => {
  const f = fixture(t, "22.22.0");
  assert.match(f.run(), /installed dependencies/);
  assert.deepEqual(f.calls(), ["nvm install 22.23.4", "nvm use 22.23.4", "corepack pnpm --version", "corepack pnpm install --frozen-lockfile --prod=false"]);
  const result = spawnSync("/bin/bash", ["-c", 'source "$1"; printf "%s\\n" "$PATH"; command -v pnpm; node -p process.versions.node; pnpm --version', "test", f.envFile], {
    cwd: f.root, encoding: "utf8", env: { PATH: f.bin, FAKE_CALLS: f.callsFile },
  });
  assert.equal(result.status, 0);
  const localBin = path.join(f.project, "node_modules/.cloud-session-bin");
  assert.equal(result.stdout, `${localBin}:${f.selected}:${f.bin}\n${localBin}/pnpm\n22.23.4\n10.26.0\n`);
  assert.equal(existsSync(path.join(f.root, "unexpected-command")), false);
});

test("runtime mismatch without nvm is reported before any dependency install", (t) => {
  const f = fixture(t, "22.22.0");
  rmSync(path.join(f.nvm, "nvm.sh"));
  assert.match(f.run(), /failed: Node 22\.23\.4 is required.*nvm is unavailable/);
  assert.deepEqual(f.calls(), []);
  assert.equal(existsSync(f.stamp), false);
});

test("nvm failure stops setup without masking it with a successful install", (t) => {
  const f = fixture(t, "24.0.0");
  assert.match(f.run({ FAKE_NVM_INSTALL_STATUS: "29" }), /failed: nvm install 22\.23\.4 failed/);
  assert.deepEqual(f.calls(), ["nvm install 22.23.4"]);
  assert.equal(existsSync(f.stamp), false);
});

test("successful nvm commands must actually select the requested patch", (t) => {
  const f = fixture(t, "22.22.0");
  writeFileSync(path.join(f.selected, "version"), "22.23.5");
  assert.match(f.run(), /failed: Node 22\.23\.4 is required after nvm selection \(found 22\.23\.5\)/);
  assert.equal(f.installs(), 0);
  assert.equal(existsSync(f.stamp), false);
});

test("resume checks runtime and restores PATH before reusing dependencies", (t) => {
  const f = fixture(t, "22.22.0");
  f.run();
  const receipt = readFileSync(f.stamp, "utf8");
  rmSync(path.join(f.project, "node_modules/.cloud-session-bin"), { recursive: true });
  writeFileSync(f.envFile, "export PRESERVED_SESSION_VALUE=resumed\n");
  assert.match(f.run(), /already installed.*Node 22\.23\.4 and pnpm 10\.26\.0/);
  assert.equal(f.installs(), 1);
  assert.equal(f.calls().filter((line) => line === "nvm use 22.23.4").length, 2);
  assert.equal(readFileSync(f.stamp, "utf8"), receipt);
  assert.match(readFileSync(f.envFile, "utf8"), /^export PRESERVED_SESSION_VALUE=resumed\nexport PATH=/);
  assert.ok(existsSync(path.join(f.project, "node_modules/.cloud-session-bin/pnpm")));
});

test("changed lockfile bytes reinstall even when its timestamp is preserved", (t) => {
  const f = fixture(t);
  f.run();
  const lock = path.join(f.project, "pnpm-lock.yaml");
  const prior = statSync(lock);
  const receipt = readFileSync(f.stamp, "utf8");
  appendFileSync(lock, "# changed dependency resolution\n");
  utimesSync(lock, prior.atime, prior.mtime);
  assert.match(f.run(), /installed dependencies/);
  assert.equal(f.installs(), 2);
  assert.notEqual(readFileSync(f.stamp, "utf8"), receipt);
});

test("timestamp changes alone do not invalidate an identical install receipt", (t) => {
  const f = fixture(t);
  f.run();
  const future = new Date(Date.now() + 60_000);
  utimesSync(path.join(f.project, "pnpm-lock.yaml"), future, future);
  assert.match(f.run(), /already installed/);
  assert.equal(f.installs(), 1);
});

test("a future-dated legacy timestamp stamp is not an install receipt", (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.stamp));
  writeFileSync(f.stamp, "");
  const future = new Date(Date.now() + 60_000);
  utimesSync(f.stamp, future, future);
  assert.match(f.run(), /installed dependencies/);
  assert.equal(f.installs(), 1);
});

test("a new exact Node pin requires fresh installation", (t) => {
  const f = fixture(t);
  f.run();
  const receipt = readFileSync(f.stamp, "utf8");
  writeFileSync(path.join(f.project, ".nvmrc"), "22.23.5\n");
  writeFileSync(path.join(f.selected, "version"), "22.23.5");
  assert.match(f.run(), /installed dependencies.*Node 22\.23\.5/);
  assert.equal(f.installs(), 2);
  assert.notEqual(readFileSync(f.stamp, "utf8"), receipt);
});

test("package metadata and the pinned pnpm release participate in the receipt", (t) => {
  const f = fixture(t);
  f.run();
  writeFileSync(path.join(f.project, "package.json"), JSON.stringify({ packageManager: "pnpm@10.27.0", dependencies: {} }));
  assert.match(f.run({ FAKE_PNPM_VERSION: "10.27.0" }), /installed dependencies.*pnpm 10\.27\.0/);
  assert.equal(f.installs(), 2);
});

test("workspace install-policy changes invalidate the receipt", (t) => {
  const f = fixture(t);
  f.run();
  writeFileSync(path.join(f.project, "pnpm-workspace.yaml"), "packages:\n  - .\nignoredBuiltDependencies:\n  - sharp\n");
  assert.match(f.run(), /installed dependencies/);
  assert.equal(f.installs(), 2);
});

test("production NODE_ENV still installs the development tools required by verification", (t) => {
  const f = fixture(t);
  assert.match(f.run({ NODE_ENV: "production" }), /installed dependencies/);
  assert.ok(f.calls().includes("corepack pnpm install --frozen-lockfile --prod=false"));
});

test("wrong or unavailable package manager refuses install without changing shims", (t) => {
  const f = fixture(t);
  assert.match(f.run({ FAKE_PNPM_VERSION: "10.25.0" }), /failed: pnpm 10\.26\.0 is required \(found 10\.25\.0\)/);
  assert.equal(f.installs(), 0);
  rmSync(path.join(f.bin, "corepack"));
  assert.match(f.run(), /failed: Corepack is unavailable/);
  assert.equal(f.installs(), 0);
  assert.equal(existsSync(f.stamp), false);
});

test("failed install invalidates old success; a retry cannot skip partial dependencies", (t) => {
  const f = fixture(t);
  f.run();
  appendFileSync(path.join(f.project, "pnpm-lock.yaml"), "# changed\n");
  assert.match(f.run({ FAKE_INSTALL_STATUS: "17" }), /failed: dependency install.*failed \(exit 17\)/);
  assert.match(readFileSync(f.log, "utf8"), /simulated dependency failure/);
  assert.equal(existsSync(f.stamp), false);
  assert.match(f.run(), /installed dependencies/);
  assert.equal(f.installs(), 3);
});

test("missing lockfile or non-exact Node pin never falls back to unlocked install", (t) => {
  const f = fixture(t);
  const lock = path.join(f.project, "pnpm-lock.yaml");
  rmSync(lock);
  assert.match(f.run(), /failed: the required pnpm lockfile is missing/);
  writeFileSync(lock, "lockfileVersion: '9.0'\n");
  writeFileSync(path.join(f.project, ".nvmrc"), "22\n");
  assert.match(f.run(), /failed: .nvmrc must pin an exact Node version/);
  assert.deepEqual(f.calls(), []);
});

test("PATH and receipt write failures are reported without false success", (t) => {
  const f = fixture(t);
  assert.match(f.run({ CLAUDE_ENV_FILE: f.root }), /failed: the session PATH could not be saved/);
  assert.equal(f.installs(), 0);
  assert.match(f.run({ FAKE_STAMP_DIRECTORY: "1" }), /failed: the successful dependency receipt could not be written/);
  assert.equal(statSync(f.stamp).isFile(), false);
});

test("hook configuration grants no permissions and only wires startup/resume", () => {
  const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
  assert.deepEqual(settings, { hooks: { SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/cloud-session-setup.sh', timeout: 600 }] }] } });
});
