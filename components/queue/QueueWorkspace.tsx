"use client";

import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileClock,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "./QueueGlyph";
import { useCallback, useEffect, useMemo, useState, useTransition, useRef, useSyncExternalStore, useLayoutEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SafeLink } from "@/components/layout/SafeLink";
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
  queueResultLink,
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

import {QueueActionForm as InlineAction,type QueueCommand} from "./QueueActionForm";
import {QueueDrafts,useQueueDraft,useQueuePreview} from "./QueueDrafts";
import {QueueCollection} from "./QueueCollection";
import {normalizeQueueFilters,queueMatchesView,type QueueFilterInput,type QueueFilters} from "@/lib/queue/viewFilters";
import {queueSnapshot,initialQueueSnapshot,subscribeQueueURL,navigateQueue} from "@/lib/queue/navigation";

type QueueProblem = {
  title: string;
  detail: string;
  surfaceState: string;
};

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
      style={{ borderColor: `color-mix(in srgb, ${presentation.accent} 35%, transparent)`, color: presentation.accent, background: presentation.wash }}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

function QueueLoading() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)]" aria-label="Loading Queue" role="status">
      <div className="space-y-3">
        {[0, 1, 2].map((value) => (
          <div key={value} className="h-36 animate-pulse rounded-lg border border-border bg-card/70" />
        ))}
      </div>
      <div className="h-[34rem] animate-pulse rounded-lg border border-border bg-card/70" />
    </div>
  );
}

