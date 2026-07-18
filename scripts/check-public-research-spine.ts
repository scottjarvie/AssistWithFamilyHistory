import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketingNav } from "../components/layout/MarketingNav";
import {
  ResearchSpine,
  researchSpineStages,
} from "../components/marketing/ResearchSpine";

const extensionPage = readFileSync("app/extension/page.tsx", "utf8");
const foundationSpec = readFileSync(
  "docs/product/design-ia-foundation-vnext.md",
  "utf8",
);

assert.deepEqual(
  researchSpineStages.map((stage) => stage.label),
  ["Capture", "Vault", "Research", "Story"],
  "Research Spine labels and order are a public product contract",
);

const spineMarkup = renderToStaticMarkup(
  createElement(ResearchSpine, { activeStage: "capture" }),
);
for (const stage of researchSpineStages) {
  assert.match(spineMarkup, new RegExp(`>${stage.label}<`));
}
assert.match(spineMarkup, /aria-label="Research journey"/);
const currentStages = [
  ...spineMarkup.matchAll(/<li[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/g),
];
assert.equal(currentStages.length, 1, "Exactly one Research Spine stage is current");
assert.match(currentStages[0]?.[1] ?? "", />Capture</);

const marketingNavMarkup = renderToStaticMarkup(createElement(MarketingNav));
const homeAnchor = [...marketingNavMarkup.matchAll(/<a\b[^>]*>/g)]
  .map(([anchor]) => anchor)
  .find((anchor) => anchor.includes('href="/"'));
assert.ok(homeAnchor, "Marketing navigation must render a home anchor");
assert.match(
  homeAnchor,
  /aria-label="Discover Their Stories home"/,
  "The compass-only mobile home link must keep an accessible name",
);

assert.match(extensionPage, /<MarketingNav\s*\/>/);
assert.match(extensionPage, /<Footer\s*\/>/);
assert.match(extensionPage, /<ResearchSpine activeStage="capture"\s*\/>/);
assert.match(
  extensionPage,
  /\/extension-download\/discover-their-stories-extension\.zip/,
);
assert.match(extensionPage, /href="\/app\/imports"/);
assert.match(extensionPage, /Private by default/);
assert.match(extensionPage, /user-initiated/i);
assert.match(extensionPage, /does not publish/i);
assert.doesNotMatch(extensionPage, /break-all/);

assert.match(foundationSpec, /Accepted now/);
assert.match(foundationSpec, /Deferred/);
assert.match(foundationSpec, /Rejected from the advisory audit/);
assert.match(foundationSpec, /Revalidation-dependent/);

console.log("Public Research Spine behavior assertions passed");
