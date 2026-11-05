import { SafeLink, SafeAnchor } from "@/components/layout/SafeLink";
import {RecordArrow as ArrowRight,RecordComplete as CheckCircle2,RecordWarning as CircleAlert,RecordMinus as CircleMinus,RecordFiles as Files} from "@/components/design/RecordGlyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Prose } from "@/components/prose/Prose";
import { LifeTimeline, type TimelineEvent } from "@/components/viz/LifeTimeline";
import type { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { DocumentsViewer } from "@/components/DocumentsViewer";
import { ResearchChecksPanel } from "@/components/vault/ResearchChecksPanel";
import { MediaPrivacyReviewPanel } from "@/components/vault/MediaPrivacyReviewPanel";
import { ContextItemsPanel } from "@/components/vault/ContextItemsPanel";
import { PersonHeader } from "@/components/vault/PersonHeader";
import { publicStoryPath } from "@/lib/stories/slug";

import { RecordSections, type RecordSection } from "@/components/records/RecordSections";
import { EvidenceStream, type EvidenceStreamEntry } from "@/components/records/EvidenceStream";
import type { DocumentRecord } from "@/components/DocumentsViewer";
export type PersonWorkspace = NonNullable<FunctionReturnType<typeof api.vaultReads.getPersonWorkspace>>;

function latestUpdate(rows: readonly ({updatedAt?:number|string;createdAt?:number;_creationTime?:number;lastReviewedAt?:number}|null)[]) {
  const dates=rows.map(row=>{const value=row?.updatedAt ?? row?.lastReviewedAt ?? row?.createdAt ?? row?._creationTime; return typeof value === "string" ? Date.parse(value) : value || 0;}).filter(Number.isFinite);
  return dates.reduce((latest,date)=>Math.max(latest,date),0) || undefined;
}

/** Server-rendered dossier and preserved evidence/review sections. */
export function PersonWorkspaceView({workspace,personId,documents,documentsError,readonlyPreview=false}:{workspace:PersonWorkspace;personId:string;documents:DocumentRecord[];documentsError:string|null;readonlyPreview?:boolean}) {
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

  const stream: EvidenceStreamEntry[] = [
    ...workspace.importRuns.map(run => ({id:`import-${run._id}`,kind:"imports",kindLabel:"Imports",date:run.importedAt,dateLabel:"Imported",author:"Not attributed",content:<><p className="text-sm font-semibold">{run.pageTypes.join(" + ")} <Badge variant={run.mergeStatus === "partial" ? "destructive" : "secondary"}>{run.mergeStatus}</Badge></p>{run.warnings.length > 0 && <p className="mt-2 text-sm text-annotation">{run.warnings.length} warning(s) still need review.</p>}</>})),
    ...workspace.researchLog.map(entry => ({id:`log-${entry._id}`,kind:entry.activityType,kindLabel:entry.activityType.replace(/_/g," "),date:entry.updatedAt,dateLabel:"Updated",author:entry.creationProvenance?.actorKind === "user" ? "You" : entry.creationProvenance?.actorKind === "chosen_ai" || entry.creationProvenance?.actorKind === "first_party_ai" ? "AI" : entry.creationProvenance?.actorKind === "system" ? "System" : "Not attributed",content:<><p className="text-sm font-medium">{entry.summary}</p>{entry.details && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{entry.details}</p>}</>})),
  ];
  const importNotice = !hasStoredRuns ? <div className="rounded-lg border border-dashed border-border bg-card p-4"><h3 className="font-sans text-sm font-semibold">No imports yet</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Start with a FamilySearch capture package so this workspace has evidence, places, and memories to build from.</p><SafeLink href="/app/imports" className="mt-1 inline-flex min-h-11 items-center text-sm text-primary underline">Open Imports</SafeLink></div> : null;
  const priorities = <>
          <Card className="mb-5 border-annotation/30 bg-annotation-surface/40">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Priority Gaps</CardTitle>
              <CardDescription>The checks blocking stronger AI context packs and story outputs.</CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.operations.nextActions.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">No missing or review-needed checks are queued.</span> Work in progress can still remain. Review the research checks below before choosing the next step.
                </p>
              ) : (
                <ol className="space-y-2">
                  {workspace.operations.nextActions.map((action: string) => (
                    <li key={action} className="border-l-2 border-annotation bg-card px-3 py-2 text-sm leading-6 text-foreground">
                      {action}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
</>;
  const sections:RecordSection[] = [{id:"sources",label:"Sources",count:workspace.sources.length,updatedAt:latestUpdate([...workspace.sources.map(row=>row.source),...sourceFacts]),content:<div className="">
          <div className="grid gap-4">
            {sourceFacts.length > 0 ? (
              <Card className="border-border bg-muted/60">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>Source-backed facts</CardTitle>
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
                  }>).map((fact) => (
                    <div key={fact._id} className="rounded-md border border-border bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-foreground">{fact.factType.replace(/_/g, " ")}</p>
                        <Badge variant={fact.status === "conflict" ? "destructive" : "secondary"}>{fact.status}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{fact.label}: {fact.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Confidence: {fact.confidence}</p>
                      {fact.conflictReason ? <p className="mt-2 text-xs text-annotation">{fact.conflictReason}</p> : null}
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
                <Card key={String(entry.source._id)} className="border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle role="heading" aria-level={2}>{entry.source.title}</CardTitle>
                        <CardDescription>{entry.source.type.replace(/_/g, " ")} · {entry.citations.length} citation record(s)</CardDescription>
                      </div>
                      {entry.source.url ? (
                        <Button asChild variant="outline" size="sm">
                          <SafeAnchor href={entry.source.url} target="_blank" rel="noreferrer">
                            Open Source
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </SafeAnchor>
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {(entry.citations as Array<{ page?: string; extractedText?: string; editedText?: string }>).map((citation, index) => (
                      <div key={`${String(entry.source._id)}-${index}`} className="rounded-lg bg-muted px-4 py-4">
                        <p className="font-medium text-foreground">{citation.page || "Imported citation"}</p>
                        <p className="mt-2 whitespace-pre-wrap">{citation.extractedText || citation.editedText || "No extracted text captured."}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>},
{id:"timeline",label:"Timeline",count:workspace.timeline.length,updatedAt:latestUpdate(workspace.timeline),content:<div className="">
          <Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Timeline</CardTitle>
              <CardDescription>Ordered life events and evidence-backed moments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(workspace.timeline as TimelineEvent[]).length === 0 ? (
                <EmptyWorkspaceState
                  title="No timeline events yet"
                  description="Imported sources usually create timeline moments automatically. If this stays empty, review the sources and place mentions for missing event clues."
                />
              ) : (
                <LifeTimeline events={workspace.timeline as TimelineEvent[]} />
              )}
            </CardContent>
          </Card>
        </div>},
{id:"relationships",label:"Relationships",count:workspace.relationships.length,updatedAt:latestUpdate([...workspace.relationships,...workspace.provisionalRelatives]),content:<div className="">
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
                <Card key={String(relationship._id)} className="border-border">
                  <CardHeader>
                    <CardTitle role="heading" aria-level={2} className="text-lg">{relationship.relatedName}</CardTitle>
                    <CardDescription>{relationship.type === "Couple" ? "Couple relationship" : "Parent/child relationship"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{relationship.relatedPerson.fsId || "No FamilySearch ID yet"}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          {workspace.provisionalRelatives.length > 0 ? (
            <Card className="mt-4 border-border">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Provisional Relatives</CardTitle>
                <CardDescription>Named relatives discovered in sources that still need promotion or merge review.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {workspace.provisionalRelatives.map((relative: { _id: string; displayName: string; relationshipHint?: string; evidenceCount: number }) => (
                  <div key={relative._id} className="rounded-lg border border-border px-4 py-4">
                    <p className="font-medium text-foreground">{relative.displayName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {relative.relationshipHint || "Relationship not labeled"} · {relative.evidenceCount} supporting record(s)
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>},
{id:"places",label:"Places",count:workspace.places.length,updatedAt:latestUpdate(workspace.places),content:<div className="">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(workspace.places as Array<{ _id: string; fullName?: string; name?: string; type?: string }>).length === 0 ? (
              <EmptyWorkspaceState
                title="No linked places yet"
                description="Place mentions from sources and memories become the context graph for migration, churches, residence, and historical research."
              />
            ) : (
              (workspace.places as Array<{ _id: string; fullName?: string; name?: string; type?: string }>).map((place) => (
                <SafeLink key={place._id} href={`/app/places/${place._id}`}>
                  <Card className="h-full border-border transition hover:border-annotation/40 hover:bg-annotation-surface/30">
                    <CardHeader>
                      <CardTitle role="heading" aria-level={2}>{place.fullName || place.name || "Unknown place"}</CardTitle>
                      <CardDescription>{place.type || "place"}</CardDescription>
                    </CardHeader>
                  </Card>
                </SafeLink>
              ))
            )}
          </div>
        </div>},
{id:"memories",label:"Memories",count:media.length,updatedAt:latestUpdate(media),content:<div className="space-y-4">
          {/* The panel always renders, because its upload control is how a
              person puts a scan into the vault at all — including the first
              one, when there is nothing here to import against yet. */}
          <fieldset disabled={readonlyPreview}>{readonlyPreview && <p className="mb-2 text-xs text-annotation">Synthetic preview: upload and review mutations are disabled.</p>}<MediaPrivacyReviewPanel media={media} personId={String(workspace.person._id)} /></fieldset>
          {media.length === 0 ? (
            <EmptyWorkspaceState
              title="No memories imported yet"
              description="Upload a scan, photo, or recording above, or import a FamilySearch memories capture to enrich this person for later story writing."
              actionHref="/app/imports"
              actionLabel="Import Memories"
            />
          ) : null}
        </div>},
{id:"documents",label:"Documents",count:documents.length,updatedAt:latestUpdate(documents),content:<div className="">
          <Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <Files className="h-5 w-5 text-annotation" />
                Derived Documents and Outputs
              </CardTitle>
              <CardDescription>Raw transcripts, dossiers, and future story drafts derived from the vault graph for this person.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <SafeLink href={`/app/people/${personId}/raw`}>Raw Evidence Document</SafeLink>
                </Button>
                <Button asChild variant="outline">
                  <SafeLink href={`/app/people/${personId}/contextualized`}>Contextualized Dossier</SafeLink>
                </Button>
              </div>
              <DocumentsViewer documents={documents} error={documentsError} />
            </CardContent>
          </Card>
        </div>},
{id:"stories",label:"Stories",count:workspace.stories.length,updatedAt:latestUpdate(workspace.stories),content:<div className="">
          <div className="grid gap-4">
            <Card className="border-border bg-gradient-to-br from-card to-annotation-surface/60">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Story Writer</CardTitle>
                <CardDescription>Generate narrative drafts from this person&apos;s context pack, then save them back into the vault.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="bg-primary hover:bg-primary/90">
                  <SafeLink href={`/app/people/${routeId}/story-writer`}>Open Story Writer</SafeLink>
                </Button>
              </CardContent>
            </Card>
            {workspace.stories.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No saved story outputs yet. Start from Story Writer or export a context pack to another AI tool.
                </CardContent>
              </Card>
            ) : (
              workspace.stories.map((story) => (
                <Card key={String(story._id)} className="border-border">
                  <CardHeader>
                    <CardTitle role="heading" aria-level={2}>{story.title}</CardTitle>
                    <CardDescription>{story.type.replace(/_/g, " ")} · {story.status}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Prose markdown={story.content} variant="compact" className="text-sm text-muted-foreground" />
                    <div className="flex flex-wrap gap-3">
                      <Button asChild variant="outline" size="sm">
                        <SafeLink href={`/app/stories/${story._id}`}>Review in Story Studio</SafeLink>
                      </Button>
                      {story.status === "published" ? (
                        <Button asChild variant="outline" size="sm">
                          <SafeLink href={publicStoryPath(story.publicSlug ?? String(story._id))} target="_blank">Open public page</SafeLink>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>},
{id:"research",label:"Research",count:workspace.researchChecks.length + workspace.researchTasks.length + contextItems.length,updatedAt:latestUpdate([...workspace.researchTasks,...contextItems]),content:<div className="">
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Card className="border-border">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Research Tasks</CardTitle>
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
                    <div key={String(task._id)} className="rounded-lg border border-border px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{task.title}</p>
                        <Badge variant="secondary">{task.priority}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{task.description || task.type}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border bg-card p-4"><h2 className="font-sans text-base font-semibold">Research Log</h2><p className="mt-2 text-sm text-muted-foreground">What the vault has already gathered or generated now lives in the single dated evidence stream.</p><SafeAnchor href="#record-section-overview" className="mt-1 inline-flex min-h-11 items-center text-sm text-primary underline">Open research log and import stream</SafeAnchor></div>
          </div>

          <Card className="mt-5 border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Research Checks</CardTitle>
              <CardDescription>Override or confirm the inferred operational checklist for this person.</CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset disabled={readonlyPreview}>{readonlyPreview && <p className="mb-2 text-xs text-annotation">Synthetic preview: research mutations are disabled.</p>}<ResearchChecksPanel
                personIdentifier={workspace.person.routeId}
                checks={workspace.researchChecks}
              /></fieldset>
            </CardContent>
          </Card>

          <div className="mt-5">
            <div>{readonlyPreview && <p className="mb-2 text-xs text-annotation">Synthetic preview: drafts can be typed; context mutations are disabled.</p>}<ContextItemsPanel personIdentifier={routeId} contextItems={contextItems} readonlyPreview={readonlyPreview}/></div>
          </div>
        </div>}];
  return <div className="min-w-0 p-4 [overflow-wrap:anywhere] sm:p-8"><RecordSections aside={<PersonHeader person={workspace.person} stats={workspace.stats} operations={workspace.operations} researchTaskCount={workspace.researchTasks.length} routeId={routeId}/>} sections={sections} overview={<div className="space-y-6">{priorities}{importNotice}<EvidenceStream entries={stream}/><div className="space-y-5">
          {/* What's next leads; readiness and actions follow; the detailed numbers come last. */}


          <section className="mb-5 grid gap-5 grid-cols-1">
            <Card className="border-border bg-card">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle role="heading" aria-level={2} className="text-2xl">Story Readiness</CardTitle>
                    <CardDescription>
                      Research coverage helps plan a draft. Review, privacy, and publication checks happen on the saved story.
                    </CardDescription>
                  </div>

                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                  {storyReadinessChecks.map((check) => (
                    <div key={check.key} className="border border-border bg-muted px-3 py-3">
                      <div className="flex items-center gap-2">
                        {check.status === "complete" ? (
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-evidence" />
                        ) : check.status === "not_applicable" ? (
                          <CircleMinus aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-annotation" />
                        )}
                        <p className="text-sm font-medium text-foreground">{check.label}</p>
                      </div>
                      <p className="mt-2 text-xs font-medium capitalize text-foreground">{check.status.replace(/_/g, " ")}</p>
                      {check.summary ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.summary}</p> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild className="bg-primary hover:bg-primary/90">
                    <SafeLink href={`/app/people/${routeId}/story-writer`}>Draft from context pack</SafeLink>
                  </Button>
                  <Button asChild variant="outline">
                    <SafeLink href="/app/stories">Open Story Studio</SafeLink>
                  </Button>
                  {currentStory ? (
                    <Button asChild variant="outline">
                      <SafeLink href={`/app/stories/${currentStory._id}`}>Review latest saved story</SafeLink>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card ">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Contextual Research</CardTitle>
                <CardDescription>
                  The non-genealogy research that helps turn names, dates, and places into a story: churches, buildings, local history, eras, migration, news, and daily life.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="grid grid-cols-2 gap-2 text-center text-sm lg:grid-cols-1">
                  <div className="border border-border bg-muted px-3 py-4">
                    <p className="text-2xl font-semibold text-foreground">{workspace.contextCoverage.count}</p>
                    <p className="text-xs text-muted-foreground">context reports</p>
                    {workspace.contextCoverage.count > 0 ? (
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {workspace.contextCoverage.aiEligibleCount} reviewed for AI · {workspace.contextCoverage.publishableCount} publish-ready
                      </p>
                    ) : null}
                  </div>
                  <div className="border border-border bg-muted px-3 py-4">
                    <p className="text-2xl font-semibold text-foreground">
                      {workspace.contextCoverage.placeCountWithContext}/{workspace.contextCoverage.relatedPlaceCount}
                    </p>
                    <p className="text-xs text-muted-foreground">places covered</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {workspace.contextCoverage.entries.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm leading-6 text-muted-foreground">
                      This person has genealogy data, but no linked contextual research reports yet. Add place and era context from the relevant place workspaces before treating the story as ready.
                    </div>
                  ) : (
                    workspace.contextCoverage.entries.map((entry) => {
                      const reviewStatus = entry.reviewStatus ?? "unreviewed";
                      const privacyLevel = entry.privacyLevel ?? "private";
                      const aiAllowed = entry.aiUseAllowed === true;
                      const reviewTone =
                        reviewStatus === "reviewed" || reviewStatus === "redacted"
                          ? "border-evidence/30 bg-evidence-surface text-evidence"
                          : reviewStatus === "disputed" || reviewStatus === "rejected"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-annotation/30 bg-annotation-surface text-annotation";
                      const privacyTone =
                        privacyLevel === "public_source" || privacyLevel === "publish_candidate"
                          ? "border-evidence/30 bg-evidence-surface text-evidence"
                          : privacyLevel === "private"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-border bg-muted text-foreground";
                      return (
                        <div key={String(entry._id)} className="border border-border px-4 py-3">
                          <p className="font-medium text-foreground">{entry.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {entry.topic.replace(/_/g, " ")} · {entry.timePeriod.startYear}-{entry.timePeriod.endYear}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className={reviewTone}>{reviewStatus}</Badge>
                            <Badge variant="outline" className={privacyTone}>{privacyLevel.replace(/_/g, " ")}</Badge>
                            <Badge variant="outline" className={aiAllowed ? "border-evidence/30 bg-evidence-surface text-evidence" : "border-border bg-muted text-muted-foreground"}>
                              AI {aiAllowed ? "allowed" : "blocked"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <Card className="mb-5 border-border bg-gradient-to-br from-card to-annotation-surface/60">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Next Actions</CardTitle>
              <CardDescription>Move from imported evidence to agent-ready research outputs.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
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
                  <SafeAnchor
                    key={action.label}
                    href={action.href}
                    className="rounded-lg border border-border bg-card px-4 py-4 transition hover:border-annotation/40 hover:bg-annotation-surface/70"
                  >
                    <p className="font-medium text-foreground">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
                  </SafeAnchor>
                ) : (
                  <div
                    key={action.label}
                    className="rounded-lg border border-dashed border-border bg-muted px-4 py-4"
                  >
                    <p className="font-medium text-foreground">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>


        </div></div>}/></div>;
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
    <Card className="border-dashed border-border bg-card/80">
      <CardContent className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        {actionHref && actionLabel ? (
          <Button asChild variant="outline" className="mt-5">
            <SafeLink href={actionHref}>{actionLabel}</SafeLink>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
