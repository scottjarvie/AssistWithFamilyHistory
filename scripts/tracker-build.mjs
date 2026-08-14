#!/usr/bin/env node
/**
 * tracker-build.mjs — compile the per-repo tracker into static HTML.
 *
 *   docs/tracker/cards/*.md  →  docs/tracker/board.html   (the kanban)
 *   docs/tracker/work-orders/*.md → rendered into the Work Orders view
 *   docs/tracker/GUIDE.md    →  docs/tracker/guide.html   (the guide page)
 *
 * Part of the per-repo tracker system (docs/tracker/SYSTEM.md, family contract §16).
 * Zero dependencies; the output works from file://.
 *
 * Usage: node scripts/tracker-build.mjs
 *
 * Portable: to reuse in another Assist repo, copy this file + SYSTEM.md and
 * change REPO_NAME / REPO_SLUG + the PALETTE block below to that site's own.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACKER_DIR = join(ROOT, "docs", "tracker");
const CARDS_DIR = join(ROOT, "docs", "tracker", "cards");
const WORK_ORDERS_DIR = join(ROOT, "docs", "tracker", "work-orders");
const GUIDE_SRC = join(ROOT, "docs", "tracker", "GUIDE.md");
const OUT_BOARD = join(ROOT, "docs", "tracker", "board.html");
const OUT_GUIDE = join(ROOT, "docs", "tracker", "guide.html");

const TRACKER = JSON.parse(readFileSync(join(TRACKER_DIR, "tracker.json"), "utf8"));
const REPO_NAME = TRACKER.project;
const REPO_SLUG = TRACKER.repository;
const SITE_URL = TRACKER.projectUrl;
const PROJECT_PHILOSOPHY = TRACKER.projectPhilosophy;
const FAMILY_CORE = TRACKER.familyCore;

/* Family History palette — archival paper, teal evidence, and rust annotations. */
const PALETTE = `
  :root {
    --paper:#f7f3e8; --paper-2:#eee7d6; --ink:#24312c; --soft:#5c6862;
    --faint:#727b76; --line:#d4cab6; --surface:#fffdf7; --surface-deep:#e8dfcc;
    --groove:#245a43; --groove-2:#2f7358; --groove-wash:#dceee5;
    --signal:#a65332; --signal-soft:#f1d8ca; --gold:#98702b;
  }
  html[data-mode="studio"] {
    --paper:#111916; --paper-2:#19241f; --ink:#f3efe4; --soft:#aab6af;
    --faint:#8e9993; --line:#314139; --surface:#17211d; --surface-deep:#0c1310;
    --groove:#8fd7b4; --groove-2:#71c99f; --groove-wash:#1c382c;
    --signal:#e18a64; --signal-soft:#4d2d21; --gold:#d6ad5b;
  }
`;

/* Status keys are the cross-repo contract (SYSTEM.md); labels and display
   order are this site's presentation. The board leads with what's moving now —
   Backlog renders last and dimmed so the first minute reads as current work,
   not inventory. */
const STATUSES = [
  ["backlog", "Backlog"],
  ["next", "Next"],
  ["doing", "Doing"],
  ["needs-you", "Needs You"],
  ["done", "Done"],
];

function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const meta = { file };
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^"|"$/g, "").trim();
  }
  meta.body = m[2].trim();
  return meta;
}

function parseCard(file) {
  const meta = parseFrontmatter(readFileSync(join(CARDS_DIR, file), "utf8"), file);
  for (const req of ["id", "title", "status", "type", "area"]) {
    if (!meta[req]) throw new Error(`${file}: missing "${req}"`);
  }
  if (!STATUSES.some(([s]) => s === meta.status)) {
    throw new Error(`${file}: unknown status "${meta.status}"`);
  }
  /* Derived signals the board surfaces. */
  meta.hasEdu = /^##\s+(Education|Why Scott is needed)\b/m.test(meta.body);
  const fuSection = meta.body.split(/^##\s+/m).find((s) => /^Follow-ups?\b/.test(s));
  meta.followups = fuSection ? (fuSection.match(/^-\s+\d{4}-\d{2}-\d{2}/gm) || []).length : 0;
  if (meta["evidence-links"]) meta.evidenceLinks = meta["evidence-links"].split(/\s+/).filter(Boolean);
  meta.workOrderIds = (meta["work-orders"] || "").split(/[\s,]+/).filter(Boolean);
  return meta;
}

const WORK_ORDER_STATUSES = ["proposed", "ready", "active", "complete", "superseded"];
const AUDIT_STATUSES = ["not-audited", "passed", "follow-up-needed"];
function parseWorkOrder(file) {
  const meta = parseFrontmatter(readFileSync(join(WORK_ORDERS_DIR, file), "utf8"), file);
  for (const req of ["id", "title", "execution", "audit", "cards", "created", "updated"]) {
    if (!meta[req]) throw new Error(`${file}: missing "${req}"`);
  }
  if (!/^AWF-WO-\d{3}$/.test(meta.id)) throw new Error(`${file}: invalid Work Order id ${meta.id}`);
  meta.cardIds = meta.cards.split(/[\s,]+/).filter(Boolean);
  if (!WORK_ORDER_STATUSES.includes(meta.execution)) {
    throw new Error(`${file}: execution must be one of ${WORK_ORDER_STATUSES.join("|")}`);
  }
  if (!AUDIT_STATUSES.includes(meta.audit)) {
    throw new Error(`${file}: audit must be one of ${AUDIT_STATUSES.join("|")}`);
  }
  if (meta["follow-ups"]) meta.followUpIds = meta["follow-ups"].split(/[\s,]+/).filter(Boolean);
  return meta;
}

/* Minimal markdown → HTML: headings, lists, checkboxes, bold, code, links. */
function esc(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}
function md(src) {
  const out = [];
  let list = null;
  let paragraph = [];
  const closeParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const lines = src.replace(/\n {2,}(?![-*]\s)([^\n]+)/g, " $1").split("\n");
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^(?:[-*]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/);
    const listType = /^\d+\./.test(line) ? "ol" : "ul";
    const tr = line.match(/^\|(.+)\|\s*$/);
    if (h) {
      closeParagraph();
      closeList();
      const lvl = Math.max(2, h[1].length);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
    } else if (tr && !/^[\s|:-]+$/.test(line)) {
      closeParagraph();
      closeList();
      const cells = tr[1].split("|").map((c) => inline(c.trim())).join("</td><td>");
      out.push(`<div class="trow" role="row"><span role="cell">${cells.replaceAll("</td><td>", '</span><span role="cell">')}</span></div>`);
    } else if (/^[\s|:-]+$/.test(line) && line.includes("|")) {
      continue;
    } else if (li) {
      closeParagraph();
      if (list && list !== listType) closeList();
      if (!list) { out.push(`<${listType}>`); list = listType; }
      const check = li[1] === undefined ? ""
        : `<span class="chk">${li[1].trim() ? "☑" : "☐"}</span> `;
      out.push(`<li>${check}${inline(li[2])}</li>`);
    } else if (line.trim() === "" || line.startsWith("```")) {
      closeParagraph();
      closeList();
    } else if (line.trim() === ">") {
      continue;
    } else if (line.startsWith("> ")) {
      closeParagraph();
      closeList();
      out.push(`<p class="quote">${inline(line.slice(2))}</p>`);
    } else {
      closeList();
      paragraph.push(line.trim());
    }
  }
  closeParagraph();
  closeList();
  return out.join("\n");
}

