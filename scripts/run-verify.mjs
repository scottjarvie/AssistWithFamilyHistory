#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const gitBashCandidates = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
];

const bash = process.platform === "win32"
  ? gitBashCandidates.find(existsSync) ?? "bash"
  : "bash";

const result = spawnSync(bash, ["scripts/verify.sh"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to start the verification runner with ${bash}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
