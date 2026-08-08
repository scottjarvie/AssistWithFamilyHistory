import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourceRelativePath =
  "docs/planning/assist-with-family-history-project-philosophy.md";
const outputRelativePath =
  "docs/planning/assist-with-family-history-project-philosophy.html";
const sourcePath = path.join(repositoryRoot, sourceRelativePath);
const outputPath = path.join(repositoryRoot, outputRelativePath);

// The checked-in HTML is also the durable Family History design shell. This
// renderer replaces every source-derived region while preserving its standalone
// archival typography, palette, layout, theme control, and accessibility CSS.
const [source, shell] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(outputPath, "utf8"),
]);

const sourceSha256 = createHash("sha256").update(source).digest("hex");
const title = source.match(/^#\s+(.+)$/m)?.[1];
const version = source.match(
  /^>\s+\*\*Product document version:\*\*\s+(.+)$/m,
)?.[1];
const evidenceDate = source.match(
  /^>\s+\*\*Capability evidence last verified:\*\*\s+(.+)$/m,
)?.[1];
const repositoryRevision = source.match(
  /^>\s+\*\*Repository evidence revision:\*\*\s+`([^`]+)`$/m,
)?.[1];

if (!title || !version || !evidenceDate || !repositoryRevision) {
  throw new Error(
    "Project Philosophy source is missing title, version, evidence date, or repository revision metadata.",
  );
}

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[“”‘’`_*]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function renderInline(value) {
  const codeTokens = [];
  let rendered = value.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  rendered = escapeHtml(rendered)
    .replace(
      /\[([^\]]+)]\(([^)]+)\)/g,
      (_, label, href) => `<a href="${escapeHtml(href)}">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return rendered.replace(
    /@@CODE(\d+)@@/g,
    (_, index) => codeTokens[Number(index)],
  );
}

function splitTableRow(line) {
  return line
    .replace(/^\s*\||\|\s*$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines) {
  const rows = lines.map(splitTableRow);
  const header = rows[0];
  const body = rows.slice(2);

  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table"><table>
<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>
<tbody>${body
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function renderMarkdown(markdown) {
  const lines = markdown.trim().split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const headingTitle = heading[2];
      if (level === 1) {
        output.push(
          `<h1 id="${slugify(headingTitle)}"><span class="eyebrow">A research trail worth keeping · 2026</span>${renderInline(headingTitle)}</h1>`,
        );
      } else {
        output.push(
          `<h${level} id="${slugify(headingTitle)}">${renderInline(headingTitle)}</h${level}>`,
        );
      }
      continue;
    }

    if (line.trim() === "---") {
      flushParagraph();
      closeList();
      output.push("<hr>");
      continue;
    }

    if (
      line.trimStart().startsWith("|") &&
      /^\s*\|\s*:?-+/.test(lines[index + 1] || "")
    ) {
      flushParagraph();
      closeList();
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trimStart().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      output.push(renderTable(tableLines));
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      closeList();
      const quoteLines = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      index -= 1;
      const quoteSource = quoteLines.join("\n");
      const className = quoteSource.includes("Marketing and PR takeaways")
        ? ' class="marketing-takeaways"'
        : "";
      output.push(`<blockquote${className}>${renderMarkdown(quoteSource)}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextListType = ordered ? "ol" : "ul";
      if (listType !== nextListType) {
        closeList();
        output.push(`<${nextListType}>`);
        listType = nextListType;
      }
      const itemParts = [ordered?.[1] ?? unordered?.[1] ?? ""];
      while (
        index + 1 < lines.length &&
        /^\s{2,}\S/.test(lines[index + 1]) &&
        !/^\s*[-*]\s+/.test(lines[index + 1]) &&
        !/^\s*\d+\.\s+/.test(lines[index + 1])
      ) {
        index += 1;
        itemParts.push(lines[index].trim());
      }
      output.push(`<li>${renderInline(itemParts.join(" "))}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  return output.join("\n");
}

const headings = [...source.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
  id: slugify(match[1]),
  title: match[1].replace(/[`_*]/g, ""),
}));
const navigationItems = headings
  .map(
    ({ id, title: headingTitle }) =>
      `<li><a href="#${id}">${escapeHtml(headingTitle)}</a></li>`,
  )
  .join("");
const mobileNavigation = `<nav class="mobile-nav" aria-label="Compact section navigation">
    <details>
      <summary>Reading map and sections</summary>
      <ol>${navigationItems}</ol>
    </details>
  </nav>`;
const sectionNavigation = `<nav class="section-nav" aria-label="Section navigation">
      <p>Along the research trail</p>
      <ol>${navigationItems}</ol>
    </nav>`;
const article = `<article class="reader">${renderMarkdown(source)}</article>`;
const headEnd = shell.indexOf("</head>");
if (headEnd === -1) {
  throw new Error("The checked-in reader design shell is missing </head>.");
}
const head = shell
  .slice(0, headEnd + "</head>".length)
  .replace(
    /<meta name="source-markdown" content="[^"]+">/,
    `<meta name="source-markdown" content="${sourceRelativePath}">`,
  )
  .replace(
    /<meta name="source-sha256" content="[^"]+">/,
    `<meta name="source-sha256" content="${sourceSha256}">`,
  )
  .replace(
    /<title>[^<]+<\/title>/,
    `<title>${escapeHtml(title)} v${escapeHtml(version)}</title>`,
  );

const html = `${head}
<body>
  <a class="skip-link" href="#main-content">Skip to philosophy</a>
  <aside class="reference" aria-label="Reference status">
    <div class="reference-inner">
      <div>
        <strong>Canonical Project Philosophy · not a live feature claim</strong>
        <span>The source is <a href="./assist-with-family-history-project-philosophy.md">${sourceRelativePath}</a>.</span>
      </div>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch color theme">Theme</button>
    </div>
  </aside>
  ${mobileNavigation}
  <div class="story-ribbon" aria-label="The research-to-story thread">
    <span><b>Clue</b><small>preserve</small></span>
    <i aria-hidden="true"></i>
    <span><b>Evidence</b><small>connect</small></span>
    <i aria-hidden="true"></i>
    <span><b>Understanding</b><small>question</small></span>
    <i aria-hidden="true"></i>
    <span><b>Story</b><small>ground</small></span>
  </div>
  <main class="page" id="main-content">
    ${sectionNavigation}
    ${article}
  </main>
  <footer class="source-footer">
    <div class="source-footer-inner">
      <p><strong>Source synchronization</strong></p>
      <p>This HTML is a designed companion. The Project Philosophy Markdown remains authoritative, and substantive changes must regenerate this reader.</p>
      <p class="digest"><strong>Source SHA-256:</strong> ${sourceSha256}</p>
      <p><strong>Product document version:</strong> ${escapeHtml(version)} · <strong>Capability evidence date:</strong> ${escapeHtml(evidenceDate)} · <strong>Repository evidence revision:</strong> <code>${escapeHtml(repositoryRevision)}</code></p>
    </div>
  </footer>
  <script>
    (() => {
      const root = document.documentElement;
      const button = document.getElementById("theme-toggle");
      button.addEventListener("click", () => {
        const current = root.dataset.theme;
        const next = current === "dark" ? "light" : current === "light" ? "dark" :
          (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
        root.dataset.theme = next;
        button.setAttribute("aria-label", "Switch to " + (next === "dark" ? "light" : "dark") + " theme");
      });
    })();
  </script>
</body>
</html>`;

await writeFile(outputPath, `${html.trimEnd()}\n`, "utf8");
console.log(
  `Rendered ${outputRelativePath} from ${sourceRelativePath} (${sourceSha256}).`,
);