/* ---------------- load everything ---------------- */

const files = readdirSync(CARDS_DIR).filter((f) => f.endsWith(".md")).sort();
const cards = files.map(parseCard);
const ids = new Set();
for (const c of cards) {
  if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`);
  ids.add(c.id);
}
for (const c of cards) c.html = md(c.body);

const workOrderFiles = existsSync(WORK_ORDERS_DIR)
  ? readdirSync(WORK_ORDERS_DIR).filter((f) => f.endsWith(".md")).sort()
  : [];
const workOrders = workOrderFiles.map(parseWorkOrder);
const workOrderIds = new Set();
for (const order of workOrders) {
  if (workOrderIds.has(order.id)) throw new Error(`duplicate Work Order id ${order.id}`);
  workOrderIds.add(order.id);
  for (const cid of order.cardIds) {
    if (!ids.has(cid)) throw new Error(`${order.file}: references unknown card ${cid}`);
  }
  order.html = md(order.body);
}
for (const card of cards) {
  for (const orderId of card.workOrderIds) {
    if (!workOrderIds.has(orderId)) throw new Error(`${card.file}: references unknown Work Order ${orderId}`);
    const order = workOrders.find((item) => item.id === orderId);
    if (!order.cardIds.includes(card.id)) throw new Error(`${card.file}: ${orderId} does not contain ${card.id}`);
  }
}

const DATA = JSON.stringify(cards.map(({ body, html, ...rest }) => rest));
const WORK_ORDER_DATA = JSON.stringify(workOrders.map(({ body, html, ...rest }) => rest));
const trackerUpdated = [...cards, ...workOrders]
  .map((item) => item.updated || item.created)
  .filter(Boolean)
  .sort()
  .at(-1);
if (!/^\d{4}-\d{2}-\d{2}$/.test(trackerUpdated || "")) {
  throw new Error("tracker records must provide a canonical YYYY-MM-DD updated date");
}

/* Raw markdown bodies power the copy-as-prompt buttons. */
const RAW = JSON.stringify(Object.fromEntries(cards.map((c) => [c.id, c.body])));
const WORK_ORDER_RAW = JSON.stringify(Object.fromEntries(workOrders.map((order) => [order.id, order.body])));

const SHARED_CSS = `
${PALETTE}
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.55 Georgia, "Times New Roman", serif;
  }
  header {
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
    padding: 18px 20px 10px;
  }
  header h1 { font-size: 20px; margin: 0; }
  header .sub { color: var(--soft); font-size: 13px; }
  header button, header a.btn {
    min-height: 44px; padding: 9px 14px; cursor: pointer; display: inline-block;
    background: var(--surface); color: var(--ink); text-decoration: none;
    border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 13px;
  }
  header .spacer { margin-left: auto; }
  header nav { display:flex; gap:6px; flex-wrap:wrap; }
  .skip { position:fixed; left:12px; top:8px; z-index:100;
    transform:translateY(-180%); background:var(--ink); color:var(--paper);
    padding:10px 14px; border-radius:8px; }
  .skip:focus { transform:translateY(0); }
  code {
    font-family: ui-monospace, monospace; font-size: 13px;
    background: var(--paper-2); padding: 1px 4px; border-radius: 4px;
  }
  a { color: var(--groove-2); }
  .quote { border-left: 3px solid var(--line); padding-left: 12px; color: var(--soft); }
  .trow { display:flex; min-width:max-content; overflow-wrap:anywhere; }
  .trow [role="cell"] { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
  :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
`;

/* ---------------- the guide page ---------------- */

const guideIntro = `
<section class="lede">
<h2>What this page is</h2>
<p>Every Assist With repository carries its own tracker: a small board of work
cards that lives <em>in the repo, next to the code</em>. No Linear, no service,
no login — the cards are plain text files, and this board is one HTML file
compiled from them. If you can open a file, you can see the whole state of the
project.</p>

<h2>Why it exists — for you</h2>
<p>It answers "where is this project?" at a glance: what's queued, what an AI
is working on, what's finished, and — most importantly — the <strong>Needs
you</strong> column: the short list of things only you can decide. Those
cards are written to be answerable on the spot: they teach the situation first,
lay out the options with costs, and end with the smallest possible question.
Everything else on the board is the AI's to do, not yours.</p>

<h2>Why it exists — for your AI</h2>
<p>A chat forgets; the board doesn't. Each card carries enough context that an
AI opening it cold — next month, on another computer, or a different model
entirely — can start working without the conversation that created it. As it
works it appends dated <strong>follow-up notes</strong> to the card, so the
next session inherits the trail. Findings from audits land here as cards
instead of scrolling away in chat.</p>

<h2>How this works, mechanically</h2>
<p>Cards are markdown files in <code>docs/tracker/cards/</code>; canonical Work
Orders live in <code>docs/tracker/work-orders/</code>. Edit a source file, run
<code>node scripts/tracker-build.mjs</code>, and the board and this guide
regenerate. Nothing else to install or run.</p>

<h2>How to hand a card to your AI</h2>
<p>Open any card and press <strong>Copy prompt</strong> — you get a
ready-to-paste instruction that introduces the project, includes the whole
card, its linked Work Order, the Project Philosophy, the exact Family Core,
rules, and current evidence. <strong>Copy work order</strong> bundles the whole
bounded tranche and every contained Card.</p>

<hr>
<p class="small">Below is Family History's canonical Guide. It preserves the
research-to-story identity while following the shared tracker contract.</p>
</section>
`;

const guideHtml = `<!doctype html>
<html lang="en" data-mode="paper">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${REPO_NAME} — tracker guide</title>
<style>
${SHARED_CSS}
  main { max-width: 760px; margin: 0 auto; padding: 8px 20px 60px; }
  main h2 { font-size: 20px; margin: 30px 0 10px; }
  main h3 { font-size: 16px; margin: 22px 0 8px; }
  .lede { background: var(--surface); border: 1px solid var(--line);
    border-top: 3px solid var(--groove-2); border-radius: 12px; padding: 8px 24px 18px; }
  .lede h2:first-child { margin-top: 14px; }
  .small { font-size: 13px; color: var(--soft); }
  hr { border: none; border-top: 1px solid var(--line); margin: 22px 0 12px; }
  @media (max-width: 700px) {
    header { align-items:flex-start; }
    header nav { width:100%; overflow-x:auto; flex-wrap:nowrap; padding-bottom:4px; }
    header nav .btn { white-space:nowrap; }
    main { padding-inline:12px; }
    .lede { padding-inline:16px; }
    .trow { overflow-x:auto; }
  }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to guide</a>
<header>
  <h1>${REPO_NAME} — tracker guide</h1>
  <span class="spacer"></span>
  <nav aria-label="Tracker links">
    <a class="btn" href="${SITE_URL}">Project</a>
    <a class="btn" href="${PROJECT_PHILOSOPHY}">Project Philosophy</a>
    <a class="btn" href="${FAMILY_CORE.url}">Family Core</a>
    <a class="btn" href="GUIDE.md">Guide</a>
  </nav>
  <button id="mode" type="button">Night archive</button>
</header>
<main id="main" tabindex="-1">
${guideIntro}
${md(readFileSync(GUIDE_SRC, "utf8"))}
</main>
<script>
const mode = document.getElementById("mode");
const root = document.documentElement;
function setMode(m) {
  root.dataset.mode = m;
  mode.textContent = m === "paper" ? "Night archive" : "Day archive";
  localStorage.setItem("tracker-mode", m);
}
setMode(localStorage.getItem("tracker-mode") ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "studio" : "paper"));
mode.onclick = () => setMode(root.dataset.mode === "paper" ? "studio" : "paper");
</script>
</body>
</html>
`;

/* ---------------- the board ---------------- */

const boardHtml = `<!doctype html>
<html lang="en" data-mode="paper">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${REPO_NAME} — tracker</title>
<style>
${SHARED_CSS}
  .filters { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 20px 12px; align-items: center; }
  .filters .flabel { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); margin-right: 2px; }
  .filters button {
    font: inherit; font-size: 12.5px; min-height: 44px; padding: 7px 10px;
    border: 1px solid var(--line); border-radius: 999px; cursor: pointer;
    background: var(--surface); color: var(--soft);
  }
  .filters button[aria-pressed="true"] {
    background: var(--groove-wash); color: var(--groove); border-color: var(--groove-2);
  }
  .orderbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:0 20px 12px;
    padding:10px 12px; border:1px solid var(--line); border-radius:10px;
    background:color-mix(in srgb,var(--surface) 88%,var(--paper)); color:var(--soft); }
  .orderbar strong { color:var(--groove-2); }
  .orderbar .order-state { font:12px/1.4 ui-monospace,monospace; }
  .orderbar .order-help { flex:1 1 300px; margin:0; font-size:12.5px; }
  .orderbar button { min-height:44px; padding:7px 12px; border:1px solid var(--line);
    border-radius:8px; background:var(--surface); color:var(--ink); font:inherit; cursor:pointer; }
  .orderbar button:disabled { cursor:not-allowed; opacity:.55; }
  .orderbar.storage-warning { border-color:var(--gold); }
  .viewbar { position:sticky; top:0; z-index:20; display:flex; gap:8px;
    align-items:center; padding:10px 20px; background:color-mix(in srgb,var(--paper) 92%,transparent);
    border-block:1px solid var(--line); backdrop-filter:blur(10px); }
  .viewbar button { min-height:44px; padding:7px 14px; border:1px solid var(--line);
    border-radius:999px; background:var(--surface); color:var(--ink); font:inherit; cursor:pointer; }
  .viewbar button[aria-selected="true"] { background:var(--groove); color:var(--paper);
    border-color:var(--groove); }
  .viewbar .needs-entry { margin-left:auto; border:2px solid var(--signal); color:var(--signal);
    font-weight:700; }
  .viewbar .needs-entry[data-count="0"] { border-style:dashed; opacity:.8; }
  .specs { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 20px 12px; align-items: center; }
  .specs .flabel { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }
  .specs button {
    font: inherit; font-size: 13px; min-height: 44px; padding: 6px 14px;
    border: 1.5px solid var(--gold); border-radius: 8px; cursor: pointer;
    background: var(--surface); color: var(--ink); font-weight: 600;
  }
  .specs .auto { font-size: 12px; color: var(--soft); }
  .specs .sid.warn { color: var(--signal); }
  .specs .sid.ok { color: var(--groove-2); }
  .prov { font-size: 12.5px; color: var(--soft); font-family: ui-monospace, monospace;
    margin: 6px 0 0; }
  .prov a { color: var(--groove-2); }
  .specs button .sid { font-family: ui-monospace, monospace; font-size: 11px; color: var(--gold); }
  .work-orders { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
    gap:14px; padding:0 20px 44px; align-items:start; }
  .work-order { background:var(--surface); border:1px solid var(--line); border-radius:12px;
    padding:16px; box-shadow:0 10px 24px color-mix(in srgb,var(--ink) 7%,transparent); }
  .work-order.ready { border-top:4px solid var(--groove-2); }
  .work-order.complete { border-top:4px solid var(--gold); }
  .work-order h2 { font-size:18px; margin:8px 0; }
  .work-order .meta,.work-order .movement { color:var(--soft); font-size:13px; }
  .work-order .meter { height:8px; overflow:hidden; background:var(--paper-2); border-radius:99px; }
  .work-order .meter span { display:block; height:100%; background:var(--groove-2); }
  .work-order .order-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
  .work-order button { min-height:44px; padding:7px 12px; font:inherit; cursor:pointer;
    border:1px solid var(--line); border-radius:8px; color:var(--ink); background:var(--paper-2); }
  .run-now { margin:0 20px 14px; padding:12px 16px; border-left:4px solid var(--groove-2);
    background:var(--groove-wash); border-radius:0 10px 10px 0; }
  [hidden] { display:none !important; }
  .board {
    display: grid; gap: 12px; padding: 0 20px 40px; align-items: start;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  .col { background: var(--paper-2); border-radius: 10px; padding: 10px; }
  .col.primary { border-top: 3px solid var(--groove-2); }
  .col.primary h2 { color: var(--groove-2); }
  .col.dim { background: transparent; border: 1px dashed var(--line); }
  .col.dim .card-shell { opacity: .72; }
  .col.dim .card-shell:hover, .col.dim .card-shell:focus-within { opacity: 1; }
  .col h2 {
    font-size: 13px; letter-spacing: .06em; text-transform: uppercase;
    margin: 2px 4px 10px; color: var(--soft); font-weight: 600;
  }
  .col h2 .n { color: var(--faint); font-weight: 400; }
  .card-shell { position:relative; margin-bottom:8px; transition:transform .14s ease,opacity .14s ease; }
  .card {
    display:block; width:100%; min-height:44px; text-align:left; color:var(--ink);
    background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
    padding:10px 12px; cursor:grab; font:inherit; touch-action:manipulation;
  }
  .card:active { cursor:grabbing; }
  .card.attn { border-top: 3px solid var(--signal); }
  .card .id { font-size: 11.5px; color: var(--faint); font-family: ui-monospace, monospace; }
  .card .t { margin: 2px 0 6px; font-size: 14.5px; }
  .tag {
    display: inline-block; font-size: 11px; font-family: ui-monospace, monospace;
    border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; margin-right: 4px;
    color: var(--soft);
  }
  .tag.P1 { border-color: var(--signal); color: var(--signal); }
  .tag.conforms { border-color: var(--groove-2); color: var(--groove-2); }
  .tag.missing { border-color: var(--signal); color: var(--signal); border-style: dashed; }
  .tag.adapt { border-color: var(--gold); color: var(--gold); border-style: dotted; }
  .tag.edu { border-color: var(--gold); color: var(--gold); }
  .tag.fu { border-color: var(--groove-2); color: var(--groove-2); }
  .card-shell.is-dragging { z-index:5; opacity:.82; transform:scale(.985);
    filter:drop-shadow(0 14px 18px color-mix(in srgb,var(--ink) 22%,transparent)); }
  .card-shell.is-dragging .card { cursor:grabbing; border-color:var(--signal); }
  .col.drop-blocked { outline:2px dashed var(--signal); outline-offset:3px; }
  body.is-reordering { cursor:grabbing; user-select:none; }
  .visually-hidden { position:absolute!important; width:1px!important; height:1px!important;
    padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0 0 0 0)!important;
    white-space:nowrap!important; border:0!important; }
  dialog {
    max-width: 720px; width: calc(100vw - 32px); border: 1px solid var(--line);
    border-radius: 12px; background: var(--surface); color: var(--ink); padding: 22px 26px;
  }
  dialog::backdrop { background: rgba(10, 20, 16, .55); }
  dialog h2 { margin-top: 22px; }
  dialog h2:first-of-type { margin-top: 0; }
  dialog h3 { font-size: 15px; }
  .dlg-actions { display: flex; gap: 8px; float: right; }
  .dlg-actions button {
    font: inherit; font-size: 13px; min-height: 44px; padding: 6px 12px; cursor: pointer;
    background: var(--surface); color: var(--ink);
    border: 1px solid var(--line); border-radius: 8px;
  }
  .dlg-actions .copy { border-color: var(--groove-2); color: var(--groove-2); }
  .edu-note {
    background: var(--paper-2); border-left: 3px solid var(--gold);
    border-radius: 0 8px 8px 0; padding: 2px 14px; margin: 14px 0;
  }
  .spec-cards { margin: 10px 0; }
  .spec-cards button {
    font: inherit; font-size: 12.5px; margin: 0 6px 6px 0; min-height: 44px;
    padding: 7px 10px; cursor: pointer; border: 1px solid var(--line);
    border-radius: 6px; background: var(--paper-2); color: var(--ink);
  }
  @media (max-width: 700px) {
    header { align-items:flex-start; }
    header nav { width:100%; overflow-x:auto; flex-wrap:nowrap; padding-bottom:4px; }
    header nav .btn { white-space:nowrap; }
    .board,.work-orders { grid-template-columns:1fr; padding-inline:12px; }
    .viewbar { padding-inline:12px; }
    .filters { padding-inline:12px; }
    .orderbar { margin-inline:12px; align-items:flex-start; }
    .orderbar .order-help { flex-basis:100%; }
    dialog { padding:18px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .card-shell { transition:none; }
  }
</style>
</head>
<body>
<a class="skip" href="#workspace">Skip to tracker</a>
<header>
  <h1>${REPO_NAME} — tracker</h1>
  <span class="sub">What's moving now, what's queued, and the few things waiting on you · ${cards.length} cards · ${trackerUpdated}</span>
  <span class="spacer"></span>
  <nav aria-label="Tracker links">
    <a class="btn" href="${SITE_URL}">Project</a>
    <a class="btn" href="${PROJECT_PHILOSOPHY}">Project Philosophy</a>
    <a class="btn" href="${FAMILY_CORE.url}">Family Core</a>
    <a class="btn" href="guide.html">Guide</a>
  </nav>
  <button id="mode" type="button">Night archive</button>
</header>
<main id="workspace" tabindex="-1">
  <div class="viewbar" role="tablist" aria-label="Tracker view">
    <button id="kanbanTab" type="button" role="tab" aria-controls="kanbanView" aria-selected="true">Kanban</button>
    <button id="ordersTab" type="button" role="tab" aria-controls="ordersView" aria-selected="false">Work Orders</button>
    <button id="needsEntry" class="needs-entry" type="button" data-count="0">Needs You · 0</button>
  </div>
  <section id="kanbanView" role="tabpanel" aria-labelledby="kanbanTab">
    <div class="filters" id="filters"></div>
    <div class="orderbar" id="orderbar">
      <strong>Personal order · browser only</strong>
      <span class="order-state" id="orderStatus">Canonical order</span>
      <p class="order-help" id="reorderHelp">Drag Cards · touch: hold, then drag · keyboard: Alt + ↑/↓/Home/End. Canonical fields never change.</p>
      <button id="resetOrder" type="button" disabled>Reset to canonical order</button>
    </div>
    <div class="board" id="board"></div>
  </section>
  <section id="ordersView" role="tabpanel" aria-labelledby="ordersTab" hidden>
    <p class="run-now" id="runNow"></p>
    <div class="work-orders" id="workOrders"></div>
  </section>
</main>
<dialog id="dlg">
  <div class="dlg-actions">
    <button class="copy" id="copyCard" type="button">Copy prompt</button>
    <button class="close" type="button" aria-label="Close">✕</button>
  </div>
  <div id="dlgBody"></div>
</dialog>
<dialog id="specDlg">
  <div class="dlg-actions">
    <button class="copy" id="copySpec" type="button">Copy whole work order</button>
    <button class="close" type="button" aria-label="Close">✕</button>
  </div>
  <div id="specBody"></div>
</dialog>
<dialog id="fallbackDlg">
  <div class="dlg-actions">
    <button class="close" type="button" aria-label="Close">✕</button>
  </div>
  <h2>Copy it yourself</h2>
  <p>This viewer blocks automatic copying. The prompt below is already selected — press <code>⌘C</code> (or <code>Ctrl+C</code>), then paste it to your AI.</p>
  <textarea id="fbText" readonly style="width:100%; height:260px; font:12.5px/1.5 ui-monospace,monospace; background:var(--paper-2); color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:10px;"></textarea>
</dialog>
<p id="reorderAnnouncement" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>
<script>
const REPO_NAME = ${JSON.stringify(REPO_NAME)};
const REPO_SLUG = ${JSON.stringify(REPO_SLUG)};
const PROJECT_URL = ${JSON.stringify(SITE_URL)};
const PROJECT_PHILOSOPHY = ${JSON.stringify(PROJECT_PHILOSOPHY)};
const FAMILY_CORE = ${JSON.stringify(FAMILY_CORE)};
const CARDS = ${DATA};
const WORK_ORDERS = ${WORK_ORDER_DATA};
const RAW = ${RAW};
const WORK_ORDER_RAW = ${WORK_ORDER_RAW};
const BODIES = {${cards.map((c) => `${JSON.stringify(c.id)}: ${JSON.stringify(c.html)}`).join(",")}};
const WORK_ORDER_BODIES = {${workOrders.map((order) => `${JSON.stringify(order.id)}: ${JSON.stringify(order.html)}`).join(",")}};
const STATUSES = ${JSON.stringify(STATUSES)};
const state = { area: null, type: null, verdict: null, status: null, view: "kanban" };
const ORDER_STORAGE_KEY = "assist-tracker-personal-order:" + REPO_SLUG + ":v1";
let storageAvailable = true;

function storageGet(key) {
  try { return localStorage.getItem(key); }
  catch { storageAvailable = false; return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch { storageAvailable = false; return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); return true; }
  catch { storageAvailable = false; return false; }
}

const mode = document.getElementById("mode");
const root = document.documentElement;
function setMode(m) {
  root.dataset.mode = m;
  mode.textContent = m === "paper" ? "Night archive" : "Day archive";
  storageSet("tracker-mode", m);
}
setMode(storageGet("tracker-mode") ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "studio" : "paper"));
mode.onclick = () => setMode(root.dataset.mode === "paper" ? "studio" : "paper");

