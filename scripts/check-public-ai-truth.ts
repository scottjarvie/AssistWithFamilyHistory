/**
 * Public chosen-AI truth contract.
 *
 * Two promises this product has made, checked instead of remembered:
 *
 *   1. **The public tool and permission list is generated, not retyped.** `/ai`
 *      and `/ai.txt` build their tool names, permission names, and never-lists
 *      from `lib/mcp/catalog.ts` — the module the MCP edge actually enforces
 *      with. A tool that exists must be published; a tool that is published must
 *      exist. Nobody has to remember to update a page.
 *
 *   2. **No assistant is named as working.** Claude, ChatGPT, Codex, Grok,
 *      Hermes and the rest are intended clients, never current compatibility.
 *      A name may only appear once that exact assistant has completed the whole
 *      lifecycle with receipts. Until then, naming one is a guess dressed up as
 *      a promise, and the reader is the one who finds out it was wrong.
 *
 * This check also polices the residue in both directions. The connection IS
 * deployed, so a public surface may say so — but it may not claim any assistant
 * has been verified, and it may no longer claim it is "awaiting deployed proof",
 * which was true for a while and then quietly became the least true sentence on
 * the site.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  FAMILY_HISTORY_SCOPE_INFO,
  FAMILY_HISTORY_TOOLS,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
} from "../lib/mcp/catalog";
import { GET as aiTxtGet } from "../app/ai.txt/route";

const root = process.cwd();
const failures: string[] = [];
const catalogNames = new Set(FAMILY_HISTORY_TOOLS.map((tool) => tool.name));

/* --------------------------------------------------- /ai.txt is generated */

/**
 * The route is called rather than read, so this checks the bytes a crawler
 * actually receives — not a source file that merely looks like it generates them.
 */
async function checkGeneratedAgentGuide(aiTxt: string) {
for (const tool of FAMILY_HISTORY_TOOLS) {
  assert.ok(aiTxt.includes(tool.name), `/ai.txt must publish the tool ${tool.name}`);
  assert.ok(
    aiTxt.includes(tool.humanSummary),
    `/ai.txt must publish what ${tool.name} is for, in the catalog's own words`,
  );
  if (tool.alias) {
    assert.ok(aiTxt.includes(tool.alias), `/ai.txt must keep naming the alias ${tool.alias}`);
  }
}
for (const scope of FAMILY_HISTORY_SCOPE_INFO) {
  assert.ok(aiTxt.includes(scope.scope), `/ai.txt must publish the permission ${scope.scope}`);
  assert.ok(aiTxt.includes(scope.grants), `/ai.txt must publish what ${scope.scope} grants`);
  assert.ok(aiTxt.includes(scope.limit), `/ai.txt must publish the limit on ${scope.scope}`);
}
for (const entry of [...NEVER_EXPOSED, ...NEVER_PERMITTED]) {
  assert.ok(aiTxt.includes(entry), `/ai.txt must publish the never-list entry: "${entry}"`);
}
// A name that is not in the catalog must not be advertised either.
const advertisedToolNames = aiTxt.match(/\bfamily_history_[a-z_]+\b/g) ?? [];
for (const name of new Set(advertisedToolNames)) {
  assert.ok(catalogNames.has(name), `/ai.txt advertises ${name}, which is not in the catalog`);
}
assert.ok(
  aiTxt.includes("/app/settings/ai") || aiTxt.includes("/settings/ai"),
  "/ai.txt must tell an AI where the person approves a connection",
);
}

/* ---------------------------------------------------- /ai is generated too */

const aiPage = readFileSync(path.join(root, "app/ai/page.tsx"), "utf8");
assert.match(
  aiPage,
  /from "@\/lib\/mcp\/catalog"/,
  "/ai must build its tool and permission list from the enforced catalog",
);
for (const symbol of [
  "FAMILY_HISTORY_TOOLS",
  "FAMILY_HISTORY_SCOPE_INFO",
  "NEVER_EXPOSED",
  "NEVER_PERMITTED",
]) {
  assert.ok(aiPage.includes(symbol), `/ai must render ${symbol} rather than a retyped copy`);
}
// A hard-coded tool count is exactly how this page went stale before.
assert.doesNotMatch(
  aiPage,
  /\b(Twelve|twelve|Fourteen|fourteen)\b/,
  "/ai must count its tools from the catalog, not spell a number that will go stale",
);
for (const tool of FAMILY_HISTORY_TOOLS) {
  if (aiPage.includes(tool.name)) {
    assert.ok(catalogNames.has(tool.name), `/ai names ${tool.name}, which must be in the catalog`);
  }
}
const hardCodedToolNames = (aiPage.match(/\bfamily_history_[a-z_]+\b/g) ?? []).filter(
  (name) => !catalogNames.has(name),
);
assert.deepEqual(hardCodedToolNames, [], "/ai must not name a tool that is not in the catalog");

