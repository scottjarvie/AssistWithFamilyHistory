"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface OperationRowActionsProps {
  rowType: "person" | "provisional";
  personFsId: string | null;
  provisionalId?: string;
  anchorPersonFsId?: string;
  missingCritical: string[];
}

export function OperationRowActions({
  rowType,
  personFsId,
  provisionalId,
  anchorPersonFsId,
  missingCritical,
}: OperationRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [merging, setMerging] = useState(false);

  async function updateCheck(status: "complete" | "not_applicable") {
    const checkKey = missingCritical[0];
    if (!personFsId || !checkKey) return;

    startTransition(async () => {
      const response = await fetch("/api/operations/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personFsId,
          checkKey,
          status,
          completionSource: "user",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not update research check");
        return;
      }
      toast.success(`Updated ${checkKey.replace(/_/g, " ")}`);
      router.refresh();
    });
  }

  async function promoteProvisional() {
    if (!provisionalId) return;
    startTransition(async () => {
      const response = await fetch("/api/operations/provisional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provisionalId,
          action: "promote",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not promote provisional relative");
        return;
      }
      toast.success("Promoted provisional relative");
      router.refresh();
    });
  }

  async function mergeProvisional() {
    if (!provisionalId) return;
    const targetPersonFsId = window.prompt("Merge into which person ID?");
    if (!targetPersonFsId) return;

    setMerging(true);
    try {
      const response = await fetch("/api/operations/provisional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provisionalId,
          action: "merge",
          targetPersonFsId,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not merge provisional relative");
        return;
      }
      toast.success("Merged provisional relative");
      router.refresh();
    } finally {
      setMerging(false);
    }
  }

  if (rowType === "provisional") {
    return (
      <div className="flex flex-wrap gap-2">
        {anchorPersonFsId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/people/${anchorPersonFsId}`}>Open Anchor</Link>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={promoteProvisional} disabled={isPending || merging}>
          Promote
        </Button>
        <Button size="sm" variant="outline" onClick={mergeProvisional} disabled={isPending || merging}>
          Merge
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {personFsId ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/people/${personFsId}`}>Open Person</Link>
        </Button>
      ) : null}
      {personFsId ? (
        <Button asChild size="sm" variant="outline">
          <a href={`/api/people/${personFsId}/context-pack?format=markdown`}>Context Pack</a>
        </Button>
      ) : null}
      {missingCritical.length > 0 ? (
        <>
          <Button size="sm" onClick={() => updateCheck("complete")} disabled={isPending}>
            Mark Done
          </Button>
          <Button size="sm" variant="outline" onClick={() => updateCheck("not_applicable")} disabled={isPending}>
            Not Applicable
          </Button>
        </>
      ) : null}
    </div>
  );
}

