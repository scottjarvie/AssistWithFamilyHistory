"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type CheckRecord = {
  checkKey: string;
  status: "missing" | "in_progress" | "complete" | "not_applicable" | "needs_review";
  applicability: "required" | "recommended" | "not_applicable" | "unknown";
  completionSource?: string;
  confidence?: number;
  summary?: string;
  notes?: string;
  lastReviewedAt?: number;
};

export function ResearchChecksPanel({
  personIdentifier,
  checks,
}: {
  personIdentifier: string;
  checks: CheckRecord[];
}) {
  const router = useRouter();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: CheckRecord["status"]; notes: string }>>(
    () =>
      Object.fromEntries(
        checks.map((check) => [
          check.checkKey,
          {
            status: check.status,
            notes: check.notes || "",
          },
        ])
      )
  );

  function updateDraft(checkKey: string, next: Partial<{ status: CheckRecord["status"]; notes: string }>) {
    setDrafts((current) => ({
      ...current,
      [checkKey]: {
        ...current[checkKey],
        ...next,
      },
    }));
  }

  async function saveCheck(check: CheckRecord) {
    const draft = drafts[check.checkKey];
    setSavingKey(check.checkKey);
    try {
      const response = await fetch("/api/operations/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIdentifier,
          checkKey: check.checkKey,
          status: draft.status,
          applicability: check.applicability,
          notes: draft.notes,
          completionSource: "user",
          summary: check.summary,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error || "Could not save research check");
        return;
      }
      toast.success(`Saved ${check.checkKey.replace(/_/g, " ")}`);
      router.refresh();
    } finally {
      setSavingKey(null);
    }
  }

  async function createTask() {
    if (!taskTitle.trim()) {
      toast.error("Add a task title first");
      return;
    }

    const response = await fetch("/api/operations/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personIdentifier,
        title: taskTitle,
        description: taskDescription,
        priority: "medium",
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(payload?.error || "Could not create task");
      return;
    }

    setTaskTitle("");
    setTaskDescription("");
    toast.success("Research task created");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {checks.map((check) => {
          const draft = drafts[check.checkKey];
          const stale = isStaleCheck(check);
          return (
            <Card key={check.checkKey} className="border-stone-200">
              <CardContent className="grid gap-4 p-4 md:grid-cols-[1.2fr_180px_1fr_auto] md:items-start">
                <div>
                  <p className="font-medium text-stone-900">{check.checkKey.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {check.applicability} {check.summary ? `· ${check.summary}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                      Source: {formatCompletionSource(check.completionSource)}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                      Reviewed: {formatReviewedAt(check.lastReviewedAt)}
                    </span>
                    {typeof check.confidence === "number" ? (
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                        Confidence: {Math.round(check.confidence * 100)}%
                      </span>
                    ) : null}
                    {stale ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                        Stale review
                      </span>
                    ) : null}
                  </div>
                </div>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    updateDraft(check.checkKey, {
                      status: event.target.value as CheckRecord["status"],
                    })
                  }
                  className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
                >
                  <option value="missing">Missing</option>
                  <option value="in_progress">In progress</option>
                  <option value="complete">Complete</option>
                  <option value="needs_review">Needs review</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
                <Textarea
                  value={draft.notes}
                  onChange={(event) =>
                    updateDraft(check.checkKey, {
                      notes: event.target.value,
                    })
                  }
                  placeholder="Add notes for this check"
                  className="min-h-24"
                />
                <Button
                  onClick={() => startTransition(() => void saveCheck(check))}
                  disabled={savingKey === check.checkKey}
                >
                  Save
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-stone-200 bg-stone-50/60">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="Create a follow-up research task"
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          />
          <Textarea
            value={taskDescription}
            onChange={(event) => setTaskDescription(event.target.value)}
            placeholder="Short description for the task"
            className="min-h-24 bg-white"
          />
          <Button className="bg-stone-900 hover:bg-stone-800" onClick={() => void createTask()}>
            Add Task
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function isStaleCheck(check: CheckRecord) {
  if (!check.lastReviewedAt) return false;
  if (check.status === "missing" || check.status === "needs_review") return false;
  return check.lastReviewedAt < Date.now() - 1000 * 60 * 60 * 24 * 45;
}

function formatCompletionSource(source: CheckRecord["completionSource"]) {
  return source ? source.replace(/_/g, " ") : "inferred";
}

function formatReviewedAt(timestamp?: number) {
  if (!timestamp) return "not recorded";
  return new Date(timestamp).toLocaleDateString();
}
