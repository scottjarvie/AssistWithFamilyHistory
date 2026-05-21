import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const runtimeFiles = [
  ["extension/dist/content/extractor.js", "extension/content/extractor.js"],
  ["extension/dist/popup/popup.js", "extension/popup/popup.js"],
  ["extension/dist/service-worker.js", "extension/service-worker.js"],
] as const;

execFileSync(pnpm, ["exec", "tsc", "-p", "extension/tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
});

for (const [compiled, runtime] of runtimeFiles) {
  const runtimePath = path.join(root, runtime);
  mkdirSync(path.dirname(runtimePath), { recursive: true });
  copyFileSync(path.join(root, compiled), runtimePath);
}

console.log(`Synced ${runtimeFiles.length} extension runtime files from TypeScript.`);
