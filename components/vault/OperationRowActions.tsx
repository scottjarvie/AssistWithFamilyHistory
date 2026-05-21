"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface OperationRowActionsProps {
  rowType: "person" | "provisional";
  personIdentifier: string | null;
  provisionalId?: string;
  anchorPersonIdentifier?: string;
  missingCritical: string[];
}

interface MergeCandidate {
  _id: string;
  displayName: string;
  fsId?: string;
  routeId: string;
}

export function OperationRowActions({
  rowType,
  personIdentifier,
  provisionalId,
  anchorPersonIdentifier,
  missingCritical,
}: OperationRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [mergingTargetId, setMergingTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!mergeDialogOpen || mergeCandidates.length > 0) return;

    let cancelled = false;

    async function loadCandidates() {
      setLoadingCandidates(true);
      try {
        const response = await fetch("/api/convex/people");
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Could not load canonical people");
        }

        if (!cancelled) {
          setMergeCandidates(Array.isArray(payload.people) ? payload.people : []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load canonical people");
          setMergeDialogOpen(false);
        }
      } finally {
        if (!cancelled) {
          setLoadingCandidates(false);
        }
      }
    }

    void loadCandidates();

    return () => {
      cancelled = true;
    };
  }, [mergeDialogOpen, mergeCandidates.length]);

  const filteredCandidates = useMemo(() => {
    const query = candidateQuery.trim().toLowerCase();

    return mergeCandidates
      .filter((candidate) => candidate.routeId !== anchorPersonIdentifier)
      .filter((candidate) => {
        if (!query) return true;

        return [candidate.displayName, candidate.fsId || "", candidate.routeId]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 10);
  }, [anchorPersonIdentifier, candidateQuery, mergeCandidates]);

  async function updateCheck(status: "complete" | "not_applicable") {
    const checkKey = missingCritical[0];
    if (!personIdentifier || !checkKey) return;

    startTransition(async () => {
      const response = await fetch("/api/operations/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIdentifier,
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
          humanReviewConfirmed: true,
          humanReviewNote: "Human operator reviewed this provisional relative before promotion.",
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

  async function mergeProvisional(target: MergeCandidate) {
    if (!provisionalId) return;
    if (anchorPersonIdentifier && target.routeId === anchorPersonIdentifier) {
      toast.error("Choose a different canonical person than the anchor person");
      return;
    }

    setMergingTargetId(target.routeId);
    try {
      const response = await fetch("/api/operations/provisional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provisionalId,
          action: "merge",
          targetPersonIdentifier: target.routeId,
          anchorPersonIdentifier,
          humanReviewConfirmed: true,
          humanReviewNote: `Human operator reviewed this provisional relative before merging into ${target.displayName}.`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not merge provisional relative");
        return;
      }
      toast.success("Merged provisional relative");
      setMergeDialogOpen(false);
      router.refresh();
    } finally {
      setMergingTargetId(null);
    }
  }

  if (rowType === "provisional") {
    const busy = isPending || mergingTargetId !== null;

    return (
      <>
        <div className="flex flex-wrap gap-2">
          {anchorPersonIdentifier ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/people/${anchorPersonIdentifier}`}>Open Anchor</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={promoteProvisional} disabled={busy}>
            Promote
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMergeDialogOpen(true)} disabled={busy}>
            Merge
          </Button>
        </div>

        <Dialog
          open={mergeDialogOpen}
          onOpenChange={(open) => {
            setMergeDialogOpen(open);
            if (!open) {
              setCandidateQuery("");
            }
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Merge provisional relative</DialogTitle>
              <DialogDescription>
                Choose an existing canonical person from this vault. This is a human-review action because it changes the identity graph.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <Input
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  placeholder="Search canonical people by name or ID"
                  className="pl-9"
                />
              </div>

              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-sm text-stone-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading canonical people
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                    No canonical people match this search.
                  </div>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <button
                      key={candidate._id}
                      type="button"
                      onClick={() => void mergeProvisional(candidate)}
                      disabled={mergingTargetId !== null}
                      className="flex w-full items-center justify-between rounded-2xl border border-stone-200 px-4 py-4 text-left transition hover:border-amber-300 hover:bg-amber-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div>
                        <p className="font-medium text-stone-900">{candidate.displayName}</p>
                        <p className="mt-1 text-sm text-stone-500">
                          {candidate.fsId || candidate.routeId}
                        </p>
                      </div>
                      {mergingTargetId === candidate.routeId ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-700" />
                      ) : (
                        <span className="text-sm font-medium text-amber-700">Merge</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMergeDialogOpen(false)} disabled={mergingTargetId !== null}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {personIdentifier ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/people/${personIdentifier}`}>Open Person</Link>
        </Button>
      ) : null}
      {personIdentifier ? (
        <Button asChild size="sm" variant="outline">
          <a href={`/api/people/${personIdentifier}/context-pack?format=markdown`}>Context Pack</a>
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