/* ---- copy-as-prompt ---- */
const AI_NOTES = "\\n\\n---\\nWorking notes for you, the AI taking this on:\\n" +
  "- Project: " + REPO_NAME + " (" + PROJECT_URL + "; " + REPO_SLUG + ").\\n" +
  "- Project Philosophy: " + PROJECT_PHILOSOPHY + ".\\n" +
  "- Family Core: " + FAMILY_CORE.label + " dated " + FAMILY_CORE.date + " at commit " + FAMILY_CORE.commit + " (" + FAMILY_CORE.url + ").\\n" +
  "- Tracker rules: docs/tracker/GUIDE.md. Card path: docs/tracker/cards/<ID>.md.\\n" +
  "- No automatic dispatch. AI proposes; Scott approves Proposed -> Ready; AI executes; a separate AI audits.\\n" +
  "- Append progress as dated bullets under a \\"## Follow-ups\\" section on the Card — never rewrite earlier notes.\\n" +
    "- When finished: record evidence, check the Definition of done, update status, run pnpm tracker:build && pnpm tracker:verify, and append history.\\n" +
  "- Record provenance with your REAL agent/model identity. If you don't know it, omit the field — never invent one.";
function cardPrompt(c) {
  let out = "This is a Card from the " + REPO_NAME + " project tracker, currently in " +
    c.status + ". I'd like you to work on it. Here are the details:\\n\\n" +
    "Card " + c.id + " — " + c.title + "\\n" +
    "Type " + c.type + " · area " + c.area +
    (c.priority ? " · priority " + c.priority : "") +
    (c.contract ? " · family contract " + c.contract : "") + "\\n\\n" + RAW[c.id];
  for (const orderId of c.workOrderIds || []) {
    const order = WORK_ORDERS.find((item) => item.id === orderId);
    if (order) out += "\\n\\n=== LINKED WORK ORDER " + order.id + " — " + order.title + " (" + order.execution + ") ===\\n\\n" + WORK_ORDER_RAW[order.id];
  }
  return out + AI_NOTES.replace("<ID>", c.id);
}
function specPrompt(s) {
  let out = "This is a bounded Work Order from the " + REPO_NAME + " project tracker (" +
    REPO_SLUG + "). Confirm it is Ready or Active before executing; Proposed requires Scott's approval.\\n\\n" +
    "=== WORK ORDER " + s.id + " — " + s.title + " (" + s.execution + "; audit " + s.audit + ") ===\\n\\n" + WORK_ORDER_RAW[s.id] + "\\n";
  for (const cid of s.cardIds) {
    const c = CARDS.find((x) => x.id === cid);
    out += "\\n=== CARD " + cid + " — " + (c ? c.title : "") + " (" + (c ? c.status : "?") + ") ===\\n\\n" + RAW[cid] + "\\n";
  }
  out += AI_NOTES.replace("Card path: docs/tracker/cards/<ID>.md.", "Card paths: docs/tracker/cards/; Work Order path: docs/tracker/work-orders/" + s.id + ".md.") +
    "\\n- Work Card by Card; leave dated evidence on every Card touched, even unfinished ones.\\n" +
    "- Stop on every Human gate and stop rule. Do not mark audit passed; a separate AI owns that state.";
  return out;
}
async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  if (!ok) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
  }
  if (!ok) {
    /* Last resort (viewers that block clipboard access entirely): show the
       prompt pre-selected so a manual Cmd+C always works. */
    fbText.value = text;
    fallbackDlg.showModal();
    fbText.focus();
    fbText.select();
    return;
  }
  const prev = btn.textContent;
  btn.textContent = "Copied ✓";
  setTimeout(() => { btn.textContent = prev; }, 2000);
}

