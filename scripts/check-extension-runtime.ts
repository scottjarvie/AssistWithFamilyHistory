import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const runtimeFiles = [
  ["content/extractor.js", "extension/content/extractor.js"],
  ["popup/popup.js", "extension/popup/popup.js"],
  ["service-worker.js", "extension/service-worker.js"],
] as const;

const outDir = mkdtempSync(path.join(tmpdir(), "tts-extension-check-"));

try {
  execFileSync(
    pnpm,
    ["exec", "tsc", "-p", "extension/tsconfig.json", "--outDir", outDir],
    {
      cwd: root,
      stdio: "inherit",
    },
  );

  const staleFiles = runtimeFiles.filter(([compiled, runtime]) => {
    const compiledText = readFileSync(path.join(outDir, compiled), "utf8");
    const runtimeText = readFileSync(path.join(root, runtime), "utf8");
    return compiledText !== runtimeText;
  });

  if (staleFiles.length > 0) {
    console.error("Extension runtime files are stale. Run `pnpm build:extension`.");
    for (const [, runtime] of staleFiles) {
      console.error(`- ${runtime}`);
    }
    process.exit(1);
  }

  console.log("Extension runtime files match TypeScript sources.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
