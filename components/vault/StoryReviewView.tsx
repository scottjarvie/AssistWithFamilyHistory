import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { ComponentProps } from "react";
import { SafeAnchor, SafeLink as Link } from "@/components/layout/SafeLink";
import { RecordComplete as CheckCircle2, RecordWarning as CircleAlert } from "@/components/design/RecordGlyph";
import { SectionGlyph } from "@/components/design/SectionGlyph";
import { ArchiveIllustration } from "@/components/design/ArchiveIllustration";
import { UtcDate } from "@/components/design/UtcDate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StoryEditorForm } from "@/components/vault/StoryEditorForm";
import { StoryReviewAssignmentForm } from "@/components/vault/StoryReviewAssignmentForm";
import { StoryReviewHistoryPanel } from "@/components/vault/StoryReviewHistoryPanel";
import { StoryStatusActions } from "@/components/vault/StoryStatusActions";
import { Prose } from "@/components/prose/Prose";
import { DossierDetails } from "@/components/records/DossierDetails";
import { RecordSections, type RecordSection } from "@/components/records/RecordSections";
import { assessStoryPublishReadiness } from "@/lib/stories/publishSafety";
import { publicStoryPath } from "@/lib/stories/slug";
export type StoryReviewBundle = NonNullable<FunctionReturnType<typeof api.vaultReads.getStoryReview>>;
type GlyphProps=ComponentProps<"svg">;
const ShieldCheck=(p:GlyphProps)=><SectionGlyph kind="review" {...p}/>;
const ClipboardCheck=(p:GlyphProps)=><SectionGlyph kind="sources" {...p}/>;
const UserCheck=(p:GlyphProps)=><SectionGlyph kind="people" {...p}/>;
const UserRound=(p:GlyphProps)=><SectionGlyph kind="relationships" {...p}/>;
const MapPinned=(p:GlyphProps)=><SectionGlyph kind="places" {...p}/>;
const Milestone=(p:GlyphProps)=><SectionGlyph kind="timeline" {...p}/>;
const FileText=(p:GlyphProps)=><SectionGlyph kind="memories" {...p}/>;
const AlertTriangle=(p:GlyphProps)=><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" {...p}><path d="M8 1 1 14h14L8 1Z M8 5v4 M8 11h.01"/></svg>;

const statusTone = {
  draft: "bg-muted text-foreground hover:bg-muted",
  review: "bg-annotation-surface text-annotation hover:bg-annotation-surface",
  published: "bg-evidence-surface text-evidence hover:bg-evidence-surface",
};

const publishGateTone = {
  blocker: "border-l-destructive",
  warning: "border-l-annotation",
  passed: "border-l-evidence",
};

function formatEventDate(event: { date?: { original?: string; year?: number } }) {
  return event.date?.original || event.date?.year?.toString() || "Undated";
}

function formatPackLabel(value?: string) {
  return value ? value.replace(/_/g, " ") : "untyped context";
}


