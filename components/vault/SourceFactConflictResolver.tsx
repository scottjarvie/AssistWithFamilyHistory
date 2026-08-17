"use client";

/**
 * AWF-0046: the person's closing move on a conflicting source-backed fact.
 *
 * A census says 1847 and a headstone says 1849. The vault could flag that and
 * never settle it. This is the settling: read both readings side by side,
 * choose which record you believe, and write down why.
 *
 * Two things it deliberately keeps visible. The reading you decide against is
 * never deleted — it stays in the vault as evidence of what you weighed. And a
 * connected AI can propose an answer here, on the research task, but only a
 * signed-in person can record the decision.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CONFLICT_REASON_MIN } from "@/lib/vault/conflictResolution";

export type ConflictingFact = {
  _id: string;
  factType: string;
  label: string;
  value: string;
  confidence: string;
  conflictReason?: string;
};

export function SourceFactConflictResolver({
  fact,
  canonicalReading,
}: {
  fact: ConflictingFact;
  /** What this vault currently concludes — the other side of the disagreement. */
  canonicalReading?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const trimmed = reason.trim();
  const ready = trimmed.length >= CONFLICT_REASON_MIN;

  function resolve(resolution: "accepted" | "rejected") {
    if (!ready) {
      toast.error(`Write at least ${CONFLICT_REASON_MIN} characters explaining why.`);
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/operations/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFactId: fact._id, resolution, reason: trimmed }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not record your decision");
        return;
      }
      toast.success(
        resolution === "accepted"
          ? "Recorded: you believed the source reading"
          : "Recorded: you kept this vault's reading"
      );
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={() => setOpen(true)}
      >
        Decide which record to believe
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <div className="text-xs text-amber-900">
          <p className="font-medium">Two records disagree. You decide which one to believe.</p>
          <p className="mt-1">
            Whichever you choose, the other reading stays in your vault. Nothing is deleted, so a
            reader a year from now can still see what you weighed.
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded border border-stone-200 bg-white px-3 py-2">
          <dt className="text-stone-500">This source reads</dt>
          <dd className="mt-1 font-medium text-stone-900">{fact.value}</dd>
          <Badge variant="secondary" className="mt-2">confidence: {fact.confidence}</Badge>
        </div>
        <div className="rounded border border-stone-200 bg-white px-3 py-2">
          <dt className="text-stone-500">This vault reads</dt>
          <dd className="mt-1 font-medium text-stone-900">
            {canonicalReading || "No reading recorded on the person"}
          </dd>
        </div>
      </dl>

      <label className="mt-3 block text-xs font-medium text-stone-700" htmlFor={`reason-${fact._id}`}>
        Why did you decide that? ({trimmed.length}/{CONFLICT_REASON_MIN})
      </label>
      <Textarea
        id={`reason-${fact._id}`}
        className="mt-1 bg-white"
        rows={3}
        value={reason}
        placeholder="The parish register is the original entry and was written within days; the family bible was copied out decades later."
        onChange={(event) => setReason(event.target.value)}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!ready || pending} onClick={() => resolve("accepted")}>
          {pending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" aria-hidden /> : null}
          I believe the source
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready || pending}
          onClick={() => resolve("rejected")}
        >
          I keep this vault&apos;s reading
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
        >
          Not yet
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Accepting a source reading records your judgment about the evidence. It does not rewrite the
        person&apos;s recorded fact — that stays a separate, deliberate edit.
      </p>
    </div>
  );
}
