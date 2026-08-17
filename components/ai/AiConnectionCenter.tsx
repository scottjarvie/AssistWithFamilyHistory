"use client";

/**
 * AiConnectionCenter — the person-facing surface for chosen-AI connections.
 *
 * Two rules shape this file:
 *
 *   1. **The consent screen is rendered from the same catalog the server
 *      enforces.** `FAMILY_HISTORY_SCOPE_INFO`, `NEVER_EXPOSED`, and
 *      `NEVER_PERMITTED` are imported directly from `lib/mcp/catalog.ts` — the
 *      module `lib/mcp/authorize.ts` and `convex/httpRoutes/mcp.ts` decide with.
 *      A permission cannot appear here that the edge does not enforce, and an
 *      enforced permission cannot go unexplained. `scripts/check-connection-center.ts`
 *      asserts that every scope and both never-lists actually reach the markup.
 *   2. **No control here is decoration.** Approve, narrow, and revoke all change
 *      real server state through owner-scoped Convex mutations. Revoking takes
 *      effect on the connection's very next request, because the MCP transport
 *      re-resolves the grant on every request rather than trusting a token's
 *      remaining lifetime.
 *
 * No OAuth vocabulary appears in the copy. A person should be able to decide
 * what their AI may touch without knowing what a bearer token is.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Eye,
  Loader2,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldOff,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FAMILY_HISTORY_SCOPE_INFO,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
  type FamilyHistoryScope,
} from "@/lib/mcp/catalog";
import type {
  ConnectionActivityRow,
  ConnectionBoundary,
  ConnectionRow,
} from "@/lib/mcp/connectionApi";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- copy */

const BOUNDARY_CHOICES: ReadonlyArray<{
  kind: ConnectionBoundary["kind"];
  label: string;
  detail: string;
}> = [
  {
    kind: "whole_workspace",
    label: "Everything in this workspace",
    detail:
      "Every person, source, event, research note, and story draft you keep here — still only the permissions you tick above, and still nothing on the never lists.",
  },
  {
    kind: "selected_people",
    label: "Only the people I name",
    detail:
      "Paste the person IDs this connection may touch. Anything it cannot tie to one of those people is refused rather than guessed at, so choose this when the work is about a specific family line.",
  },
  {
    kind: "queue_only",
    label: "Only the work I assign",
    detail:
      "The connection reaches your Queue and nothing else. Reading a Queue directive is continuity, not permission over the records that directive mentions.",
  },
];

const EXPIRY_CHOICES: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
];

const STATUS_COPY: Record<
  ConnectionRow["status"],
  { label: string; tone: string; meaning: string }
> = {
  pending: {
    label: "Waiting for you",
    tone: "bg-amber-100 text-amber-900",
    meaning: "This AI asked to connect. It can read and change nothing until you approve it.",
  },
  active: {
    label: "Approved",
    tone: "bg-emerald-100 text-emerald-900",
    meaning: "This connection is working inside exactly the permissions and boundary below.",
  },
  revoked: {
    label: "Turned off",
    tone: "bg-stone-200 text-stone-700",
    meaning: "You turned this off. It was refused from its very next request onward.",
  },
  denied: {
    label: "Declined",
    tone: "bg-stone-200 text-stone-700",
    meaning: "You declined this request. It was never given any permission.",
  },
  expired: {
    label: "Ran out",
    tone: "bg-stone-200 text-stone-700",
    meaning: "This approval reached the end date you chose and stopped working then.",
  },
};

const PROVENANCE_COPY: Record<ConnectionRow["clientProvenance"], string> = {
  cimd: "It identified itself with a published address we fetched and checked.",
  dcr: "It registered itself with the sign-in provider.",
  manual:
    "It presented an identifier issued by the sign-in provider. That proves the sign-in was real; it does not prove which software is on the other end.",
};

