import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BookOpen, FileText, MapPinned, Milestone, ShieldCheck, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import {
  getConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { createPageMetadata } from "@/lib/seo";
import { canRenderPublicStory } from "@/lib/stories/publicStoryPolicy";

export const metadata: Metadata = createPageMetadata({
  title: "Ancestor Story",
  description: "A published ancestor story with supporting evidence and historical context.",
  path: "/stories",
});

export const dynamic = "force-dynamic";

function formatEventDate(event: { date?: { original?: string; year?: number } }) {
  return event.date?.original || event.date?.year?.toString() || "Undated";
}

export default async function PublicStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Published Stories",
      "Published story pages need the canonical vault backend."
    );
    return (
      <div className="min-h-screen bg-[#f8f4ec]">
        <MarketingNav />
        <main className="mx-auto max-w-4xl px-4 pt-28 sm:px-6">
          <div className="border border-[#d8c7a7] bg-white px-6 py-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-[#1d212a]">{issue.title}</h1>
            <p className="mt-2 text-[#625947]">{issue.description}</p>
          </div>
        </main>
      </div>
    );
  }

  const { id } = await params;
  let bundle;

  try {
    bundle = await getConvexClient().query(api.vault.getPublishedStory, {
      storyId: id as Id<"stories">,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/ArgumentValidationError|Value does not match validator|Invalid id/i.test(message)) {
      notFound();
    }
    const issue = getConvexRuntimeIssue(error);
    if (issue.statusCode === 404 || issue.statusCode === 400) notFound();
    throw error;
  }

  if (!bundle || !canRenderPublicStory(bundle.story.status)) notFound();

  const { story, person, evidence, events, places, media, relationships, historicalContext } = bundle;
  const linkedRelationships = relationships.filter((relationship) => relationship !== null);

  return (
    <div className="min-h-screen bg-[#f8f4ec] text-[#1d212a]">
      <MarketingNav />
      <main className="pt-24">
        <section className="border-b border-[#d8c7a7] bg-[#efe4cd] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Badge className="mb-5 border-[#9f5a2d33] bg-white/60 text-[#7c4425] hover:bg-white/60">
              Published ancestor story
            </Badge>
            <h1 className="max-w-4xl font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.95] text-[#1d212a] sm:text-6xl lg:text-7xl">
              {story.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#5f5542]">
              {person ? `${person.displayName}${person.lifespan ? `, ${person.lifespan}` : ""}` : "A family story from the research vault"}
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
          <article className="bg-white px-6 py-8 shadow-sm sm:px-8">
            <div className="mb-6 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-[#8b7c5c]">
              <BookOpen className="h-4 w-4" />
              Story
            </div>
            <div className="whitespace-pre-wrap text-lg leading-9 text-[#2d2b26]">{story.content}</div>
          </article>

          <aside className="space-y-5">
            <section className="border border-[#d8c7a7] bg-white px-5 py-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#4f765d]" />
                <h2 className="font-semibold text-[#1d212a]">Why This Story Is Grounded</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#625947]">
                This beta page connects the story back to the person&apos;s vault data: source groups, events, relationships, places, memories, and context reports.
              </p>
              <div className="mt-4 space-y-3">
                {evidence.length === 0 ? (
                  <p className="text-sm text-[#7a705d]">No source groups are public on this page yet.</p>
                ) : (
                  evidence.slice(0, 5).map((entry) => (
                    <div key={String(entry.source._id)} className="border-l-2 border-[#c57d39] pl-3">
                      <p className="text-sm font-medium text-[#2d2b26]">{entry.source.title}</p>
                      <p className="text-xs text-[#7a705d]">
                        {entry.citations.length} citation{entry.citations.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="border border-[#d8c7a7] bg-white px-5 py-5 shadow-sm">
              <h2 className="font-semibold text-[#1d212a]">Beta Note</h2>
              <p className="mt-3 text-sm leading-6 text-[#625947]">
                Published story pages are evolving. The current version shows the narrative first, then the evidence and context that made the story possible.
              </p>
            </section>
          </aside>
        </section>

        <section className="border-y border-[#d8c7a7] bg-white px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-[#9f5a2d]" />
                <h2 className="font-semibold">Relationships</h2>
              </div>
              <div className="space-y-2">
                {linkedRelationships.length === 0 ? (
                  <p className="text-sm text-[#7a705d]">No relationships are linked yet.</p>
                ) : (
                  linkedRelationships.slice(0, 6).map((relationship) => (
                    <p key={String(relationship._id)} className="border border-[#e6dcc8] px-3 py-2 text-sm">
                      {relationship.relatedName}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2">
                <Milestone className="h-5 w-5 text-[#9f5a2d]" />
                <h2 className="font-semibold">Related Events</h2>
              </div>
              <div className="space-y-3">
                {events.length === 0 ? (
                  <p className="text-sm text-[#7a705d]">No events are linked yet.</p>
                ) : (
                  events.slice(0, 6).map((event) => (
                    <div key={String(event._id)} className="border-l border-[#d8c7a7] pl-3">
                      <p className="text-sm font-medium">{event.type}</p>
                      <p className="text-xs text-[#7a705d]">{formatEventDate(event)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-[#9f5a2d]" />
                <h2 className="font-semibold">Related Places</h2>
              </div>
              <div className="space-y-2">
                {places.length === 0 ? (
                  <p className="text-sm text-[#7a705d]">No places are linked yet.</p>
                ) : (
                  places.slice(0, 7).map((place) => (
                    <p key={String(place._id)} className="border border-[#e6dcc8] px-3 py-2 text-sm">
                      {place.fullName || place.name}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#9f5a2d]" />
                <h2 className="font-semibold">Memories And Media</h2>
              </div>
              <div className="space-y-2">
                {media.length === 0 ? (
                  <p className="text-sm text-[#7a705d]">No memories are linked yet.</p>
                ) : (
                  media.slice(0, 6).map((item) => (
                    <p key={String(item._id)} className="border border-[#e6dcc8] px-3 py-2 text-sm">
                      {item.title}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#efe4cd] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6">
              <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-[#1d212a]">
                Historical And Local Context
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#625947]">
                These reports help connect the ancestor to towns, churches, work, migration, eras, buildings, and local history.
              </p>
            </div>
            {historicalContext.length === 0 ? (
              <div className="border border-[#d8c7a7] bg-white px-5 py-6 text-sm text-[#7a705d]">
                No contextual research reports are linked to this public story yet.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {historicalContext.slice(0, 6).map((entry) => (
                  <article key={String(entry._id)} className="border border-[#d8c7a7] bg-white px-5 py-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#8b7c5c]">
                      {entry.topic.replace(/_/g, " ")} · {entry.timePeriod.startYear}-{entry.timePeriod.endYear}
                    </p>
                    <h3 className="mt-2 font-semibold text-[#1d212a]">{entry.title}</h3>
                    <p className="mt-3 line-clamp-5 text-sm leading-6 text-[#625947]">{entry.content}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="px-4 py-10 text-center sm:px-6 lg:px-8">
          <Button asChild variant="outline" className="border-[#9f5a2d66] text-[#7c4425] hover:bg-[#efe4cd]">
            <Link href="/">Learn about Discover Their Stories</Link>
          </Button>
        </section>
      </main>
      <Footer />
    </div>
  );
}
