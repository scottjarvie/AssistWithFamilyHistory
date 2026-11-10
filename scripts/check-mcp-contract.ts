/**
 * MCP contract parity.
 *
 * The catalog in lib/mcp/catalog.ts is the single source of truth for what a
 * chosen AI can see and do. This check fails the build when the code, the
 * published guidance, or the enforcement path drifts from it — which is the
 * failure mode that turns a permission model into decoration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FAMILY_HISTORY_ALL_TOOL_NAMES,
  FAMILY_HISTORY_CANONICAL_TOOL_NAMES,
  FAMILY_HISTORY_SCOPES,
  FAMILY_HISTORY_SCOPE_INFO,
  FAMILY_HISTORY_TOOLS,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
  assertFamilyHistoryCatalogContract,
  findTool,
  scopeForTool,
} from "../lib/mcp/catalog";
import { assertMcpToolContract, FAMILY_HISTORY_MCP_TOOL_NAMES } from "../lib/mcp/contract";
import { decideToolAccess, queueScopesForGrant } from "../lib/mcp/authorize";

assertFamilyHistoryCatalogContract();
assertMcpToolContract();

/* ------------------------------------------------- scope -> tool, both ways */

for (const tool of FAMILY_HISTORY_TOOLS) {
  assert.ok(
    FAMILY_HISTORY_SCOPES.includes(tool.requiredScope),
    `${tool.name} requires a scope outside the ceiling`,
  );
  assert.equal(scopeForTool(tool.name), tool.requiredScope);
  if (tool.alias) {
    // An alias must resolve to the SAME entry, which is what makes it the same
    // handler and the same permission rather than a second, weaker door.
    assert.equal(findTool(tool.alias), findTool(tool.name), `${tool.alias} must resolve to ${tool.name}`);
    assert.equal(scopeForTool(tool.alias), tool.requiredScope);
  }
}

// A name outside the catalog carries no scope at all.
for (const unknown of ["", "save_everything", "family_history_delete_person", "tools/list"]) {
  assert.equal(scopeForTool(unknown), null, `${unknown} must map to no scope`);
}

// No read scope may reach a tool that writes.
for (const scope of FAMILY_HISTORY_SCOPES.filter((entry) => entry.endsWith(":read"))) {
  const writers = FAMILY_HISTORY_TOOLS.filter((tool) => tool.requiredScope === scope && tool.writes);
  assert.equal(writers.length, 0, `${scope} must not grant a tool that writes`);
}

/* --------------------------------------------- deny by default, both paths */

const now = Date.now();
for (const state of ["absent", "pending", "revoked", "expired", "denied"] as const) {
  for (const name of FAMILY_HISTORY_ALL_TOOL_NAMES) {
    const discovery = decideToolAccess({ toolName: name, resolution: { state }, now });
    assert.equal(discovery.allowed, false, `${name} must be hidden when the grant is ${state}`);
    const call = decideToolAccess({ toolName: name, resolution: { state }, now, input: {} });
    assert.equal(call.allowed, false, `${name} must be refused when the grant is ${state}`);
  }
}

// Two half-permissions never add up to a whole one: the authorizer only ever
// sees one grant, so a scope split across two grants cannot open a tool.
const halfA = decideToolAccess({
  toolName: "family_history_save_story_work",
  resolution: {
    state: "active",
    grant: {
      grantId: "a",
      clientId: "c",
      issuer: "i",
      scopes: ["family_history:research:write"],
      boundary: { kind: "whole_workspace" },
    },
  },
  now,
  input: {},
});
assert.equal(halfA.allowed, false, "research:write alone must not reach a story draft tool");

// An unknown tool and an ungranted tool must be indistinguishable.
const grantAll = {
  state: "active" as const,
  grant: {
    grantId: "a",
    clientId: "c",
    issuer: "i",
    scopes: ["family_history:context:read"] as never,
    boundary: { kind: "whole_workspace" as const },
  },
};
const unknownRefusal = decideToolAccess({ toolName: "not_a_tool", resolution: grantAll, now, input: {} });
const ungrantedRefusal = decideToolAccess({
  toolName: "family_history_save_person",
  resolution: grantAll,
  now,
  input: {},
});
assert.equal(unknownRefusal.allowed, false);
assert.equal(ungrantedRefusal.allowed, false);
assert.equal(unknownRefusal.code, ungrantedRefusal.code);
assert.match(ungrantedRefusal.message, /family_history:research:write/);
assert.match(ungrantedRefusal.recovery, /Only the person.*https:\/\/assistwithfamilyhistory.com\/settings\/ai/);