/**
 * The fallback for an assistant that cannot connect at all. A person copies this,
 * fills it in from their own workspace, and pastes it into any chat. It is a
 * brief, not a connection: it carries context and no authority whatsoever.
 */
export const MANUAL_QUEUE_BRIEF = `FAMILY HISTORY BRIEF — [person or family line]
Prepared [date] · from my private Assist With Family History workspace

QUESTION: [one research question, narrowly stated]

WHO THIS IS ABOUT
  [name], [born ~year, place] – [died ~year, place]
  Known relationships: [parent / spouse / child, and how sure you are]

WHAT IS ALREADY EVIDENCED
  - [claim] — source: [what record], [where it is held], [date you saw it]
    What this source cannot tell us: [its real limits]

WHAT IS STILL UNCERTAIN
  - [the conflict, the gap, or the two candidates you cannot separate]

WHAT I HAVE ALREADY TRIED
  - [search, index, or archive] — [what came back, including the dead ends]

WHAT I WANT BACK
  - Candidate records to check, each with where it would be held and why you think so.
  - For every suggestion: what would confirm it and what would rule it out.
  - Say plainly when you do not know. A named gap is worth more than a guess.

DELIBERATELY NOT INCLUDED
  - Living people — their details stay in my workspace.
  - Private family notes, memory media, and uploaded files — a brief never carries one.
  - Anything I have not reviewed yet — unreviewed material is not ready to leave.
  - My other research threads — a brief answers one question about one line.

BOUNDARY
  Context only. No account access, no tool permission, no authority to change,
  publish, delete, merge, or share anything. Do not act on FamilySearch or any
  other site on my behalf. Propose; I decide.`;

/* ------------------------------------------------------------- helpers */

function formatDate(ms?: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(ms?: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function boundarySummary(boundary: ConnectionBoundary): string {
  const choice = BOUNDARY_CHOICES.find((entry) => entry.kind === boundary.kind);
  const base = choice?.label ?? boundary.kind;
  if (boundary.kind === "selected_people") {
    return `${base} (${boundary.personIds?.length ?? 0} named)`;
  }
  if (boundary.kind === "queue_only" && boundary.queueItemIds?.length) {
    return `${base} (${boundary.queueItemIds.length} named)`;
  }
  return base;
}

function parseIdList(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean))].slice(0, 500);
}

type ConsentSnapshot = {
  shownAt?: number;
  boundary?: { kind?: string; personCount?: number | null; queueItemCount?: number | null };
  expiresAt?: number | null;
};

function readSnapshot(raw: string | null): ConsentSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConsentSnapshot;
  } catch {
    return null;
  }
}

/* ------------------------------------------------- shared presentation */

