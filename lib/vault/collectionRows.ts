import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { publicStoryPath } from "@/lib/stories/slug";

type Place = FunctionReturnType<typeof api.vaultReads.getPlacesExplorer>[number];
type Story = FunctionReturnType<typeof api.vaultReads.getStoriesIndex>[number];
type Candidate = FunctionReturnType<typeof api.vaultReads.getStoryReadinessCandidates>[number];
type Research = FunctionReturnType<typeof api.vaultReads.getResearchOverview>;

// Never spread a backend document into a client collection row.
export function projectPlaceRow(p: Place) {
  return { id: String(p._id), name: p.fullName, kind: p.type, events: p.stats.events, citations: p.stats.citations, media: p.stats.media };
}
export type PlaceCollectionRow = ReturnType<typeof projectPlaceRow>;

export function projectStoryRow(s: Story) {
  return {
    id: String(s._id), title: s.title, content: s.content, kind: s.type, status: s.status, workflow: s.storyWorkflow,
    person: s.person?.displayName || "Unlinked story", sources: s.evidenceCount, places: s.placeCount,
    context: s.contextReportCount, ready: s.readiness?.completionPercent ?? 0, warnings: s.publishWarnings.length,
    publicHref: s.status === "published" ? publicStoryPath(s.publicSlug ?? String(s._id)) : null,
  };
}
export type StoryCollectionRow = ReturnType<typeof projectStoryRow>;

export function projectWritingCandidate(p: Candidate) {
  return { id: String(p._id), routeId: p.routeId, name: p.displayName, lifespan: p.lifespan.replace(/ to /g,"–"), workflow: p.storyWorkflow, sources: p.sourceCount, context: p.contextReportCount, ready: p.completionPercent };
}
export type WritingCandidateRow = ReturnType<typeof projectWritingCandidate>;

function personLabel(p: { name: { given: string; surname?: string }; fsId?: string; _id: unknown } | null) {
  return p ? { name: [p.name.given,p.name.surname].filter(Boolean).join(" "), href: `/app/people/${p.fsId || String(p._id)}` } : null;
}
export function projectResearchTask(t: Research["tasks"][number]) {
  return { id: String(t._id), title: t.title, description: t.description || t.type, kind: t.type, priority: t.priority, status: t.status, suggested: t.aiSuggested, updatedAt: t.updatedAt, person: personLabel(t.person) };
}
export type ResearchTaskRow = ReturnType<typeof projectResearchTask>;
export function projectResearchLog(e: Research["logEntries"][number]) {
  const p = e.creationProvenance;
  return { id: String(e._id), summary: e.summary, kind: e.activityType, updatedAt: e.updatedAt, person: personLabel(e.person), authorKind: p?.actorKind || null, method: p?.method || null, modelHint: e.model || null };
}
export type ResearchLogRow = ReturnType<typeof projectResearchLog>;
