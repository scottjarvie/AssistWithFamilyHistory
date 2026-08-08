#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACKER = path.join(ROOT, "docs", "tracker");
const CARD_STATUSES = new Set(["backlog", "next", "doing", "needs-you", "done"]);
const EXECUTION = new Set(["proposed", "ready", "active", "complete", "superseded"]);
const AUDIT = new Set(["not-audited", "passed", "follow-up-needed"]);

function parse(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert(match, `${path.relative(ROOT, file)}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const item = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (item) meta[item[1]] = item[2].replace(/^"|"$/g, "").trim();
  }
  return { file, raw, body: match[2].trim(), meta };
}
function list(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort().map((name) => parse(path.join(dir, name)));
}
function values(value = "") { return value.split(/[\s,]+/).filter(Boolean); }
function requireHeadings(item, headings) {
  for (const heading of headings) assert.match(item.body, new RegExp(`^## ${heading}$`, "m"), `${path.basename(item.file)}: missing ## ${heading}`);
}

const metadata = JSON.parse(fs.readFileSync(path.join(TRACKER, "tracker.json"), "utf8"));
assert.equal(metadata.schemaVersion, 1);
assert.equal(metadata.project, "Assist With Family History");
assert.equal(metadata.idPrefix, "AWF");
assert.equal(metadata.familyCore.label, "Assist With Sites Core Philosophy v1.6.2");
assert.equal(metadata.familyCore.date, "2026-08-08");
assert.equal(metadata.familyCore.commit, "561481843793a1d0fb97eee3984bccfd004c21a2");

const cards = list(path.join(TRACKER, "cards"));
const orders = list(path.join(TRACKER, "work-orders"));
const cardIds = new Set();
const orderIds = new Set();
for (const card of cards) {
  const { meta, body, file } = card;
  assert.match(meta.id || "", /^AWF-\d{4}$/, `${path.basename(file)}: invalid Card id`);
  assert.equal(path.basename(file, ".md"), meta.id, `${meta.id}: filename mismatch`);
  assert(!cardIds.has(meta.id), `duplicate Card ${meta.id}`); cardIds.add(meta.id);
  assert(CARD_STATUSES.has(meta.status), `${meta.id}: invalid status ${meta.status}`);
  for (const field of ["title", "type", "area", "created", "updated"]) assert(meta[field], `${meta.id}: missing ${field}`);
  assert(body.length > 80, `${meta.id}: body is not cold-start durable`);
  assert.match(body, /^## (Evidence|Completion evidence)$/m, `${meta.id}: missing evidence section`);
  assert.match(body, /^## (Definition of done|History)$/m, `${meta.id}: missing completion or history section`);
  if (meta.status === "needs-you") requireHeadings(card, ["Why Scott is needed", "Smallest decision or action", "Recommendation", "Alternatives and trade-offs", "What each choice changes", "Safe default", "Consequence of waiting", "Evidence"]);
}
for (const order of orders) {
  const { meta, file } = order;
  assert.match(meta.id || "", /^AWF-WO-\d{3}$/, `${path.basename(file)}: invalid Work Order id`);
  assert.equal(path.basename(file, ".md"), meta.id, `${meta.id}: filename mismatch`);
  assert(!orderIds.has(meta.id), `duplicate Work Order ${meta.id}`); orderIds.add(meta.id);
  assert(EXECUTION.has(meta.execution), `${meta.id}: invalid execution ${meta.execution}`);
  assert(AUDIT.has(meta.audit), `${meta.id}: invalid audit ${meta.audit}`);
  for (const field of ["title", "cards", "created", "updated"]) assert(meta[field], `${meta.id}: missing ${field}`);
  for (const id of values(meta.cards)) assert(cardIds.has(id), `${meta.id}: unknown Card ${id}`);
  requireHeadings(order, ["Goal", "Current truth", "Sequence", "Dependencies", "Exclusions", "Stop rules", "Verification", "Human gates", "Execution evidence", "History"]);
  if (meta.execution === "ready") assert(meta["approved-by"] || meta["approval-evidence"], `${meta.id}: Ready lacks approval provenance`);
}
for (const card of cards) {
  for (const id of values(card.meta["work-orders"])) {
    assert(orderIds.has(id), `${card.meta.id}: unknown Work Order ${id}`);
    const order = orders.find((item) => item.meta.id === id);
    assert(values(order.meta.cards).includes(card.meta.id), `${card.meta.id}: ${id} does not contain Card`);
  }
}

execFileSync(process.execPath, [path.join(ROOT, "scripts", "tracker-build.mjs"), "--check"], { cwd: ROOT, stdio: "inherit" });
for (const name of ["board.html", "guide.html"]) {
  const html = fs.readFileSync(path.join(TRACKER, name), "utf8");
  assert(!/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html), `${name}: external runtime asset`);
  assert.match(html, /class="skip" href="#/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /@media \(max-width: 700px\)/);
  assert.match(html, /data-mode="paper"/);
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1], { filename: `${name}:inline-script` });
}
const board = fs.readFileSync(path.join(TRACKER, "board.html"), "utf8");
for (const label of ["Project", "Project Philosophy", "Family Core", "Guide", "Kanban", "Work Orders", "Needs You"] ) assert(board.includes(label), `board missing ${label}`);
for (const status of CARD_STATUSES) assert(board.includes(`\\"${status}\\"`) || board.includes(`"${status}"`), `board missing status ${status}`);
assert.match(board, /Copy whole work order/);
assert.match(board, /No automatic dispatch/);
assert.match(board, /Independent audit/);
assert.match(board, /overflow-x:auto/);

console.log(`tracker verified: ${cards.length} Cards, ${orders.length} Work Orders, generated parity and JavaScript syntax`);
