export const QUEUE_STATES = [
  "needs_you",
  "working",
  "waiting_for_your_ai",
  "done",
] as const;

export type QueueState = (typeof QUEUE_STATES)[number];

export const QUEUE_STATE_LABELS: Record<QueueState, string> = {
  needs_you: "Needs You",
  working: "Working",
  waiting_for_your_ai: "Waiting for your AI",
  done: "Done",
};

export const QUEUE_CONDITIONS = [
  "ready",
  "active",
  "awaiting_user",
  "retry_scheduled",
  "failed",
  "disconnected",
  "expired",
  "canceled",
  "completed",
] as const;

export type QueueCondition = (typeof QUEUE_CONDITIONS)[number];
export type QueuePriority = "high" | "normal" | "low";
export type QueueActorKind = "user" | "chosen_ai" | "first_party_ai" | "system";
export type QueueOperation = "queue:read" | "queue:claim" | "queue:update" | "queue:complete";

export const QUEUE_SERVICE_STATES = [
  "loading",
  "empty",
  "ready",
  "permission_denied",
  "error",
  "retry",
  "disconnected_ai",
  "expired_handoff",
] as const;

export const QUEUE_LIMITS = {
  directive: 4_000,
  summary: 180,
  requestedOutcome: 1_000,
  requiredAction: 1_000,
  nextStep: 1_000,
  resultSummary: 4_000,
  activityPage: 100,
  itemPage: 50,
  contextRefs: 20,
  resultRefs: 20,
  maxRetries: 10,
  leaseMinMs: 60_000,
  leaseMaxMs: 30 * 60_000,
} as const;

export type QueueSnapshot = {
  state: QueueState;
  condition: QueueCondition;
  version: number;
  activeActorKind?: QueueActorKind;
  activeActorId?: string;
  leaseExpiresAt?: number;
  handoffExpiresAt?: number;
  nextRetryAt?: number;
  retryCount: number;
  maxRetries: number;
};

export type QueueCommand =
  | "assign"
  | "claim"
  | "checkpoint"
  | "request_user_action"
  | "resume"
  | "release"
  | "fail"
  | "complete"
  | "cancel"
  | "expire"
  | "reopen";

export class QueueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueConflictError";
  }
}

export function normalizeRequiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return normalized;
}

export function normalizeOptionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return normalized;
}

export function summarizeDirective(directive: string): string {
  const normalized = normalizeRequiredText(directive, "Directive", QUEUE_LIMITS.directive);
  return normalized.length <= QUEUE_LIMITS.summary
    ? normalized
    : `${normalized.slice(0, QUEUE_LIMITS.summary - 1).trimEnd()}…`;
}

export function assertVersion(snapshot: QueueSnapshot, expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("expectedVersion must be a positive integer");
  }
  if (snapshot.version !== expectedVersion) {
    throw new QueueConflictError(
      `Queue item changed from version ${expectedVersion} to ${snapshot.version}; reload before retrying`,
    );
  }
}

export function assertLeaseDuration(leaseMs: number): void {
  if (!Number.isInteger(leaseMs) || leaseMs < QUEUE_LIMITS.leaseMinMs || leaseMs > QUEUE_LIMITS.leaseMaxMs) {
    throw new Error(
      `leaseMs must be between ${QUEUE_LIMITS.leaseMinMs} and ${QUEUE_LIMITS.leaseMaxMs}`,
    );
  }
}

export function assertActiveActor(
  snapshot: QueueSnapshot,
  actor: { kind: QueueActorKind; id: string },
  now: number,
): void {
  if (snapshot.state !== "working") throw new Error("Queue item is not Working");
  if (snapshot.activeActorKind !== actor.kind || snapshot.activeActorId !== actor.id) {
    throw new Error("Queue item is claimed by another actor");
  }
  if (!snapshot.leaseExpiresAt || snapshot.leaseExpiresAt <= now) {
    throw new QueueConflictError("Queue claim expired; reclaim the item before continuing");
  }
}

export function assertCommandAllowed(
  command: QueueCommand,
  snapshot: QueueSnapshot,
  actor: { kind: QueueActorKind; id: string },
  now: number,
): void {
  switch (command) {
    case "assign":
      if (actor.kind !== "user") throw new Error("Only the user can assign Queue work");
      if (snapshot.state === "done") throw new Error("Reopen Done work before assigning it");
      return;
    case "claim":
      if (snapshot.handoffExpiresAt !== undefined && snapshot.handoffExpiresAt <= now) {
        throw new QueueConflictError("Queue handoff expired; the user must reconnect or reassign it");
      }
      if (
        snapshot.condition === "retry_scheduled" &&
        snapshot.nextRetryAt !== undefined &&
        snapshot.nextRetryAt > now
      ) {
        throw new QueueConflictError("Queue retry is not ready yet");
      }
      if (snapshot.state === "waiting_for_your_ai") return;
      if (snapshot.state === "working" && (snapshot.leaseExpiresAt ?? 0) <= now) return;
      throw new Error("Only waiting work or a Working item with an expired claim can be claimed");
    case "checkpoint":
    case "request_user_action":
    case "release":
    case "fail":
    case "complete":
      assertActiveActor(snapshot, actor, now);
      return;
    case "resume":
      if (actor.kind !== "user") throw new Error("Only the user can answer and resume Needs You work");
      if (snapshot.state !== "needs_you") throw new Error("Only Needs You work can be resumed");
      return;
    case "cancel":
      if (actor.kind !== "user") throw new Error("Only the user can cancel Queue work");
      if (snapshot.state === "done") throw new Error("Done work is already closed");
      return;
    case "expire":
      if (actor.kind !== "system") throw new Error("Only the system can expire a handoff");
      if (snapshot.state === "done" || snapshot.state === "needs_you") {
        throw new Error("Only Waiting or Working handoffs can expire");
      }
      return;
    case "reopen":
      if (actor.kind !== "user") throw new Error("Only the user can reopen Queue work");
      if (snapshot.state !== "done") throw new Error("Only Done work can be reopened");
      return;
  }
}

export function nextStateForFailure(snapshot: QueueSnapshot, retryable: boolean): {
  state: QueueState;
  condition: QueueCondition;
} {
  const nextRetryCount = snapshot.retryCount + 1;
  if (retryable && nextRetryCount <= snapshot.maxRetries) {
    return { state: "waiting_for_your_ai", condition: "retry_scheduled" };
  }
  return { state: "needs_you", condition: "failed" };
}

export function handoffLine(input: {
  state: QueueState;
  leftForActorId?: string;
  submittedAt: number;
  activeActorId?: string;
  pickedUpAt?: number;
}): string {
  if (input.state === "working" && input.activeActorId) {
    return `${input.activeActorId} picked this up${input.pickedUpAt ? ` at ${new Date(input.pickedUpAt).toISOString()}` : ""}.`;
  }
  if (input.state === "waiting_for_your_ai") {
    return `Left for ${input.leftForActorId || "your AI"} at ${new Date(input.submittedAt).toISOString()}; nothing is running.`;
  }
  if (input.state === "needs_you") return "Work is paused for your answer or action.";
  return "The result is recorded and this handoff is complete.";
}

export function queueSurfaceState(_state: QueueState, condition: QueueCondition):
  (typeof QUEUE_SERVICE_STATES)[number] {
  if (condition === "retry_scheduled") return "retry";
  if (condition === "disconnected") return "disconnected_ai";
  if (condition === "expired") return "expired_handoff";
  return "ready";
}
