import { SafeLink as Link } from "@/components/layout/SafeLink";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, ExternalLink, PenLine } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { getAuthedConvexClient, getConvexRuntimeIssue, getConvexUnavailableState, isConvexConfigured } from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { publicStoryPath } from "@/lib/stories/slug";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Story Studio",
  description: "Review, publish, and manage ancestor story drafts from the research vault.",
  path: "/app/stories",
});

export const dynamic = "force-dynamic";

type StoryStatus = "draft" | "review" | "published";
type StoryWorkflow =
  | "needs_genealogy_evidence"
  | "needs_context_research"
  | "ready_to_draft"
  | "ready_to_review"
  | "published";

const statusTone = {
  draft: "bg-stone-100 text-stone-700 hover:bg-stone-100",
  review: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  published: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};

function isStoryStatus(value: unknown): value is StoryStatus {
  return value === "draft" || value === "review" || value === "published";
}

function isStoryWorkflow(value: unknown): value is StoryWorkflow {
  return (
    value === "needs_genealogy_evidence" ||
    value === "needs_context_research" ||
    value === "ready_to_draft" ||
    value === "ready_to_review" ||
    value === "published"
  );
}

export default async function StoriesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; workflow?: string }>;
}) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Story Studio",
      "Story Studio needs the canonical vault backend."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { vaultOwnerId } = await getVaultAccessContext();
  const client = await getAuthedConvexClient();
  let stories;

  try {
    stories = await client.query(api.vault.getStoriesIndex, { vaultOwnerId });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const params = await searchParams;
  const counts = {
    draft: stories.filter((story) => story.status === "draft").length,
    review: stories.filter((story) => story.status === "review").length,
    published: stories.filter((story) => story.status === "published").length,
  };
  const selectedStatus = isStoryStatus(params.status) ? params.status : null;
  const selectedWorkflow = isStoryWorkflow(params.workflow) ? params.workflow : null;
  const visibleStories = stories.filter((story) => {
    if (selectedStatus && story.status !== selectedStatus) return false;
    if (selectedWorkflow && story.storyWorkflow !== selectedWorkflow) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-8">
      <section className="mb-8 border border-stone-200 bg-white px-6 py-7 shadow-sm">
        <Badge variant="secondary" className="mb-4">Story Studio</Badge>
        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr] xl:items-end">
          <div>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight text-stone-950 sm:text-5xl">
              Saved stories moving from draft to public memory.
            </h1>
            <p className="mt-3 max-w-3xl text-stone-600">
              Review ancestor narratives, check their evidence foundation, and explicitly publish the ones ready to be shared.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Draft", value: counts.draft, Icon: PenLine },
              { label: "Review", value: counts.review, Icon: Clock3 },
              { label: "Published", value: counts.published, Icon: CheckCircle2 },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="border border-stone-200 bg-stone-50 px-4 py-4">
                <Icon className="h-5 w-5 text-amber-700" />
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-stone-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["All", null],
          ["Draft", "draft"],
          ["Review", "review"],
          ["Published", "published"],
        ].map(([label, status]) => (
          <Button key={label} asChild variant={selectedStatus === status ? "default" : "outline"} size="sm">
            <Link href={status ? `/app/stories?status=${status}` : "/app/stories"}>{label}</Link>
          </Button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["Needs genealogy", "needs_genealogy_evidence"],
          ["Needs context", "needs_context_research"],
          ["Ready to draft", "ready_to_draft"],
          ["Ready to review", "ready_to_review"],
          ["Published", "published"],
        ].map(([label, workflow]) => (
          <Button key={workflow} asChild variant={selectedWorkflow === workflow ? "default" : "outline"} size="sm">
            <Link href={`/app/stories?workflow=${workflow}`}>{label}</Link>
          </Button>
        ))}
      </div>

      {stories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-stone-300" />
            <p className="mt-4 text-lg font-medium text-stone-900">No saved stories yet</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-500">
              Start with a person context pack in Story Writer. Saved drafts will appear here for review and publishing.
            </p>
            <Button asChild className="mt-6 bg-amber-700 hover:bg-amber-800">
              <Link href="/app/story-writer">Open Story Writer</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {visibleStories.length === 0 ? (
            <Card className="border-dashed xl:col-span-2">
              <CardContent className="py-12 text-center text-sm text-stone-500">
                No stories match this filter.
              </CardContent>
            </Card>
          ) : null}
          {visibleStories.map((story) => (
            <Card key={String(story._id)} className="border-stone-200 bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Badge className={statusTone[story.status]}>{story.status}</Badge>
                    <CardTitle className="mt-3 text-2xl">{story.title}</CardTitle>
                    <CardDescription>
                      {story.person?.displayName || "Unlinked story"} · {story.type.replace(/_/g, " ")}
                    </CardDescription>
                  </div>
                  {story.status === "published" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={publicStoryPath(story.publicSlug ?? String(story._id))} target="_blank">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-4 text-sm leading-6 text-stone-600">{story.content}</p>
                <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                  <div className="bg-stone-50 px-3 py-3">
                    <p className="font-semibold text-stone-900">{story.evidenceCount}</p>
                    <p className="text-xs text-stone-500">Sources</p>
                  </div>
                  <div className="bg-stone-50 px-3 py-3">
                    <p className="font-semibold text-stone-900">{story.placeCount}</p>
                    <p className="text-xs text-stone-500">Places</p>
                  </div>
                  <div className="bg-stone-50 px-3 py-3">
                    <p className="font-semibold text-stone-900">{story.contextReportCount}</p>
                    <p className="text-xs text-stone-500">Context</p>
                  </div>
                  <div className="bg-stone-50 px-3 py-3">
                    <p className="font-semibold text-stone-900">{story.readiness?.completionPercent ?? 0}%</p>
                    <p className="text-xs text-stone-500">Ready</p>
                  </div>
                </div>
                {story.publishWarnings.length > 0 ? (
                  <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    {story.publishWarnings.length} publish warning{story.publishWarnings.length === 1 ? "" : "s"} before sharing.
                  </div>
                ) : null}
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={`/app/stories/${story._id}`}>
                    Review story
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
