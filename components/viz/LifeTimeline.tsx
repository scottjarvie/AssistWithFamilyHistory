/**
 * LifeTimeline — a chronological rail of a person's sourced life events.
 *
 * Upgrades the flat event list into a vertical timeline that surfaces RESEARCH
 * GAPS: long stretches between dated events with no evidence, which is where an
 * operator (or an agent) should dig next. Pure presentational (no hooks/state),
 * so it renders inside the server-rendered person workspace with zero client JS.
 *
 * Read-only and owner-scoped by virtue of where it's rendered. It is NOT a
 * public surface — public/story-attached timelines must run through the
 * three-gate predicates before they can ship.
 */
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  _id: string;
  type: string;
  customType?: string;
  date?: { original?: string; year?: number };
  place?: { fullName?: string; name?: string };
  description?: string;
}

/** Years between dated events beyond which we flag a research gap. */
const GAP_YEARS = 15;

type Row =
  | { kind: "event"; event: TimelineEvent }
  | { kind: "gap"; fromYear: number; toYear: number };

function eventYear(event: TimelineEvent): number | null {
  return typeof event.date?.year === "number" ? event.date.year : null;
}

function placeLabel(event: TimelineEvent): string | null {
  return event.place?.fullName || event.place?.name || null;
}

function buildRows(events: TimelineEvent[]): Row[] {
  const rows: Row[] = [];
  let previousYear: number | null = null;
  for (const event of events) {
    const year = eventYear(event);
    if (previousYear !== null && year !== null && year - previousYear >= GAP_YEARS) {
      rows.push({ kind: "gap", fromYear: previousYear, toYear: year });
    }
    rows.push({ kind: "event", event });
    if (year !== null) previousYear = year;
  }
  return rows;
}

export function LifeTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  const rows = buildRows(events);

  return (
    <ol className="relative ml-1 border-l border-stone-200 pl-6">
      {rows.map((row, index) => {
        if (row.kind === "gap") {
          return (
            <li key={`gap-${index}`} className="mb-6">
              <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border border-dashed border-amber-400 bg-amber-50" />
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
                ~{row.toYear - row.fromYear} years with no sourced event ({row.fromYear}–{row.toYear}) — a research gap to investigate.
              </div>
            </li>
          );
        }

        const { event } = row;
        const year = eventYear(event);
        const place = placeLabel(event);
        const label = (event.customType || event.type).replace(/_/g, " ");

        return (
          <li key={String(event._id)} className="mb-6">
            <span
              className={cn(
                "absolute -left-[6px] mt-1.5 h-3 w-3 rounded-full border-2 border-white",
                year !== null ? "bg-amber-500" : "bg-stone-300",
              )}
            />
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900">
                {year ?? "—"}
              </span>
              <p className="font-medium capitalize text-stone-900">{label}</p>
            </div>
            <p className="mt-0.5 text-sm text-stone-500">
              {event.date?.original || "Undated"}
              {place ? ` · ${place}` : ""}
            </p>
            {event.description ? (
              <p className="mt-2 text-sm leading-6 text-stone-600">{event.description}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
