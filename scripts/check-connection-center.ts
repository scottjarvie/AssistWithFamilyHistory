/**
 * Connection-centre honesty contract.
 *
 * The consent screen at /app/settings/ai is the only place a person decides what
 * their AI may do. If it ever drifts from what the MCP edge actually enforces,
 * the product is lying to somebody about their own family records. That is the
 * failure this check exists to make impossible.
 *
 * It renders the real component with a real pending connection and asserts:
 *
 *   - every scope in the enforced ceiling reaches the markup, with its label,
 *     its plain-language grant, AND the limit that still holds after approval;
 *   - both never-lists are rendered verbatim, entry for entry;
 *   - every record boundary the grant model supports can be chosen;
 *   - a scope that can change things is visibly marked as such;
 *   - the revoke control states the immediate-effect promise the backend keeps;
 *   - nothing is pre-ticked, so approval is always an explicit act;
 *   - the manual fallback brief names what it deliberately leaves out and
 *     carries no authority; and
 *   - no OAuth vocabulary leaks into the person-facing copy.
 *
 * It also checks the source-level wiring the render alone cannot prove: that the
 * copy is generated from `lib/mcp/catalog.ts` rather than retyped, and that the
 * write path cannot widen a grant.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AiConnectionCenter, MANUAL_QUEUE_BRIEF } from "../components/ai/AiConnectionCenter";
import {
  FAMILY_HISTORY_SCOPES,
  FAMILY_HISTORY_SCOPE_INFO,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
} from "../lib/mcp/catalog";
import type { ConnectionRow } from "../lib/mcp/connectionApi";

function decode(markup: string): string {
  return markup
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

const pending: ConnectionRow = {
  id: "grant_pending_fixture",
  label: "New AI connection",
  observedClientName: "an assistant that named itself",
  clientId: "https://client.example.test/metadata.json",
  issuer: "https://identity.example.test",
  clientProvenance: "manual",
  clientMetadataUrl: null,
  scopes: [],
  boundary: { kind: "queue_only" },
  status: "pending",
  requestedAt: 1_755_300_000_000,
  consentedAt: null,
  issuedAt: null,
  expiresAt: null,
  lastUsedAt: null,
  lastToolName: null,
  revokedAt: null,
  revokedReason: null,
  useCount: 0,
  consentSnapshot: null,
};

const active: ConnectionRow = {
  ...pending,
  id: "grant_active_fixture",
  label: "Research assistant",
  status: "active",
  scopes: ["family_history:context:read", "family_history:research:write"],
  boundary: { kind: "whole_workspace" },
  consentedAt: 1_755_300_000_000,
  issuedAt: 1_755_300_000_000,
  expiresAt: 1_763_000_000_000,
  lastUsedAt: 1_755_400_000_000,
  lastToolName: "family_history_get_brief",
  useCount: 12,
  consentSnapshot: JSON.stringify({ shownAt: 1_755_300_000_000 }),
};

const markup = decode(
  renderToStaticMarkup(
    React.createElement(AiConnectionCenter, {
      initialConnections: [pending, active],
      initialActivity: [
        {
          id: "activity_fixture",
          at: 1_755_400_000_000,
          tool: "family_history_get_brief",
          outcome: "ok",
          detail: null,
          grantId: active.id,
          clientId: active.clientId,
        },
      ],
    }),
  ),
);

/* ------------------------------------------------ the enforced ceiling */

assert.equal(
  FAMILY_HISTORY_SCOPE_INFO.length,
  FAMILY_HISTORY_SCOPES.length,
  "Every enforced scope must carry person-facing consent copy",
);

for (const scope of FAMILY_HISTORY_SCOPE_INFO) {
  assert.ok(
    markup.includes(scope.label),
    `The connection centre must show the consent label for ${scope.scope}`,
  );
  assert.ok(
    markup.includes(scope.grants),
    `The connection centre must show what ${scope.scope} actually grants, not a paraphrase`,
  );
  assert.ok(
    markup.includes(scope.limit),
    `The connection centre must show the limit that still holds after ${scope.scope} is approved`,
  );
  assert.ok(
    markup.includes(`id="ceiling-${scope.scope}"`) ||
      markup.includes(`approve-${pending.id}-${scope.scope}`),
    `${scope.scope} must be reachable on the consent screen, not merely described`,
  );
}

/* -------------------------------------------------- both never-lists */

for (const entry of NEVER_EXPOSED) {
  assert.ok(markup.includes(entry), `The connection centre must render never-exposed: "${entry}"`);
}
for (const entry of NEVER_PERMITTED) {
  assert.ok(markup.includes(entry), `The connection centre must render never-permitted: "${entry}"`);
}

/* ------------------------------------------------- boundary and effect */

for (const kind of ["whole_workspace", "selected_people", "queue_only"]) {
  assert.ok(
    markup.includes(`boundary-${pending.id}-${kind}`),
    `The consent screen must offer the ${kind} record boundary`,
  );
}

