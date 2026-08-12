import assert from "node:assert/strict";
import test from "node:test";
import {
  QUEUE_STATES,
  QUEUE_STATE_LABELS,
  assertCommandAllowed,
  handoffLine,
  leaseExpiresAtForActor,
  nextStateForFailure,
  queueExpiryTransition,
  summarizeDirective,
} from "../lib/queue/contract";
import { QUEUE_AGENT_TOOLS, assertNoBroadQueueAgentTools, authorizeQueueAgentTool } from "../lib/queue/agentTools";

test("Queue exposes exactly the four Core states", () => {
  assert.deepEqual(QUEUE_STATES, ["needs_you", "working", "waiting_for_your_ai", "done"]);
  assert.deepEqual(Object.values(QUEUE_STATE_LABELS), ["Needs You", "Working", "Waiting for your AI", "Done"]);
});

test("waiting handoff says nothing is running", () => {
  assert.match(
    handoffLine({ state: "waiting_for_your_ai", submittedAt: Date.UTC(2026, 7, 9), leftForActorId: "Claude" }),
    /nothing is running/i,
  );
});

test("completion requires the active unexpired actor", () => {
  const snapshot = {
    state: "working" as const,
    condition: "active" as const,
    version: 2,
    activeActorKind: "chosen_ai" as const,
    activeActorId: "ai:a",
    leaseExpiresAt: 2_000,
    retryCount: 0,
    maxRetries: 3,
  };
  assert.doesNotThrow(() => assertCommandAllowed("complete", snapshot, { kind: "chosen_ai", id: "ai:a" }, 1_000));
  assert.throws(() => assertCommandAllowed("complete", snapshot, { kind: "chosen_ai", id: "ai:b" }, 1_000));
  assert.throws(() => assertCommandAllowed("complete", snapshot, { kind: "chosen_ai", id: "ai:a" }, 2_001));
});

test("chosen-AI authority expires even when a longer lease was requested", () => {
  const snapshot = {
    state: "waiting_for_your_ai" as const,
    condition: "ready" as const,
    version: 1,
    handoffExpiresAt: 90_000,
    retryCount: 0,
    maxRetries: 3,
  };
  assert.equal(
    leaseExpiresAtForActor(snapshot, { kind: "chosen_ai", id: "ai:a" }, 10_000, 120_000),
    90_000,
  );
  assert.equal(
    leaseExpiresAtForActor(snapshot, { kind: "user", id: "user:a" }, 10_000, 120_000),
    130_000,
  );
});

test("expiry stays inside Needs You and is inert before the real deadline", () => {
  const snapshot = {
    state: "working" as const,
    condition: "active" as const,
    version: 2,
    activeActorKind: "chosen_ai" as const,
    activeActorId: "ai:a",
    leaseExpiresAt: 80_000,
    handoffExpiresAt: 90_000,
    retryCount: 0,
    maxRetries: 3,
  };
  assert.equal(queueExpiryTransition(snapshot, 79_999), null);
  assert.deepEqual(queueExpiryTransition(snapshot, 80_000), {
    expiresAt: 80_000,
    state: "needs_you",
    condition: "expired",
    requiredAction: "Reconnect or choose an AI for this directive, then return it to Waiting for your AI.",
  });
});

test("failure stays inside the four-state model", () => {
  const snapshot = { state: "working" as const, condition: "active" as const, version: 1, retryCount: 0, maxRetries: 1 };
  assert.deepEqual(nextStateForFailure(snapshot, true), { state: "waiting_for_your_ai", condition: "retry_scheduled" });
  assert.deepEqual(nextStateForFailure({ ...snapshot, retryCount: 1 }, true), { state: "needs_you", condition: "failed" });
  assert.deepEqual(nextStateForFailure(snapshot, false), { state: "needs_you", condition: "failed" });
});

test("agent surface is narrow and requires per-operation scope", () => {
  assertNoBroadQueueAgentTools();
  assert.deepEqual(
    QUEUE_AGENT_TOOLS.map((tool) => tool.name),
    ["list_queue_items", "get_queue_item", "claim_queue_item", "checkpoint_queue_item", "request_user_action", "complete_queue_item", "report_queue_failure"],
  );
  const principal = { ownerId: "user:a", actorId: "ai:a", actorKind: "chosen_ai" as const, scopes: ["queue:read"], credentialId: "key:a" };
  assert.doesNotThrow(() => authorizeQueueAgentTool(principal, "list_queue_items"));
  assert.throws(() => authorizeQueueAgentTool(principal, "claim_queue_item"), /queue:claim/);
});

test("directive summary is derived without adding a required field", () => {
  assert.equal(summarizeDirective("  Find   the household. "), "Find the household.");
});
