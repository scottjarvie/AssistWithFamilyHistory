import {normalizeQueueFilters,queueMatchesView,startOfQueueWeekUTC} from "../lib/queue/viewFilters";
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
import {
  QUEUE_STATE_PRESENTATION,
  canPersonClaim,
  canPersonContinue,
  queueFocusLabel,
  queueHandoffCopy,
  type QueueItemRecord,
} from "../lib/queue/presentation";

test("Queue exposes the three Core lifecycle states with a legacy display label", () => {
  assert.deepEqual(QUEUE_STATES, ["waiting_for_your_ai", "working", "done"]);
  assert.deepEqual(Object.values(QUEUE_STATE_LABELS), ["Needs your input", "AI working", "Waiting on AI", "Answered"]);
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

test("expiry raises input without changing the underlying state and is inert before the real deadline", () => {
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
    state: "working",
    condition: "expired",
    requiredAction: "Reconnect or choose an AI for this directive, then return it to Waiting for your AI.",
  });
});

test("failure preserves state or releases a scheduled retry", () => {
  const snapshot = { state: "working" as const, condition: "active" as const, version: 1, retryCount: 0, maxRetries: 1 };
  assert.deepEqual(nextStateForFailure(snapshot, true), { state: "waiting_for_your_ai", condition: "retry_scheduled" });
  assert.deepEqual(nextStateForFailure({ ...snapshot, retryCount: 1 }, true), { state: "working", condition: "failed" });
  assert.deepEqual(nextStateForFailure(snapshot, false), { state: "working", condition: "failed" });
});

test("agent surface is narrow and requires per-operation scope", () => {
  assertNoBroadQueueAgentTools();
  assert.deepEqual(
    QUEUE_AGENT_TOOLS.map((tool) => tool.name),
    ["archive_queue_item", "add_queue_item", "withdraw_suggestion", "list_queue_items", "get_queue_item", "claim_queue_item", "checkpoint_queue_item", "request_user_action", "complete_queue_item", "report_queue_failure"],
  );
  const principal = { ownerId: "user:a", actorId: "ai:a", actorKind: "chosen_ai" as const, scopes: ["queue:read"], credentialId: "key:a" };
  assert.doesNotThrow(() => authorizeQueueAgentTool(principal, "list_queue_items"));
  assert.throws(() => authorizeQueueAgentTool(principal, "claim_queue_item"), /queue:claim/);
});

test("directive summary is derived without adding a required field", () => {
  assert.equal(summarizeDirective("  Find   the household. "), "Find the household.");
});

const presentationFixture = (partial: Partial<QueueItemRecord>): QueueItemRecord => ({
  _id: "queue:test",
  directive: "Review the household evidence.",
  summary: "Review the household evidence.",
  state: "waiting_for_your_ai",
  condition: "disconnected",
  priority: "normal",
  context: [],
  authority: {
    actorKind: "chosen_ai",
    actorId: "unassigned",
    operations: ["queue:read"],
    scopeNote: "Queue continuity only",
  },
  leftForActorKind: "chosen_ai",
  retryCount: 0,
  maxRetries: 3,
  submittedAt: 1,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  ...partial,
});

test("Queue presentation retains three lifecycle states and a legacy-only mapping", () => {
  assert.deepEqual(Object.keys(QUEUE_STATE_PRESENTATION).filter(state=>state!=="needs_you").sort(), [...QUEUE_STATES].sort());
});

test("disconnected Waiting copy never implies autonomous work", () => {
  assert.match(queueHandoffCopy(presentationFixture({})), /nothing is running/i);
  assert.match(queueHandoffCopy(presentationFixture({})), /no AI is connected/i);
});