assert.ok(
  markup.includes("Can change things"),
  "A permission that lets an AI change records must be visibly marked as such",
);
assert.ok(markup.includes("Read only"), "A read-only permission must be visibly marked as such");

assert.match(
  markup,
  /very next request/,
  "Revoking must state that it takes effect on the connection's very next request",
);
assert.match(
  markup,
  /not whenever its sign-in happens to run out|not whenever a token/,
  "Revoking must say plainly that it does not wait for a sign-in to expire",
);
assert.match(
  markup,
  /fresh approval/,
  "Narrowing must explain that giving a permission back needs a fresh approval",
);

/* -------------------------------------------------------- no defaults */

assert.doesNotMatch(
  markup,
  /name="boundary-grant_pending_fixture"[^>]*type="radio"[^>]*checked=""[^>]*value/,
  "Boundary choice must not silently default to a wider boundary",
);
const preTickedScopes = FAMILY_HISTORY_SCOPE_INFO.filter((scope) =>
  new RegExp(`id="approve-${pending.id}-${scope.scope}"[^>]*checked`).test(markup),
);
assert.equal(
  preTickedScopes.length,
  0,
  "No permission may be pre-ticked on the consent screen; approval must be an explicit act",
);

/* --------------------------------------------- stale tools and fallback */

assert.match(markup, /If the tools look wrong/, "Stale-tool recovery must be on the page");
assert.match(markup, /disconnect/i, "Stale-tool recovery must tell the person to disconnect");
assert.match(markup, /Sign in again/i, "Stale-tool recovery must tell the person to sign in again");
assert.match(markup, /family_history_/, "Stale-tool recovery must name the tool prefix to confirm");

assert.ok(
  markup.includes("DELIBERATELY NOT INCLUDED"),
  "The manual brief must name what it deliberately leaves out",
);
assert.ok(markup.includes("BOUNDARY"), "The manual brief must state that it carries no authority");
assert.ok(
  MANUAL_QUEUE_BRIEF.includes("Living people"),
  "The manual brief must exclude living people by name",
);
assert.ok(
  /no authority to change,\s+publish, delete, merge, or share/.test(MANUAL_QUEUE_BRIEF),
  "The manual brief must state the exact actions it does not authorize",
);
for (const foreign of ["Trip", "itinerary", "booking", "reservation"]) {
  assert.ok(
    !MANUAL_QUEUE_BRIEF.includes(foreign),
    `The manual brief must use Family History's own nouns, not "${foreign}"`,
  );
}

/* --------------------------------------------------- plain language */

// The never-lists are published verbatim from the catalog and legitimately name
// things like access tokens, so they are excluded before the jargon sweep — this
// checks the copy this page writes, not the promises it quotes.
let ownCopy = markup;
for (const entry of [...NEVER_EXPOSED, ...NEVER_PERMITTED]) {
  ownCopy = ownCopy.split(entry).join(" ");
}

for (const jargon of [
  "OAuth",
  "bearer token",
  "JWT",
  "access token",
  "PKCE",
  "client_id",
  "scope ceiling",
  "JSON-RPC",
  "MCP",
]) {
  assert.ok(
    !ownCopy.includes(jargon),
    `The connection centre must not put "${jargon}" in front of a person`,
  );
}

/* ------------------------------------------------------ source wiring */

const componentSource = readFileSync(
  new URL("../components/ai/AiConnectionCenter.tsx", import.meta.url),
  "utf8",
);
assert.match(
  componentSource,
  /from "@\/lib\/mcp\/catalog"/,
  "Consent copy must be imported from the enforced catalog, never retyped",
);
assert.match(
  componentSource,
  /FAMILY_HISTORY_SCOPE_INFO\.map/,
  "The consent screen must be generated from the scope catalog",
);
assert.match(componentSource, /NEVER_EXPOSED\.map/, "The never-exposed list must be generated");
assert.match(componentSource, /NEVER_PERMITTED\.map/, "The never-permitted list must be generated");

const routeSource = readFileSync(
  new URL("../app/api/ai-connections/route.ts", import.meta.url),
  "utf8",
);
assert.ok(
  !/widen/i.test(routeSource) || /not reachable/i.test(routeSource),
  "The connection write path must not offer a widening action",
);
assert.ok(
  !routeSource.includes("vaultOwnerId: body"),
  "The vault owner must come from the session, never from the request body",
);
assert.match(
  routeSource,
  /getVaultAccessContext\(\)/,
  "The connection write path must derive the owner from the signed-in session",
);

const pageSource = readFileSync(
  new URL("../app/app/settings/ai/page.tsx", import.meta.url),
  "utf8",
);
assert.match(pageSource, /getAuthedConvexClient/, "The page must read through the authed client");
assert.match(pageSource, /force-dynamic/, "Connection state must never be cached across people");

console.log(
  `Connection-centre honesty contract passed (${FAMILY_HISTORY_SCOPE_INFO.length} scopes, ` +
    `${NEVER_EXPOSED.length} never-exposed, ${NEVER_PERMITTED.length} never-permitted entries rendered)`,
);
