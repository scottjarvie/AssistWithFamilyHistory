/**
 * Guard against rendering story markdown as raw text.
 *
 * Published stories used to render with `whitespace-pre-wrap` dumping literal
 * markdown (`#`, `**`, tables) on the page. Story content must go through the
 * shared <Prose> renderer (components/prose/Prose.tsx). This gate fails the build
 * if any file wraps `story.content` in a `whitespace-pre-wrap` element again.
 *
 * It targets the story-content bug class specifically; legitimately-raw renders
 * (citation.extractedText, mono document dumps, JSON snapshots) are unaffected.
 *
 * Wired into `pnpm verify`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const roots = [path.join(process.cwd(), "app"), path.join(process.cwd(), "components")];

function walkTsx(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkTsx(full));
    } else if (entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const offenders: string[] = [];

for (const root of roots) {
  for (const file of walkTsx(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/whitespace-pre-wrap/.test(line) && /story\.content/.test(line)) {
        offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
      }
    });
  }
}

if (offenders.length > 0) {
  console.error("Story content rendered as raw markdown (use <Prose> from components/prose/Prose.tsx):");
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log("No-raw-markdown-render check passed (story content renders through <Prose>).");
