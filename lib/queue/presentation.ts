import {
  QUEUE_STATE_LABELS,
  type QueueActorKind,
  type QueueCondition,
  type QueuePriority,
  type QueueState,
} from "./contract";

export type QueueContextKind =
  | "person"
  | "relationship"
  | "place"
  | "event"
  | "source"
  | "citation"
  | "media"
  | "context_item"
  | "research_task"
  | "research_check"
  | "story"
  | "import_run"
  | "provisional_relative";

export type QueueItemRecord = {
  _id: string;
  directive: string;
  summary: string;
  requestedOutcome?: string;
  state: QueueState;
  condition: QueueCondition;
  priority: QueuePriority;
  priorityReason?: string;
  context: Array<{ kind: QueueContextKind; refId: string }>;
  authority: {
    actorKind: QueueActorKind;
    actorId: string;
    operations: string[];
    scopeNote: string;
  };
  leftForActorKind: "user" | "chosen_ai";
  leftForActorId?: string;
  activeActorKind?: QueueActorKind;
  activeActorId?: string;
  leaseExpiresAt?: number;
  handoffExpiresAt?: number;
  requiredAction?: string;
  nextStep?: string;
  resultSummary?: string;
  resultRefs?: string[];
  failureCode?: string;
  failureSummary?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number;
  canceledReason?: string;
  submittedAt: number;
  pickedUpAt?: number;
  completedAt?: number;
  canceledAt?: number;
  lastUserResponse?: string;
  lastReopenReason?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type QueueActivityRecord = {
  _id: string;
  eventType: string;
  fromState?: string;
  toState: string;
  actorKind: QueueActorKind;
  actorId: string;
  summary: string;
  detail?: string;
  itemVersion: number;
  createdAt: number;
};

export type QueueResultLink = {
  href: string;
  label: string;
};

const QUEUE_RESULT_ROUTES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^\/app\/people\/[A-Za-z0-9_-]+$/, label: "Open person workspace" },
  { pattern: /^\/app\/stories\/[A-Za-z0-9_-]+$/, label: "Open story draft" },
  { pattern: /^\/app\/research$/, label: "Open research findings" },
  { pattern: /^\/app\/people$/, label: "Open people" },
  { pattern: /^\/app\/stories$/, label: "Open Story Studio" },
];

/**
 * Queue result references are written by a chosen AI and therefore remain
 * untrusted text. Only known signed-in product routes become links; external,
 * malformed, and legacy opaque references stay in the durable ledger without
 * becoming navigation targets.
 */
export function queueResultLink(ref: string): QueueResultLink | null {
  const normalized = ref.trim();
  const route = QUEUE_RESULT_ROUTES.find(({ pattern }) => pattern.test(normalized));
  return route ? { href: normalized, label: route.label } : null;
}

export const QUEUE_STATE_PRESENTATION: Record<
  QueueState,
  { label: string; short: string; accent: string; wash: string }
> = {
  needs_you: {
    label: QUEUE_STATE_LABELS.needs_you,
    short: "Paused for one answer or action from you.",
    accent: "#9f5a2d",
    wash: "#f6e8da",
  },
  working: {
    label: QUEUE_STATE_LABELS.working,
    short: "Actively claimed by you or an authorized AI.",
    accent: "#245a43",
    wash: "#e5eee8",
  },
  waiting_for_your_ai: {
    label: QUEUE_STATE_LABELS.waiting_for_your_ai,
    short: "Saved for continuity; nothing is running.",
    accent: "#98702b",
    wash: "#f2ead5",
  },
  done: {
    label: QUEUE_STATE_LABELS.done,
    short: "Result or cancellation recorded with its trail.",
    accent: "#4d5f68",
    wash: "#e8ecec",
  },
};

export function queueConditionLabel(condition: QueueCondition): string {
  const labels: Record<QueueCondition, string> = {
    ready: "Ready for pickup",
    active: "Active claim",
    awaiting_user: "Awaiting your answer",
    retry_scheduled: "Retry scheduled",
    failed: "Stopped after a failure",
    disconnected: "AI not connected",
    expired: "Handoff expired",
    canceled: "Canceled",
    completed: "Completed",
  };
  return labels[condition];
}

export function queueHandoffCopy(item: QueueItemRecord): string {
  if (item.state === "working") {
    return item.activeActorKind === "user"
      ? "You picked this up. The claim is time-limited."
      : "Your authorized AI picked this up under a time-limited claim.";
  }
  if (item.state === "waiting_for_your_ai") {
    if (item.condition === "retry_scheduled") {
      return "A retry is scheduled, but nothing is running between attempts.";
    }
    if (item.condition === "disconnected") {
      return "Saved for your AI, but no AI is connected through Assist With Family History. Nothing is running.";
    }
    return "Left for your AI. Nothing is running until an authorized AI claims it.";
  }
  if (item.state === "needs_you") {
    return "The handoff is paused for your answer or action.";
  }
  return item.condition === "canceled"
    ? "Canceled with its reason and activity trail retained."
    : "The result and activity trail are recorded.";
}

export function queueFocusLabel(item: QueueItemRecord): string {
  if (item.state === "needs_you") return "What needs you";
  if (item.state === "working") return "Current step";
  if (item.state === "waiting_for_your_ai") return "Handoff status";
  return "Recorded result";
}

export function queueFocusText(item: QueueItemRecord): string {
  if (item.state === "needs_you") {
    return item.requiredAction || item.failureSummary || "Choose how this research should continue.";
  }
  if (item.state === "working") {
    return item.nextStep || "The current actor has not recorded a next step yet.";
  }
  if (item.state === "waiting_for_your_ai") return queueHandoffCopy(item);
  return item.resultSummary || item.canceledReason || "This handoff is closed.";
}

export function queueActorLabel(kind: QueueActorKind): string {
  if (kind === "user") return "You";
  if (kind === "chosen_ai") return "Your AI";
  if (kind === "first_party_ai") return "Family History AI";
  return "Queue system";
}

export function queueContextGroup(kind: QueueContextKind): string {
  if (["person", "relationship", "place", "event"].includes(kind)) return "Research subject";
  if (["source", "citation", "media", "context_item"].includes(kind)) return "Evidence";
  return "Work thread";
}

export function queueContextLabel(kind: QueueContextKind): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function canPersonClaim(item: QueueItemRecord, now = Date.now()): boolean {
  if (item.state !== "waiting_for_your_ai") return false;
  return item.condition !== "retry_scheduled" || item.nextRetryAt === undefined || item.nextRetryAt <= now;
}

export function canPersonContinue(item: QueueItemRecord): boolean {
  return item.state === "working" && item.activeActorKind === "user";
}

export function formatQueueDate(value?: number): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