function ScopeExplainer({
  scope,
  checked,
  onToggle,
  disabled,
  idPrefix,
}: {
  scope: (typeof FAMILY_HISTORY_SCOPE_INFO)[number];
  checked: boolean;
  onToggle?: (next: boolean) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const inputId = `${idPrefix}-${scope.scope}`;
  return (
    <li className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex gap-3">
        {onToggle ? (
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-emerald-800"
          />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={onToggle ? inputId : undefined} className="text-sm font-semibold text-stone-900">
              {scope.label}
            </Label>
            <Badge
              className={cn(
                "text-[11px]",
                scope.writes ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700",
              )}
            >
              {scope.writes ? "Can change things" : "Read only"}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-stone-700">{scope.grants}</p>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            <span className="font-medium text-stone-600">Still cannot: </span>
            {scope.limit}
          </p>
        </div>
      </div>
    </li>
  );
}

function NeverLists() {
  return (
    <div className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
          <Eye className="h-4 w-4" aria-hidden="true" /> Never shown to any AI
        </p>
        <ul className="mt-2 space-y-1.5">
          {NEVER_EXPOSED.map((entry) => (
            <li key={entry} className="text-sm leading-6 text-stone-700">
              {entry}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
          <Lock className="h-4 w-4" aria-hidden="true" /> Never allowed, whatever you approve
        </p>
        <ul className="mt-2 space-y-1.5">
          {NEVER_PERMITTED.map((entry) => (
            <li key={entry} className="text-sm leading-6 text-stone-700">
              {entry}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ClientIdentity({ connection }: { connection: ConnectionRow }) {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          What it called itself
        </dt>
        <dd className="mt-1 break-words text-stone-800">
          {connection.observedClientName ?? "It did not give a name."}
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            This is a name the software chose for itself. It is a label to help you recognise it —
            not proof of what it is.
          </span>
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          How it identified itself
        </dt>
        <dd className="mt-1 text-stone-800">
          {PROVENANCE_COPY[connection.clientProvenance]}
          <span className="mt-1 block break-all font-mono text-xs text-stone-500">
            {connection.clientId}
          </span>
        </dd>
      </div>
    </dl>
  );
}

/* ----------------------------------------------------- consent screen */

function ApprovalForm({
  connection,
  busy,
  onApprove,
  onDeny,
}: {
  connection: ConnectionRow;
  busy: boolean;
  onApprove: (input: {
    label: string;
    scopes: FamilyHistoryScope[];
    boundary: ConnectionBoundary;
    expiresInDays: number;
  }) => void;
  onDeny: (reason: string) => void;
}) {
  const [label, setLabel] = useState(connection.label);
  const [scopes, setScopes] = useState<FamilyHistoryScope[]>([]);
  const [boundaryKind, setBoundaryKind] = useState<ConnectionBoundary["kind"]>("queue_only");
  const [personIdText, setPersonIdText] = useState("");
  const [queueItemText, setQueueItemText] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [denyReason, setDenyReason] = useState("");

  const personIds = useMemo(() => parseIdList(personIdText), [personIdText]);
  const queueItemIds = useMemo(() => parseIdList(queueItemText), [queueItemText]);
  const boundaryIncomplete = boundaryKind === "selected_people" && personIds.length === 0;

  function toggleScope(scope: FamilyHistoryScope, next: boolean) {
    setScopes((current) =>
      next ? [...new Set([...current, scope])] : current.filter((entry) => entry !== scope),
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-600">
          1 · What may it do?
        </h4>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          Tick only what this AI genuinely needs. Nothing is ticked for you.
        </p>
        <ul className="mt-3 space-y-3">
          {FAMILY_HISTORY_SCOPE_INFO.map((scope) => (
            <ScopeExplainer
              key={scope.scope}
              scope={scope}
              checked={scopes.includes(scope.scope)}
              onToggle={(next) => toggleScope(scope.scope, next)}
              disabled={busy}
              idPrefix={`approve-${connection.id}`}
            />
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-600">
          2 · Which records?
        </h4>
        <ul className="mt-3 space-y-3">
          {BOUNDARY_CHOICES.map((choice) => (
            <li key={choice.kind} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex gap-3">
                <input
                  id={`boundary-${connection.id}-${choice.kind}`}
                  type="radio"
                  name={`boundary-${connection.id}`}
                  checked={boundaryKind === choice.kind}
                  disabled={busy}
                  onChange={() => setBoundaryKind(choice.kind)}
                  className="mt-1 h-5 w-5 shrink-0 accent-emerald-800"
                />
                <div className="min-w-0">
                  <Label
                    htmlFor={`boundary-${connection.id}-${choice.kind}`}
                    className="text-sm font-semibold text-stone-900"
                  >
                    {choice.label}
                  </Label>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{choice.detail}</p>
                  {choice.kind === "selected_people" && boundaryKind === "selected_people" && (
                    <Textarea
                      value={personIdText}
                      disabled={busy}
                      onChange={(event) => setPersonIdText(event.target.value)}
                      placeholder="Paste person IDs, one per line"
                      className="mt-3 min-h-24 font-mono text-xs"
                      aria-label="Person IDs this connection may use"
                    />
                  )}
                  {choice.kind === "queue_only" && boundaryKind === "queue_only" && (
                    <Textarea
                      value={queueItemText}
                      disabled={busy}
                      onChange={(event) => setQueueItemText(event.target.value)}
                      placeholder="Optional: paste Queue item IDs to narrow it further"
                      className="mt-3 min-h-20 font-mono text-xs"
                      aria-label="Queue item IDs this connection may use"
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-600">
          3 · For how long?
        </h4>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          When this runs out the connection stops working until you approve it again. You can turn
          it off sooner at any time.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXPIRY_CHOICES.map((choice) => (
            <button
              key={choice.days}
              type="button"
              disabled={busy}
              onClick={() => setExpiresInDays(choice.days)}
              aria-pressed={expiresInDays === choice.days}
              className={cn(
                "min-h-11 rounded-lg border px-4 text-sm font-medium",
                expiresInDays === choice.days
                  ? "border-emerald-800 bg-emerald-800 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-400",
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-600">
          4 · What will you call it?
        </h4>
        <Input
          value={label}
          disabled={busy}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          className="mt-3 h-11 max-w-md"
          aria-label="Your name for this connection"
        />
      </div>

      <NeverLists />

      <div className="flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center">
        <Button
          type="button"
          disabled={busy || scopes.length === 0 || boundaryIncomplete || !label.trim()}
          onClick={() =>
            onApprove({
              label: label.trim(),
              scopes,
              boundary: {
                kind: boundaryKind,
                personIds: boundaryKind === "selected_people" ? personIds : undefined,
                queueItemIds:
                  boundaryKind === "queue_only" && queueItemIds.length ? queueItemIds : undefined,
              },
              expiresInDays,
            })
          }
          className="min-h-11 bg-emerald-800 hover:bg-emerald-900 sm:w-auto"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Approve exactly this
        </Button>
        <span className="text-sm text-stone-500">
          {scopes.length === 0
            ? "Tick at least one permission first."
            : boundaryIncomplete
              ? "Name at least one person for that boundary."
              : `${scopes.length} permission${scopes.length === 1 ? "" : "s"}, ${boundarySummary({
                  kind: boundaryKind,
                  personIds,
                  queueItemIds,
                }).toLowerCase()}.`}
        </span>
      </div>

      <details className="rounded-lg border border-stone-200 bg-stone-50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-stone-700">
          I do not recognise this — decline it
        </summary>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={denyReason}
            disabled={busy}
            maxLength={300}
            onChange={(event) => setDenyReason(event.target.value)}
            placeholder="Why, for your own record (optional)"
            className="h-11 sm:max-w-sm"
            aria-label="Reason for declining"
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onDeny(denyReason.trim())}
            className="min-h-11 sm:w-auto"
          >
            Decline
          </Button>
        </div>
      </details>
    </div>
  );
}

/* ---------------------------------------------------- active connection */

function ActiveConnectionControls({
  connection,
  busy,
  onReduce,
  onRevoke,
}: {
  connection: ConnectionRow;
  busy: boolean;
  onReduce: (scopes: FamilyHistoryScope[]) => void;
  onRevoke: (reason: string) => void;
}) {
  const [kept, setKept] = useState<FamilyHistoryScope[]>(connection.scopes);
  const [revokeReason, setRevokeReason] = useState("");
  const narrowed = kept.length < connection.scopes.length && kept.length > 0;

  return (
    <div className="mt-5 space-y-5">
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-600">
          What you approved
        </h4>
        <ul className="mt-3 space-y-3">
          {FAMILY_HISTORY_SCOPE_INFO.filter((scope) => connection.scopes.includes(scope.scope)).map(
            (scope) => (
              <ScopeExplainer
                key={scope.scope}
                scope={scope}
                checked={kept.includes(scope.scope)}
                onToggle={(next) =>
                  setKept((current) =>
                    next
                      ? [...new Set([...current, scope.scope])]
                      : current.filter((entry) => entry !== scope.scope),
                  )
                }
                disabled={busy}
                idPrefix={`narrow-${connection.id}`}
              />
            ),
          )}
        </ul>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !narrowed}
            onClick={() => onReduce(kept)}
            className="min-h-11 sm:w-auto"
          >
            Narrow to what is still ticked
          </Button>
          <span className="text-sm text-stone-500">
            Untick to take a permission away. Giving one back needs a fresh approval, so you always
            see the consent screen again before a connection gets more.
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
          <ShieldOff className="h-4 w-4" aria-hidden="true" /> Turn this connection off
        </p>
        <p className="mt-1 text-sm leading-6 text-red-900/80">
          This takes effect on the connection&apos;s very next request — not whenever its sign-in
          happens to run out. The moment you turn it off, the next thing that AI tries is refused.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={revokeReason}
            disabled={busy}
            maxLength={300}
            onChange={(event) => setRevokeReason(event.target.value)}
            placeholder="Why, for your own record (optional)"
            className="h-11 bg-white sm:max-w-sm"
            aria-label="Reason for turning this connection off"
          />
          <Button
            type="button"
            disabled={busy}
            onClick={() => onRevoke(revokeReason.trim())}
            className="min-h-11 bg-red-700 hover:bg-red-800 sm:w-auto"
          >
            Turn it off now
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export function AiConnectionCenter({
  initialConnections,
  initialActivity,
}: {
  initialConnections: ConnectionRow[];
  initialActivity: ConnectionActivityRow[];
}) {
  const [connections, setConnections] = useState(initialConnections);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = connections.filter((row) => row.status === "pending");
  const active = connections.filter((row) => row.status === "active");
  const closed = connections.filter(
    (row) => row.status === "revoked" || row.status === "denied" || row.status === "expired",
  );

  async function send(grantId: string, body: Record<string, unknown>, success: string) {
    setBusyId(grantId);
    try {
      const response = await fetch("/api/ai-connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, grantId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: ConnectionRow["status"];
        scopes?: FamilyHistoryScope[];
        removed?: boolean;
      };
      if (!response.ok) {
        toast.error(payload.error ?? "That connection change could not be applied.");
        return;
      }
      toast.success(success);
      setConnections((current) => {
        if (payload.removed) return current.filter((row) => row.id !== grantId);
        return current.map((row) =>
          row.id === grantId
            ? {
                ...row,
                status: payload.status ?? row.status,
                scopes: payload.scopes ?? row.scopes,
              }
            : row,
        );
      });
    } catch {
      toast.error("That connection change could not be sent. Check your network and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(MANUAL_QUEUE_BRIEF);
      setCopied(true);
      toast.success("Brief copied. Fill it in from your own workspace before you paste it.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copying failed. Select the text and copy it manually.");
    }
  }

  return (
    <div className="space-y-10">
      {/* ------------------------------------------- the whole ceiling */}
      <section aria-labelledby="ceiling-heading">
        <h2
          id="ceiling-heading"
          className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
        >
          Everything an AI can ever be given here
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          These six permissions are the whole list. There is no seventh, no hidden one, and no
          setting that grants more — anything not named here has no way in at all. Every consent
          screen below is built from this same list, so what you are shown and what the server
          allows cannot drift apart.
        </p>
        <ul className="mt-4 space-y-3">
          {FAMILY_HISTORY_SCOPE_INFO.map((scope) => (
            <ScopeExplainer key={scope.scope} scope={scope} checked idPrefix="ceiling" />
          ))}
        </ul>
        <div className="mt-4">
          <NeverLists />
        </div>
      </section>

      {/* ------------------------------------------------ waiting for you */}
      <section aria-labelledby="pending-heading">
        <h2
          id="pending-heading"
          className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
        >
          Waiting for you
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Nothing is waiting. When an AI signs in here for the first time it is refused and lands
            in this list, so it can never start working before you have said what it may do.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {pending.map((connection) => (
              <article
                key={connection.id}
                className="rounded-xl border border-amber-300 bg-amber-50/60 p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <PlugZap className="h-5 w-5 text-amber-800" aria-hidden="true" />
                  <h3 className="text-lg font-semibold text-stone-900">{connection.label}</h3>
                  <Badge className={STATUS_COPY.pending.tone}>{STATUS_COPY.pending.label}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  {STATUS_COPY.pending.meaning} Signing in proved whose workspace this is; it did
                  not decide what this connection may do. That is this page&apos;s whole job.
                </p>
                <ClientIdentity connection={connection} />
                <p className="mt-3 text-xs text-stone-500">
                  First asked {formatDateTime(connection.requestedAt)}
                </p>
                <ApprovalForm
                  connection={connection}
                  busy={busyId === connection.id}
                  onApprove={(input) =>
                    send(
                      connection.id,
                      {
                        action: "approve",
                        label: input.label,
                        scopes: input.scopes,
                        boundary: input.boundary,
                        expiresInDays: input.expiresInDays,
                      },
                      "Approved. This connection now works inside exactly what you chose.",
                    )
                  }
                  onDeny={(reason) =>
                    send(
                      connection.id,
                      { action: "deny", reason: reason || undefined },
                      "Declined. It was never given any permission.",
                    )
                  }
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ connected */}
      <section aria-labelledby="active-heading">
        <h2
          id="active-heading"
          className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
        >
          Connected now
        </h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-stone-600">
            No AI is connected to this workspace.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {active.map((connection) => {
              const snapshot = readSnapshot(connection.consentSnapshot);
              return (
                <article
                  key={connection.id}
                  className="rounded-xl border border-stone-300 bg-white p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <PlugZap className="h-5 w-5 text-emerald-800" aria-hidden="true" />
                    <h3 className="text-lg font-semibold text-stone-900">{connection.label}</h3>
                    <Badge className={STATUS_COPY.active.tone}>{STATUS_COPY.active.label}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    {STATUS_COPY.active.meaning}
                  </p>
                  <ClientIdentity connection={connection} />
                  <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Records it may reach
                      </dt>
                      <dd className="mt-1 text-stone-800">{boundarySummary(connection.boundary)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Runs out
                      </dt>
                      <dd className="mt-1 text-stone-800">{formatDate(connection.expiresAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Last used
                      </dt>
                      <dd className="mt-1 text-stone-800">
                        {formatDateTime(connection.lastUsedAt)}
                        {connection.lastToolName ? (
                          <span className="mt-0.5 block break-all font-mono text-xs text-stone-500">
                            {connection.lastToolName}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Times used
                      </dt>
                      <dd className="mt-1 text-stone-800">{connection.useCount}</dd>
                    </div>
                  </dl>
                  {snapshot?.shownAt ? (
                    <p className="mt-3 text-xs leading-5 text-stone-500">
                      What you were shown when you approved this on{" "}
                      {formatDateTime(snapshot.shownAt)} is kept word for word, so a later change to
                      this page can never rewrite what you agreed to.
                    </p>
                  ) : null}
                  <ActiveConnectionControls
                    connection={connection}
                    busy={busyId === connection.id}
                    onReduce={(scopes) =>
                      send(
                        connection.id,
                        { action: "reduce", scopes },
                        "Narrowed. The next thing this AI tries is judged against the smaller list.",
                      )
                    }
                    onRevoke={(reason) =>
                      send(
                        connection.id,
                        { action: "revoke", reason: reason || undefined },
                        "Turned off. Its very next request is refused.",
                      )
                    }
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- closed */}
      {closed.length > 0 && (
        <section aria-labelledby="closed-heading">
          <h2
            id="closed-heading"
            className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
          >
            No longer connected
          </h2>
          <ul className="mt-4 space-y-3">
            {closed.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-900">{connection.label}</span>
                    <Badge className={STATUS_COPY[connection.status].tone}>
                      {STATUS_COPY[connection.status].label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {STATUS_COPY[connection.status].meaning}
                    {connection.revokedReason ? ` You noted: “${connection.revokedReason}”` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId === connection.id}
                  onClick={() =>
                    send(connection.id, { action: "remove" }, "Removed from this list.")
                  }
                  className="min-h-11 shrink-0 sm:w-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Remove from this list
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------- activity */}
      <section aria-labelledby="activity-heading">
        <h2
          id="activity-heading"
          className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
        >
          Recent activity
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Which tool ran and how it ended. Nothing your family records actually say is ever kept
          here — this is a log of activity, not of content.
        </p>
        {initialActivity.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">No AI has used this workspace yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    When
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Tool
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Outcome
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialActivity.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100">
                    <td className="py-2 pr-4 whitespace-nowrap text-stone-600">
                      {formatDateTime(row.at)}
                    </td>
                    <td className="py-2 pr-4 break-all font-mono text-xs text-stone-800">
                      {row.tool ?? "—"}
                    </td>
                    <td className="py-2">
                      <Badge
                        className={cn(
                          "text-[11px]",
                          row.outcome === "ok"
                            ? "bg-emerald-100 text-emerald-900"
                            : row.outcome === "denied"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-stone-200 text-stone-700",
                        )}
                      >
                        {row.outcome === "ok"
                          ? "Worked"
                          : row.outcome === "denied"
                            ? "Refused"
                            : row.outcome === "rate_limited"
                              ? "Slowed down"
                              : "Failed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------------------------------------------- stale-tool recovery */}
      <section aria-labelledby="stale-heading" className="rounded-xl border border-stone-200 bg-stone-50 p-5 sm:p-6">
        <h2
          id="stale-heading"
          className="flex items-center gap-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
        >
          <RefreshCw className="h-5 w-5 text-stone-600" aria-hidden="true" /> If the tools look wrong
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          After we release a change, an assistant can hold on to the old list of tools and keep
          calling names that no longer mean anything. Nothing is broken and nothing is lost — it just
          needs to ask again.
        </p>
        <ol className="mt-4 space-y-2 text-sm leading-6 text-stone-700">
          <li>1. In your AI, disconnect the Assist With Family History server.</li>
          <li>2. Add it back with the same address.</li>
          <li>3. Sign in again when it asks.</li>
          <li>
            4. Ask it to list the tools it now has. The names should start with{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">family_history_</code>.
          </li>
          <li>
            5. Check this page. If the connection shows here as approved, its permissions are
            unchanged — reconnecting does not widen anything.
          </li>
        </ol>
        <p className="mt-3 flex gap-2 text-sm leading-6 text-stone-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          If it still refuses everything, look at the status above. A connection that ran out or was
          turned off is refused on purpose, and reconnecting will not change that — approve a fresh
          request instead.
        </p>
      </section>

      {/* ---------------------------------------------- manual fallback */}
      <section aria-labelledby="manual-heading">
        <h2
          id="manual-heading"
          className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900"
        >
          When an assistant cannot connect at all
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Plenty of assistants cannot connect to anything. You can still use one: copy this brief,
          fill it in from your own workspace, and paste it into any chat. It carries context and no
          authority — nothing you paste can reach back into your records.
        </p>
        <div className="mt-4 rounded-xl border border-stone-300 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <Clock className="h-4 w-4" aria-hidden="true" /> One question, one family line
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={copyBrief}
              className="min-h-11 sm:w-auto"
            >
              <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
              {copied ? "Copied" : "Copy the brief"}
            </Button>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-stone-800">
            <code>{MANUAL_QUEUE_BRIEF}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}