function chip(group, value, label) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = label;
  b.dataset.filterGroup = group; b.dataset.filterValue = value;
  b.setAttribute("aria-pressed", String(state[group] === value));
  b.onclick = () => { state[group] = state[group] === value ? null : value; render(); };
  return b;
}
function flabel(text) {
  const s = document.createElement("span");
  s.className = "flabel"; s.textContent = text;
  return s;
}
function renderWorkOrders() {
  const host = document.getElementById("workOrders");
  host.replaceChildren();
  const runnable = WORK_ORDERS.filter((order) => order.execution === "ready");
  document.getElementById("runNow").innerHTML = runnable.length
    ? "<strong>Runnable now:</strong> " + runnable.map((order) => order.id + " · " + order.title).join("; ") + ". Ready means Scott already approved the bounded scope."
    : "<strong>Runnable now:</strong> no Ready Work Orders. Proposed requires Scott; Active is already claimed; Complete awaits only its separate audit when needed.";
  for (const order of WORK_ORDERS) {
    const done = order.cardIds.filter((id) => CARDS.find((card) => card.id === id)?.status === "done").length;
    const progress = Math.round((done / order.cardIds.length) * 100);
    const blocker = order.execution === "proposed" ? "Scott's scope approval" :
      order.execution === "ready" ? "None known — runnable now" :
      order.execution === "active" ? "See stop rules and contained Cards" :
      order.execution === "complete" && order.audit !== "passed" ? "Independent audit still open" : "None recorded";
    const evidence = order["completed-on"]
      ? "Completed " + order["completed-on"] + (order["executed-by"] ? " by " + order["executed-by"] : "")
      : order["executed-on"] ? "Execution started " + order["executed-on"] : "No execution evidence recorded";
    const article = document.createElement("article");
    article.className = "work-order " + order.execution;
    article.innerHTML = '<div class="meta">' + order.id + ' · <strong>' + order.execution + '</strong> · audit: <strong>' + order.audit + '</strong></div>' +
      '<h2>' + order.title + '</h2>' +
      '<div class="meter" aria-label="' + done + ' of ' + order.cardIds.length + ' Cards complete"><span style="width:' + progress + '%"></span></div>' +
      '<p class="meta">' + done + ' of ' + order.cardIds.length + ' Cards complete</p>' +
      '<p><strong>Blocker:</strong> ' + blocker + '</p>' +
      '<p><strong>Execution evidence:</strong> ' + evidence + '</p>' +
      '<p><strong>Independent audit:</strong> ' + order.audit + (order["audited-by"] ? ' by ' + order["audited-by"] : '') + '</p>' +
      '<p class="movement">Last movement · ' + order.updated + '</p>' +
      '<div class="spec-cards">' + order.cardIds.map((id) => '<button type="button" data-card="' + id + '">' + id + ' · ' + (CARDS.find((card) => card.id === id)?.status || '?') + '</button>').join('') + '</div>' +
      '<div class="order-actions"><button type="button" data-open>Open details</button><button type="button" data-copy>Copy whole work order</button></div>';
    article.querySelector("[data-open]").onclick = () => openSpec(order);
    article.querySelector("[data-copy]").onclick = (event) => copyText(specPrompt(order), event.currentTarget);
    for (const button of article.querySelectorAll("[data-card]")) button.onclick = () => openCard(CARDS.find((card) => card.id === button.dataset.card));
    host.append(article);
  }
}
function setView(view) {
  state.view = view;
  const kanban = view === "kanban";
  document.getElementById("kanbanView").hidden = !kanban;
  document.getElementById("ordersView").hidden = kanban;
  document.getElementById("kanbanTab").setAttribute("aria-selected", String(kanban));
  document.getElementById("ordersTab").setAttribute("aria-selected", String(!kanban));
  storageSet("tracker-view", view);
}

