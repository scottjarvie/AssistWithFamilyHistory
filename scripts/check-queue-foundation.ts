import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUEUE_AGENT_TOOLS } from "../lib/queue/agentTools";
import { QUEUE_SERVICE_STATES, QUEUE_STATES, QUEUE_STATE_LABELS } from "../lib/queue/contract";
import { SCOPES } from "../lib/auth/scopes";

const schema = readFileSync("convex/schema.ts", "utf8");
const queueModule = readFileSync("convex/queue.ts", "utf8");
const handoff = readFileSync("docs/product/queue-foundation-design-handoff.md", "utf8");
const philosophy = readFileSync("docs/planning/assist-with-family-history-project-philosophy.md", "utf8");
const route = readFileSync("app/api/queue/route.ts", "utf8");
const itemRoute = readFileSync("app/api/queue/[id]/route.ts", "utf8");

assert.deepEqual(QUEUE_STATES, ["needs_you", "working", "waiting_for_your_ai", "done"]);
assert.deepEqual(Object.values(QUEUE_STATE_LABELS), ["Needs You", "Working", "Waiting for your AI", "Done"]);
for (const state of QUEUE_STATES) assert.match(schema, new RegExp(`v\\.literal\\(\"${state}\"\\)`));

for (const table of ["queueItems", "queueActivity", "queueCommandReceipts"]) {
  assert.match(schema, new RegExp(`${table}: defineTable`), `${table} must remain durable`);
}
for (const index of ["by_owner_state_updated", "by_owner_priority_updated", "by_item_created", "by_owner_key"]) {
  assert.match(schema, new RegExp(index), `${index} must remain available for bounded access`);
}
for (const operation of ["queue:read", "queue:claim", "queue:update", "queue:complete"] as const) {
  assert.ok(SCOPES.includes(operation), `Missing Queue scope: ${operation}`);
}
for (const surfaceState of QUEUE_SERVICE_STATES) {
  assert.ok(handoff.includes(surfaceState), `Design handoff must explain ${surfaceState}`);
}

assert.equal(QUEUE_AGENT_TOOLS.length, 7);
assert.doesNotMatch(QUEUE_AGENT_TOOLS.map((tool) => tool.name).join(" "), /delete|publish|merge|access|identity/i);
assert.match(queueModule, /QUEUE_LIMITS\.itemPage/);
assert.match(queueModule, /QUEUE_LIMITS\.activityPage/);
assert.match(queueModule, /assertVersion/);
assert.match(queueModule, /existingReceipt/);
assert.match(queueModule, /assertAgentAuthority/);
assert.match(queueModule, /assertQueueTenantAllowed/);
assert.match(queueModule, /ctx\.scheduler\.runAt/);
assert.match(queueModule, /reconcileQueueItemExpiry/);
assert.match(route, /api\.queue\.listQueueItems/);
assert.match(itemRoute, /delete_queue_item_and_history/);
assert.match(handoff, /not automatically adapted/i);
assert.match(handoff, /incoming API-key resolution/i);
assert.match(handoff, /does not inherit the broader legacy[\s\S]*shadow behavior/i);
assert.match(handoff, /lifecycle reconciliation, not[\s\S]*autonomous work/i);
assert.match(philosophy, /There is no fifth product Queue state/);

console.log("Queue foundation contract assertions passed");
