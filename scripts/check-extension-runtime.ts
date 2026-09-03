import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

const runtimeFiles = [
  ["content/extractor.js", "extension/content/extractor.js"],
  ["popup/popup.js", "extension/popup/popup.js"],
  ["service-worker.js", "extension/service-worker.js"],
] as const;

const outDir = mkdtempSync(path.join(tmpdir(), "tts-extension-check-"));

try {
  execFileSync(
    process.execPath,
    [tsc, "-p", "extension/tsconfig.json", "--outDir", outDir],
    {
      cwd: root,
      stdio: "inherit",
    },
  );

  const staleFiles = runtimeFiles.filter(([compiled, runtime]) => {
    const compiledText = readFileSync(path.join(outDir, compiled), "utf8");
    const runtimeText = readFileSync(path.join(root, runtime), "utf8");
    return normalizeNewlines(compiledText) !== normalizeNewlines(runtimeText);
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