test("person-side controls respect the active actor boundary", () => {
  assert.equal(canPersonClaim(presentationFixture({})), true);
  assert.equal(
    canPersonClaim(presentationFixture({ condition: "retry_scheduled", nextRetryAt: 2_000 }), 1_000),
    false,
  );
  assert.equal(
    canPersonClaim(presentationFixture({ condition: "retry_scheduled", nextRetryAt: 2_000 }), 2_000),
    true,
  );
  assert.equal(
    canPersonContinue(presentationFixture({ state: "working", condition: "active", activeActorKind: "chosen_ai" })),
    false,
  );
  assert.equal(
    canPersonContinue(presentationFixture({ state: "working", condition: "active", activeActorKind: "user" })),
    true,
  );
  assert.equal(queueFocusLabel(presentationFixture({ state: "needs_you", condition: "awaiting_user" })), "What needs you");
});


test("Queue AI working view never attributes a person's claim or stale waiting actor to an AI",()=>{
 const filters=normalizeQueueFilters({state:"working",actor:"ai"}),now=Date.parse("2026-11-05T12:00:00Z");
 assert.equal(queueMatchesView(presentationFixture({state:"working",condition:"active",activeActorKind:"user"}),filters,now),false);
 assert.equal(queueMatchesView(presentationFixture({state:"working",condition:"active",activeActorKind:"chosen_ai"}),filters,now),true);
 assert.equal(queueMatchesView(presentationFixture({state:"working",condition:"active",activeActorKind:"first_party_ai"}),filters,now),true);
 assert.equal(queueMatchesView(presentationFixture({state:"waiting_for_your_ai",activeActorKind:"chosen_ai"}),filters,now),false);
});
test("Queue closed-this-week uses recorded closing dates and UTC boundaries rather than a recent edit",()=>{
 const now=Date.parse("2026-11-02T00:00:00Z"),filters=normalizeQueueFilters({view:"done-week"});
 assert.equal(startOfQueueWeekUTC(now-1),Date.parse("2026-10-26T00:00:00Z"));
 assert.equal(startOfQueueWeekUTC(now),now);
 assert.equal(queueMatchesView(presentationFixture({state:"done",condition:"completed",completedAt:now-1,updatedAt:now}),filters,now),false);
 assert.equal(queueMatchesView(presentationFixture({state:"done",condition:"completed",completedAt:undefined,canceledAt:undefined,updatedAt:now}),filters,now),false);
 assert.equal(queueMatchesView(presentationFixture({state:"done",condition:"canceled",completedAt:undefined,canceledAt:now}),filters,now),true);
 assert.equal(queueMatchesView(presentationFixture({state:"done",condition:"completed",completedAt:now+7*86400000}),filters,now),false);
});


test("Quiet Queue refresh retains earlier activity without duplicate IDs or old event details",async()=>{
 const {mergeQueueActivity}=await import("../lib/queue/presentation");
 type Activity=Parameters<typeof mergeQueueActivity>[0][number];
 const old=[{_id:"old",summary:"Earlier stored event"},{_id:"latest",summary:"Previous detail"}] as Activity[];
 const fresh=[{_id:"latest",summary:"Corrected stored detail"},{_id:"new",summary:"New checkpoint"}] as Activity[];
 const merged=mergeQueueActivity(old,fresh);
 assert.equal(merged.length,3);assert.equal(merged.find(row=>row._id==="latest")?.summary,"Corrected stored detail");assert.equal(old[1].summary,"Previous detail");assert.equal(merged[0]._id,"old");
});

test("A refreshed Queue state hides stale person commands while preserving the applicable ones",async()=>{
 const {canPersonRunQueueCommand}=await import("../lib/queue/presentation");
 const working=presentationFixture({state:"working",condition:"active",activeActorKind:"user"});
 assert.equal(canPersonRunQueueCommand(working,"checkpoint"),true);assert.equal(canPersonRunQueueCommand({...working,activeActorKind:"chosen_ai"},"checkpoint"),false);
 const closed=presentationFixture({state:"done",condition:"completed"});
 assert.equal(canPersonRunQueueCommand(closed,"checkpoint"),false);assert.equal(canPersonRunQueueCommand(closed,"cancel"),false);assert.equal(canPersonRunQueueCommand(closed,"reopen"),true);
 assert.equal(canPersonRunQueueCommand(presentationFixture({state:"needs_you",condition:"awaiting_user"}),"resume"),true);
});