function QueueProblemCard({ problem, onRetry }: { problem: QueueProblem; onRetry: () => void }) {
  const permissionDenied = problem.surfaceState === "permission_denied";
  return (
    <section role="alert" className="queue-paper mx-auto max-w-3xl rounded-lg border border-border px-6 py-12 text-center sm:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-annotation">
        {permissionDenied ? <ShieldCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      </div>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-annotation">
        {permissionDenied ? "Private vault boundary" : "Continuity interrupted"}
      </p>
      <h2 className="mt-2 text-3xl font-semibold text-foreground">{problem.title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{problem.detail}</p>
      <Button onClick={onRetry} className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
        <RefreshCw aria-hidden="true" /> Try again
      </Button>
    </section>
  );
}

function NewDirectiveForm({ onCreated, onClose }: { onCreated: (item: QueueItemRecord) => void; onClose: () => void }) {
  const [directive, setDirective] = useQueueDraft("new:directive");
  const readonlyPreview=useQueuePreview();
  const [outcome, setOutcome] = useQueueDraft("new:outcome");
  const [priority, setPriority] = useQueueDraft("new:priority","normal");
  const [priorityReason, setPriorityReason] = useQueueDraft("new:priorityReason");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(readonlyPreview)return;
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
            chosenAiId: "oauth-chosen-ai",
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const payload = (await response.json()) as { success?: boolean; item?: QueueItemRecord; error?: string; details?: string };
        if (!response.ok || !payload.item) throw new Error(payload.details || payload.error || "Could not save the directive");
        toast.success("Directive saved to your Queue");
        setDirective("");setOutcome("");setPriority("normal");setPriorityReason("");
        onCreated(payload.item);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the directive");
      }
    });
  }

  return (
    <section className="queue-paper animate-rise-in rounded-lg border border-border " aria-labelledby="new-directive-title">
      <div className="flex items-start justify-between gap-5 border-b border-border px-5 py-5 sm:px-7">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-annotation">New continuity record</p>
          <h2 id="new-directive-title" className="mt-1 text-3xl font-semibold text-foreground">What should stay in the thread?</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close new directive form">
          <X aria-hidden="true" />
        </Button>
      </div>
      <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-7">
        <div>
          <label htmlFor="queue-directive" className="text-sm font-semibold text-foreground">Directive</label>
          <p className="mt-1 text-xs text-muted-foreground">Write it in your own words. This is the durable instruction.</p>
          <Textarea
            id="queue-directive"
            value={directive}
            onChange={(event) => setDirective(event.target.value)}
            required
            maxLength={4000}
            rows={5}
            placeholder="Compare the two census households and tell me which evidence supports the relationship."
            className="mt-2 min-h-32 resize-y border-border bg-card text-base leading-7"
          />
        </div>
        <div>
          <label htmlFor="queue-outcome" className="text-sm font-semibold text-foreground">A useful result <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input
            id="queue-outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            maxLength={1000}
            placeholder="A short evidence comparison with remaining uncertainty."
            className="mt-2 border-border bg-card"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="queue-priority" className="text-sm font-semibold text-foreground">Priority</label>
            <select
              id="queue-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as QueuePriority)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-base md:pointer-fine:h-10 md:pointer-fine:text-sm"
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
          {priority === "high" ? (
            <div>
              <label htmlFor="queue-priority-reason" className="text-sm font-semibold text-foreground">Why high priority?</label>
              <Input
                id="queue-priority-reason"
                value={priorityReason}
                onChange={(event) => setPriorityReason(event.target.value)}
                required
                maxLength={500}
                className="mt-2 border-border bg-card"
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-xl gap-3 text-sm leading-6 text-muted-foreground">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-annotation" aria-hidden="true" />
            <p>The directive will wait for the compatible AI you connect through OAuth. Nothing runs automatically; that AI must connect and deliberately claim it.</p>
          </div>
          <Button type="submit" disabled={readonlyPreview || isPending || !directive.trim()} className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
            {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
            Save directive
          </Button>
        </div>
      </form>
    </section>
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
  onReload,
}: {
  item: QueueItemRecord;
  activity: QueueActivityRecord[];
  activityDone: boolean;
  activityLoading: boolean;
  onLoadMoreActivity: () => void;
  onChanged: (item: QueueItemRecord) => void;
  onDeleted: (id:string) => void;
  onReload: () => Promise<boolean|void>;
}) {
  const readonlyPreview=useQueuePreview();
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
  const resultLinks = useMemo(
    () => (item.resultRefs ?? []).map(queueResultLink).filter((link) => link !== null),
    [item.resultRefs],
  );

  useEffect(() => setAction(null), [item._id]);
  const historyList=useRef<HTMLOListElement>(null);
  const historyAnchor=useRef<{element:HTMLElement;top:number}|null>(null);
  useLayoutEffect(()=>{if(activityLoading||!historyAnchor.current)return;const {element,top}=historyAnchor.current;const scroller=element.closest<HTMLElement>("[data-queue-scroll]");if(scroller)scroller.scrollTop+=element.getBoundingClientRect().top-top;historyAnchor.current=null;},[activity,activityLoading]);
  const actionDone=(next:QueueItemRecord)=>{setAction(null);onChanged(next);};

  function deleteItem() {
    if(readonlyPreview)return;
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
        onDeleted(item._id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete Queue item");
      }
    });
  }

  return (
    <article className="queue-paper min-w-0 rounded-lg border border-border " aria-labelledby="queue-detail-title">
      <header className="border-b border-border px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center gap-2">
          <StateStamp item={item} />
          <Badge variant="outline" className="border-border bg-card/70 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {queueConditionLabel(item.condition)}
          </Badge>
          <Badge variant="outline" className="border-border bg-card/70 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {item.priority} priority
          </Badge>
        </div>
        <h2 id="queue-detail-title" className="mt-5 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">{item.summary}</h2>
      </header>

      <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="flex min-w-0 flex-col"><section aria-label="Current answer and actions" className="order-1 px-5 py-6 sm:px-8 lg:order-2">
          <section className="rounded-lg border border-border bg-muted/72 p-5" aria-labelledby="queue-focus-heading">
            <p id="queue-focus-heading" className="font-mono text-[10px] uppercase tracking-[0.2em] text-annotation">{queueFocusLabel(item)}</p>
            <p className="mt-2 text-lg font-semibold leading-7 text-foreground">{queueFocusText(item)}</p>
            <p className="mt-3 flex gap-2 text-sm leading-6 text-muted-foreground">
              {<FileClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {queueHandoffCopy(item)}
            </p>
            {resultLinks.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-annotation">Saved in your workspace</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {resultLinks.map((link) => (
                    <SafeLink
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-evidence/30 bg-evidence-surface px-3 py-1.5 text-xs font-semibold text-evidence transition-colors hover:border-evidence hover:bg-evidence-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {link.label}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </SafeLink>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <div className="mt-5 flex flex-wrap gap-2">
            {canPersonClaim(item) ? (
              <Button onClick={() => setAction("claim")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <UserRound aria-hidden="true" /> Work on this myself
              </Button>
            ) : null}
            {item.state === "needs_you" ? (
              <Button onClick={() => setAction("resume")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <ArrowRight aria-hidden="true" /> Answer and resume
              </Button>
            ) : null}
            {canPersonContinue(item) ? (
              <>
                <Button onClick={() => setAction("checkpoint")} variant="outline" className="border-evidence/30 bg-evidence-surface text-evidence">
                  <RefreshCw aria-hidden="true" /> Update next step
                </Button>
                <Button onClick={() => setAction("complete")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Check aria-hidden="true" /> Record result
                </Button>
              </>
            ) : null}
            {item.state === "done" ? (
              <Button onClick={() => setAction("reopen")} variant="outline" className="border-border bg-card">
                <RotateCcw aria-hidden="true" /> Reopen
              </Button>
            ) : null}
            {item.state !== "done" ? (
              <Button onClick={() => setAction("cancel")} variant="ghost" className="text-destructive">
                <X aria-hidden="true" /> Cancel handoff
              </Button>
            ) : null}
          </div>

          {action === "claim" ? (
            <div className="mt-4"><InlineAction item={item} command="claim" label="Work on this yourself" prompt="Record the first concrete step. Your claim lasts up to 30 minutes and can be renewed with a progress update." placeholder="Compare the household names and dates against the cited census page." submitLabel="Start working" onDone={actionDone} onReload={onReload} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "checkpoint" ? (
            <div className="mt-4"><InlineAction item={item} command="checkpoint" label="Update the current step" prompt="Leave a readable next step so the thread survives this session." placeholder="Check the neighboring census page for the missing surname variation." submitLabel="Save progress" onDone={actionDone} onReload={onReload} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "resume" ? (
            <div className="mt-4"><InlineAction item={item} command="resume" label="Answer and resume" prompt="Record the answer or decision that unblocks the handoff. It returns to Waiting for your AI; nothing runs automatically." placeholder="Use the 1880 household as the working family group, but retain the date conflict." submitLabel="Return to Waiting" onDone={actionDone} onReload={onReload} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "complete" ? (
            <div className="mt-4"><InlineAction item={item} command="complete" label="Record the result" prompt="Summarize what was learned, what evidence supports it, and any uncertainty that remains." placeholder="The two households are probably the same family because… Remaining uncertainty…" submitLabel="Mark Done" onDone={actionDone} onReload={onReload} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "cancel" ? (
            <div className="mt-4"><InlineAction item={item} command="cancel" label="Cancel this handoff" prompt="Canceling moves it to Done and keeps the reason and activity trail." placeholder="This question was superseded by the newer source comparison." submitLabel="Record cancellation" onDone={actionDone} onReload={onReload} onCancel={() => setAction(null)} /></div>
          ) : null}
          {action === "reopen" ? (
            <div className="mt-4"><InlineAction item={item} command="reopen" label="Reopen this handoff" prompt="Explain why the result needs another pass. It returns to Waiting for your AI; nothing runs automatically." placeholder="A new source changes the household interpretation." submitLabel="Reopen in Waiting" onDone={actionDone} onReload={onReload} onCancel={() => setAction(null)} /></div>
          ) : null}

          </section><section aria-label="Original directive" className="order-2 border-b border-border px-5 py-5 sm:px-8 lg:order-1"><p className="mb-3 font-mono text-xs uppercase tracking-wider text-annotation">You asked</p>        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-foreground">{item.directive}</p>
        {item.requestedOutcome ? (
          <div className="mt-5 border-l-2 border-annotation pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-annotation">Useful result</p>
            <p className="mt-1 text-sm leading-6 text-foreground">{item.requestedOutcome}</p>
          </div>
        ) : null}
      </section><section className="order-3 border-t border-border px-5 py-6 sm:px-8" aria-labelledby="queue-activity-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-annotation">Attributable history</p>
                <h3 id="queue-activity-heading" className="mt-1 text-2xl font-semibold text-foreground">Activity trail</h3><p className="mt-1 text-xs text-muted-foreground">Loaded history · oldest first{!activityDone?" · earlier entries available":""}</p>
              </div>
              <History className="h-5 w-5 text-annotation" aria-hidden="true" />
            </div>
            {!activityDone ? (
              <Button variant="outline" size="sm" onClick={()=>{const element=historyList.current?.firstElementChild as HTMLElement|null;if(element)historyAnchor.current={element,top:element.getBoundingClientRect().top};onLoadMoreActivity();}} disabled={activityLoading} className="mt-4 border-border bg-card">
                {activityLoading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                Older activity
              </Button>
            ) : null}
            <ol ref={historyList} className="mt-5 space-y-0">
              {activity.toSorted((a,b)=>a.createdAt-b.createdAt||a._id.localeCompare(b._id)).map((entry, index) => (
                <li key={entry._id} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-5">
                  {index < activity.length - 1 ? <span className="absolute left-[0.57rem] top-4 h-full w-px bg-border" aria-hidden="true" /> : null}
                  <span className="relative mt-1.5 h-3 w-3 rounded-full border-2 border-card bg-annotation shadow-none" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">{entry.summary}</p>
                      <time className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{formatQueueDate(entry.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{queueActorLabel(entry.actorKind)} · version {entry.itemVersion}</p>
                    {entry.detail ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ol>

          </section>
        </div>

        <aside className="min-w-0 border-t border-border bg-muted/60 px-5 py-6 xl:border-l xl:border-t-0" aria-label="Queue item details">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-annotation">Handoff ledger</p>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd className="mt-1 font-medium text-foreground">{formatQueueDate(item.submittedAt)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1 font-medium text-foreground">{formatQueueDate(item.updatedAt)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Current authority</dt><dd className="mt-1 font-medium text-foreground">Queue continuity only</dd></div>
            {item.leaseExpiresAt ? <div><dt className="text-xs text-muted-foreground">Claim expires</dt><dd className="mt-1 font-medium text-foreground">{formatQueueDate(item.leaseExpiresAt)}</dd></div> : null}
            {item.nextRetryAt ? <div><dt className="text-xs text-muted-foreground">Next retry</dt><dd className="mt-1 font-medium text-foreground">{formatQueueDate(item.nextRetryAt)}</dd></div> : null}
          </dl>
          <dl className="mt-5 space-y-4 border-t border-border pt-4 text-sm">
            {item.priorityReason&&<div><dt className="text-xs text-muted-foreground">Priority reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.priorityReason}</dd></div>}
            {item.handoffExpiresAt&&<div><dt className="text-xs text-muted-foreground">Handoff expires</dt><dd className="mt-1">{formatQueueDate(item.handoffExpiresAt)}</dd></div>}
            {item.lastUserResponse&&<div><dt className="text-xs text-muted-foreground">Last response</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.lastUserResponse}</dd></div>}
            {item.lastReopenReason&&<div><dt className="text-xs text-muted-foreground">Last reopen reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.lastReopenReason}</dd></div>}
            {item.canceledReason&&<div><dt className="text-xs text-muted-foreground">Cancellation reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.canceledReason}</dd></div>}
            {item.failureSummary&&<div><dt className="text-xs text-muted-foreground">Recorded failure</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.failureSummary}{item.failureCode&&<span className="mt-1 block text-xs text-muted-foreground">{item.failureCode}</span>}</dd></div>}
            {(item.resultRefs||[]).some(ref=>!queueResultLink(ref))&&<div><dt className="text-xs text-muted-foreground">Other recorded result references</dt><dd className="mt-1 space-y-2">{(item.resultRefs||[]).filter(ref=>!queueResultLink(ref)).map((ref,index)=><p key={index} className="break-all text-xs leading-5">{ref}</p>)}</dd></div>}
            {item.authority.scopeNote&&<div><dt className="text-xs text-muted-foreground">Recorded authority note</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">{item.authority.scopeNote}</dd></div>}
          </dl>
          <div className="mt-7 border-t border-border pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-annotation">Attached context</p>
            {groupedContext.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Directive only. No person, evidence, or work-thread records are attached.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {groupedContext.map(([group, labels]) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-foreground">{group}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.join(" · ")}</p>
                  </div>
                ))}
              </div>
            )}
            {item.context.length>0&&<details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center text-xs text-primary">Recorded context references</summary><ul className="space-y-2 text-xs leading-5">{item.context.map((ref,index)=><li key={`${ref.kind}-${ref.refId}-${index}`} className="break-all"><span className="font-semibold">{queueContextLabel(ref.kind)}</span> · {ref.refId}</li>)}</ul></details>}
          </div>
          <div className="mt-7 border-t border-border pt-5">
            {action === "delete" ? (
              <div className="rounded-xl border border-destructive/35 bg-destructive/5 p-3">
                <p className="text-xs leading-5 text-destructive">Permanently delete this directive, its activity, and command receipts?</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="destructive" onClick={deleteItem} disabled={readonlyPreview || isDeleting}>
                    {isDeleting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Keep it</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setAction("delete")} className="px-0 text-destructive hover:bg-transparent hover:text-destructive">
                <Trash2 aria-hidden="true" /> Delete item and activity
              </Button>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

export type QueuePreview={items:QueueItemRecord[];activity:Record<string,QueueActivityRecord[]>;pageSize?:number;activityPageSize?:number;now?:number;problem?:QueueProblem;detailProblem?:QueueProblem};
type QueueWorkspaceProps={preferenceKey:string;initialFilters?:QueueFilterInput;preview?:QueuePreview};
export function QueueWorkspace(props:QueueWorkspaceProps){return <QueueDrafts readonlyPreview={Boolean(props.preview)}><QueueController {...props}/></QueueDrafts>;}
function QueueController({preferenceKey,initialFilters={},preview}:QueueWorkspaceProps) {
  const snapshot=useSyncExternalStore(subscribeQueueURL,queueSnapshot,()=>initialQueueSnapshot(initialFilters));
  const filters=useMemo(()=>JSON.parse(snapshot) as QueueFilters,[snapshot]);
  const stateFilter=(filters.state||"all") as "all"|QueueState;
  const listRequest=useRef(0),detailRequest=useRef(0);
  const collection=useRef<HTMLDivElement>(null);
  const origin=useRef<HTMLElement|null>(null);
  const threadScroll=useRef<HTMLDivElement>(null);
  const setSelectedId=(id:string|null)=>navigateQueue({item:id||""});
  const applyFilters=(next:Record<string,string>)=>{const normalized=normalizeQueueFilters(next);navigateQueue({...normalized,item:normalized.state!==filters.state?"":filters.item});};
  const selectItem=(item:QueueItemRecord)=>{if(!filters.item)origin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;navigateQueue({item:item._id},false);};
  const [items, setItems] = useState<QueueItemRecord[]>([]);
  const visibleItems=useMemo(()=>items.filter(item=>queueMatchesView(item,filters,preview?.now??Date.now())),[items,filters,preview?.now]);
  const selectedId=filters.item||null;
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

  const loadItems = useCallback(async (append = false, cursor?: string | null) => {
    const request=++listRequest.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    if (!append) setProblem(null);
    try {
      if(preview){
        if(preview.problem){setProblem(preview.problem);setItems([]);return;}
        const matching=preview.items.filter(item=>stateFilter==="all"||item.state===stateFilter);
        const start=Number(cursor||0),end=start+(preview.pageSize||25),page=matching.slice(start,end);
        setItems(current=>append?[...current,...page]:page);setListCursor(end<matching.length?String(end):null);setListDone(end>=matching.length);
        return;
      }
      const params = new URLSearchParams({ limit: "25" });
      if (stateFilter !== "all") params.set("state", stateFilter);
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/queue?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as QueueListResponse;
      if (!response.ok || !payload.success) throw problemFromResponse(response, payload);
      if(request!==listRequest.current)return;
      setItems((current) => append ? [...current, ...payload.page] : payload.page);
      setListCursor(payload.continueCursor || null);
      setListDone(payload.isDone);

    } catch (error) {
      if(request!==listRequest.current)return;
      const nextProblem = error && typeof error === "object" && "surfaceState" in error
        ? error as QueueProblem
        : { title: "Queue unavailable", detail: "The Queue could not be loaded. Refresh and try again.", surfaceState: "error" };
      setProblem(nextProblem);
      if (!append) setItems([]);
    } finally {
      if(request===listRequest.current){setLoading(false);setLoadingMore(false);}
    }
  }, [stateFilter,preview]);

  const loadDetail = useCallback(async (id: string, appendActivity = false, cursor?: string | null, quiet = false) => {
    const request=++detailRequest.current;
    if (appendActivity) setActivityLoading(true);
    else {
      if(!quiet)setDetailLoading(true);
      setDetailProblem(null);
    }
    try {
      if(preview){
        const item=preview.items.find(item=>item._id===id);
        if(preview.detailProblem||!item){setDetailProblem(preview.detailProblem||{title:"Queue item unavailable",detail:"This invented item is not in the fixture.",surfaceState:"error"});return;}
        const all=preview.activity[id]||[],start=Number(cursor||0),end=start+(preview.activityPageSize||50),page=all.slice(start,end);
        const payload={success:true,surfaceState:"ready",item,activity:{page,isDone:end>=all.length,continueCursor:end<all.length?String(end):""}};
        setDetail(current=>appendActivity&&current?{...payload,activity:{...payload.activity,page:[...current.activity.page,...page]}}:payload);return;
      }
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/queue/${encodeURIComponent(id)}?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as QueueDetailResponse;
      if (!response.ok || !payload.success) throw problemFromResponse(response, payload);
      if(request!==detailRequest.current)return;
      setDetailProblem(null);
      setDetail((current) => appendActivity && current
        ? { ...payload, activity: { ...payload.activity, page: [...current.activity.page, ...payload.activity.page] } }
        : payload);
      return true;
    } catch (error) {
      if(request!==detailRequest.current)return;
      const nextProblem = error && typeof error === "object" && "surfaceState" in error
        ? error as QueueProblem
        : { title: "Queue item unavailable", detail: "This item could not be loaded. Refresh the Queue and try again.", surfaceState: "error" };
      if (!appendActivity) setDetailProblem(nextProblem);
      toast.error(nextProblem.detail);
      return false;
    } finally {
      if(request===detailRequest.current){setDetailLoading(false);setActivityLoading(false);}
    }
  }, [preview]);

  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {++detailRequest.current;setDetail(null);setDetailLoading(false);setActivityLoading(false);}
  }, [selectedId, loadDetail]);

  const counts = useMemo(() => {
    const result: Record<QueueState, number> = { needs_you: 0, working: 0, waiting_for_your_ai: 0, done: 0 };
    for (const item of items) result[item.state] += 1;
    return result;
  }, [items]);

  useEffect(()=>{threadScroll.current?.scrollTo({top:0});},[selectedId]);
  function replaceItem(item: QueueItemRecord) {
    const leavesState=stateFilter!=="all"&&stateFilter!==item.state;
    setItems(current=>leavesState?current.filter(entry=>entry._id!==item._id):current.map(entry=>entry._id===item._id?item:entry));
    // An in-row reply may finish while a different thread is open.
    if(item._id===selectedId){setDetail(current=>current?{...current,item}:current);void loadDetail(item._id);}
    if(leavesState)void loadItems();
  }

  function handleCreated(item: QueueItemRecord) {
    setShowNew(false);
    if (stateFilter !== "all" && stateFilter !== item.state) navigateQueue({state:"",view:"",actor:""});
    setItems((current) => [item, ...current]);
    setSelectedId(item._id);
  }

  function handleDeleted(deletedId:string) {
    setItems(current=>current.filter(item=>item._id!==deletedId));
    if(selectedId===deletedId){setSelectedId(null);setDetail(null);}
  }
  // Async form submissions can outlive the selection/filter render that started them.
  const latestHandlers=useRef({changed:replaceItem,deleted:handleDeleted});
  useLayoutEffect(()=>{latestHandlers.current={changed:replaceItem,deleted:handleDeleted};});
  const itemChanged=useCallback((item:QueueItemRecord)=>latestHandlers.current.changed(item),[]);
  const itemDeleted=useCallback((id:string)=>latestHandlers.current.deleted(id),[]);

  return <div className="min-w-0 p-4 sm:p-8">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-xs uppercase tracking-[.14em] text-annotation">Private continuity ledger</p><h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Your Queue</h1><p className="mt-2 text-xl">Keep the research thread.</p><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Your Queue preserves directives, handoffs, next steps, and results across sessions. It is not the Research Queue and it does not run research on its own.</p></div>
      <Button className="min-h-11" onClick={()=>setShowNew(true)}><Plus/>Leave a directive</Button>
    </header>
    <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-foreground"><Bot className="mr-2 inline h-4 w-4 text-primary"/>A compatible AI can connect through MCP and OAuth. <SafeLink href="/ai" className="text-primary underline">See setup</SafeLink>. Nothing runs until it deliberately claims a directive.</p>

    {showNew&&<div className="mb-5"><NewDirectiveForm onCreated={handleCreated} onClose={()=>setShowNew(false)}/></div>}
    {preview&&<p className="mb-4 text-xs text-annotation">Synthetic preview: all writes are disabled; no backend connected.</p>}
    {loading&&!items.length?<QueueLoading/>:problem?<QueueProblemCard problem={problem} onRetry={()=>void loadItems()}/>:<>
      {items.length===0&&<section className="mb-5 rounded-lg border border-dashed border-border bg-card p-6"><h2 className="text-2xl font-semibold">Nothing needs carrying forward.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Leave a directive when a research question, review, or story thread should survive this session.</p><Button onClick={()=>setShowNew(true)} className="mt-3 min-h-11"><Plus/>Leave the first directive</Button></section>}
      <div ref={collection} tabIndex={-1} aria-label="Queue items" className="min-w-0 scroll-mt-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><QueueCollection items={visibleItems} loadedItems={items} filters={filters} selectedId={selectedId} preferenceKey={preferenceKey} onFilters={applyFilters} onSelect={selectItem} onChanged={itemChanged} onReload={()=>loadItems()}/>{loading&&<p role="status" className="text-sm text-muted-foreground">Loading matching handoffs…</p>}{!listDone&&<Button variant="outline" className="mt-4 min-h-11" onClick={()=>void loadItems(true,listCursor)} disabled={loadingMore}>{loadingMore?<LoaderCircle className="animate-spin"/>:<ChevronDown/>}Load more handoffs</Button>}</div>

    </>}
    <Dialog open={Boolean(selectedId)} onOpenChange={open=>{if(!open)setSelectedId(null);}}><DialogContent ref={threadScroll} data-queue-scroll showCloseButton={false} onOpenAutoFocus={event=>{event.preventDefault();threadScroll.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();if(origin.current?.isConnected)origin.current.focus({preventScroll:true});else collection.current?.focus({preventScroll:true});}} tabIndex={-1} id="queue-selected" className="left-0 top-0 block h-[100dvh] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-0 sm:max-w-none lg:left-auto lg:right-0 lg:w-[48rem] lg:max-w-[calc(100vw-3rem)] lg:border-l">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-2">
        <div><DialogTitle className="font-sans text-sm">Selected thread</DialogTitle><DialogDescription className="mt-1 text-xs">{visibleItems.some(item=>item._id===selectedId)?"Previous/Next follow loaded order":"Outside this loaded view"}</DialogDescription></div>
        <div className="flex gap-1"><Button variant="ghost" className="min-h-11 px-2" disabled={visibleItems.findIndex(item=>item._id===selectedId)<=0} onClick={()=>{const i=visibleItems.findIndex(item=>item._id===selectedId);if(i>0)navigateQueue({item:visibleItems[i-1]._id});}} aria-label="Previous loaded handoff">↑ Previous</Button><Button variant="ghost" className="min-h-11 px-2" disabled={visibleItems.findIndex(item=>item._id===selectedId)<0||visibleItems.findIndex(item=>item._id===selectedId)>=visibleItems.length-1} onClick={()=>{const i=visibleItems.findIndex(item=>item._id===selectedId);if(i>=0&&i<visibleItems.length-1)navigateQueue({item:visibleItems[i+1]._id});}} aria-label="Next loaded handoff">Next ↓</Button><Button variant="outline" className="min-h-11" onClick={()=>setSelectedId(null)}>Back to loaded handoffs</Button></div>
      </div>
      {selectedId&&(detailProblem?<QueueProblemCard problem={detailProblem} onRetry={()=>void loadDetail(selectedId)}/>:detailLoading||!detail||detail.item._id!==selectedId?<div className="h-80 animate-pulse border border-border bg-muted" aria-label="Loading selected Queue item"/>:<QueueDetail key={detail.item._id} item={detail.item} activity={detail.activity.page} activityDone={detail.activity.isDone} activityLoading={activityLoading} onLoadMoreActivity={()=>void loadDetail(detail.item._id,true,detail.activity.continueCursor)} onChanged={itemChanged} onDeleted={itemDeleted} onReload={()=>loadDetail(selectedId,false,null,true)}/>)}
    </DialogContent></Dialog>
    <section className="mt-6 rounded-lg border border-border bg-card px-4 py-2" aria-label="Queue state summary"><p className="mt-2 text-xs text-muted-foreground">State meanings · counts in the current load</p><dl className="grid gap-x-6 sm:grid-cols-2">{QUEUE_STATES.map(state=><div key={state} className="border-b border-border py-2 last:border-0"><dt><button type="button" aria-pressed={stateFilter===state} onClick={()=>applyFilters({...filters,state:stateFilter===state?"":state,view:"",actor:""})} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-primary"><span className="flex items-center gap-2">{stateIcons[state]({className:"h-4 w-4"})}{QUEUE_STATE_PRESENTATION[state].label}</span><span className="font-mono text-xs text-muted-foreground">{problem?"Unavailable":stateFilter==="all"||stateFilter===state?counts[state]:"Not in this load"}</span></button></dt><dd className="pb-2 text-xs leading-5 text-muted-foreground">{QUEUE_STATE_PRESENTATION[state].short}</dd></div>)}</dl></section>
    <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border py-5 text-xs leading-5 text-muted-foreground"><p className="flex items-start gap-2"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-evidence"/>Queue directives and activity stay private to this vault and share the item&apos;s deletion lifecycle.</p><p className="font-mono">Four states · no autonomous runner</p></footer>
  </div>;
}