/* ---- personal, lane-scoped ordering ---- */
function canonicalCompare(a, b) {
  return (a.priority || "P9").localeCompare(b.priority || "P9") || a.id.localeCompare(b.id);
}
function canonicalLaneIds(status) {
  return CARDS.filter((card) => card.status === status).sort(canonicalCompare).map((card) => card.id);
}
function normalizeLaneOrder(status, proposed) {
  const canonical = canonicalLaneIds(status);
  const valid = new Set(canonical);
  const seen = new Set();
  const kept = Array.isArray(proposed)
    ? proposed.filter((id) => typeof id === "string" && valid.has(id) && !seen.has(id) && seen.add(id))
    : [];
  return kept.concat(canonical.filter((id) => !seen.has(id)));
}
function canonicalOrder() {
  return Object.fromEntries(STATUSES.map(([status]) => [status, canonicalLaneIds(status)]));
}
function loadPersonalOrder() {
  let saved = null;
  const raw = storageGet(ORDER_STORAGE_KEY);
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed && parsed.version === 1) saved = parsed.lanes; }
    catch { storageRemove(ORDER_STORAGE_KEY); }
  }
  return Object.fromEntries(STATUSES.map(([status]) => [status, normalizeLaneOrder(status, saved?.[status])]));
}
let personalOrder = loadPersonalOrder();
function laneCards(status) {
  const byId = new Map(CARDS.filter((card) => card.status === status).map((card) => [card.id, card]));
  return normalizeLaneOrder(status, personalOrder[status]).map((id) => byId.get(id)).filter(Boolean);
}
function isPersonalized() {
  return STATUSES.some(([status]) => canonicalLaneIds(status).join(",") !== personalOrder[status].join(","));
}
function updateOrderUi() {
  const changed = isPersonalized();
  const status = document.getElementById("orderStatus");
  const bar = document.getElementById("orderbar");
  status.textContent = storageAvailable
    ? (changed ? "Personal order saved locally" : "Canonical order")
    : (changed ? "Personal order for this session" : "Canonical order · storage unavailable");
  bar.classList.toggle("storage-warning", !storageAvailable);
  document.getElementById("resetOrder").disabled = !changed;
}
function savePersonalOrder() {
  storageSet(ORDER_STORAGE_KEY, JSON.stringify({ version: 1, lanes: personalOrder }));
  updateOrderUi();
}
function announceOrder(message) {
  const live = document.getElementById("reorderAnnouncement");
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = message; });
}
function laneLabel(status) {
  return STATUSES.find(([key]) => key === status)?.[1] || status;
}
function commitVisibleOrder(status, visibleIds) {
  const visible = new Set(visibleIds);
  let index = 0;
  personalOrder[status] = normalizeLaneOrder(status, personalOrder[status]).map((id) =>
    visible.has(id) ? visibleIds[index++] : id);
  savePersonalOrder();
}
function focusCard(id) {
  requestAnimationFrame(() => document.querySelector('[data-open-card="' + CSS.escape(id) + '"]')?.focus());
}
function moveCardByKeyboard(id, status, destination) {
  const lane = document.querySelector('[data-lane="' + CSS.escape(status) + '"]');
  const visible = [...lane.querySelectorAll("[data-card-shell]")].map((shell) => shell.dataset.cardShell);
  const from = visible.indexOf(id);
  const to = destination === "first" ? 0 : destination === "last" ? visible.length - 1
    : Math.max(0, Math.min(visible.length - 1, from + destination));
  if (from < 0 || from === to) {
    announceOrder(id + " is already at the " + (to === 0 ? "start" : "end") + " of visible " + laneLabel(status) + " Cards.");
    return;
  }
  visible.splice(to, 0, visible.splice(from, 1)[0]);
  commitVisibleOrder(status, visible);
  render();
  focusCard(id);
  const neighbor = visible[to + (to < from ? 1 : -1)];
  announceOrder("Moved " + id + (to === 0 ? " to the start" : to === visible.length - 1 ? " to the end" : to < from ? " before " + neighbor : " after " + neighbor) + " in " + laneLabel(status) + ". Personal order only; status is unchanged.");
}
let pointerOrder = null;
let suppressCardClick = null;
function beginPointerOrder(event) {
  if (event.pointerType === "touch") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const card = event.currentTarget;
  const shell = card.closest("[data-card-shell]");
  pointerOrder = { pointerId:event.pointerId, card, shell, status:shell.dataset.status,
    id:shell.dataset.cardShell, startX:event.clientX, startY:event.clientY,
    active:false, blocked:false, holdTimer:null };
}
function activateOrder(order) {
  if (order.active) return;
  order.active = true;
  suppressCardClick = order.id;
  if (order.pointerId !== null) order.card.setPointerCapture?.(order.pointerId);
  order.shell.classList.add("is-dragging");
  document.body.classList.add("is-reordering");
}
function moveActiveOrder(order, clientX, clientY) {
  document.querySelectorAll(".col.drop-blocked").forEach((lane) => lane.classList.remove("drop-blocked"));
  const point = document.elementFromPoint(clientX, clientY);
  const target = point?.closest("[data-card-shell]");
  const targetLane = point?.closest("[data-lane]");
  order.blocked = !targetLane || targetLane.dataset.lane !== order.status;
  if (order.blocked) targetLane?.classList.add("drop-blocked");
  if (target && target.dataset.status === order.status && target !== order.shell) {
    const before = clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    target.parentElement.insertBefore(order.shell, before ? target : target.nextSibling);
  }
  if (clientY < 70) window.scrollBy(0, -12);
  else if (clientY > innerHeight - 70) window.scrollBy(0, 12);
}
function pointerOrderMove(event) {
  if (!pointerOrder || event.pointerId !== pointerOrder.pointerId) return;
  const distance = Math.hypot(event.clientX - pointerOrder.startX, event.clientY - pointerOrder.startY);
  if (!pointerOrder.active && distance < 6) return;
  if (!pointerOrder.active) activateOrder(pointerOrder);
  event.preventDefault();
  moveActiveOrder(pointerOrder, event.clientX, event.clientY);
}
function finishOrder(current, cancelled = false) {
  clearTimeout(current.holdTimer);
  current.shell.classList.remove("is-dragging");
  document.body.classList.remove("is-reordering");
  document.querySelectorAll(".col.drop-blocked").forEach((lane) => lane.classList.remove("drop-blocked"));
  if (!current.active) return;
  if (cancelled || current.blocked) {
    render(); focusCard(current.id);
    announceOrder(current.blocked ? "Cards stay in their canonical lane. " + current.id + " was not moved or changed." : "Reordering cancelled.");
    setTimeout(() => { if (suppressCardClick === current.id) suppressCardClick = null; }, 0);
    return;
  }
  const lane = current.shell.closest("[data-lane]");
  const visible = [...lane.querySelectorAll("[data-card-shell]")].map((shell) => shell.dataset.cardShell);
  commitVisibleOrder(current.status, visible);
  render(); focusCard(current.id);
  const position = visible.indexOf(current.id) + 1;
  announceOrder("Moved " + current.id + " to position " + position + " of " + visible.length + " visible " + laneLabel(current.status) + " Cards. Personal order only; status is unchanged.");
  setTimeout(() => { if (suppressCardClick === current.id) suppressCardClick = null; }, 0);
}
function finishPointerOrder(event, cancelled = false) {
  if (!pointerOrder || event.pointerId !== pointerOrder.pointerId) return;
  const current = pointerOrder;
  pointerOrder = null;
  finishOrder(current, cancelled);
}
let touchOrder = null;
function beginTouchOrder(event) {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  const card = event.currentTarget;
  const shell = card.closest("[data-card-shell]");
  const order = { pointerId:null, touchId:touch.identifier, card, shell, status:shell.dataset.status,
    id:shell.dataset.cardShell, startX:touch.clientX, startY:touch.clientY,
    active:false, blocked:false, movedBeforeHold:false, holdTimer:null };
  order.holdTimer = setTimeout(() => {
    if (touchOrder === order && !order.movedBeforeHold) {
      activateOrder(order);
      announceOrder("Reordering " + order.id + " within " + laneLabel(order.status) + ". Move, then lift to place it.");
    }
  }, 420);
  touchOrder = order;
}
function touchOrderMove(event) {
  if (!touchOrder) return;
  const touch = [...event.touches].find((item) => item.identifier === touchOrder.touchId);
  if (!touch) return;
  const distance = Math.hypot(touch.clientX - touchOrder.startX, touch.clientY - touchOrder.startY);
  if (!touchOrder.active) {
    if (distance >= 8) {
      touchOrder.movedBeforeHold = true;
      clearTimeout(touchOrder.holdTimer);
    }
    return;
  }
  event.preventDefault();
  moveActiveOrder(touchOrder, touch.clientX, touch.clientY);
}
function finishTouchOrder(event, cancelled = false) {
  if (!touchOrder) return;
  const current = touchOrder;
  touchOrder = null;
  if (current.active) event.preventDefault();
  finishOrder(current, cancelled);
}
document.addEventListener("pointermove", pointerOrderMove, { passive:false });
document.addEventListener("pointerup", (event) => finishPointerOrder(event));
document.addEventListener("pointercancel", (event) => finishPointerOrder(event, true));
document.addEventListener("touchmove", touchOrderMove, { passive:false });
document.addEventListener("touchend", (event) => finishTouchOrder(event));
document.addEventListener("touchcancel", (event) => finishTouchOrder(event, true));
document.getElementById("resetOrder").addEventListener("click", () => {
  personalOrder = canonicalOrder();
  storageRemove(ORDER_STORAGE_KEY);
  render();
  announceOrder("Personal Card order reset to canonical priority and ID order in every lane.");
});

