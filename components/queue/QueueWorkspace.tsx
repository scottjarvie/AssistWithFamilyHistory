"use client";

import {
  Archive,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileClock,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  QUEUE_STATE_PRESENTATION,
  canPersonClaim,
  canPersonContinue,
  formatQueueDate,
  queueActorLabel,
  queueConditionLabel,
  queueContextGroup,
  queueContextLabel,
  queueFocusLabel,
  queueFocusText,
  queueHandoffCopy,
  type QueueActivityRecord,
  type QueueItemRecord,
} from "@/lib/queue/presentation";
import { QUEUE_STATES, type QueuePriority, type QueueState } from "@/lib/queue/contract";

type QueueListResponse = {
  success: boolean;
  surfaceState: string;
  page: QueueItemRecord[];
  isDone: boolean;
  continueCursor: string;
  error?: string;
  details?: string;
};

type QueueDetailResponse = {
  success: boolean;
  surfaceState: string;
  item: QueueItemRecord;
  activity: {
    page: QueueActivityRecord[];
    isDone: boolean;
    continueCursor: string;
  };
  error?: string;
  details?: string;
};

type QueueCommand = "claim" | "checkpoint" | "resume" | "complete" | "cancel" | "reopen";

type QueueProblem = {
  title: string;
  detail: string;
  surfaceState: string;
};

const stateOrder: Array<"all" | QueueState> = ["all", ...QUEUE_STATES];

const stateIcons = {
  needs_you: CircleAlert,
  working: FileClock,
  waiting_for_your_ai: Clock3,
  done: Check,
} as const;

function problemFromResponse(response: Response, payload: Partial<QueueListResponse>): QueueProblem {
  const surfaceState =
    response.status === 401 || response.status === 403
      ? "permission_denied"
      : response.status === 409
        ? "retry"
        : payload.surfaceState || "error";
  return {
    title: payload.error || (surfaceState === "permission_denied" ? "Queue access denied" : "Queue unavailable"),
    detail:
      payload.details ||
      (surfaceState === "permission_denied"
        ? "Sign in with the vault owner account and try again."
        : "The Queue could not complete this request. Refresh and try again."),
    surfaceState,
  };
}

function StateStamp({ item, compact = false }: { item: QueueItemRecord; compact?: boolean }) {
  const presentation = QUEUE_STATE_PRESENTATION[item.state];
  const Icon = stateIcons[item.state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
        compact && "px-2 py-0.5 text-[9px]",
      )}
      style={{ borderColor: `${presentation.accent}55`, color: presentation.accent, background: presentation.wash }}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

function QueueLoading() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)]" aria-label="Loading Queue">
      <div className="space-y-3">
        {[0, 1, 2].map((value) => (
          <div key={value} className="h-36 animate-pulse rounded-2xl border border-[#d7cfbf] bg-[#fffaf2]/70" />
        ))}
      </div>
      <div className="h-[34rem] animate-pulse rounded-3xl border border-[#d7cfbf] bg-[#fffaf2]/70" />
    </div>
  );
}

