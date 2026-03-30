import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ImageIcon, MapPinned, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import {
  getConvexClient,
  getConvexRuntimeIssue,
  getConvexUnavailableState,
  isConvexConfigured,
} from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { getVaultAccessContext } from "@/lib/vault/server";

interface PageProps {
  params: Promise<{ placeId: string }>;
}

export const dynamic = "force-dynamic";

export default async function PlaceWorkspacePage({ params }: PageProps) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Place workspace",
      "The place workspace needs the canonical vault graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { placeId } = await params;
  const client = getConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let workspace;

  try {
    workspace = await client.query(api.vault.getPlaceWorkspace, {
      vaultOwnerId,
      placeId: placeId as never,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  if (!workspace) {
    notFound();
  }

  return (
    <div className="p-4 sm:p-8">
      <Link href="/app/places" className="mb-5 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" />
        Back to Places
      </Link>

      <section className="rounded-[2rem] border border-stone-200 bg-white px-6 py-6 shadow-sm">
        <Badge variant="secondary" className="mb-4">Place Workspace</Badge>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">{workspace.place.fullName}</h1>
            <p className="mt-2 text-stone-500">
              Use this place as a context hub for historical research, source grouping, and story enrichment.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl bg-stone-50 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Events</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{workspace.events.length}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">People</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{workspace.people.length}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Context entries</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{workspace.contextEntries.length}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-stone-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-700" />
              <CardTitle>Linked People</CardTitle>
            </div>
            <CardDescription>Ancestors whose life events or vital facts intersect this place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(workspace.people as Array<{
              _id: string;
              fsId?: string;
              name: { prefix?: string; given: string; surname: string; suffix?: string };
              birth?: { date?: { year?: number } };
              death?: { date?: { year?: number } };
            }>).length === 0 ? (
              <PlaceEmptyState
                title="No linked people yet"
                description="People appear here once imported sources or memories mention this place in birth, residence, marriage, burial, or migration events."
              />
            ) : (
              (workspace.people as Array<{
                _id: string;
                fsId?: string;
                name: { prefix?: string; given: string; surname: string; suffix?: string };
                birth?: { date?: { year?: number } };
                death?: { date?: { year?: number } };
              }>).map((person) => (
                <Link
                  key={String(person._id)}
                  href={`/app/people/${person.fsId || person._id}`}
                  className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3 transition hover:border-amber-300"
                >
                  <div>
                    <p className="font-medium text-stone-900">
                      {[person.name.prefix, person.name.given, person.name.surname, person.name.suffix].filter(Boolean).join(" ")}
                    </p>
                    <p className="text-sm text-stone-500">
                      {person.birth?.date?.year || "?"} to {person.death?.date?.year || "?"}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card className="border-stone-200 bg-gradient-to-br from-white to-amber-50/50">
            <CardHeader>
              <CardTitle>How To Use This Place</CardTitle>
              <CardDescription>Place workspaces connect local facts to larger historical story context.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {[
                "Review linked people to see whose stories intersect here.",
                "Use events and media to identify the most important years for this place.",
                "Add historical context later for religion, migration, work, and daily life.",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-600">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-amber-700" />
                <CardTitle>Events at This Place</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.events.length === 0 ? (
                <PlaceEmptyState
                  title="No events anchored here yet"
                  description="As sources are normalized into events, this place will accumulate marriages, residences, burials, census entries, and more."
                />
              ) : (
                workspace.events.map((event) => (
                  <div key={String(event._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{event.type.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-sm text-stone-500">{event.date?.original || "Undated"}</p>
                    {event.description ? <p className="mt-2 text-sm text-stone-600">{event.description}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-700" />
                <CardTitle>Linked Sources</CardTitle>
              </div>
              <CardDescription>Evidence records that mention or anchor this place.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.sources.length === 0 ? (
                <PlaceEmptyState
                  title="No linked sources yet"
                  description="Source citations will appear here when imported records mention this place directly."
                />
              ) : (
                workspace.sources.map((source) => (
                  <div key={String(source?._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{source?.title}</p>
                    <p className="mt-1 text-sm text-stone-500">{source?.type?.replace(/_/g, " ")}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-700" />
                <CardTitle>Historical Context Slots</CardTitle>
              </div>
              <CardDescription>Reusable context about religion, economy, culture, and migration tied to this place and time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.contextEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                  No historical context entries yet. This place is ready for deeper context research.
                </div>
              ) : (
                workspace.contextEntries.map((entry) => (
                  <div key={String(entry._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{entry.title}</p>
                    <p className="mt-1 text-sm text-stone-500">{entry.topic.replace(/_/g, " ")}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Place Research Activity</CardTitle>
              <CardDescription>Historical context notes and future place-specific research can accumulate here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.researchLog.length === 0 ? (
                <PlaceEmptyState
                  title="No place research entries yet"
                  description="Use this place as the hub for future church, migration, labor, and neighborhood context research."
                />
              ) : (
                workspace.researchLog.map((entry) => (
                  <div key={String(entry._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{entry.summary}</p>
                    <p className="mt-1 text-sm text-stone-500">{entry.activityType.replace(/_/g, " ")}</p>
                    {entry.details ? <p className="mt-2 text-sm text-stone-600">{entry.details}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-amber-700" />
                <CardTitle>Place-linked Media</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.media.length === 0 ? (
                <p className="text-sm text-stone-500">No media tagged to this place yet.</p>
              ) : (
                workspace.media.map((item) => (
                  <div key={String(item._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{item.title}</p>
                    <p className="mt-1 text-sm text-stone-500">{item.type}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlaceEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center">
      <p className="font-medium text-stone-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
    </div>
  );
}
