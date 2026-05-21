"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Filter } from "lucide-react";

type StoryReviewEvent = {
  _id: string;
  eventType: "publish_preview" | "status_change" | "publish_confirmation" | "assignment" | "draft_edit";
  fromStatus?: "draft" | "review" | "published";
  toStatus?: "draft" | "review" | "published";
  actorRole: string;
  actorName?: string;
  assignedTo?: string;
  reviewerName?: string;
  humanReviewNote?: string;
  readinessSnapshot?: unknown;
  blockerCount?: number;
  warningCount?: number;
  readinessScore?: number;
  createdAt?: number;
};

const eventLabels: Record<StoryReviewEvent["eventType"], string> = {
  publish_preview: "Publish preview",
  status_change: "Status change",
  publish_confirmation: "Publish confirmation",
  assignment: "Reviewer assignment",
  draft_edit: "Draft edit",
};

const eventTone: Record<StoryReviewEvent["eventType"], string> = {
  publish_preview: "border-blue-200 bg-blue-50 text-blue-900",
  status_change: "border-stone-200 bg-stone-50 text-stone-900",
  publish_confirmation: "border-emerald-200 bg-emerald-50 text-emerald-900",
  assignment: "border-amber-200 bg-amber-50 text-amber-900",
  draft_edit: "border-stone-200 bg-white text-stone-900",
};

function formatReviewEventDate(value?: number) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function describeEvent(event: StoryReviewEvent) {
  if (event.eventType === "publish_confirmation") return "Public publish confirmed by trusted publisher.";
  if (event.eventType === "publish_preview") return "Publish blockers, warnings, and provenance were captured.";
  if (event.eventType === "assignment") return event.assignedTo ? `Assigned to ${event.assignedTo}.` : "Reviewer assignment updated.";
  if (event.fromStatus && event.toStatus) return `${event.fromStatus} -> ${event.toStatus}`;
  return "No status change.";
}

export function StoryReviewHistoryPanel({ events }: { events: StoryReviewEvent[] }) {
  const [filter, setFilter] = useState<StoryReviewEvent["eventType"] | "all">("all");
  const filteredEvents = useMemo(
    () => events.filter((event) => filter === "all" || event.eventType === filter),
    [events, filter]
  );

  if (events.length === 0) {
    return <p className="text-sm text-stone-500">No review activity has been recorded yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
          <Filter className="h-4 w-4" />
          Filter
        </div>
        {(["all", "publish_preview", "assignment", "status_change", "publish_confirmation"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`border px-3 py-1.5 text-xs font-medium ${
              filter === value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700"
            }`}
          >
            {value === "all" ? "All" : eventLabels[value]}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <p className="border border-dashed border-stone-300 px-4 py-6 text-sm text-stone-500">
          No review events match this filter.
        </p>
      ) : (
        filteredEvents.map((event) => (
          <div key={String(event._id)} className={`border px-4 py-4 ${eventTone[event.eventType]}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium">{eventLabels[event.eventType]}</p>
                <p className="mt-1 text-sm opacity-80">{describeEvent(event)}</p>
              </div>
              <p className="text-xs uppercase tracking-[0.14em] opacity-70">
                {formatReviewEventDate(event.createdAt)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-80">
              <span className="bg-white/70 px-2 py-1">actor: {event.actorName || event.actorRole}</span>
              {event.reviewerName ? <span className="bg-white/70 px-2 py-1">reviewer: {event.reviewerName}</span> : null}
              {typeof event.readinessScore === "number" ? <span className="bg-white/70 px-2 py-1">score: {event.readinessScore}%</span> : null}
              {typeof event.blockerCount === "number" ? <span className="bg-white/70 px-2 py-1">blockers: {event.blockerCount}</span> : null}
              {typeof event.warningCount === "number" ? <span className="bg-white/70 px-2 py-1">warnings: {event.warningCount}</span> : null}
            </div>
            {event.humanReviewNote ? (
              <p className="mt-3 text-sm leading-6 opacity-90">{event.humanReviewNote}</p>
            ) : null}
            {event.readinessSnapshot ? (
              <details className="mt-3 border border-white/70 bg-white/70 px-3 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <ClipboardList className="h-4 w-4" />
                  Publish preview snapshot
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-stone-700">
                  {JSON.stringify(event.readinessSnapshot, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
