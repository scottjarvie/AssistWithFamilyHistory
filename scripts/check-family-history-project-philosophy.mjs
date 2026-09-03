import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourceRelativePath =
  "docs/planning/assist-with-family-history-project-philosophy.md";
const outputRelativePath =
  "docs/planning/assist-with-family-history-project-philosophy.html";
const oldBaseName = ["assist-with-family-history", "core", "philosophy"].join(
  "-",
);
const oldSourcePath = path.join(
  repositoryRoot,
  "docs/planning",
  `${oldBaseName}.md`,
);
const oldOutputPath = path.join(
  repositoryRoot,
  "docs/planning",
  `${oldBaseName}.html`,
);
const sourcePath = path.join(repositoryRoot, sourceRelativePath);
const outputPath = path.join(repositoryRoot, outputRelativePath);
const trackerMetadataPath = path.join(
  repositoryRoot,
  "docs/tracker/tracker.json",
);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(existsSync(sourcePath), `Missing canonical Markdown: ${sourceRelativePath}`);
assert(existsSync(outputPath), `Missing synchronized HTML: ${outputRelativePath}`);
assert(!existsSync(oldSourcePath), `Old canonical Markdown still exists: ${oldBaseName}.md`);
assert(!existsSync(oldOutputPath), `Old synchronized HTML still exists: ${oldBaseName}.html`);

if (!existsSync(sourcePath) || !existsSync(outputPath)) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const [sourceRaw, html, trackerMetadataRaw] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(outputPath, "utf8"),
  readFile(trackerMetadataPath, "utf8"),
]);
const source = sourceRaw.replace(/\r\n?/g, "\n");
const trackerMetadata = JSON.parse(trackerMetadataRaw);
const familyCore = trackerMetadata.familyCore;
const digest = createHash("sha256").update(source).digest("hex");
const metaDigest = html.match(
  /<meta name="source-sha256" content="([0-9a-f]{64})">/,
)?.[1];
const footerDigest = html.match(
  /<strong>Source SHA-256:<\/strong>\s*([0-9a-f]{64})/,
)?.[1];

assert(
  html.includes(`<meta name="source-markdown" content="${sourceRelativePath}">`),
  "HTML source-markdown metadata does not point to the Project Philosophy.",
);
assert(digest === metaDigest, "HTML source-sha256 metadata does not match Markdown.");
assert(digest === footerDigest, "Visible HTML source digest does not match Markdown.");
assert(
  source.startsWith("# Assist With Family History Project Philosophy\n"),
  "Canonical Markdown title is not Project Philosophy.",
);
assert(
  html.includes("<title>Assist With Family History Project Philosophy v"),
  "HTML title is not Project Philosophy.",
);
assert(
  !source.includes("Assist With Family History Core Philosophy") &&
    !html.includes("Assist With Family History Core Philosophy"),
  "A competing product-level Core Philosophy title remains.",
);
assert(
  /^Assist With Sites — Core Philosophy v\d+\.\d+\.\d+$/.test(
    familyCore?.label ?? "",
  ),
  "Tracker Family Core label is missing or malformed.",
);
assert(
  /^\d{4}-\d{2}-\d{2}$/.test(familyCore?.date ?? ""),
  "Tracker Family Core date is missing or malformed.",
);
assert(
  /^[0-9a-f]{40}$/.test(familyCore?.commit ?? ""),
  "Tracker Family Core commit is missing or malformed.",
);
assert(
  /^[0-9a-f]{64}$/.test(familyCore?.sourceSha256 ?? ""),
  "Tracker Family Core source SHA-256 is missing or malformed.",
);