function render() {
  const f = document.getElementById("filters");
  f.replaceChildren();
  f.append(flabel("area"));
  for (const a of [...new Set(CARDS.map((c) => c.area))].sort()) f.append(chip("area", a, a));
  f.append(flabel("type"));
  for (const t of [...new Set(CARDS.map((c) => c.type))].sort()) f.append(chip("type", t, t));
  const verdicts = ["conforms", "missing", "adapt"].filter((v) => CARDS.some((c) => c.verdict === v));
  if (verdicts.length) f.append(flabel("verdict"));
  for (const v of verdicts) f.append(chip("verdict", v, v));
  const board = document.getElementById("board");
  board.replaceChildren();
  const visible = CARDS.filter((c) =>
    (!state.area || c.area === state.area) &&
    (!state.type || c.type === state.type) &&
    (!state.verdict || c.verdict === state.verdict) &&
    (!state.status || c.status === state.status));
  for (const [key, label] of STATUSES) {
    const col = document.createElement("div");
    col.className = "col" + (key === "next" ? " primary" : key === "backlog" ? " dim" : "");
    col.dataset.lane = key;
    const visibleIds = new Set(visible.filter((card) => card.status === key).map((card) => card.id));
    const cs = laneCards(key).filter((card) => visibleIds.has(card.id));
    col.innerHTML = '<h2>' + label + ' <span class="n">' + cs.length + '</span></h2>';
    for (const c of cs) {
      const shell = document.createElement("div");
      shell.className = "card-shell";
      shell.dataset.cardShell = c.id;
      shell.dataset.status = c.status;
      shell.dataset.type = c.type;
      shell.dataset.area = c.area;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "card" + (c.status === "needs-you" ? " attn" : "");
      open.dataset.openCard = c.id;
      open.setAttribute("aria-label", "Open " + c.id + ": " + c.title + ". Drag to reorder within " + label + "; or use Alt plus Arrow keys, Home, or End.");
      open.setAttribute("aria-describedby", "reorderHelp");
      open.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End");
      open.innerHTML = '<span class="id">' + c.id + '</span>' +
        (c.priority ? ' <span class="tag ' + c.priority + '">' + c.priority + "</span>" : "") +
        (c.size ? ' <span class="tag">' + c.size + "</span>" : "") +
        (c.verdict ? ' <span class="tag ' + c.verdict + '">' + c.verdict + "</span>" : "") +
        (c.hasEdu ? ' <span class="tag edu">edu</span>' : "") +
        (c.followups ? ' <span class="tag fu">+' + c.followups + ' notes</span>' : "") +
        '<div class="t">' + c.title + "</div>" +
        '<span class="tag">' + c.type + '</span><span class="tag">' + c.area + "</span>" +
        (c.contract ? '<span class="tag">' + c.contract + "</span>" : "");
      open.onclick = (event) => {
        if (suppressCardClick === c.id) { event.preventDefault(); suppressCardClick = null; return; }
        openCard(c);
      };
      open.onkeydown = (event) => {
        if (!event.altKey) return;
        const destination = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1
          : event.key === "Home" ? "first" : event.key === "End" ? "last" : null;
        if (destination === null) return;
        event.preventDefault();
        moveCardByKeyboard(c.id, c.status, destination);
      };
      open.addEventListener("pointerdown", beginPointerOrder);
      open.addEventListener("touchstart", beginTouchOrder, { passive:true });
      shell.append(open);
      col.append(shell);
    }
    board.append(col);
  }
  const needs = CARDS.filter((card) => card.status === "needs-you").length;
  const needsButton = document.getElementById("needsEntry");
  needsButton.textContent = "Needs You · " + needs;
  needsButton.dataset.count = String(needs);
  updateOrderUi();
}
const dlg = document.getElementById("dlg");
const specDlg = document.getElementById("specDlg");
const fallbackDlg = document.getElementById("fallbackDlg");
const fbText = document.getElementById("fbText");
/* No inline onclick handlers — sandboxed viewers (and strict CSPs) drop them.
   A click that lands on the dialog element itself (its padding or the
   ::backdrop) rather than on content closes it. Escape works natively. */
