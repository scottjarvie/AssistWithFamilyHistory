import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivateFamilyStart } from "../components/vault/PrivateFamilyStart";

const markup = renderToStaticMarkup(<PrivateFamilyStart />);
const componentSource = readFileSync(
  new URL("../components/vault/PrivateFamilyStart.tsx", import.meta.url),
  "utf8",
);
const mutationSource = readFileSync(
  new URL("../convex/vaultMutations.ts", import.meta.url),
  "utf8",
);

assert.match(markup, /Who belongs in this first connection/);
assert.match(markup, /Given name/);
assert.match(markup, /Are they living/);
assert.match(markup, /Choose explicitly/);
assert.match(markup, /Create an optional Queue handoff/);
assert.match(markup, /Your AI receives nothing unless you choose this/);
assert.match(markup, /Known is not yet proven/);
assert.match(markup, /min-h-11|min-h-12/);
assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);

assert.match(componentSource, /if \(createHandoff\) \{[\s\S]*fetch\("\/api\/queue"/);
assert.match(componentSource, /fetch\("\/api\/first-start"[\s\S]*if \(createHandoff\)/);
assert.match(componentSource, /Correct details/);
assert.match(componentSource, /Nothing has been written yet/);
assert.match(componentSource, /Nothing was saved/);

assert.match(mutationSource, /authorizeTenantMutation\([\s\S]*"vaultMutations\.startPrivateWorkspace"/);
assert.match(mutationSource, /evidenceStatus: "unsourced"/);
assert.match(mutationSource, /by_owner_creation_operation/);
assert.match(mutationSource, /First start is only available in an empty private workspace/);

console.log("Private first-start UI, authority, and evidence-boundary contract passed");