/* ------------------------------------------- no assistant is named as working */

/**
 * Public surfaces: everything a person or a crawler can read without signing in.
 * `/app/**` is the signed-in workspace and is not a public claim.
 */
const PUBLIC_SURFACE_ROOTS = [
  "app/ai",
  "app/ai.txt",
  "app/llms.txt",
  "app/about",
  "app/features",
  "app/roadmap",
  "app/updates",
  "app/contact",
  "app/privacy",
  "app/extension",
  "app/page.tsx",
  "components/marketing",
];

/** Names that may not be presented as working here until each one has proved it. */
const CLIENT_NAMES = [
  "Claude",
  "ChatGPT",
  "GPT-4",
  "GPT-5",
  "Codex",
  "Grok",
  "Hermes",
  "Gemini",
  "Copilot",
  "Anthropic",
  "OpenAI",
  "Perplexity",
];

function walk(target: string): string[] {
  const full = path.join(root, target);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return [full];
  const files: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...walk(path.join(target, entry.name)));
    else if (/\.(tsx?|md|txt)$/.test(entry.name)) files.push(path.join(full, entry.name));
  }
  return files;
}

let scanned = 0;

for (const target of PUBLIC_SURFACE_ROOTS) {
  for (const file of walk(target)) {
    scanned += 1;
    const source = readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    for (const name of CLIENT_NAMES) {
      // Word boundary so "codex-test:" run keys and the like do not trip this.
      const pattern = new RegExp(`(^|[^\\w-])${name.replace(/[-]/g, "\\-")}([^\\w-]|$)`, "g");
      if (pattern.test(source)) {
        failures.push(
          `${relative} names "${name}" on a public surface. Intended clients are never named as ` +
            "current compatibility; a name may only appear after that exact client passes the full " +
            "lifecycle with receipts (AWF-0043).",
        );
      }
    }
  }
}

/* -------------------------------------- no deployed proof is claimed yet */

const DEPLOYED_PROOF_CLAIMS = [
  /proved in production/i,
  /verified in production/i,
  /production-proved/i,
  /works with your assistant/i,
  /any assistant works/i,
];
for (const file of [path.join(root, "app/ai/page.tsx"), path.join(root, "app/ai.txt/route.ts")]) {
  const source = readFileSync(file, "utf8");
  for (const claim of DEPLOYED_PROOF_CLAIMS) {
    if (claim.test(source)) {
      failures.push(
        `${path.relative(root, file)} claims deployed or client-verified proof (${claim}). ` +
          "The connection currently has source-and-test proof only.",
      );
    }
  }
}
assert.match(
  aiPage,
  /no assistant has yet completed a whole\s+connection here/i,
  "/ai must say plainly that being deployed is not proof that a reader's own assistant works",
);
// The residue is real-client proof, not deployed proof. The code IS deployed, so
// a public surface that still says "awaiting deployed proof" is now the lie.
for (const file of [path.join(root, "app/ai/page.tsx"), path.join(root, "app/ai.txt/route.ts")]) {
  const source = readFileSync(file, "utf8");
  if (/awaiting deployed proof|not (?:yet )?(?:been )?proved against the live site/i.test(source)) {
    failures.push(
      `${path.relative(root, file)} says the connection awaits deployed proof. It is deployed; ` +
        "the honest residue is real-client proof.",
    );
  }
}
assert.match(
  aiPage,
  /We do not name assistants that work here/i,
  "/ai must state the no-named-client rule where a reader will actually see it",
);



function report() {
  if (failures.length > 0) {
    console.error("Public chosen-AI truth contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
  `Public chosen-AI truth contract passed (${FAMILY_HISTORY_TOOLS.length} tools and ` +
    `${FAMILY_HISTORY_SCOPE_INFO.length} permissions published from the catalog; ` +
    `${scanned} public files carry no named-client claim)`,
  );
}

const aiTxtBody = aiTxtGet() as Response;
aiTxtBody
  .text()
  .then(checkGeneratedAgentGuide)
  .then(report)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
