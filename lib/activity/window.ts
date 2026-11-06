export type ActivityPeriod = "all" | "year" | "quarter" | "custom";
export type ActivityDates = { start: string; end: string };
export const activityDay = 86_400_000;
export const activityDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Periods end at the latest stored update. A custom bound replaces, rather than intersects, the preset. */
export function activityWindow(period: ActivityPeriod, dates: ActivityDates, first: number, latest: number) {
  const start = period === "custom" && dates.start ? Date.parse(`${dates.start}T00:00:00Z`) : period === "all" || period === "custom" ? -Infinity : latest - (period === "year" ? 365 : 90) * activityDay;
  const end = period === "custom" && dates.end ? Date.parse(`${dates.end}T00:00:00Z`) + activityDay - 1 : Infinity;
  const invalid = Number.isNaN(start) || Number.isNaN(end) || start > end;
  return { start, end, invalid, chartStart: Number.isFinite(start) ? start : first, chartEnd: Number.isFinite(end) ? end : latest };
}