for (const requiredText of [
  "**Document:** Assist With Family History — Project Philosophy",
  `**Canonical:**`,
  `**Family Core:** ${familyCore.label} (${familyCore.date})`,
  "**Aligned:** 2026-08-08",
  "**Adopted:**",
  "**Deferred/gaps:**",
  "**Differs:**",
  "**Evidence:**",
]) {
  assert(source.includes(requiredText), `Missing alignment field: ${requiredText}`);
}
assert(
  source.includes(familyCore.commit),
  "Project Philosophy does not name the tracker Family Core commit.",
);
assert(
  source.includes(familyCore.sourceSha256),
  "Project Philosophy does not name the tracker Family Core source SHA-256.",
);

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[“”‘’`_*]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const markdownHeadings = [...source.matchAll(/^(#{2,3})\s+(.+)$/gm)].map(
  (match) => ({ level: match[1].length, id: slugify(match[2]) }),
);
const htmlHeadings = [...html.matchAll(/<h([23]) id="([^"]+)">/g)].map(
  (match) => ({ level: Number(match[1]), id: match[2] }),
);
assert(
  JSON.stringify(markdownHeadings) === JSON.stringify(htmlHeadings),
  "Markdown and HTML heading order or anchors differ.",
);

const markdownInternalLinks = [
  ...source.matchAll(/\]\(#([^)]+)\)/g),
].map((match) => match[1]);
const htmlIds = new Set(
  [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]),
);
const missingInternalLinks = [
  ...new Set(markdownInternalLinks.filter((id) => !htmlIds.has(id))),
];
assert(
  missingInternalLinks.length === 0,
  `Missing internal-link targets: ${missingInternalLinks.join(", ")}`,
);

const decodeHtml = (value) =>
  value
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const normalizeText = (value) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?—)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
let markdownText = source
  .replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
  .replace(/^\s*```[^\n]*$/gm, "")
  .replace(/^\s*>\s?/gm, "")
  .replace(/^\s*(?:[-*+] |\d+\. )/gm, "")
  .replace(/^#{1,6}\s+/gm, "")
  .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
  .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
  .replace(/\*\*|(?<!\*)\*(?!\*)/g, "")
  .replaceAll("`", "")
  .replace(/^\||\|$/gm, "")
  .replace(/\|/g, " ")
  .replace(/\\([|*_[\]()])/g, "$1");
const articleHtml =
  html.match(/<article class="reader">([\s\S]*?)<\/article>/)?.[1] ?? "";
let htmlText = decodeHtml(
  articleHtml
    .replace(/<span class="eyebrow">[\s\S]*?<\/span>/, "")
    .replace(/<[^>]+>/g, " "),
);
markdownText = normalizeText(markdownText);
htmlText = normalizeText(htmlText);
assert(
  markdownText === htmlText,
  "Markdown and HTML article text are not substantively identical.",
);

const externalRuntimeAssets = [
  ...html.matchAll(
    /(?:src|href)="(https?:\/\/[^\"]+)"|@import\s+url\((https?:\/\/[^)]+)\)|url\((https?:\/\/[^)]+)\)/g,
  ),
].map((match) => match[1] || match[2] || match[3]);
assert(
  externalRuntimeAssets.length === 0,
  `External runtime assets found: ${externalRuntimeAssets.join(", ")}`,
);
assert(/^<!doctype html>/i.test(html), "HTML doctype is missing or misplaced.");
assert(/<html lang="en"/.test(html), "HTML language is not declared.");
assert(
  /<a class="skip-link" href="#main-content">/.test(html),
  "Keyboard skip link is missing.",
);
assert(
  /<main[^>]+id="main-content"/.test(html),
  "Main landmark or skip target is missing.",
);
assert(
  /\.skip-link:focus\s*\{[^}]*translateY\(0\)/s.test(html),
  "Visible skip-link focus rule is missing.",
);
assert(
  /prefers-reduced-motion:\s*reduce/.test(html),
  "Reduced-motion handling is missing.",
);
assert(
  (html.match(/class="table-scroll" tabindex="0" role="region"/g) || [])
    .length > 0,
  "Scrollable tables are not keyboard-focusable regions.",
);

const textExtensions = new Set([
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const ignoredDirectories = new Set([".git", ".next", "node_modules"]);
const staleReferences = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(absolutePath);
      continue;
    }
    const relativePath = path.relative(repositoryRoot, absolutePath);
    const extension = path.extname(entry.name);
    if (!textExtensions.has(extension) && !["AGENTS.md", "CLAUDE.md", "README.md"].includes(entry.name)) {
      continue;
    }
    const contents = await readFile(absolutePath, "utf8");
    if (contents.includes(oldBaseName)) staleReferences.push(relativePath);
  }
}

await scan(repositoryRoot);
assert(
  staleReferences.length === 0,
  `Stale old canonical-path references remain: ${staleReferences.join(", ")}`,
);

for (const discoveryFile of ["README.md", "docs/README.md", "AGENTS.md", "CLAUDE.md"]) {
  const contents = await readFile(path.join(repositoryRoot, discoveryFile), "utf8");
  assert(
    contents.includes("assist-with-family-history-project-philosophy.md"),
    `${discoveryFile} does not link to the canonical Project Philosophy.`,
  );
}

if (failures.length > 0) {
  console.error("Family History Project Philosophy check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Family History Project Philosophy check passed (${markdownHeadings.length} h2/h3 headings, SHA-256 ${digest}).`,
);
