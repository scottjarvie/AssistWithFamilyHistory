/**
 * Research-task status lifecycle.
 *
 * The `researchTasks.status` enum existed in the schema but NO mutation ever
 * transitioned a task off "todo" — a dead state machine. This pure module
 * defines the legal transitions so convex/researchTasks.ts can enforce them and
 * so the rule is unit-testable without a Convex runtime (the same pattern used
 * by other pure policy helpers in this repository).
 */
export type ResearchTaskStatus = "todo" | "in_progress" | "blocked" | "done";

const TRANSITIONS: Record<ResearchTaskStatus, readonly ResearchTaskStatus[]> = {
  todo: ["in_progress", "blocked", "done"],
  in_progress: ["done", "blocked", "todo"], // -> todo = release back to the queue
  blocked: ["in_progress", "todo", "done"], // unblock / release / resolve
  done: ["in_progress", "todo"], // reopen
};

/** Statuses a task in `from` may legally transition into. */
export function allowedNextStatuses(from: ResearchTaskStatus): readonly ResearchTaskStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** True iff `from -> to` is a legal transition (self-transitions are not). */
export function isValidTaskTransition(from: ResearchTaskStatus, to: ResearchTaskStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Minimum notes-summary length required to mark a task done. Mirrors the
 * agent-quality-gate ≥20-char floor so a "done" task always carries a real
 * summary of what was found.
 */
export const TASK_DONE_NOTES_MIN = 20;
