import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Files,
  Globe2,
  ImageIcon,
  Network,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConvexClient, getConvexUnavailableState, isConvexConfigured } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { DocumentsViewer } from "@/components/DocumentsViewer";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { getConvexRuntimeIssue } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { ResearchChecksPanel } from "@/components/vault/ResearchChecksPanel";
import { MediaPrivacyReviewPanel } from "@/components/vault/MediaPrivacyReviewPanel";
import { ContextItemsPanel } from "@/components/vault/ContextItemsPanel";
import { publicStoryPath } from "@/lib/stories/slug";

interface PageProps {
  params: Promise<{ personId: string }>;
}

export const dynamic = "force-dynamic";

export default async function PersonWorkspacePage({ params }: PageProps) {
  if (!isConvexConfigured()) {
    const issue = getConvexUnavailableState(
      "Person workspace",
      "The person workspace needs the canonical vault graph."
    );
    return (
      <div className="p-6 sm:p-8">
        <VaultStateCard title={issue.title} description={issue.description} />
      </div>
    );
  }

  const { personId } = await params;
  const client = getConvexClient();
  const { vaultOwnerId } = await getVaultAccessContext();
  let workspace;

  try {
    workspace = await client.query(api.vault.getPersonWorkspace, {
      vaultOwnerId,
      personIdentifier: personId,
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

  const routeId = workspace.person.routeId || personId;
  const hasStoredRuns = workspace.importRuns.length > 0;
  const storyCheckLabels: Record<string, string> = {
    biography: "Biography or draft",
    timeline: "Timeline coverage",
    relationships: "Relationships",
    birth_record: "Birth evidence",
    death_record: "Death evidence",
    memories: "Memories",
    place_context: "Place context",
  };
  const storyReadinessChecks = workspace.researchChecks
    .filter((check) => Object.keys(storyCheckLabels).includes(check.checkKey))
    .map((check) => ({
      key: check.checkKey,
      label: storyCheckLabels[check.checkKey] || check.checkKey.replace(/_/g, " "),
      status: check.status,
      summary: check.summary,
    }));
  const currentStory = workspace.stories[0] ?? null;
  const sourceFacts = workspace.sourceFacts ?? [];
  const contextItems = workspace.contextItems ?? [];
  const media = workspace.media ?? [];

  return (
    <div className="p-4 sm:p-8">
      <Link href="/app/people" className="mb-5 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" />
        Back to People
      </Link>

      <section className="rounded-[2rem] border border-stone-200 bg-white px-6 py-6 shadow-sm sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4">{workspace.person.fsId || "Research subject"}</Badge>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-900 sm:text-5xl">
              {workspace.person.displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-stone-500">
              {workspace.person.birth?.date?.original || "Unknown birth"} {workspace.person.birth?.place?.original ? `· ${workspace.person.birth.place.original}` : ""}
              {"  "}
              {workspace.person.death?.date?.original ? `to ${workspace.person.death.date.original}` : ""}
              {workspace.person.death?.place?.original ? ` · ${workspace.person.death.place.original}` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild className="bg-amber-700 hover:bg-amber-800">
                <Link href={`/app/people/${routeId}/ai`}>Run AI Analysis</Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/people/${routeId}/context-pack?format=markdown`}>Download Context Pack</a>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/people/${routeId}/context-pack`}>Structured JSON</a>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[420px] lg:grid-cols-2">
            {[
              ["Sources", workspace.stats.sources],
              ["Memories", workspace.stats.memories],
              ["Places", workspace.stats.places],
              ["Imports", workspace.stats.imports],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-stone-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Tabs defaultValue="overview" className="mt-8 space-y-6">
        <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl bg-transparent p-0">
          {["overview", "sources", "timeline", "relationships", "places", "memories", "documents", "stories", "research"].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="rounded-full border border-stone-200 bg-white px-4 py-2 capitalize data-[state=active]:border-amber-300 data-[state=active]:bg-amber-50">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="border-stone-200 bg-white">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-2xl">Story Readiness</CardTitle>
                    <CardDescription>
                      The overview starts with whether this person is ready to draft or publish, then keeps the operating data within reach.
                    </CardDescription>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-4xl font-semibold text-stone-900">{workspace.operations.completionPercent}%</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">coverage</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {storyReadinessChecks.map((check) => (
                    <div key={check.key} className="border border-stone-200 bg-stone-50 px-3 py-3">
                      <div className="flex items-center gap-2">
                        {check.status === "complete" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <CircleAlert className="h-4 w-4 text-amber-700" />
                        )}
                        <p className="text-sm font-medium text-stone-900">{check.label}</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-stone-500">{check.summary || check.status}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild className="bg-amber-700 hover:bg-amber-800">
                    <Link href={`/app/people/${routeId}/story-writer`}>Draft from context pack</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/app/stories">Open Story Studio</Link>
                  </Button>
                  {currentStory ? (
                    <Button asChild variant="outline">
                      <Link href={`/app/stories/${currentStory._id}`}>Review latest saved story</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white">
              <CardHeader>
                <CardTitle>Life Sketch Preview</CardTitle>
                <CardDescription>Quick story frame before diving into dense tabs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-stone-600">
                <p>
                  <span className="font-medium text-stone-900">{workspace.person.displayName}</span>
                  {workspace.person.birth?.date?.original ? ` was born ${workspace.person.birth.date.original}` : " has an unknown birth date"}
                  {workspace.person.birth?.place?.original ? ` in ${workspace.person.birth.place.original}` : ""}.
                  {workspace.person.death?.date?.original ? ` Death is recorded as ${workspace.person.death.date.original}` : ""}
                  {workspace.person.death?.place?.original ? ` in ${workspace.person.death.place.original}` : ""}.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Events", workspace.stats.events],
                    ["Relationships", workspace.relationships.length],
                    ["Stories", workspace.stats.stories],
                    ["Context", workspace.stats.contextReports],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-stone-200 px-3 py-3">
                      <p className="text-lg font-semibold text-stone-900">{value}</p>
                      <p className="text-xs text-stone-500">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white xl:col-span-2">
              <CardHeader>
                <CardTitle>Contextual Research</CardTitle>
                <CardDescription>
                  The non-genealogy research that helps turn names, dates, and places into a story: churches, buildings, local history, eras, migration, news, and daily life.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="grid grid-cols-2 gap-2 text-center text-sm lg:grid-cols-1">
                  <div className="border border-stone-200 bg-stone-50 px-3 py-4">
                    <p className="text-2xl font-semibold text-stone-900">{workspace.contextCoverage.count}</p>
                    <p className="text-xs text-stone-500">context reports</p>
                  </div>
                  <div className="border border-stone-200 bg-stone-50 px-3 py-4">
                    <p className="text-2xl font-semibold text-stone-900">
                      {workspace.contextCoverage.placeCountWithContext}/{workspace.contextCoverage.relatedPlaceCount}
                    </p>
                    <p className="text-xs text-stone-500">places covered</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {workspace.contextCoverage.entries.length === 0 ? (
                    <div className="rounded-md border border-dashed border-stone-200 px-4 py-6 text-sm leading-6 text-stone-500">
                      This person has genealogy data, but no linked contextual research reports yet. Add place and era context from the relevant place workspaces before treating the story as ready.
                    </div>
                  ) : (
                    workspace.contextCoverage.entries.slice(0, 4).map((entry) => (
                      <div key={String(entry._id)} className="border border-stone-200 px-4 py-3">
                        <p className="font-medium text-stone-900">{entry.title}</p>
                        <p className="mt-1 text-sm text-stone-500">
                          {entry.topic.replace(/_/g, " ")} · {entry.timePeriod.startYear}-{entry.timePeriod.endYear}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle>Story Inputs</CardTitle>
                <CardDescription>The vault pieces most useful to an AI story workflow.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {[
                  { icon: ScrollText, label: "Evidence sources", value: workspace.stats.sources },
                  { icon: Globe2, label: "Places", value: workspace.stats.places },
                  { icon: ImageIcon, label: "Memories", value: workspace.stats.memories },
                  { icon: Network, label: "Relationships", value: workspace.relationships.length },
                  { icon: BookOpen, label: "Open research tasks", value: workspace.researchTasks.length },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-stone-50 px-4 py-4">
                    <item.icon className="mb-3 h-5 w-5 text-amber-700" />
                    <p className="text-sm text-stone-500">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-stone-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-700" />
                  <CardTitle>Latest Imports</CardTitle>
                </div>
                <CardDescription>Recent FamilySearch captures merged into this person.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.importRuns.length === 0 ? (
                  <EmptyWorkspaceState
                    title="No imports yet"
                    description="Start with a FamilySearch capture package so this workspace has evidence, places, and memories to build from."
                    actionHref="/app/imports"
                    actionLabel="Open Imports"
                  />
                ) : (
                  workspace.importRuns.slice(0, 4).map((run) => (
                    <div key={String(run._id)} className="rounded-2xl border border-stone-200 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-stone-900">{run.pageTypes.join(" + ")}</p>
                        <Badge variant="secondary">{run.mergeStatus}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-stone-500">{new Date(run.importedAt).toLocaleString()}</p>
                      {run.warnings.length > 0 ? (
                        <p className="mt-2 text-sm text-amber-800">{run.warnings.length} warning(s) still need review.</p>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-stone-200 bg-gradient-to-br from-white to-stone-50">
              <CardHeader>
                <CardTitle>Operations Status</CardTitle>
                <CardDescription>The auto-inferred research backend view for this person.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {[
                  ["Completion", `${workspace.operations.completionPercent}%`],
                  ["Critical gaps", workspace.operations.requiredMissingCount],
                  ["Recommended gaps", workspace.operations.recommendedMissingCount],
                  ["Stale checks", workspace.operations.staleChecksCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white px-4 py-4 ring-1 ring-stone-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle>Priority Gaps</CardTitle>
                <CardDescription>The checks blocking stronger AI context packs and story outputs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.operations.nextActions.length === 0 ? (
                  <EmptyWorkspaceState
                    title="No priority gaps right now"
                    description="This person is in good operational shape. Move into Story Writer, place context, or longer narrative work."
                  />
                ) : (
                  workspace.operations.nextActions.map((action: string) => (
                    <div key={action} className="rounded-2xl border border-stone-200 px-4 py-4 text-sm text-stone-600">
                      {action}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-5 border-stone-200 bg-gradient-to-br from-white to-amber-50/60">
            <CardHeader>
              <CardTitle>Next Actions</CardTitle>
              <CardDescription>Move from imported evidence to agent-ready research outputs.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  href: `/app/people/${routeId}/raw`,
                  label: "Generate raw evidence",
                  description: hasStoredRuns
                    ? "Create the deterministic source transcript from a stored capture run."
                    : "Requires a stored FamilySearch capture run before the legacy raw document flow is available.",
                  available: hasStoredRuns,
                },
                {
                  href: `/app/people/${routeId}/contextualized`,
                  label: "Open dossier",
                  description: hasStoredRuns
                    ? "Review or save contextualized research notes from a stored run."
                    : "Requires a stored FamilySearch capture run before the legacy dossier flow is available.",
                  available: hasStoredRuns,
                },
                {
                  href: `/app/people/${routeId}/ai`,
                  label: "Run AI analysis",
                  description: hasStoredRuns
                    ? "Use the staged normalization and synthesis flow on a stored evidence pack."
                    : "Requires a stored FamilySearch capture run before staged AI analysis can start.",
                  available: hasStoredRuns,
                },
                {
                  href: `/app/people/${routeId}/story-writer`,
                  label: "Open Story Writer",
                  description: "Draft short or long narrative outputs from the context pack.",
                  available: true,
                },
                {
                  href: `/api/people/${routeId}/context-pack?format=markdown`,
                  label: "Export context pack",
                  description: "Hand a clean Markdown package to an AI agent.",
                  available: true,
                },
              ].map((action) =>
                action.available ? (
                  <a
                    key={action.label}
                    href={action.href}
                    className="rounded-2xl border border-stone-200 bg-white px-4 py-4 transition hover:border-amber-300 hover:bg-amber-50/70"
                  >
                    <p className="font-medium text-stone-900">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{action.description}</p>
                  </a>
                ) : (
                  <div
                    key={action.label}
                    className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4"
                  >
                    <p className="font-medium text-stone-900">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{action.description}</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <div className="grid gap-4">
            {sourceFacts.length > 0 ? (
              <Card className="border-stone-200 bg-stone-50/60">
                <CardHeader>
                  <CardTitle>Source-backed facts</CardTitle>
                  <CardDescription>Indexed fields captured as citation-backed candidates. Conflicts require review before canonical facts change.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {(sourceFacts as Array<{
                    _id: string;
                    factType: string;
                    label: string;
                    value: string;
                    confidence: string;
                    status: string;
                    conflictReason?: string;
                  }>).slice(0, 12).map((fact) => (
                    <div key={fact._id} className="rounded-md border border-stone-200 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-stone-900">{fact.factType.replace(/_/g, " ")}</p>
                        <Badge variant={fact.status === "conflict" ? "destructive" : "secondary"}>{fact.status}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-stone-600">{fact.label}: {fact.value}</p>
                      <p className="mt-1 text-xs text-stone-500">Confidence: {fact.confidence}</p>
                      {fact.conflictReason ? <p className="mt-2 text-xs text-amber-800">{fact.conflictReason}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
            {(workspace.sources as Array<{
              source: { _id: string; title: string; type: string; url?: string };
              citations: Array<{ page?: string; extractedText?: string; editedText?: string }>;
            }>).length === 0 ? (
              <EmptyWorkspaceState
                title="No sources attached yet"
                description="Import a FamilySearch capture package to populate source evidence, citations, and outbound record links."
                actionHref="/app/imports"
                actionLabel="Import Capture Package"
              />
            ) : (
              (workspace.sources as Array<{
                source: { _id: string; title: string; type: string; url?: string };
                citations: Array<{ page?: string; extractedText?: string; editedText?: string }>;
              }>).map((entry) => (
                <Card key={String(entry.source._id)} className="border-stone-200">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle>{entry.source.title}</CardTitle>
                        <CardDescription>{entry.source.type.replace(/_/g, " ")} · {entry.citations.length} citation record(s)</CardDescription>
                      </div>
                      {entry.source.url ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={entry.source.url} target="_blank" rel="noreferrer">
                            Open Source
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-stone-600">
                    {(entry.citations as Array<{ page?: string; extractedText?: string; editedText?: string }>).map((citation, index) => (
                      <div key={`${String(entry.source._id)}-${index}`} className="rounded-2xl bg-stone-50 px-4 py-4">
                        <p className="font-medium text-stone-900">{citation.page || "Imported citation"}</p>
                        <p className="mt-2 whitespace-pre-wrap">{citation.extractedText || citation.editedText || "No extracted text captured."}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Ordered life events and evidence-backed moments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(workspace.timeline as Array<{
                _id: string;
                type: string;
                date?: { original?: string };
                place?: { fullName?: string; name?: string };
                description?: string;
              }>).length === 0 ? (
                <EmptyWorkspaceState
                  title="No timeline events yet"
                  description="Imported sources usually create timeline moments automatically. If this stays empty, review the sources and place mentions for missing event clues."
                />
              ) : (
                (workspace.timeline as Array<{
                  _id: string;
                  type: string;
                  date?: { original?: string };
                  place?: { fullName?: string; name?: string };
                  description?: string;
                }>).map((event) => (
                  <div key={String(event._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{event.type.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {event.date?.original || "Undated"} {event.place?.fullName ? `· ${event.place.fullName}` : event.place?.name ? `· ${event.place.name}` : ""}
                    </p>
                    {event.description ? <p className="mt-3 text-sm text-stone-600">{event.description}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relationships">
          <div className="grid gap-4 md:grid-cols-2">
            {(workspace.relationships as Array<{
              _id: string;
              type: string;
              relatedName: string;
              relatedPerson: { fsId?: string };
            }>).length === 0 ? (
              <EmptyWorkspaceState
                title="No relationships discovered yet"
                description="Related people are inferred from indexed fields in imported sources. Marriage, census, and church records usually populate this area first."
              />
            ) : (
              (workspace.relationships as Array<{
                _id: string;
                type: string;
                relatedName: string;
                relatedPerson: { fsId?: string };
              }>).map((relationship) => (
                <Card key={String(relationship._id)} className="border-stone-200">
                  <CardHeader>
                    <CardTitle className="text-lg">{relationship.relatedName}</CardTitle>
                    <CardDescription>{relationship.type === "Couple" ? "Couple relationship" : "Parent/child relationship"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-stone-500">{relationship.relatedPerson.fsId || "No FamilySearch ID yet"}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          {workspace.provisionalRelatives.length > 0 ? (
            <Card className="mt-4 border-stone-200">
              <CardHeader>
                <CardTitle>Provisional Relatives</CardTitle>
                <CardDescription>Named relatives discovered in sources that still need promotion or merge review.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {workspace.provisionalRelatives.map((relative: { _id: string; displayName: string; relationshipHint?: string; evidenceCount: number }) => (
                  <div key={relative._id} className="rounded-2xl border border-stone-200 px-4 py-4">
                    <p className="font-medium text-stone-900">{relative.displayName}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {relative.relationshipHint || "Relationship not labeled"} · {relative.evidenceCount} supporting record(s)
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="places">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(workspace.places as Array<{ _id: string; fullName?: string; name?: string; type?: string }>).length === 0 ? (
              <EmptyWorkspaceState
                title="No linked places yet"
                description="Place mentions from sources and memories become the context graph for migration, churches, residence, and historical research."
              />
            ) : (
              (workspace.places as Array<{ _id: string; fullName?: string; name?: string; type?: string }>).map((place) => (
                <Link key={place._id} href={`/app/places/${place._id}`}>
                  <Card className="h-full border-stone-200 transition hover:border-amber-300 hover:bg-amber-50/30">
                    <CardHeader>
                      <CardTitle>{place.fullName || place.name || "Unknown place"}</CardTitle>
                      <CardDescription>{place.type || "place"}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="memories">
          {media.length === 0 ? (
            <EmptyWorkspaceState
              title="No memories imported yet"
              description="Import a FamilySearch memories capture to enrich this person with photos, scans, and media for later story writing."
              actionHref="/app/imports"
              actionLabel="Import Memories"
            />
          ) : (
            <MediaPrivacyReviewPanel media={media} />
          )}
        </TabsContent>

        <TabsContent value="documents">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Files className="h-5 w-5 text-amber-700" />
                Derived Documents and Outputs
              </CardTitle>
              <CardDescription>Raw transcripts, dossiers, and future story drafts derived from the vault graph for this person.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href={`/app/people/${personId}/raw`}>Raw Evidence Document</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/app/people/${personId}/contextualized`}>Contextualized Dossier</Link>
                </Button>
              </div>
              <DocumentsViewer personId={workspace.person.fsId || String(workspace.person._id)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stories">
          <div className="grid gap-4">
            <Card className="border-stone-200 bg-gradient-to-br from-white to-amber-50/60">
              <CardHeader>
                <CardTitle>Story Writer</CardTitle>
                <CardDescription>Generate narrative drafts from this person&apos;s context pack, then save them back into the vault.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="bg-amber-700 hover:bg-amber-800">
                  <Link href={`/app/people/${routeId}/story-writer`}>Open Story Writer</Link>
                </Button>
              </CardContent>
            </Card>
            {workspace.stories.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-stone-500">
                  No saved story outputs yet. Start from Story Writer or export a context pack to another AI tool.
                </CardContent>
              </Card>
            ) : (
              workspace.stories.map((story) => (
                <Card key={String(story._id)} className="border-stone-200">
                  <CardHeader>
                    <CardTitle>{story.title}</CardTitle>
                    <CardDescription>{story.type.replace(/_/g, " ")} · {story.status}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm text-stone-600">{story.content}</p>
                    <div className="flex flex-wrap gap-3">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/stories/${story._id}`}>Review in Story Studio</Link>
                      </Button>
                      {story.status === "published" ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={publicStoryPath(story.publicSlug ?? String(story._id))} target="_blank">Open public page</Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="research">
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle>Open Research Tasks</CardTitle>
                <CardDescription>AI-suggested and human follow-up tasks anchored to this person.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.researchTasks.length === 0 ? (
                  <EmptyWorkspaceState
                    title="No research tasks yet"
                    description="Imports and AI analysis will start creating follow-up tasks here as the vault spots unresolved questions and story opportunities."
                  />
                ) : (
                  workspace.researchTasks.map((task) => (
                    <div key={String(task._id)} className="rounded-2xl border border-stone-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-stone-900">{task.title}</p>
                        <Badge variant="secondary">{task.priority}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-stone-600">{task.description || task.type}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-stone-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-700" />
                  <CardTitle>Research Log</CardTitle>
                </div>
                <CardDescription>What the vault has already gathered or generated.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.researchLog.length === 0 ? (
                  <EmptyWorkspaceState
                    title="No research log entries yet"
                    description="This area will show import activity, AI runs, and future manual research notes for this person."
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
          </div>

          <Card className="mt-5 border-stone-200">
            <CardHeader>
              <CardTitle>Research Checks</CardTitle>
              <CardDescription>Override or confirm the inferred operational checklist for this person.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResearchChecksPanel
                personIdentifier={workspace.person.routeId}
                checks={workspace.researchChecks}
              />
            </CardContent>
          </Card>

          <div className="mt-5">
            <ContextItemsPanel personIdentifier={routeId} contextItems={contextItems} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyWorkspaceState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Card className="border-dashed border-stone-300 bg-white/80">
      <CardContent className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-lg font-semibold text-stone-900">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">{description}</p>
        {actionHref && actionLabel ? (
          <Button asChild variant="outline" className="mt-5">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
