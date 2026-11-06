"use client";

import { SafeLink as Link } from "@/components/layout/SafeLink";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { LoaderCircle as Loader2, Search, CircleAlert as ShieldAlert } from "@/components/queue/QueueGlyph";
import { CopyGlyph as Copy } from "@/components/operations/OperationsGlyph";
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
import { Textarea } from "@/components/ui/textarea";

interface OperationRowActionsProps {
  readonlyPreview?: boolean;
  rowType: "person" | "provisional";
  personIdentifier: string | null;
  provisionalId?: string;
  anchorPersonIdentifier?: string;
  displayName: string;
  missingCritical: string[];
  nextActions: string[];
  sourceCount: number;
  memoryCount: number;
  documentCount: number;
  contextReportCount: number;
  storyWorkflow: string;
  staleChecksCount: number;
}

interface MergeCandidate {
  _id: string;
  displayName: string;
  fsId?: string;
  routeId: string;
}

export function OperationRowActions({
  readonlyPreview = false,
  rowType,
  personIdentifier,
  provisionalId,
  anchorPersonIdentifier,
  displayName,
  missingCritical,
  nextActions,
  sourceCount,
  memoryCount,
  documentCount,
  contextReportCount,
  storyWorkflow,
  staleChecksCount,
}: OperationRowActionsProps) {
  const router = useRouter();
  const noteId = useId();
  const [isPending, startTransition] = useTransition();
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [mergingTargetId, setMergingTargetId] = useState<string | null>(null);
  const [handoffDialogOpen, setHandoffDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    if (readonlyPreview || !mergeDialogOpen || mergeCandidates.length > 0) return;

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
  }, [readonlyPreview, mergeDialogOpen, mergeCandidates.length]);

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

  const handoffText = useMemo(
    () =>
      buildRowHandoffText({
        rowType,
        displayName,
        personIdentifier,
        provisionalId,
        anchorPersonIdentifier,
        missingCritical,
        nextActions,
        sourceCount,
        memoryCount,
        documentCount,
        contextReportCount,
        storyWorkflow,
        staleChecksCount,
      }),
    [
      anchorPersonIdentifier,
      contextReportCount,
      displayName,
      documentCount,
      memoryCount,
      missingCritical,
      nextActions,
      personIdentifier,
      provisionalId,
      rowType,
      sourceCount,
      staleChecksCount,
      storyWorkflow,
    ]
  );

  async function copyHandoff() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(handoffText);
      toast.success("Copied agent handoff");
    } catch {
      setHandoffDialogOpen(true);
      toast.error("Clipboard unavailable. Handoff text is open for manual copy.");
    }
  }

  const trimmedReviewNote = reviewNote.trim();
  const reviewNoteReady = trimmedReviewNote.length >= 20;

  async function updateCheck(status: "complete" | "not_applicable") {
    if (readonlyPreview) return;
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
    if (readonlyPreview || !provisionalId) return;
    if (!reviewNoteReady) {
      toast.error("Add a review note of at least 20 characters.");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/operations/provisional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provisionalId,
          action: "promote",
          humanReviewConfirmed: true,
          humanReviewNote: trimmedReviewNote,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not promote provisional relative");
        return;
      }
      toast.success("Promoted provisional relative");
      setPromoteDialogOpen(false);
      setReviewNote("");
      router.refresh();
    });
  }

  async function mergeProvisional(target: MergeCandidate) {
    if (readonlyPreview || !provisionalId) return;
    if (!reviewNoteReady) {
      toast.error("Add a review note of at least 20 characters.");
      return;
    }
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
          humanReviewNote: trimmedReviewNote,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not merge provisional relative");
        return;
      }
      toast.success("Merged provisional relative");
      setMergeDialogOpen(false);
      setReviewNote("");
      router.refresh();
    } finally {
      setMergingTargetId(null);
    }
  }

  const handoffDialog = (
    <Dialog open={handoffDialogOpen} onOpenChange={setHandoffDialogOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agent handoff</DialogTitle>
          <DialogDescription>
            Copy this packet into the next agent route or attach a privacy-safe reference to the relevant tracker Card.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={handoffText} readOnly className="min-h-[320px] font-mono text-sm" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setHandoffDialogOpen(false)}>
            Close
          </Button>
          <Button onClick={() => void copyHandoff()}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (rowType === "provisional") {
    const busy = isPending || mergingTargetId !== null;

    return (
      <>
        <div className="grid min-w-0 grid-cols-1 gap-2 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_a]:h-auto [&_a]:min-h-11 [&_a]:max-w-full [&_a]:whitespace-normal">
          <Button size="sm" variant="outline" onClick={() => void copyHandoff()} disabled={busy}>
            <Copy className="mr-2 h-4 w-4" />
            Handoff
          </Button>
          {anchorPersonIdentifier ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/people/${anchorPersonIdentifier}`}>Open Anchor</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setPromoteDialogOpen(true)} disabled={busy}>
            Promote
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMergeDialogOpen(true)} disabled={busy}>
            Merge
          </Button>
        </div>
        {handoffDialog}

        <Dialog
          open={promoteDialogOpen}
          onOpenChange={(open) => {
            setPromoteDialogOpen(open);
            if (!open) setReviewNote("");
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Promote provisional relative</DialogTitle>
              <DialogDescription>
                Promotion creates a canonical person from provisional evidence. Record what you reviewed before making this graph change.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">Human review required</p>
                  <p className="mt-1">
                    Confirm the provisional name, relationship hint, source evidence, and anchor person before promoting.
                  </p>
                </div>
              </div>
              <label htmlFor={`${noteId}-promote`} className="block text-sm font-medium">Review note</label>
              <Textarea id={`${noteId}-promote`}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Reviewed source title, relationship evidence, anchor person, and identity risk..."
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 20 characters. This note is written to the research log.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPromoteDialogOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void promoteProvisional()} disabled={readonlyPreview || busy || !reviewNoteReady}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Promote
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={mergeDialogOpen}
          onOpenChange={(open) => {
            setMergeDialogOpen(open);
            if (!open) {
              setCandidateQuery("");
              setReviewNote("");
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
              <div className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">Identity graph change</p>
                  <p className="mt-1">
                    Merge only after comparing the provisional evidence, source titles, and anchor person. The decision is logged to the research log.
                  </p>
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  placeholder="Search canonical people by name or ID"
                  className="pl-9"
                />
              </div>
              <label htmlFor={`${noteId}-merge`} className="block text-sm font-medium">Review note</label>
              <Textarea id={`${noteId}-merge`}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Reviewed provisional evidence, target identity, FamilySearch ID match if present, and anchor-person risk..."
                className="min-h-[110px]"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 20 characters. This note is written to the research log with the merge.
              </p>

              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading canonical people
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    {readonlyPreview ? "Synthetic preview: canonical people lookup is disconnected." : "No canonical people match this search."}
                  </div>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <button
                      key={candidate._id}
                      type="button"
                      onClick={() => void mergeProvisional(candidate)}
                      disabled={readonlyPreview || mergingTargetId !== null || !reviewNoteReady}
                      className="flex w-full items-center justify-between rounded-2xl border border-border px-4 py-4 text-left transition hover:border-primary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div>
                        <p className="font-medium text-foreground">{candidate.displayName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {candidate.fsId || candidate.routeId}
                        </p>
                      </div>
                      {mergingTargetId === candidate.routeId ? (
                        <Loader2 className="h-4 w-4 animate-spin text-warning" />
                      ) : (
                        <span className="text-sm font-medium text-warning">Merge</span>
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
    <>
      <div className="grid min-w-0 grid-cols-1 gap-2 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_a]:h-auto [&_a]:min-h-11 [&_a]:max-w-full [&_a]:whitespace-normal">
        <Button size="sm" variant="outline" onClick={() => void copyHandoff()} disabled={isPending}>
          <Copy className="mr-2 h-4 w-4" />
          Handoff
        </Button>
        {personIdentifier ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/people/${personIdentifier}`}>Open Person</Link>
          </Button>
        ) : null}
        {personIdentifier && !readonlyPreview ? (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/people/${personIdentifier}/context-pack?format=markdown`}>Context Pack</a>
          </Button>
        ) : null}
        {personIdentifier&&readonlyPreview&&<Button size="sm" variant="outline" disabled>Context Pack</Button>}
        {missingCritical.length > 0 ? (
          <>
            <Button size="sm" className="h-auto min-h-11 whitespace-normal text-left" onClick={() => updateCheck("complete")} disabled={readonlyPreview || isPending}>
              Mark {missingCritical[0].replace(/_/g," ")} done
            </Button>
            <Button size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal text-left" onClick={() => updateCheck("not_applicable")} disabled={readonlyPreview || isPending}>
              Mark {missingCritical[0].replace(/_/g," ")} not applicable
            </Button>
          </>
        ) : null}
      </div>
      {handoffDialog}
    </>
  );
}

function buildRowHandoffText(params: {
  rowType: "person" | "provisional";
  displayName: string;
  personIdentifier: string | null;
  provisionalId?: string;
  anchorPersonIdentifier?: string;
  missingCritical: string[];
  nextActions: string[];
  sourceCount: number;
  memoryCount: number;
  documentCount: number;
  contextReportCount: number;
  storyWorkflow: string;
  staleChecksCount: number;
}) {
  const routeLines = [
    `- Operations: /app/operations`,
    params.personIdentifier ? `- Person workspace: /app/people/${params.personIdentifier}` : null,
    params.personIdentifier
      ? `- Context pack: /api/people/${params.personIdentifier}/context-pack?format=markdown`
      : null,
    params.anchorPersonIdentifier ? `- Anchor workspace: /app/people/${params.anchorPersonIdentifier}` : null,
  ].filter(Boolean);

  const reviewLine =
    params.rowType === "provisional"
      ? "Human identity review required before promote, merge, or dismiss."
      : params.missingCritical.includes("identity_review") || params.missingCritical.includes("relationships")
        ? "Human review required before downstream story work."
        : "Agent can draft research or story prep, with human review before publication.";

  return [
    `# Operations Handoff: ${params.displayName}`,
    "",
    `- Row type: ${params.rowType}`,
    `- Person identifier: ${params.personIdentifier || "none"}`,
    `- Provisional ID: ${params.provisionalId || "none"}`,
    `- Anchor person: ${params.anchorPersonIdentifier || "none"}`,
    `- Story workflow: ${params.storyWorkflow}`,
    `- Evidence counts: ${params.sourceCount} sources, ${params.memoryCount} memories, ${params.documentCount} documents, ${params.contextReportCount} context reports`,
    `- Stale checks: ${params.staleChecksCount}`,
    `- Missing critical checks: ${params.missingCritical.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...(params.nextActions.length > 0 ? params.nextActions.map((action) => `- ${action}`) : ["- Queue is clear."]),
    "",
    "## Routes",
    "",
    ...routeLines,
    "",
    "## Review Rule",
    "",
    reviewLine,
  ].join("\n");
}