for (const d of [dlg, specDlg, fallbackDlg]) {
  d.querySelector(".close").addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
}
let currentCard = null, currentSpec = null;
document.getElementById("copyCard").addEventListener("click", (e) => {
  if (currentCard) copyText(cardPrompt(currentCard), e.currentTarget);
});
document.getElementById("copySpec").addEventListener("click", (e) => {
  if (currentSpec) copyText(specPrompt(currentSpec), e.currentTarget);
});
function openCard(c) {
  currentCard = c;
  const prov = [];
  if (c["completed-by"] || c["completed-on"]) prov.push("completed by " + (c["completed-by"] || "?") + (c["completed-on"] ? " on " + c["completed-on"] : ""));
  if (c["updated-by"]) prov.push("last updated by " + c["updated-by"] + (c.updated ? " on " + c.updated : ""));
  if (c.evidenceLinks) prov.push(c.evidenceLinks.map((u, i) => '<a href="' + u + '">evidence ' + (i + 1) + "</a>").join(" "));
  document.getElementById("dlgBody").innerHTML =
    '<span class="id">' + c.id + " · " + c.status + (c.contract ? " · " + c.contract : "") +
    "</span><h2>" + c.title + "</h2>" +
    (prov.length ? '<p class="prov">' + prov.join(" · ") + "</p>" : "") +
    (c.status === "needs-you" ? '<div class="edu-note"><strong>Owner gate · read the teaching before acting</strong>' + BODIES[c.id] + '</div>' : BODIES[c.id]);
  const eduH = [...document.getElementById("dlgBody").querySelectorAll("h2")]
    .find((h) => h.textContent === "Education");
  if (eduH) {
    const wrap = document.createElement("div");
    wrap.className = "edu-note";
    let n = eduH.nextSibling;
    const nodes = [];
    while (n && !(n.tagName && /^H2$/.test(n.tagName))) { nodes.push(n); n = n.nextSibling; }
    eduH.after(wrap);
    for (const node of nodes) wrap.append(node);
  }
  dlg.showModal();
}
function openSpec(s) {
  currentSpec = s;
  const cardsHtml = s.cardIds.map((cid) => {
    const c = CARDS.find((x) => x.id === cid);
    return '<button type="button" data-card="' + cid + '">' + cid + " · " +
      (c ? c.title : "?") + " (" + (c ? c.status : "?") + ")</button>";
  }).join("");
  const done = s.cardIds.filter((cid) => CARDS.find((c) => c.id === cid)?.status === "done").length;
  const prov = [];
  if (s["executed-by"] || s["executed-on"]) prov.push("executed by " + (s["executed-by"] || "?") + (s["executed-on"] ? " on " + s["executed-on"] : ""));
  if (s["completed-on"]) prov.push("completed " + s["completed-on"]);
  if (s["audited-by"] || s["audited-on"]) prov.push("audited by " + (s["audited-by"] || "?") + (s["audited-on"] ? " on " + s["audited-on"] : "") + " — " + s.audit);
  else prov.push("audit: " + s.audit);
  if (s.followUpIds) prov.push("follow-ups: " + s.followUpIds.join(", "));
  document.getElementById("specBody").innerHTML =
    '<span class="id">' + s.id + " · " + s.execution + " · audit " + s.audit + " · " + done + " of " + s.cardIds.length + " Cards complete</span>" +
    "<h2>" + s.title + "</h2>" +
    '<p class="prov">' + prov.join(" · ") + "</p>" +
    (s.execution === "ready"
      ? '<p><strong>Runnable now: Scott already approved this bounded scope.</strong></p>'
      : "") +
    WORK_ORDER_BODIES[s.id] +
    '<h3>Cards in this Work Order</h3><div class="spec-cards">' + cardsHtml + "</div>";
  if (s.followUpIds) {
    const fb = s.followUpIds
      .map((fid) => CARDS.find((c) => c.id === fid) ? '<button type="button" data-card="' + fid + '">' + fid + "</button>" : fid)
      .join(" ");
    document.getElementById("specBody").insertAdjacentHTML("beforeend",
      '<h3>Resulting follow-ups</h3><div class="spec-cards">' + fb + "</div>");
  }
  for (const b of document.getElementById("specBody").querySelectorAll("[data-card]")) {
    b.addEventListener("click", () => {
      specDlg.close();
      openCard(CARDS.find((x) => x.id === b.dataset.card));
    });
  }
  specDlg.showModal();
}
document.getElementById("kanbanTab").onclick = () => setView("kanban");
document.getElementById("ordersTab").onclick = () => setView("orders");
document.getElementById("needsEntry").onclick = () => {
  setView("kanban"); state.status = "needs-you"; render();
  document.getElementById("kanbanView").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
};
renderWorkOrders();
render();
setView(storageGet("tracker-view") === "orders" ? "orders" : "kanban");
</script>
</body>
</html>
`;

if (process.argv.includes("--check")) {
  if (readFileSync(OUT_BOARD, "utf8") !== boardHtml || readFileSync(OUT_GUIDE, "utf8") !== guideHtml) {
    throw new Error("generated tracker readers are stale; run pnpm tracker:build");
  }
  console.log(`tracker parity: ${cards.length} Cards, ${workOrders.length} Work Orders`);
} else {
  writeFileSync(OUT_BOARD, boardHtml);
  writeFileSync(OUT_GUIDE, guideHtml);
  console.log(`tracker: ${cards.length} Cards, ${workOrders.length} Work Orders → board.html + guide.html`);
}