/** Server-rendered story record. Editorial and publication controls retain their original contracts. */
export function StoryReviewView({bundle,readonlyPreview=false}:{bundle:StoryReviewBundle;readonlyPreview?:boolean}) {
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
  const historyRows = reviewHistory.map(event=>({
    _id:String(event._id),eventType:event.eventType,fromStatus:event.fromStatus,toStatus:event.toStatus,
    actorRole:event.actorRole,actorName:event.actorName,assignedTo:event.assignedTo,reviewerName:event.reviewerName,
    humanReviewNote:event.humanReviewNote,readinessSnapshot:event.readinessSnapshot,
    blockerCount:event.blockerCount,warningCount:event.warningCount,readinessScore:event.readinessScore,createdAt:event.createdAt,
  }));
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
;
  const linkedRelationships = relationships.filter((relationship) => relationship !== null);
  const attachedContextPackIds = new Set((story.contextPackIds ?? []).map((id) => String(id)));
  const attachedContextPacks = historicalContext.filter((entry) => attachedContextPackIds.has(String(entry._id)));
  // Provenance and "available now" are different signals. A draft saved
  // before contextPackIds tracking landed has 0 recorded packs even when
  // the person currently has typed packs available — those are not provenance.
  const hasRecordedProvenance = attachedContextPackIds.size > 0;
  const availableContextPacks = historicalContext.filter((entry) => entry.packType);
  const recordedCitations=new Set(story.citationIds.map(String));
  const recordedSets=evidence.filter(entry=>entry.citations.some(citation=>recordedCitations.has(String(citation._id))));
  const otherSets=evidence.length-recordedSets.length;
  const gateOrder={blocker:0,warning:1,passed:2};
  const orderedGates=publishReadiness.checks.toSorted((a,b)=>gateOrder[a.severity]-gateOrder[b.severity]);
  const unmatchedWarnings=publishWarnings.filter(warning=>!publishReadiness.checks.some(gate=>gate.key===warning.key));
  const attentionCount=publishReadiness.blockers.length+publishReadiness.warnings.length;
  const passedCount=publishReadiness.checks.filter(gate=>gate.severity==="passed").length;
  const phrase=(count:number,one:string,many=one+"s")=>`${count} ${count===1?one:many}`;
  const returned=(count:number,cap:number,label:string,many?:string)=>`${phrase(count,label,many)}${count>=cap?` (first ${cap} returned)`:""}`;
  const humanLabel=(value:string)=>value.toLowerCase().replace(/_/g," ").replace(/^./,letter=>letter.toUpperCase());
  const workflowSteps = [
    { key: "draft", label: "Draft" },
    { key: "review", label: "Review" },
    { key: "published", label: "Published" },
  ] as const;

 const panel0=(<Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <ShieldCheck className={publishReadiness.canPublish ? "h-5 w-5 text-evidence" : "h-5 w-5 text-destructive"} />
                Publish Gate
              </CardTitle>
              <CardDescription>
                {publishReadiness.summary}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="border border-border bg-card px-2 py-3">
                  <p className="font-semibold text-foreground">{publishReadiness.score}%</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
                <div className="border border-border bg-card px-2 py-3">
                  <p className="font-semibold text-destructive">{publishReadiness.blockers.length}</p>
                  <p className="text-xs text-muted-foreground">Blockers</p>
                </div>
                <div className="border border-border bg-card px-2 py-3">
                  <p className="font-semibold text-annotation">{publishReadiness.warnings.length}</p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
              </div>
              <div className="space-y-2">
                {orderedGates.map((gate) => (
                  <div key={gate.key} className={`border border-border border-l-2 bg-card px-3 py-3 ${publishGateTone[gate.severity]}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{gate.label}</p>
                      <span className="text-xs text-muted-foreground">{humanLabel(gate.severity)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{gate.detail}</p>
                    {publishWarnings.filter(warning=>warning.key===gate.key).map(warning=><div key={`${warning.key}-${warning.status}`} className="mt-2 text-xs text-annotation"><p>Warning status: {humanLabel(warning.status)}</p>{warning.detail!==gate.detail&&<p className="mt-1 leading-5 text-muted-foreground">{warning.detail}</p>}</div>)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>);
 const panel1=(<Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-annotation" />
                Story Provenance
              </CardTitle>
              <CardDescription>
                The support packet a writer, reviewer, or publisher should inspect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-muted px-3 py-3">
                  <p className="font-semibold text-foreground">{publishReadiness.provenance.evidenceGroups}</p>
                  <p className="text-xs text-muted-foreground">Sources</p>
                </div>
                <div className="bg-muted px-3 py-3">
                  <p className="font-semibold text-foreground">{publishReadiness.provenance.citations}</p>
                  <p className="text-xs text-muted-foreground">Citations</p>
                </div>
                <div className="bg-muted px-3 py-3">
                  <p className="font-semibold text-foreground">{publishReadiness.provenance.events}</p>
                  <p className="text-xs text-muted-foreground">Events</p>
                </div>
                <div className="bg-muted px-3 py-3">
                  <p className="font-semibold text-foreground">{attachedContextPacks.length}</p>
                  <p className="text-xs text-muted-foreground">{hasRecordedProvenance ? "Packs attached" : "Packs recorded"}</p>
                </div>
              </div>
              {publishReadiness.recommendedNextActions.length > 0 ? (
                <div className="space-y-2">
                  {publishReadiness.recommendedNextActions.map((action) => (
                    <p key={action} className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                      {action}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>);
 const panel2=(<Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Research Pack Provenance</CardTitle>
              <CardDescription>
                {hasRecordedProvenance
                  ? "Research packs the writer attached when this draft was saved."
                  : "No research packs were recorded for this draft. Currently available packs are listed for reference only."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {hasRecordedProvenance ? (
                attachedContextPacks.map((entry) => (
                  <div key={String(entry._id)} className="rounded-md border border-border px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{formatPackLabel(entry.packType)}</Badge>
                      {entry.templateVersion ? <Badge variant="outline">{entry.templateVersion}</Badge> : null}
                      <Badge className="bg-annotation-surface text-annotation hover:bg-annotation-surface">attached</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{entry.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.reviewStatus ?? "unreviewed"} · {entry.privacyLevel ?? "private"} · AI {entry.aiUseAllowed ? "allowed" : "blocked"}
                    </p>
                  </div>
                ))
              ) : availableContextPacks.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
                  No research packs were recorded for this draft, and none are currently available for this person.
                </p>
              ) : (
                <>
                  <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
                    No research packs were recorded for this draft (saved before pack provenance was tracked).
                  </p>
                  <p className="px-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Currently available for this person
                  </p>
                  {availableContextPacks.map((entry) => (
                    <div key={String(entry._id)} className="rounded-md border border-dashed border-border px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{formatPackLabel(entry.packType)}</Badge>
                        {entry.templateVersion ? <Badge variant="outline">{entry.templateVersion}</Badge> : null}
                        <Badge variant="outline">available, not attached</Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{entry.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.reviewStatus ?? "unreviewed"} · {entry.privacyLevel ?? "private"} · AI {entry.aiUseAllowed ? "allowed" : "blocked"}
                      </p>
                    </div>
                  ))}
                </>
              )}
              <p className="rounded-md bg-annotation-surface px-3 py-3 text-xs leading-5 text-annotation">
                Research packs are background context. Person-specific claims still need source facts or citations.
              </p>
            </CardContent>
          </Card>);
 const panel3=(<Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-annotation" />
                Review Owner
              </CardTitle>
              <CardDescription>
                Assign the person responsible for clearing gates before trusted publish.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset disabled={readonlyPreview} className="min-w-0"><StoryReviewAssignmentForm
                storyId={String(story._id)}
                assignedReviewer={story.assignedReviewer}
                secondReviewRequired={story.secondReviewRequired}
                secondReviewer={story.secondReviewer}
                secondReviewedAt={story.secondReviewedAt}
              /></fieldset>
              {story.secondReviewRequired ? (
                <div className="mt-4 border border-annotation/30 bg-annotation-surface px-3 py-3 text-sm text-annotation">
                  <p className="font-medium">Second approval is required before publishing.</p>
                  <p className="mt-1 text-xs leading-5">
                    {story.secondReviewedAt
                      ? "Second approval has been marked complete."
                      : "Publishing remains blocked until second approval is marked complete."}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>);
 const panel4=(<Card className="border-annotation/30 bg-annotation-surface/50">
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-annotation" />
                Publish Warnings
              </CardTitle>
              <CardDescription>
                These gaps remain visible alongside the Publish Gate. Publishing still requires every blocking gate to clear.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unmatchedWarnings.length === 0 ? (
                <p className="rounded-md bg-evidence-surface px-3 py-3 text-sm text-evidence">
                  No major publish warnings are currently detected.
                </p>
              ) : (
                unmatchedWarnings.map((warning) => (
                  <div key={`${warning.key}-${warning.status}`} className="rounded-md border border-annotation/30 bg-card px-3 py-3">
                    <p className="text-sm font-medium text-foreground">{warning.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-annotation">{humanLabel(warning.status)}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{warning.detail}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>);
 const panel5=(<Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Story Readiness</CardTitle>
              <CardDescription>
                Current vault checks used as blockers before publishing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-semibold text-foreground">
                    {readiness?`${readiness.completionPercent}%`:"Unavailable"}
                  </p>
                  <p className="text-sm text-muted-foreground">research coverage</p>
                </div>
                {(readiness?.requiredMissingCount ?? 0) === 0 ? (
                  <CheckCircle2 className="h-8 w-8 text-evidence" />
                ) : (
                  <CircleAlert className="h-8 w-8 text-annotation" />
                )}
              </div>
              <div className="mt-5 space-y-2">
                {blockers.length === 0 ? (
                  <p className="rounded-md bg-evidence-surface px-3 py-3 text-sm text-evidence">
                    {readiness?"Required checks are satisfied. Use human review before publishing.":"Research coverage is unavailable without a linked person. The Publish Gate still applies."}
                  </p>
                ) : (
                  blockers.map((check) => (
                    <div key={String("_id" in check ? check._id : check.checkKey)} className="rounded-md bg-muted px-3 py-3">
                      <p className="text-sm font-medium text-foreground">{check.summary || check.checkKey.replace(/_/g, " ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{humanLabel(check.status)} · {humanLabel(check.applicability)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>);
 const panel6=(<Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Context Coverage</CardTitle>
              <CardDescription>
                Place, era, church, building, news, and locality research tied to this story.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-muted px-3 py-3">
                  <p className="font-semibold text-foreground">{contextCoverage?.count ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Reports</p>
                </div>
                <div className="bg-muted px-3 py-3">
                  <p className="font-semibold text-foreground">{contextCoverage?.placeCountWithContext ?? 0}/{contextCoverage?.relatedPlaceCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Places</p>
                </div>
              </div>
              {contextCoverage?.missingPlaces?.length ? (
                <div className="rounded-md bg-annotation-surface px-3 py-3 text-sm text-annotation">
                  Missing context: {contextCoverage.missingPlaces.map((place) => place.name).join(", ")}
                </div>
              ) : null}
            </CardContent>
          </Card>);
 const panel7=(<Card className="border-border">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Grounding Evidence</CardTitle>
              <CardDescription>{evidence.length} grouped source sets linked to this person.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">No source coverage is linked yet.</p>
              ) : (
                evidence.map((entry) => (
                  <div key={String(entry.source._id)} className="border border-border px-3 py-3">
                    <p className="text-sm font-medium text-foreground">{entry.source.title}</p>
                    <Badge variant="outline" className="mt-2">{entry.citations.some(citation=>recordedCitations.has(String(citation._id)))?"Recorded citation for this draft":entry.citations.length>=3?"No recorded citation among the first 3 returned":"Other person source"}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {phrase(entry.citations.length,"citation")}{entry.citations.length>=3?" · first 3 returned":""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>);
 const panel8=(<Card className="border-border">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-annotation" />
              Relationships
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkedRelationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No relationships linked yet.</p>
            ) : (
              linkedRelationships.map((relationship) => (
                <p key={String(relationship._id)} className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  {relationship.relatedName}
                </p>
              ))
            )}
          </CardContent>
        </Card>);
 const panel9=(<Card className="border-border">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <Milestone className="h-5 w-5 text-annotation" />
              Life Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events linked yet.</p>
            ) : (
              events.map((event) => (
                <div key={String(event._id)} className="border-l-2 border-annotation/40 pl-3">
                  <p className="text-sm font-medium text-foreground">{event.type}</p>
                  <p className="text-xs text-muted-foreground">{formatEventDate(event)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>);
 const panel10=(<Card className="border-border">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-annotation" />
              Places
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {places.length === 0 ? (
              <p className="text-sm text-muted-foreground">No places linked yet.</p>
            ) : (
              places.map((place) => (
                <p key={String(place._id)} className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  {place.fullName || place.name}
                </p>
              ))
            )}
          </CardContent>
        </Card>);
 const panel11=(<Card className="border-border">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-annotation" />
              Memories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {media.length === 0 ? (
              <p className="text-sm text-muted-foreground">No memories linked yet.</p>
            ) : (
              media.map((item) => (
                <p key={String(item._id)} className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  {item.title}
                </p>
              ))
            )}
          </CardContent>
        </Card>);
 const panel12=(<Card className="border-border">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Historical And Local Context</CardTitle>
            <CardDescription>
              Research reports that help turn dates and places into a grounded narrative.
            </CardDescription>
          </CardHeader>
          <CardContent className="@container grid gap-3 @[36rem]:grid-cols-2">
            {historicalContext.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contextual research reports are linked yet.</p>
            ) : (
              historicalContext.map((entry) => (
                <div key={String(entry._id)} className="border border-border px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{formatPackLabel(entry.packType)}</Badge>
                    {entry.templateVersion ? <Badge variant="outline">{entry.templateVersion}</Badge> : null}
                    {attachedContextPackIds.has(String(entry._id)) ? <Badge className="bg-annotation-surface text-annotation hover:bg-annotation-surface">attached</Badge> : null}
                  </div>
                  <p className="mt-3 font-medium text-foreground">{entry.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.topic.replace(/_/g, " ")} · {entry.timePeriod.startYear}-{entry.timePeriod.endYear}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {entry.reviewStatus ?? "unreviewed"} · {entry.privacyLevel ?? "private"} · AI {entry.aiUseAllowed ? "allowed" : "blocked"}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.content}</p>
                  {entry.categoryBlocks?.length ? (
                    <div className="mt-4 space-y-3">
                      {entry.categoryBlocks.map((block) => (
                        <div key={block.category} className="rounded-md bg-muted px-3 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            {block.category.replace(/_/g, " ")}
                          </p>
                          {block.summary ? <p className="mt-2 text-sm leading-6 text-foreground">{block.summary}</p> : null}
                          {block.sourcedClaims.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {block.sourcedClaims.map((claim) => (
                                <div key={`${block.category}-${claim.text}`} className="border-l-2 border-annotation/40 pl-3">
                                  <p className="text-sm leading-6 text-foreground">{claim.text}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {claim.confidence} confidence{claim.sourceRefs.length > 0 ? ` · ${claim.sourceRefs.join("; ")}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {block.synthesisNotes ? (
                            <p className="mt-3 rounded-md bg-card px-3 py-2 text-sm leading-6 text-muted-foreground">
                              Synthesis: {block.synthesisNotes}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>);
 const panel13=(<Card className="border-border">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Review History</CardTitle>
            <CardDescription>
              Publish previews, reviewer assignments, and status changes recorded for this story.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StoryReviewHistoryPanel
              events={historyRows}
            />
          </CardContent>
        </Card>);

 const sections:RecordSection[]=[
  {id:"draft",label:"Edit",updatedAt:story.updatedAt,content:<Card><CardHeader><CardTitle role="heading" aria-level={2}>Editable Markdown Draft</CardTitle><CardDescription>Title, type, tags and full Markdown. The preview reflects your current edits.</CardDescription></CardHeader><CardContent><StoryEditorForm story={{_id:String(story._id),title:story.title,content:story.content,type:story.type,tags:story.tags}} readonlyPreview={readonlyPreview}/></CardContent></Card>},
  {id:"review",label:"Review",count:attentionCount,detail:`${phrase(publishReadiness.blockers.length,"blocker")} · ${phrase(publishReadiness.warnings.length,"warning")} · ${passedCount} passed`,content:<div className="space-y-5">{panel0}{panel3}{unmatchedWarnings.length>0&&panel4}{panel5}</div>},
  {id:"sources",label:"Evidence",count:evidence.length,detail:`${returned(evidence.length,8,"source set")}; current person evidence, not per-paragraph citations`,content:<div className="space-y-5">{panel1}{panel7}</div>},
  {id:"context",label:"Context",count:historicalContext.length,detail:`${returned(historicalContext.length,8,"report")}; attached provenance distinguished`,content:<div className="space-y-5">{panel2}{panel6}{panel12}</div>},
  {id:"life",label:"Life",count:linkedRelationships.length+events.length+places.length+media.length,detail:`${phrase(linkedRelationships.length,"relationship")} · ${returned(events.length,8,"event")} · ${returned(places.length,8,"place")} · ${returned(media.length,6,"memory","memories")}`,content:<div className="space-y-5">{panel8}{panel9}{panel10}{panel11}</div>},
  {id:"history",label:"History",count:reviewHistory.length,detail:reviewHistory.length>=12?"First 12 returned":undefined,updatedAt:reviewHistory.reduce((last,event)=>Math.max(last,event.createdAt||0),0)||undefined,content:panel13},
 ];
 const aside=<><Link href="/app/stories" className="mb-1 inline-flex min-h-11 items-center text-sm text-muted-foreground">← Story Studio</Link><section className="rounded-lg border border-border bg-card p-3 lg:p-4"><div className="flex items-start gap-3"><ArchiveIllustration className="h-14 w-14 shrink-0 rounded bg-muted text-primary lg:h-16 lg:w-16"/><div className="min-w-0"><p className="font-mono text-xs uppercase tracking-wider text-annotation">Story dossier</p><h1 className="mt-1 break-words text-2xl font-semibold leading-tight lg:text-3xl">{story.title}</h1><Badge className={`mt-2 ${statusTone[story.status]}`}>{story.status}</Badge></div></div><p className="mt-2 text-sm text-muted-foreground">{person?`${person.displayName}${person.lifespan?`, ${person.lifespan}`:""}`:"Unlinked story"} · {story.type.replace(/_/g," ")}</p><p className={`mt-2 border-t border-border pt-2 text-sm ${publishReadiness.canPublish?"text-evidence":"text-annotation"}`}>{publishReadiness.canPublish?"Ready for trusted publisher review":"Review before sharing"} · <SafeAnchor href="#record-section-review" className="underline">{phrase(publishReadiness.blockers.length,"blocker")} · {phrase(publishReadiness.warnings.length,"warning")}</SafeAnchor></p></section></>;
 const asideDetails=<div className="mt-2 rounded-lg border border-border bg-card px-3 lg:mt-3 lg:p-4"><fieldset disabled={readonlyPreview} className="mt-3 min-w-0"><legend className="sr-only">Story status actions</legend><StoryStatusActions compact storyId={String(story._id)} publicIdentifier={story.publicSlug} status={story.status} publishReadiness={{canPublish:publishReadiness.canPublish,summary:publishReadiness.summary}}/></fieldset><DossierDetails label="Authorship, dates and draft provenance"><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs lg:grid-cols-1"><div><dt className="text-muted-foreground">Who wrote this</dt><dd className="mt-1 text-sm">{story.generatedBy==="human"?"Person-written":story.generatedBy==="ai_edited"?"AI-edited · which AI not recorded":"AI-generated · which AI not recorded"}</dd></div>{story.modelUsed&&<div><dt className="text-muted-foreground">Recorded model · not verified</dt><dd className="mt-1 break-words">{story.modelUsed}</dd></div>}<div><dt className="text-muted-foreground">Updated</dt><dd className="mt-1"><UtcDate value={story.updatedAt} withTime/></dd></div><div><dt className="text-muted-foreground">Version</dt><dd className="mt-1">Current saved story; no version number recorded</dd></div><div><dt className="text-muted-foreground">Sources and context</dt><dd><SafeAnchor href="#record-section-sources" className="inline-flex min-h-11 items-center text-primary underline">Inspect grounding and provenance</SafeAnchor></dd></div></dl></DossierDetails><DossierDetails label="Story connections and editor"><div className="mt-3 border-t border-border pt-3"><h2 className="font-sans text-sm font-semibold">Connections</h2>{person&&<Link href={`/app/people/${person.routeId}`} className="flex min-h-11 items-center text-sm text-primary">Open source person</Link>}{story.status==="published"&&<Link href={publicStoryPath(story.publicSlug??String(story._id))} target="_blank" className="flex min-h-11 items-center text-sm text-primary">Public page ↗</Link>}<SafeAnchor href="#record-section-draft" className="flex min-h-11 items-center text-sm text-primary">Edit draft</SafeAnchor></div></DossierDetails></div>;
 const draftSources=<section aria-label="Recorded draft sources" className="rounded-lg border border-border bg-card p-4 text-sm"><h2 className="font-sans text-sm font-semibold">Recorded for this draft</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Whole draft, not per paragraph</p><dl className="mt-3 space-y-2"><div className="flex items-baseline justify-between gap-2"><dt>Recorded citations</dt><dd className="font-mono">{story.citationIds.length}</dd></div><div className="flex items-baseline justify-between gap-2"><dt>Recorded source facts</dt><dd className="font-mono">{story.sourceFactIds?.length||0}</dd></div><div className="flex items-baseline justify-between gap-2"><dt>Recorded packs</dt><dd className="font-mono">{attachedContextPackIds.size}</dd></div></dl>{attachedContextPacks.length>0&&<ul className="mt-3 space-y-2 border-t border-border pt-3">{attachedContextPacks.map(entry=><li key={String(entry._id)}><SafeAnchor href="#record-section-context" className="inline-flex min-h-11 items-center text-primary underline">{entry.title}</SafeAnchor></li>)}</ul>}{attachedContextPackIds.size>attachedContextPacks.length&&<p className="mt-3 text-xs leading-5 text-muted-foreground">{attachedContextPackIds.size-attachedContextPacks.length} recorded pack(s) are not in the returned context list.</p>}<p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground"><SafeAnchor href="#record-section-sources" className="inline-flex min-h-11 items-center text-primary underline">Source sets without a matching returned draft citation · {otherSets}</SafeAnchor>{evidence.length>=8&&<span className="block">Only the first 8 source sets are returned.</span>}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Recorded IDs establish draft provenance; they do not resolve paragraph support or an unresolved claim.</p></section>;
 const overview=<div className="space-y-5"><section className={`rounded-lg border p-4 ${publishReadiness.canPublish?"border-evidence/30 bg-evidence-surface":"border-annotation/30 bg-annotation-surface"}`}><div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-annotation"/><div><h2 className="text-xl font-semibold">{publishReadiness.canPublish?"Ready for trusted publisher review":"Review before sharing"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{publishReadiness.summary}</p><SafeAnchor href="#record-section-review" className="inline-flex min-h-11 items-center text-sm text-primary underline">Inspect all publish gates and assignments</SafeAnchor></div></div></section><div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_11rem] 2xl:grid-cols-[minmax(0,1fr)_13rem]"><article className="rounded-lg border border-border bg-card p-4 sm:p-6" aria-label="Saved story reading view"><p className="mb-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">Saved narrative · private workspace</p><Prose markdown={story.content} variant="story" className="mx-auto max-w-[68ch]"/><footer className="mt-6 border-t border-border pt-4 text-sm leading-6 text-muted-foreground">This reading view shows the last saved draft. Inspect source sets and attached research packs before treating a narrative claim as established.<SafeAnchor href="#record-section-sources" className="ml-1 inline-flex min-h-11 items-center text-primary underline">Open grounding evidence</SafeAnchor></footer></article><aside className="hidden min-w-0 xl:block">{draftSources}</aside><details className="rounded-lg border border-border bg-card xl:hidden"><summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">Draft sources · {phrase(story.citationIds.length,"citation")}</summary><div className="px-3 pb-3">{draftSources}</div></details></div><section className="rounded-lg border border-border bg-card p-4"><h2 className="text-xl font-semibold">Story workflow</h2><ol className="mt-3 divide-y divide-border">{workflowSteps.map((step,index)=><li key={step.key} className="flex gap-3 py-3 text-sm"><span className="font-mono text-xs text-annotation">0{index+1}</span><div><p className="font-semibold">{step.label}{story.status===step.key&&<Badge variant="secondary" className="ml-2">Current</Badge>}</p><p className="mt-1 leading-6 text-muted-foreground">{step.key==="draft"?"Writer prepares a grounded draft.":step.key==="review"?"Reviewer clears evidence, privacy, and family-graph risks.":"Trusted publisher confirms the public status change."}</p></div></li>)}</ol></section><section className="rounded-lg border border-border bg-card p-4"><h2 className="text-xl font-semibold">Review activity</h2><p className="mt-1 text-sm text-muted-foreground">Dated assignments, previews, edits and status changes, newest first.</p><div className="mt-4"><StoryReviewHistoryPanel events={historyRows} initialLimit={6}/></div></section></div>;
 return <div className="p-4 sm:p-8"><RecordSections aside={aside} asideDetails={asideDetails} overview={overview} sections={sections}/>{readonlyPreview&&<p className="mt-4 text-xs text-annotation">Synthetic preview: saving, assignment and status mutations are disabled.</p>}</div>;
}
