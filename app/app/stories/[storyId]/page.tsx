import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileText,
  MapPinned,
  Milestone,
  ShieldCheck,
  UserCheck,
  UserRound,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StoryEditorForm } from "@/components/vault/StoryEditorForm";
import { StoryReviewAssignmentForm } from "@/components/vault/StoryReviewAssignmentForm";
import { StoryReviewHistoryPanel } from "@/components/vault/StoryReviewHistoryPanel";
import { StoryStatusActions } from "@/components/vault/StoryStatusActions";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { assessStoryPublishReadiness } from "@/lib/stories/publishSafety";
import { publicStoryPath } from "@/lib/stories/slug";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Review Story",
  description: "Review an ancestor story draft and decide whether it is ready to publish.",
  path: "/app/stories",
});

export const dynamic = "force-dynamic";

const statusTone = {
  draft: "bg-stone-100 text-stone-700 hover:bg-stone-100",
  review: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  published: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};

const publishGateTone = {
  blocker: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  passed: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

function formatEventDate(event: { date?: { original?: string; year?: number } }) {
  return event.date?.original || event.date?.year?.toString() || "Undated";
}

export default async function StoryReviewPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Story Review",
      "Story review needs the canonical vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { storyId } = await params;
  const { vaultOwnerId } = await getVaultAccessContext();
  let bundle;

  try {
    bundle = await getConvexClient().query(api.vault.getStoryReview, {
      vaultOwnerId,
      storyId: storyId as Id<"stories">,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  if (!bundle) notFound();

  const {
    story,
    person,
    readiness,
    evidence,
    events,
    places,
    media,
    researchChecks,
    contextCoverage,
    publishWarnings,
    historicalContext,
    relationships,
    provisionalRelatives,
    reviewHistory = [],
  } = bundle;
  const publishReadiness = assessStoryPublishReadiness({
    story,
    person,
    readiness,
    researchChecks,
    contextCoverage,
    evidence,
    events,
    places,
    relationships,
    provisionalRelatives,
    publishWarnings,
  });
  const blockers = researchChecks
    .filter((check) => check.status !== "complete" && check.status !== "not_applicable")
    .slice(0, 6);
  const linkedRelationships = relationships.filter((relationship) => relationship !== null);
  const workflowSteps = [
    { key: "draft", label: "Draft" },
    { key: "review", label: "Review" },
    { key: "published", label: "Published" },
  ] as const;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-5">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/stories">
            <ArrowLeft className="h-4 w-4" />
            Story Studio
          </Link>
        </Button>
      </div>

      <section className="border border-stone-200 bg-white px-6 py-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge className={statusTone[story.status]}>{story.status}</Badge>
            <h1 className="mt-4 max-w-4xl font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-stone-950 sm:text-5xl">
              {story.title}
            </h1>
            <p className="mt-3 text-stone-600">
              {person ? `${person.displayName}${person.lifespan ? `, ${person.lifespan}` : ""}` : "Unlinked story"} · {story.type.replace(/_/g, " ")}
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <StoryStatusActions
              storyId={String(story._id)}
              publicIdentifier={story.publicSlug}
              status={story.status}
              publishReadiness={publishReadiness}
            />
            <div className="flex flex-wrap gap-2">
              {person ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/people/${person.routeId}`}>
                    <UserRound className="h-4 w-4" />
                    Open source person
                  </Link>
                </Button>
              ) : null}
              {story.status === "published" ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={publicStoryPath(story.publicSlug ?? String(story._id))} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                    Public page
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 border-t border-stone-200 pt-5 md:grid-cols-3">
          {workflowSteps.map((step, index) => {
            const isActive = story.status === step.key;
            const isComplete =
              (story.status === "review" && step.key === "draft") ||
              (story.status === "published" && step.key !== "published");

            return (
              <div
                key={step.key}
                className={`border px-4 py-3 ${isActive || isComplete ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
              >
                <p className="text-xs font-medium uppercase text-stone-500">Step {index + 1}</p>
                <p className="mt-1 font-semibold text-stone-900">{step.label}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {step.key === "draft"
                    ? "Writer prepares a grounded draft."
                    : step.key === "review"
                      ? "Reviewer clears evidence, privacy, and family-graph risks."
                      : "Trusted publisher confirms the public status change."}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="border border-stone-200 bg-white px-6 py-7 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-stone-400">
            <BookOpen className="h-4 w-4" />
            Editable Markdown Draft
          </div>
          <StoryEditorForm
            story={{
              _id: String(story._id),
              title: story.title,
              content: story.content,
              type: story.type,
              tags: story.tags,
            }}
          />
        </article>

        <aside className="space-y-5">
          <Card className={publishReadiness.canPublish ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className={publishReadiness.canPublish ? "h-5 w-5 text-emerald-700" : "h-5 w-5 text-red-700"} />
                Publish Gate
              </CardTitle>
              <CardDescription>
                {publishReadiness.summary}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="border border-stone-200 bg-white px-2 py-3">
                  <p className="font-semibold text-stone-900">{publishReadiness.score}%</p>
                  <p className="text-xs text-stone-500">Score</p>
                </div>
                <div className="border border-stone-200 bg-white px-2 py-3">
                  <p className="font-semibold text-red-800">{publishReadiness.blockers.length}</p>
                  <p className="text-xs text-stone-500">Blockers</p>
                </div>
                <div className="border border-stone-200 bg-white px-2 py-3">
                  <p className="font-semibold text-amber-800">{publishReadiness.warnings.length}</p>
                  <p className="text-xs text-stone-500">Warnings</p>
                </div>
              </div>
              <div className="space-y-2">
                {publishReadiness.checks.map((gate) => (
                  <div key={gate.key} className={`border px-3 py-3 ${publishGateTone[gate.severity]}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{gate.label}</p>
                      <span className="text-xs uppercase">{gate.severity}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 opacity-80">{gate.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-amber-700" />
                Story Provenance
              </CardTitle>
              <CardDescription>
                The support packet a writer, reviewer, or publisher should inspect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-stone-50 px-3 py-3">
                  <p className="font-semibold text-stone-900">{publishReadiness.provenance.evidenceGroups}</p>
                  <p className="text-xs text-stone-500">Sources</p>
                </div>
                <div className="bg-stone-50 px-3 py-3">
                  <p className="font-semibold text-stone-900">{publishReadiness.provenance.citations}</p>
                  <p className="text-xs text-stone-500">Citations</p>
                </div>
                <div className="bg-stone-50 px-3 py-3">
                  <p className="font-semibold text-stone-900">{publishReadiness.provenance.events}</p>
                  <p className="text-xs text-stone-500">Events</p>
                </div>
                <div className="bg-stone-50 px-3 py-3">
                  <p className="font-semibold text-stone-900">{publishReadiness.provenance.contextReports}</p>
                  <p className="text-xs text-stone-500">Context</p>
                </div>
              </div>
              {publishReadiness.recommendedNextActions.length > 0 ? (
                <div className="space-y-2">
                  {publishReadiness.recommendedNextActions.slice(0, 4).map((action) => (
                    <p key={action} className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
                      {action}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-amber-700" />
                Review Owner
              </CardTitle>
              <CardDescription>
                Assign the person responsible for clearing gates before trusted publish.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StoryReviewAssignmentForm
                storyId={String(story._id)}
                assignedReviewer={story.assignedReviewer}
                secondReviewRequired={story.secondReviewRequired}
                secondReviewer={story.secondReviewer}
                secondReviewedAt={story.secondReviewedAt}
              />
              {story.secondReviewRequired ? (
                <div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <p className="font-medium">Second approval is required before publishing.</p>
                  <p className="mt-1 text-xs leading-5">
                    {story.secondReviewedAt
                      ? "Second approval has been marked complete."
                      : "Publishing remains blocked until second approval is marked complete."}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
                Publish Warnings
              </CardTitle>
              <CardDescription>
                Publishing is allowed, but these gaps should be visible before sharing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {publishWarnings.length === 0 ? (
                <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  No major publish warnings are currently detected.
                </p>
              ) : (
                publishWarnings.map((warning) => (
                  <div key={`${warning.key}-${warning.status}`} className="rounded-md border border-amber-200 bg-white px-3 py-3">
                    <p className="text-sm font-medium text-stone-900">{warning.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-amber-700">{warning.status}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{warning.detail}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Story Readiness</CardTitle>
              <CardDescription>
                Current vault checks used as blockers before publishing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-semibold text-stone-900">
                    {readiness?.completionPercent ?? 0}%
                  </p>
                  <p className="text-sm text-stone-500">research coverage</p>
                </div>
                {(readiness?.requiredMissingCount ?? 0) === 0 ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                ) : (
                  <CircleAlert className="h-8 w-8 text-amber-700" />
                )}
              </div>
              <div className="mt-5 space-y-2">
                {blockers.length === 0 ? (
                  <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    Required checks are satisfied. Use human review before publishing.
                  </p>
                ) : (
                  blockers.map((check) => (
                    <div key={String("_id" in check ? check._id : check.checkKey)} className="rounded-md bg-stone-50 px-3 py-3">
                      <p className="text-sm font-medium text-stone-900">{check.summary || check.checkKey.replace(/_/g, " ")}</p>
                      <p className="mt-1 text-xs text-stone-500">{check.status} · {check.applicability}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Context Coverage</CardTitle>
              <CardDescription>
                Place, era, church, building, news, and locality research tied to this story.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-stone-50 px-3 py-3">
                  <p className="font-semibold text-stone-900">{contextCoverage?.count ?? 0}</p>
                  <p className="text-xs text-stone-500">Reports</p>
                </div>
                <div className="bg-stone-50 px-3 py-3">
                  <p className="font-semibold text-stone-900">{contextCoverage?.placeCountWithContext ?? 0}/{contextCoverage?.relatedPlaceCount ?? 0}</p>
                  <p className="text-xs text-stone-500">Places</p>
                </div>
              </div>
              {contextCoverage?.missingPlaces?.length ? (
                <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  Missing context: {contextCoverage.missingPlaces.map((place) => place.name).join(", ")}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Grounding Evidence</CardTitle>
              <CardDescription>{evidence.length} grouped source sets linked to this person.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {evidence.length === 0 ? (
                <p className="text-sm text-stone-500">No source coverage is linked yet.</p>
              ) : (
                evidence.map((entry) => (
                  <div key={String(entry.source._id)} className="border border-stone-200 px-3 py-3">
                    <p className="text-sm font-medium text-stone-900">{entry.source.title}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {entry.citations.length} citation{entry.citations.length === 1 ? "" : "s"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-amber-700" />
              Relationships
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkedRelationships.length === 0 ? (
              <p className="text-sm text-stone-500">No relationships linked yet.</p>
            ) : (
              linkedRelationships.map((relationship) => (
                <p key={String(relationship._id)} className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
                  {relationship.relatedName}
                </p>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Milestone className="h-5 w-5 text-amber-700" />
              Life Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-stone-500">No events linked yet.</p>
            ) : (
              events.map((event) => (
                <div key={String(event._id)} className="border-l-2 border-amber-300 pl-3">
                  <p className="text-sm font-medium text-stone-900">{event.type}</p>
                  <p className="text-xs text-stone-500">{formatEventDate(event)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-amber-700" />
              Places
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {places.length === 0 ? (
              <p className="text-sm text-stone-500">No places linked yet.</p>
            ) : (
              places.map((place) => (
                <p key={String(place._id)} className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
                  {place.fullName || place.name}
                </p>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-700" />
              Memories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {media.length === 0 ? (
              <p className="text-sm text-stone-500">No memories linked yet.</p>
            ) : (
              media.map((item) => (
                <p key={String(item._id)} className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
                  {item.title}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Historical And Local Context</CardTitle>
            <CardDescription>
              Research reports that help turn dates and places into a grounded narrative.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {historicalContext.length === 0 ? (
              <p className="text-sm text-stone-500">No contextual research reports are linked yet.</p>
            ) : (
              historicalContext.map((entry) => (
                <div key={String(entry._id)} className="border border-stone-200 px-4 py-4">
                  <p className="font-medium text-stone-900">{entry.title}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {entry.topic.replace(/_/g, " ")} · {entry.timePeriod.startYear}-{entry.timePeriod.endYear}
                  </p>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-stone-600">{entry.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Review History</CardTitle>
            <CardDescription>
              Publish previews, reviewer assignments, and status changes recorded for this story.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StoryReviewHistoryPanel
              events={reviewHistory.map((event) => ({
                ...event,
                _id: String(event._id),
              }))}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
