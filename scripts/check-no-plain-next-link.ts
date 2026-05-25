/**
 * Guard against plain `Link` imports from `next/link`.
 *
 * After GEN-76 confirmed the Keychainify browser extension as the cause of
 * the anchor hydration mismatch, every anchor must be `SafeLink` (which
 * applies `suppressHydrationWarning`). Files that import `Link` directly
 * from `next/link` re-emit the warning whenever Keychainify or a similar
 * extension is installed.
 *
 * `SafeLink.tsx` is the only file allowed to import directly from
 * `next/link` — it's the wrapper.
 *
 * The convention for all other files is:
 *
 *   import { SafeLink as Link } from "@/components/layout/SafeLink";
 *
 * That way `<Link>` JSX keeps working without per-file JSX edits.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ALLOWLIST = new Set<string>([
  // SafeLink itself wraps next/link — that's its job.
  "components/layout/SafeLink.tsx",
]);

const ROOTS = ["app", "components", "features", "lib"];
const failures: string[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "_generated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const root of ROOTS) {
  let files: string[];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    if (ALLOWLIST.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    // Match `import Link from "next/link"` and similar bare-default imports.
    // Allow `import { SafeLink as Link } from "@/components/layout/SafeLink"`
    // and aliased re-exports.
    if (/^\s*import\s+Link\s+from\s+["']next\/link["']/m.test(source)) {
      failures.push(
        `${rel}: imports Link directly from next/link. ` +
          `Use \`import { SafeLink as Link } from "@/components/layout/SafeLink"\` instead ` +
          `(GEN-76: Keychainify and similar extensions inject classes on anchors, causing hydration mismatches).`
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Next.js Link import guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Next.js Link import guard passed.");
