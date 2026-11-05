"use client";
import {useState,useTransition} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {ArrowRight,LoaderCircle,X} from "./QueueGlyph";
import {useQueueDraft,useQueuePreview} from "./QueueDrafts";
import type {QueueItemRecord} from "@/lib/queue/presentation";
export type QueueCommand="claim"|"checkpoint"|"resume"|"complete"|"cancel"|"reopen";
export function QueueActionForm({
  item,
  command,
  label,
  prompt,
  placeholder,
  submitLabel,
  onDone,
  onCancel,
  onReload,
}: {
  item: QueueItemRecord;
  command: QueueCommand;
  label: string;
  prompt: string;
  placeholder: string;
  submitLabel: string;
  onDone: (item: QueueItemRecord) => void;
  onCancel: () => void;
  onReload: () => Promise<boolean|void>;
}) {
  const [value, setValue] = useQueueDraft(`${item._id}:${command}`);
  const readonlyPreview=useQueuePreview();
  const [conflict,setConflict]=useState(false);
  const [isReloading,setIsReloading]=useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(readonlyPreview)return;
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
          if (response.status === 409) {setConflict(true);throw new Error("This item changed elsewhere. Reload it before trying again.");}
          throw new Error(payload.details || payload.error || "Queue command failed");
        }
        toast.success(`${label} recorded`);
        setConflict(false);
        setValue("");
        onDone(payload.item);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Queue command failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-muted/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{prompt}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label={`Close ${label}`}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <Textarea
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        rows={3}
        maxLength={command === "complete" ? 4000 : 1000}
        placeholder={placeholder}
        className="mt-3 resize-y border-border bg-card"
      />
      {conflict&&<div role="alert" className="mt-3 text-sm text-warning"><p>This item changed elsewhere. Reload it before trying again. Your draft stays here.</p><Button type="button" variant="outline" className="mt-2 min-h-11" disabled={isReloading} onClick={async()=>{setIsReloading(true);try{const fresh=await onReload();if(fresh!==false)setConflict(false);}finally{setIsReloading(false);}}}>{isReloading?"Reloading…":"Reload this item"}</Button></div>}
      <Button type="submit" disabled={readonlyPreview || isPending || isReloading || conflict || !value.trim()} size="sm" className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90">
        {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  );
}

