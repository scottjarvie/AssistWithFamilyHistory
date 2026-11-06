"use client";

import { useMemo, useState } from "react";
import { SectionGlyph } from "@/components/design/SectionGlyph";
import { UtcDate } from "@/components/design/UtcDate";
import { Button } from "@/components/ui/button";
import { WorkspaceStateCard } from "@/components/vault/WorkspaceStateCard";

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

function describeEvent(event: StoryReviewEvent) {
  if (event.eventType === "publish_confirmation") return "Public publish confirmed by trusted publisher.";
  if (event.eventType === "publish_preview") return "Publish blockers, warnings, and provenance were captured.";
  if (event.eventType === "assignment") return event.assignedTo ? `Assigned to ${event.assignedTo}.` : "Reviewer assignment updated.";
  if (event.fromStatus && event.toStatus) return `${event.fromStatus} -> ${event.toStatus}`;
  return "No status change.";
}

export function StoryReviewHistoryPanel({ events, initialLimit }: { events: StoryReviewEvent[]; initialLimit?:number }) {
  const [showAll,setShowAll]=useState(false);
  const [filter, setFilter] = useState<StoryReviewEvent["eventType"] | "all">("all");
  const filteredEvents = useMemo(
    () => events.filter((event) => filter === "all" || event.eventType === filter).toSorted((a,b)=>(b.createdAt||0)-(a.createdAt||0)||a._id.localeCompare(b._id)),
    [events, filter]
  );

  const visibleEvents=initialLimit&&!showAll?filteredEvents.slice(0,initialLimit):filteredEvents;
  if (events.length === 0) {
    return (
      <WorkspaceStateCard
        kind="empty"
        title="No review activity yet"
        description="Review and publication events will appear here after they are recorded."
        badge={null}
        density="compact"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <SectionGlyph kind="history"/>
          Filter
        </div>
        {(["all",...Object.keys(eventLabels).filter(key=>events.some(event=>event.eventType===key))] as ("all"|StoryReviewEvent["eventType"])[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter===value}
            onClick={() => {setFilter(value);setShowAll(false);}}
            className={`min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
              filter === value ? "border-primary bg-secondary text-foreground" : "border-border bg-card text-foreground"
            }`}
          >
            {value === "all" ? "All" : eventLabels[value]}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <WorkspaceStateCard
          kind="empty"
          title="No matching review events"
          description="Choose another filter to see the activity recorded for this story."
          badge={null}
          density="compact"
        />
      ) : (
        visibleEvents.map((event) => (
          <div key={String(event._id)} className="border-b border-border bg-card px-0 py-4 last:border-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold"><SectionGlyph kind={event.eventType==="draft_edit"?"draft":"review"}/>{eventLabels[event.eventType]}</p>
                <p className="mt-1 text-sm opacity-80">{describeEvent(event)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {event.createdAt?<UtcDate value={event.createdAt} withTime/>:"Unknown time"}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-80">
              <span className="rounded-full border border-border px-2 py-1">Actor: {event.actorName || event.actorRole.replace(/_/g," ")}</span>
              {event.reviewerName ? <span className="bg-card/70 px-2 py-1">reviewer: {event.reviewerName}</span> : null}
              {typeof event.readinessScore === "number" ? <span className="bg-card/70 px-2 py-1">score: {event.readinessScore}%</span> : null}
              {typeof event.blockerCount === "number" ? <span className="bg-card/70 px-2 py-1">blockers: {event.blockerCount}</span> : null}
              {typeof event.warningCount === "number" ? <span className="bg-card/70 px-2 py-1">warnings: {event.warningCount}</span> : null}
            </div>
            {event.humanReviewNote ? (
              <p className="mt-3 text-sm leading-6 opacity-90">{event.humanReviewNote}</p>
            ) : null}
            {event.readinessSnapshot ? (
              <details className="mt-3 border border-border bg-card/70 px-3 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <SectionGlyph kind="review"/>
                  Publish preview snapshot
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
                  {JSON.stringify(event.readinessSnapshot, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ))
      )}
      {filteredEvents.length>visibleEvents.length&&<Button variant="outline" className="min-h-11" onClick={()=>setShowAll(true)}>{filteredEvents.length-visibleEvents.length} earlier {filteredEvents.length-visibleEvents.length===1?"entry":"entries"} · Show all</Button>}
    </div>
  );
}