function QueueProblemCard({ problem, onRetry }: { problem: QueueProblem; onRetry: () => void }) {
  const permissionDenied = problem.surfaceState === "permission_denied";
  return (
    <section className="queue-paper mx-auto max-w-3xl rounded-3xl border border-[#cdbfa8] px-6 py-12 text-center sm:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#9f5a2d]/10 text-[#9f5a2d]">
        {permissionDenied ? <ShieldCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      </div>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#98702b]">
        {permissionDenied ? "Private vault boundary" : "Continuity interrupted"}
      </p>
      <h2 className="mt-2 text-3xl font-semibold text-[#24312c]">{problem.title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#5f665f]">{problem.detail}</p>
      <Button onClick={onRetry} className="mt-6 bg-[#245a43] text-[#fffdf7] hover:bg-[#1c4936]">
        <RefreshCw aria-hidden="true" /> Try again
      </Button>
    </section>
  );
}

function NewDirectiveForm({ onCreated, onClose }: { onCreated: (item: QueueItemRecord) => void; onClose: () => void }) {
  const [directive, setDirective] = useState("");
  const [outcome, setOutcome] = useState("");
  const [priority, setPriority] = useState<QueuePriority>("normal");
  const [priorityReason, setPriorityReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const response = await fetch("/api/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            directive,
            requestedOutcome: outcome || undefined,
            priority,
            priorityReason: priority === "high" ? priorityReason : undefined,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const payload = (await response.json()) as { success?: boolean; item?: QueueItemRecord; error?: string; details?: string };
        if (!response.ok || !payload.item) throw new Error(payload.details || payload.error || "Could not save the directive");
        toast.success("Directive saved to your Queue");
        onCreated(payload.item);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the directive");
      }
    });
  }

  return (
    <section className="queue-paper animate-rise-in rounded-3xl border border-[#bda984] shadow-[0_24px_60px_-45px_#24312c]" aria-labelledby="new-directive-title">
      <div className="flex items-start justify-between gap-5 border-b border-[#d7cfbf] px-5 py-5 sm:px-7">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#98702b]">New continuity record</p>
          <h2 id="new-directive-title" className="mt-1 text-3xl font-semibold text-[#24312c]">What should stay in the thread?</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close new directive form">
          <X aria-hidden="true" />
        </Button>
      </div>
      <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-7">
        <div>
          <label htmlFor="queue-directive" className="text-sm font-semibold text-[#24312c]">Directive</label>
          <p className="mt-1 text-xs text-[#687169]">Write it in your own words. This is the durable instruction.</p>
          <Textarea
            id="queue-directive"
            value={directive}
            onChange={(event) => setDirective(event.target.value)}
            required
            maxLength={4000}
            rows={5}
            placeholder="Compare the two census households and tell me which evidence supports the relationship."
            className="mt-2 min-h-32 resize-y border-[#cfc3af] bg-[#fffdf7] text-base leading-7"
          />
        </div>
        <div>
          <label htmlFor="queue-outcome" className="text-sm font-semibold text-[#24312c]">A useful result <span className="font-normal text-[#777b74]">(optional)</span></label>
          <Input
            id="queue-outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            maxLength={1000}
            placeholder="A short evidence comparison with remaining uncertainty."
            className="mt-2 border-[#cfc3af] bg-[#fffdf7]"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="queue-priority" className="text-sm font-semibold text-[#24312c]">Priority</label>
            <select
              id="queue-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as QueuePriority)}
              className="mt-2 h-10 w-full rounded-md border border-[#cfc3af] bg-[#fffdf7] px-3 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
          {priority === "high" ? (
            <div>
              <label htmlFor="queue-priority-reason" className="text-sm font-semibold text-[#24312c]">Why high priority?</label>
              <Input
                id="queue-priority-reason"
                value={priorityReason}
                onChange={(event) => setPriorityReason(event.target.value)}
                required
                maxLength={500}
                className="mt-2 border-[#cfc3af] bg-[#fffdf7]"
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 border-t border-[#d7cfbf] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-xl gap-3 text-sm leading-6 text-[#5f665f]">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-[#98702b]" aria-hidden="true" />
            <p>No AI is connected through this product yet. The directive will be saved as <strong>Waiting for your AI</strong>, and nothing will run until you pick it up yourself.</p>
          </div>
          <Button type="submit" disabled={isPending || !directive.trim()} className="shrink-0 bg-[#245a43] text-[#fffdf7] hover:bg-[#1c4936]">
            {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
            Save directive
          </Button>
        </div>
      </form>
    </section>
  );
}

function QueueItemCard({ item, selected, onSelect }: { item: QueueItemRecord; selected: boolean; onSelect: () => void }) {
  const presentation = QUEUE_STATE_PRESENTATION[item.state];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "queue-paper group w-full rounded-2xl border px-4 py-4 text-left transition-[border-color,box-shadow,transform] focus-visible:ring-2 focus-visible:ring-[#245a43]",
        selected
          ? "border-[#98702b] shadow-[0_16px_35px_-28px_#24312c]"
          : "border-[#d7cfbf] hover:-translate-y-0.5 hover:border-[#bda984]",
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: presentation.accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <StateStamp item={item} compact />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#7d7b70]">{item.priority}</span>
      </div>
      <p className="mt-3 line-clamp-2 font-semibold leading-6 text-[#24312c]">{item.summary}</p>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#687169]">{queueFocusText(item)}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#ded5c7] pt-3 text-xs text-[#777b74]">
        <span>Updated {formatQueueDate(item.updatedAt)}</span>
        <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", selected && "translate-x-0.5")} aria-hidden="true" />
      </div>
    </button>
  );
}

function InlineAction({
  item,
  command,
  label,
  prompt,
  placeholder,
  submitLabel,
  onDone,
  onCancel,
}: {
  item: QueueItemRecord;
  command: QueueCommand;
  label: string;
  prompt: string;
  placeholder: string;
  submitLabel: string;
  onDone: (item: QueueItemRecord) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const fields: Record<QueueCommand, Record<string, unknown>> = {
        claim: { leaseMs: 30 * 60_000, nextStep: value },
        checkpoint: { leaseMs: 30 * 60_000, nextStep: value },
        resume: { answerSummary: value },
        complete: { resultSummary: value },
        cancel: { reason: value },
        reopen: { reason: value },
      };
      try {
        const response = await fetch(`/api/queue/${item._id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command,
            ...fields[command],
            expectedVersion: item.version,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const payload = (await response.json()) as { item?: QueueItemRecord; error?: string; details?: string };
        if (!response.ok || !payload.item) {
          if (response.status === 409) throw new Error("This item changed elsewhere. Reload it before trying again.");
          throw new Error(payload.details || payload.error || "Queue command failed");
        }
        toast.success(`${label} recorded`);
        onDone(payload.item);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Queue command failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#cdbfa8] bg-[#f7f3e8]/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#24312c]">{label}</p>
          <p className="mt-1 text-xs leading-5 text-[#687169]">{prompt}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label={`Close ${label}`}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        rows={3}
        maxLength={command === "complete" ? 4000 : 1000}
        placeholder={placeholder}
        className="mt-3 resize-y border-[#cfc3af] bg-[#fffdf7]"
      />
      <Button type="submit" disabled={isPending || !value.trim()} size="sm" className="mt-3 bg-[#245a43] text-white hover:bg-[#1c4936]">
        {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  );
}

function QueueDetail({
  item,
  activity,
  activityDone,
  activityLoading,
  onLoadMoreActivity,
  onChanged,
  onDeleted,
}: {
  item: QueueItemRecord;
  activity: QueueActivityRecord[];
  activityDone: boolean;
  activityLoading: boolean;
  onLoadMoreActivity: () => void;
  onChanged: (item: QueueItemRecord) => void;
  onDeleted: () => void;
}) {
  const [action, setAction] = useState<QueueCommand | "delete" | null>(null);
  const [isDeleting, startDeleting] = useTransition();
  const groupedContext = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const ref of item.context) {
      const group = queueContextGroup(ref.kind);
      groups.set(group, [...(groups.get(group) || []), queueContextLabel(ref.kind)]);
    }
    return [...groups.entries()];
  }, [item.context]);

  useEffect(() => setAction(null), [item._id, item.version]);

  function deleteItem() {
    startDeleting(async () => {
      try {
        const response = await fetch(`/api/queue/${item._id}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation: "delete_queue_item_and_history" }),
        });
        const payload = (await response.json()) as { success?: boolean; error?: string; details?: string };
        if (!response.ok) throw new Error(payload.details || payload.error || "Could not delete Queue item");
        toast.success("Queue item and activity deleted");
        onDeleted();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete Queue item");
      }
    });
  }

  return (
    <article className="queue-paper min-w-0 rounded-3xl border border-[#cdbfa8] shadow-[0_25px_70px_-50px_#24312c]" aria-labelledby="queue-detail-title">
      <header className="border-b border-[#d7cfbf] px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center gap-2">
          <StateStamp item={item} />
          <Badge variant="outline" className="border-[#cdbfa8] bg-[#fffdf7]/70 font-mono text-[10px] uppercase tracking-[0.12em] text-[#686b65]">
            {queueConditionLabel(item.condition)}
          </Badge>
          <Badge variant="outline" className="border-[#cdbfa8] bg-[#fffdf7]/70 font-mono text-[10px] uppercase tracking-[0.12em] text-[#686b65]">
            {item.priority} priority
          </Badge>
        </div>
        <h2 id="queue-detail-title" className="mt-5 text-3xl font-semibold leading-tight text-[#24312c] sm:text-4xl">{item.summary}</h2>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#3f4b45]">{item.directive}</p>
        {item.requestedOutcome ? (
          <div className="mt-5 border-l-2 border-[#98702b] pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#98702b]">Useful result</p>
            <p className="mt-1 text-sm leading-6 text-[#4c554f]">{item.requestedOutcome}</p>
          </div>
        ) : null}
      </header>

      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 px-5 py-6 sm:px-8">
          <section className="rounded-2xl border border-[#cdbfa8] bg-[#f7f3e8]/72 p-5" aria-labelledby="queue-focus-heading">
            <p id="queue-focus-heading" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#98702b]">{queueFocusLabel(item)}</p>
            <p className="mt-2 text-lg font-semibold leading-7 text-[#24312c]">{queueFocusText(item)}</p>
            <p className="mt-3 flex gap-2 text-sm leading-6 text-[#606a62]">
              {item.state === "working" && item.activeActorKind === "user" ? <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Bot className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {queueHandoffCopy(item)}
            </p>
          </section>

          <div className="mt-5 flex flex-wrap gap-2">
            {canPersonClaim(item) ? (
              <Button onClick={() => setAction("claim")} className="bg-[#245a43] text-white hover:bg-[#1c4936]">
                <UserRound aria-hidden="true" /> Work on this myself
              </Button>
            ) : null}
            {item.state === "needs_you" ? (
              <Button onClick={() => setAction("resume")} className="bg-[#9f5a2d] text-white hover:bg-[#854824]">
                <ArrowRight aria-hidden="true" /> Answer and resume
              </Button>
            ) : null}
            {canPersonContinue(item) ? (
              <>
                <Button onClick={() => setAction("checkpoint")} variant="outline" className="border-[#9eb4a6] bg-[#eff5f0] text-[#245a43]">
                  <RefreshCw aria-hidden="true" /> Update next step
                </Button>
                <Button onClick={() => setAction("complete")} className="bg-[#245a43] text-white hover:bg-[#1c4936]">
                  <Check aria-hidden="true" /> Record result
                </Button>
              </>
            ) : null}
            {item.state === "done" ? (
              <Button onClick={() => setAction("reopen")} variant="outline" className="border-[#cdbfa8] bg-[#fffdf7]">
                <RotateCcw aria-hidden="true" /> Reopen
              </Button>
            ) : null}
            {item.state !== "done" ? (
              <Button onClick={() => setAction("cancel")} variant="ghost" className="text-[#7a4b38]">
                <X aria-hidden="true" /> Cancel handoff
              </Button>
            ) : null}
          </div>

          {action === "claim" ? (
            <div className="mt-4"><InlineAction item={item} command="claim" label="Work on this yourself" prompt="Record the first concrete step. Your claim lasts up to 30 minutes and can be renewed with a progress update." placeholder="Compare the household names and dates against the cited census page." submitLabel="Start working" onDone={onChanged} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "checkpoint" ? (
            <div className="mt-4"><InlineAction item={item} command="checkpoint" label="Update the current step" prompt="Leave a readable next step so the thread survives this session." placeholder="Check the neighboring census page for the missing surname variation." submitLabel="Save progress" onDone={onChanged} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "resume" ? (
            <div className="mt-4"><InlineAction item={item} command="resume" label="Answer and resume" prompt="Record the answer or decision that unblocks the handoff. It returns to Waiting for your AI; nothing runs automatically." placeholder="Use the 1880 household as the working family group, but retain the date conflict." submitLabel="Return to Waiting" onDone={onChanged} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "complete" ? (
            <div className="mt-4"><InlineAction item={item} command="complete" label="Record the result" prompt="Summarize what was learned, what evidence supports it, and any uncertainty that remains." placeholder="The two households are probably the same family because… Remaining uncertainty…" submitLabel="Mark Done" onDone={onChanged} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "cancel" ? (
            <div className="mt-4"><InlineAction item={item} command="cancel" label="Cancel this handoff" prompt="Canceling moves it to Done and keeps the reason and activity trail." placeholder="This question was superseded by the newer source comparison." submitLabel="Record cancellation" onDone={onChanged} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "reopen" ? (
            <div className="mt-4"><InlineAction item={item} command="reopen" label="Reopen this handoff" prompt="Explain why the result needs another pass. It returns to Waiting for your AI; nothing runs automatically." placeholder="A new source changes the household interpretation." submitLabel="Reopen in Waiting" onDone={onChanged} onCancel={() => setAction(null)} /></div>
          ) : null}

          <section className="mt-8" aria-labelledby="queue-activity-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#98702b]">Attributable history</p>
                <h3 id="queue-activity-heading" className="mt-1 text-2xl font-semibold text-[#24312c]">Activity trail</h3>
              </div>
              <History className="h-5 w-5 text-[#98702b]" aria-hidden="true" />
            </div>
            <ol className="mt-5 space-y-0">
              {activity.map((entry, index) => (
                <li key={entry._id} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-5">
                  {index < activity.length - 1 ? <span className="absolute left-[0.57rem] top-4 h-full w-px bg-[#d7cfbf]" aria-hidden="true" /> : null}
                  <span className="relative mt-1.5 h-3 w-3 rounded-full border-2 border-[#fffdf7] bg-[#98702b] shadow-[0_0_0_1px_#bda984]" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-[#24312c]">{entry.summary}</p>
                      <time className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#7d7b70]">{formatQueueDate(entry.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-xs text-[#687169]">{queueActorLabel(entry.actorKind)} · version {entry.itemVersion}</p>
                    {entry.detail ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#535f58]">{entry.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
            {!activityDone ? (
              <Button variant="outline" size="sm" onClick={onLoadMoreActivity} disabled={activityLoading} className="border-[#cdbfa8] bg-[#fffdf7]">
                {activityLoading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                Older activity
              </Button>
            ) : null}
          </section>
        </div>

        <aside className="min-w-0 border-t border-[#d7cfbf] bg-[#f7f3e8]/60 px-5 py-6 lg:border-l lg:border-t-0" aria-label="Queue item details">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#98702b]">Handoff ledger</p>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-xs text-[#777b74]">Submitted</dt><dd className="mt-1 font-medium text-[#3f4b45]">{formatQueueDate(item.submittedAt)}</dd></div>
            <div><dt className="text-xs text-[#777b74]">Last updated</dt><dd className="mt-1 font-medium text-[#3f4b45]">{formatQueueDate(item.updatedAt)}</dd></div>
            <div><dt className="text-xs text-[#777b74]">Current authority</dt><dd className="mt-1 font-medium text-[#3f4b45]">Queue continuity only</dd></div>
            {item.leaseExpiresAt ? <div><dt className="text-xs text-[#777b74]">Claim expires</dt><dd className="mt-1 font-medium text-[#3f4b45]">{formatQueueDate(item.leaseExpiresAt)}</dd></div> : null}
            {item.nextRetryAt ? <div><dt className="text-xs text-[#777b74]">Next retry</dt><dd className="mt-1 font-medium text-[#3f4b45]">{formatQueueDate(item.nextRetryAt)}</dd></div> : null}
          </dl>
          <div className="mt-7 border-t border-[#d7cfbf] pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#98702b]">Attached context</p>
            {groupedContext.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-[#687169]">Directive only. No person, evidence, or work-thread records are attached.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {groupedContext.map(([group, labels]) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-[#3f4b45]">{group}</p>
                    <p className="mt-1 text-xs leading-5 text-[#687169]">{labels.join(" · ")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-7 border-t border-[#d7cfbf] pt-5">
            {action === "delete" ? (
              <div className="rounded-xl border border-[#be4a2f]/35 bg-[#be4a2f]/5 p-3">
                <p className="text-xs leading-5 text-[#6d4033]">Permanently delete this directive, its activity, and command receipts?</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="destructive" onClick={deleteItem} disabled={isDeleting}>
                    {isDeleting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Keep it</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setAction("delete")} className="px-0 text-[#7a4b38] hover:bg-transparent hover:text-[#632f25]">
                <Trash2 aria-hidden="true" /> Delete item and activity
              </Button>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

export function QueueWorkspace() {
  const [items, setItems] = useState<QueueItemRecord[]>([]);
  const [stateFilter, setStateFilter] = useState<"all" | QueueState>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueDetailResponse | null>(null);
  const [problem, setProblem] = useState<QueueProblem | null>(null);
  const [detailProblem, setDetailProblem] = useState<QueueProblem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listDone, setListDone] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [searchText, setSearchText] = useState("");

  const loadItems = useCallback(async (append = false, cursor?: string | null) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    if (!append) setProblem(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (stateFilter !== "all") params.set("state", stateFilter);
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/queue?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as QueueListResponse;
      if (!response.ok || !payload.success) throw problemFromResponse(response, payload);
      setItems((current) => append ? [...current, ...payload.page] : payload.page);
      setListCursor(payload.continueCursor || null);
      setListDone(payload.isDone);
      if (!append) {
        setSelectedId((current) => payload.page.some((item) => item._id === current) ? current : payload.page[0]?._id || null);
      }
    } catch (error) {
      const nextProblem = error && typeof error === "object" && "surfaceState" in error
        ? error as QueueProblem
        : { title: "Queue unavailable", detail: "The Queue could not be loaded. Refresh and try again.", surfaceState: "error" };
      setProblem(nextProblem);
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [stateFilter]);

  const loadDetail = useCallback(async (id: string, appendActivity = false, cursor?: string | null) => {
    if (appendActivity) setActivityLoading(true);
    else {
      setDetailLoading(true);
      setDetailProblem(null);
    }
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/queue/${id}?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as QueueDetailResponse;
      if (!response.ok || !payload.success) throw problemFromResponse(response, payload);
      setDetailProblem(null);
      setDetail((current) => appendActivity && current
        ? { ...payload, activity: { ...payload.activity, page: [...current.activity.page, ...payload.activity.page] } }
        : payload);
    } catch (error) {
      const nextProblem = error && typeof error === "object" && "surfaceState" in error
        ? error as QueueProblem
        : { title: "Queue item unavailable", detail: "This item could not be loaded. Refresh the Queue and try again.", surfaceState: "error" };
      if (!appendActivity) setDetailProblem(nextProblem);
      toast.error(nextProblem.detail);
    } finally {
      setDetailLoading(false);
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const counts = useMemo(() => {
    const result: Record<QueueState, number> = { needs_you: 0, working: 0, waiting_for_your_ai: 0, done: 0 };
    for (const item of items) result[item.state] += 1;
    return result;
  }, [items]);

  const visibleItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.summary} ${item.directive} ${item.requestedOutcome || ""}`.toLowerCase().includes(query));
  }, [items, searchText]);

  function replaceItem(item: QueueItemRecord) {
    if (stateFilter !== "all" && stateFilter !== item.state) {
      setItems((current) => current.filter((entry) => entry._id !== item._id));
      setSelectedId(null);
      setDetail(null);
      void loadItems();
      return;
    }
    setItems((current) => current.map((entry) => entry._id === item._id ? item : entry));
    setDetail((current) => current ? { ...current, item } : current);
    void loadDetail(item._id);
  }

  function handleCreated(item: QueueItemRecord) {
    setShowNew(false);
    if (stateFilter !== "all" && stateFilter !== item.state) setStateFilter("all");
    setItems((current) => [item, ...current]);
    setSelectedId(item._id);
  }

  function handleDeleted() {
    const deletedId = selectedId;
    setItems((current) => {
      const next = current.filter((item) => item._id !== deletedId);
      setSelectedId(next[0]?._id || null);
      return next;
    });
    setDetail(null);
  }

  return (
    <main className="queue-ledger min-h-full overflow-x-hidden px-4 py-6 sm:px-7 sm:py-9 lg:px-10">
      <div className="mx-auto max-w-[92rem]">
        <header className="relative overflow-hidden rounded-[2rem] border border-[#cdbfa8] bg-[#24312c] px-5 py-7 text-[#fffdf7] shadow-[0_28px_80px_-55px_#111916] sm:px-8 sm:py-9 lg:px-11">
          <div className="absolute inset-y-0 right-0 hidden w-[42%] opacity-25 lg:block" aria-hidden="true">
            <div className="absolute right-10 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-[#d8b16d]/40" />
            <div className="absolute right-24 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full border border-[#d8b16d]/30" />
            <div className="absolute right-[8.5rem] top-1/2 h-px w-36 bg-[#d8b16d]/50" />
          </div>
          <div className="relative max-w-4xl">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.23em] text-[#d8c49c]">
              <Archive className="h-4 w-4" aria-hidden="true" />
              Private continuity ledger
            </div>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-6xl">Keep the research thread.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e4dfd3] sm:text-base">
              Your Queue preserves directives, handoffs, next steps, and results across sessions. It is not the Research Queue and it does not run research on its own.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={() => setShowNew(true)} className="bg-[#d8b16d] text-[#24312c] hover:bg-[#e2bf80]">
                <Plus aria-hidden="true" /> Leave a directive
              </Button>
              <p className="flex items-center gap-2 text-xs leading-5 text-[#d3cec1]">
                <Bot className="h-4 w-4 shrink-0 text-[#d8b16d]" aria-hidden="true" />
                Your AI connection is not available yet. Human-only Queue work remains fully usable.
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Queue state summary">
          {QUEUE_STATES.map((state) => {
            const meta = QUEUE_STATE_PRESENTATION[state];
            const Icon = stateIcons[state];
            return (
              <button
                type="button"
                key={state}
                onClick={() => setStateFilter(stateFilter === state ? "all" : state)}
                aria-pressed={stateFilter === state}
                className={cn(
                  "queue-paper rounded-2xl border px-4 py-4 text-left transition-[border-color,transform] hover:-translate-y-0.5",
                  stateFilter === state ? "border-[#98702b]" : "border-[#d7cfbf]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: meta.accent, background: meta.wash }}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="text-right">
                    <span className="block font-mono text-xl font-semibold text-[#24312c]">{counts[state]}</span>
                    <span className="block font-mono text-[8px] uppercase tracking-[0.12em] text-[#7d7b70]">loaded</span>
                  </span>
                </div>
                <p className="mt-3 font-semibold text-[#24312c]">{meta.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#687169]">{meta.short}</p>
              </button>
            );
          })}
        </section>

        {showNew ? <div className="mt-5"><NewDirectiveForm onCreated={handleCreated} onClose={() => setShowNew(false)} /></div> : null}

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#d7cfbf] bg-[#fffaf2]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Filter Queue by state">
            {stateOrder.map((state) => (
              <button
                type="button"
                key={state}
                onClick={() => setStateFilter(state)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  stateFilter === state ? "bg-[#24312c] text-[#fffdf7]" : "text-[#5f665f] hover:bg-[#e7ddc7]",
                )}
              >
                {state === "all" ? "All handoffs" : QUEUE_STATE_PRESENTATION[state].label}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 sm:w-64">
            <span className="sr-only">Search loaded Queue items</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777b74]" aria-hidden="true" />
            <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search loaded handoffs" className="border-[#cfc3af] bg-[#fffdf7] pl-9" />
          </label>
        </div>

        <div className="mt-5">
          {loading ? <QueueLoading /> : problem ? <QueueProblemCard problem={problem} onRetry={() => void loadItems()} /> : items.length === 0 ? (
            <section className="queue-paper rounded-3xl border border-dashed border-[#bda984] px-6 py-16 text-center sm:px-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#98702b]/10 text-[#98702b]"><Archive aria-hidden="true" /></div>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#98702b]">The ledger is clear</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#24312c]">Nothing needs carrying forward.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#687169]">Leave a directive when a research question, review, or story thread should survive this session.</p>
              <Button onClick={() => setShowNew(true)} className="mt-6 bg-[#245a43] text-white hover:bg-[#1c4936]"><Plus aria-hidden="true" /> Leave the first directive</Button>
            </section>
          ) : (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(32rem,1.35fr)] xl:items-start">
              <section className="min-w-0" aria-label="Queue items">
                {visibleItems.length === 0 ? (
                  <div className="queue-paper rounded-2xl border border-dashed border-[#bda984] px-5 py-10 text-center text-sm text-[#687169]">No loaded handoffs match this search.</div>
                ) : (
                  <div className="space-y-3">
                    {visibleItems.map((item) => <QueueItemCard key={item._id} item={item} selected={selectedId === item._id} onSelect={() => setSelectedId(item._id)} />)}
                  </div>
                )}
                {!listDone ? (
                  <Button variant="outline" onClick={() => void loadItems(true, listCursor)} disabled={loadingMore} className="mt-4 w-full border-[#cdbfa8] bg-[#fffdf7]">
                    {loadingMore ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ChevronDown aria-hidden="true" />} Load more handoffs
                  </Button>
                ) : null}
              </section>
              <section className="min-w-0 xl:sticky xl:top-6" aria-label="Selected Queue item">
                {detailProblem ? (
                  <QueueProblemCard problem={detailProblem} onRetry={() => selectedId && void loadDetail(selectedId)} />
                ) : detailLoading || !detail || detail.item._id !== selectedId ? (
                  <div className="h-[34rem] animate-pulse rounded-3xl border border-[#d7cfbf] bg-[#fffaf2]/70" aria-label="Loading selected Queue item" />
                ) : (
                  <QueueDetail
                    item={detail.item}
                    activity={detail.activity.page}
                    activityDone={detail.activity.isDone}
                    activityLoading={activityLoading}
                    onLoadMoreActivity={() => void loadDetail(detail.item._id, true, detail.activity.continueCursor)}
                    onChanged={replaceItem}
                    onDeleted={handleDeleted}
                  />
                )}
              </section>
            </div>
          )}
        </div>

        <footer className="mt-8 flex flex-col gap-3 border-t border-[#cdbfa8] py-6 text-xs leading-5 text-[#687169] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#245a43]" aria-hidden="true" /> Queue directives and activity stay private to this vault and share the item&apos;s deletion lifecycle.</p>
          <p className="font-mono uppercase tracking-[0.1em]">Four states · no autonomous runner</p>
        </footer>
      </div>
    </main>
  );
}