// No refusal may name a record, an owner, or a table.
for (const state of ["absent", "pending", "revoked", "expired", "denied"] as const) {
  const refusal = decideToolAccess({ toolName: "family_history_get_brief", resolution: { state }, now, input: {} });
  assert.equal(refusal.allowed, false);
  const text = JSON.stringify(refusal).toLowerCase();
  for (const leak of ["vaultownerid", "_id", "persons", "not found", "does not exist"]) {
    assert.ok(!text.includes(leak), `refusal text must not leak "${leak}"`);
  }
}

/* -------------------------------------------------------------- Queue scopes */

assert.deepEqual(queueScopesForGrant([]), [], "no queue scope means no queue principal");
assert.deepEqual(
  queueScopesForGrant(["family_history:queue:read"]),
  ["queue:read"],
  "queue:read must produce a read-only Queue principal",
);
assert.deepEqual(
  queueScopesForGrant(["family_history:queue:work"]),
  ["queue:read", "queue:claim", "queue:update", "queue:complete", "queue:add"],
  "queue:work must produce the claim/update/complete set",
);

/* ------------------------------------------------------- source-level parity */

const transport = readFileSync("convex/httpRoutes/mcp.ts", "utf8");
for (const name of FAMILY_HISTORY_CANONICAL_TOOL_NAMES) {
  assert.ok(
    transport.includes(`registerTool("${name}"`),
    `${name} is in the catalog but the transport never registers it`,
  );
}
assert.ok(
  transport.includes("grants.resolveForRequest"),
  "the transport must resolve the product grant on every request",
);
assert.ok(
  /if \(tool\.alias\)/.test(transport),
  "the transport must register every compatibility alias on the same handler",
);
assert.ok(
  transport.includes("queueScopesForGrant"),
  "Queue scopes must derive from the grant, not from a hard-coded list",
);
assert.ok(
  !/scopes: \["queue:read", "queue:claim"/.test(transport),
  "the hard-coded full Queue scope set must be gone",
);

// Every implementedBy claim must point at a function that actually exists.
for (const tool of FAMILY_HISTORY_TOOLS) {
  const [modulePath, fnName] = tool.implementedBy.split(".");
  const source = readFileSync(`${modulePath}.ts`, "utf8");
  assert.ok(
    new RegExp(`export const ${fnName}\\b`).test(source),
    `${tool.name} claims ${tool.implementedBy}, which does not exist`,
  );
}

// The data layer must refuse independently of the transport.
const domain = readFileSync("convex/mcpFamilyHistory.ts", "utf8");
assert.ok(
  domain.includes("assertGrantPermits"),
  "MCP writes must re-validate the grant inside the mutation",
);

/* ---------------------------------------- raw-wire responses stay conforming */

// Two responses are written straight onto the wire, bypassing the MCP server
// that would normally stamp protocol revision 2026-07-28's required
// discriminator: the empty tool catalog for an unapproved connection, and the
// preflight refusal for a tool the grant does not cover. Without `resultType` a
// conforming client rejects both as malformed — so the person's AI sees a broken
// server instead of "ask them to approve this", which is the exact opposite of
// what those two branches exist to do.
const jsonRpcResults: string[] = [];
for (let index = transport.indexOf('jsonrpc: "2.0"'); index >= 0; index = transport.indexOf('jsonrpc: "2.0"', index + 1)) {
  jsonRpcResults.push(transport.slice(index, index + 700));
}
assert.ok(jsonRpcResults.length >= 1, "the preflight-refusal wire path must exist");
for (const block of jsonRpcResults) {
  assert.ok(
    block.includes('resultType: "complete"'),
    "every hand-written JSON-RPC result must carry the protocol revision's required resultType",
  );
}
// Connection controls remain discoverable even when every domain tool is refused.
assert.ok(transport.includes("FAMILY_HISTORY_CONTROL_TOOLS"));
assert.ok(transport.includes("describeCallingConnection"));
assert.ok(transport.includes("limitCallingConnection"));

// Only initialize contributes clientInfo; neither per-request metadata nor a
// User-Agent is a connection identity. The backend prefers its registration.
assert.ok(transport.includes('message?.method !== "initialize"'));
assert.ok(transport.includes("message.params?.clientInfo?.name"));
assert.ok(!transport.includes('headers.get("user-agent")'));
const grantSource = readFileSync("convex/mcpGrants.ts", "utf8");
assert.ok(grantSource.includes("registeredName ?? trimmed(args.observedClientName"));
const connectSource = grantSource.slice(grantSource.indexOf("export const resolveForRequest"), grantSource.indexOf("export const touchGrantUse"));
assert.ok(!grantSource.includes("resolveClientAlias"));
assert.ok(!grantSource.includes("normalizedClientName"));
assert.ok(connectSource.includes("carried.entries.map"));
assert.ok(connectSource.includes("prepareCarriedRestrictions"));
assert.ok(!connectSource.includes('query("mcpGrants")'));

assert.ok(!grantSource.includes("MAX_CLIENT_GRANTS"));
assert.ok(grantSource.includes("sourceRevision: row.revision ?? 0"));

/* ------------------------------------------------- published guidance parity */

const aiTxt = readFileSync("app/ai.txt/route.ts", "utf8");
assert.ok(aiTxt.includes("FAMILY_HISTORY_TOOLS"), "/ai.txt must generate its tool list from the catalog");
assert.ok(aiTxt.includes("FAMILY_HISTORY_SCOPE_INFO"), "/ai.txt must publish the real scope list");
assert.ok(aiTxt.includes("GRANT_REQUIRED"), "/ai.txt must tell an AI what to do when approval is missing");
assert.ok(aiTxt.includes("BYTES_NOT_AVAILABLE"), "/ai.txt must stay honest about media byte delivery");

// The legacy exported list is exactly the compatibility aliases, no more.
const aliases = FAMILY_HISTORY_TOOLS.flatMap((tool) => (tool.alias ? [tool.alias] : []));
assert.deepEqual(
  [...FAMILY_HISTORY_MCP_TOOL_NAMES].sort(),
  [...aliases].sort(),
  "the pre-namespace tool list must stay exactly the set of compatibility aliases",
);

assert.equal(FAMILY_HISTORY_SCOPE_INFO.length, FAMILY_HISTORY_SCOPES.length);
assert.ok(NEVER_EXPOSED.length >= 5 && NEVER_PERMITTED.length >= 5);

/* -------------------------------- machine capability manifest parity */

const capabilityManifest = JSON.parse(
  readFileSync("docs/api/capability-manifest.json", "utf8"),
) as {
  mcp?: {
    currentInSource?: string[];
    authorityTiers?: {
      defaultAfterOAuth?: string[];
      personApproved?: string[];
      raisedOutsideOrdinaryApproval?: string[];
      reservedNeverIssuable?: string[];
    };
  };
};

assert.deepEqual(
  capabilityManifest.mcp?.currentInSource,
  [...FAMILY_HISTORY_CANONICAL_TOOL_NAMES],
  "the capability manifest must list the canonical MCP catalog in catalog order",
);
assert.deepEqual(
  capabilityManifest.mcp?.authorityTiers?.defaultAfterOAuth,
  [...FAMILY_HISTORY_SCOPES],
  "OAuth sign-in grants the ordinary scope ceiling (owner decision 2026-10-13); the never-list stays outside it",
);
assert.deepEqual(
  capabilityManifest.mcp?.authorityTiers?.personApproved,
  [...FAMILY_HISTORY_SCOPES],
  "the manifest's person-approved tier must equal the enforced scope ceiling",
);
assert.deepEqual(
  capabilityManifest.mcp?.authorityTiers?.raisedOutsideOrdinaryApproval,
  [],
  "Family History has no current raised MCP tier; adding one requires an explicit product decision",
);
assert.deepEqual(
  capabilityManifest.mcp?.authorityTiers?.reservedNeverIssuable,
  [...NEVER_PERMITTED],
  "the manifest's reserved tier must equal the catalog's never-permitted authority list",
);

console.log(
  `MCP contract assertions passed: ${FAMILY_HISTORY_CANONICAL_TOOL_NAMES.length} canonical tools, ${aliases.length} aliases, ${FAMILY_HISTORY_SCOPES.length} scopes.`,
);
