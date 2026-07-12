import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { requireHumanReviewConfirmation } from "@/lib/operations/reviewGates";
import {
  getActionForStatusChange,
  requireStoryAction,
  resolveStoryActor,
} from "@/lib/stories/capabilities";
import { buildStoryHandoffPacket } from "@/lib/stories/handoff";
import { assessStoryPublishReadiness, type StoryPublishReadiness } from "@/lib/stories/publishSafety";
import { getVaultAccessContext } from "@/lib/vault/server";

function isStoryStatus(value: unknown): value is "draft" | "review" | "published" {
  return value === "draft" || value === "review" || value === "published";
}

type AuthedConvexClient = Awaited<ReturnType<typeof getAuthedConvexClient>>;

async function getStoryBundle(client: AuthedConvexClient, vaultOwnerId: string, storyId: string) {
  return client.query(api.vault.getStoryReview, {
    vaultOwnerId,
    storyId: storyId as Id<"stories">,
  });
}

function buildPublishPreview(bundle: NonNullable<Awaited<ReturnType<typeof getStoryBundle>>>) {
  const publishReadiness = assessStoryPublishReadiness({
    story: bundle.story,
    person: bundle.person,
    readiness: bundle.readiness,
    researchChecks: bundle.researchChecks,
    contextCoverage: bundle.contextCoverage,
    evidence: bundle.evidence,
    events: bundle.events,
    places: bundle.places,
    relationships: bundle.relationships,
    provisionalRelatives: bundle.provisionalRelatives,
    publishWarnings: bundle.publishWarnings,
  });
  const handoffPacket = buildStoryHandoffPacket({
    story: bundle.story,
    person: bundle.person,
    readiness: bundle.readiness,
    researchChecks: bundle.researchChecks,
    contextCoverage: bundle.contextCoverage,
    evidence: bundle.evidence,
    events: bundle.events,
    places: bundle.places,
    relationships: bundle.relationships,
    provisionalRelatives: bundle.provisionalRelatives,
    publishWarnings: bundle.publishWarnings,
    publishReadiness,
  });

  return { publishReadiness, handoffPacket };
}

function toAuditSnapshot(readiness: StoryPublishReadiness) {
  return {
    canPublish: readiness.canPublish,
    status: readiness.status,
    score: readiness.score,
    summary: readiness.summary,
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    provenance: readiness.provenance,
    recommendedNextActions: readiness.recommendedNextActions,
  };
}

async function recordReviewEvent(params: {
  client: AuthedConvexClient;
  vaultOwnerId: string;
  storyId: string;
  eventType: "publish_preview" | "status_change" | "publish_confirmation";
  actorRole: "first_party_owner" | "story_writer" | "reviewer" | "trusted_publisher" | "unknown";
  actorName?: string;
  fromStatus?: "draft" | "review" | "published";
  toStatus?: "draft" | "review" | "published";
  reviewerName?: string;
  humanReviewNote?: string;
  publishReadiness?: StoryPublishReadiness;
}) {
  return params.client.mutation(api.vaultMutations.recordStoryReviewEvent, {
    vaultOwnerId: params.vaultOwnerId,
    storyId: params.storyId as Id<"stories">,
    eventType: params.eventType,
    actorRole: params.actorRole,
    actorName: params.actorName,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    reviewerName: params.reviewerName,
    humanReviewNote: params.humanReviewNote,
    readinessSnapshot: params.publishReadiness ? toAuditSnapshot(params.publishReadiness) : undefined,
    blockerCount: params.publishReadiness?.blockers.length,
    warningCount: params.publishReadiness?.warnings.length,
    readinessScore: params.publishReadiness?.score,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { id } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const bundle = await getStoryBundle(client, vaultOwnerId, id);

    if (!bundle) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const preview = buildPublishPreview(bundle);
    const format = request.nextUrl.searchParams.get("format");
    const shouldRecord = request.nextUrl.searchParams.get("record") === "true";
    const actor = resolveStoryActor(request);

    if (shouldRecord) {
      await recordReviewEvent({
        client,
        vaultOwnerId,
        storyId: id,
        eventType: "publish_preview",
        actorRole: actor.role,
        actorName: actor.name,
        fromStatus: bundle.story.status,
        toStatus: bundle.story.status,
        publishReadiness: preview.publishReadiness,
      });
    }

    return NextResponse.json({
      success: true,
      preview: true,
      recorded: shouldRecord,
      actor,
      storyStatus: bundle.story.status,
      publishReadiness: preview.publishReadiness,
      handoffPacket: format === "handoff" ? preview.handoffPacket : undefined,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const actor = resolveStoryActor(request, body);

    if (!isStoryStatus(body.status)) {
      return NextResponse.json({ error: "Invalid story status" }, { status: 400 });
    }

    const denied = requireStoryAction(actor.role, getActionForStatusChange(body.status));
    if (denied) {
      return NextResponse.json(denied, { status: 403 });
    }

    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    let publishReadiness;
    let fromStatus: "draft" | "review" | "published" | undefined;

    if (body.status === "published") {
      const bundle = await getStoryBundle(client, vaultOwnerId, id);

      if (!bundle) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }

      fromStatus = bundle.story.status;
      if (bundle.story.secondReviewRequired && !bundle.story.secondReviewedAt) {
        return NextResponse.json(
          {
            error: "Second review required",
            details:
              "This story is marked high-risk and needs second reviewer approval before public publish.",
          },
          { status: 400 }
        );
      }

      publishReadiness = buildPublishPreview(bundle).publishReadiness;
      if (!publishReadiness.canPublish) {
        return NextResponse.json(
          {
            error: "Story publish blocked",
            details: publishReadiness.summary,
            publishReadiness,
          },
          { status: 400 }
        );
      }

      const reviewErrors = requireHumanReviewConfirmation({
        actionName: "Publishing a public story",
        confirmed: body.humanReviewConfirmed,
        note: body.humanReviewNote,
      });

      if (reviewErrors.length > 0) {
        return NextResponse.json(
          {
            error: "Human review gate failed",
            details: reviewErrors.join(" "),
            reviewErrors,
          },
          { status: 400 }
        );
      }
    }

    if (!fromStatus) {
      const bundle = await getStoryBundle(client, vaultOwnerId, id);
      fromStatus = bundle?.story.status;
    }

    const result = await client.mutation(api.vaultMutations.updateStoryStatus, {
      vaultOwnerId,
      storyId: id as Id<"stories">,
      status: body.status,
    });

    await recordReviewEvent({
      client,
      vaultOwnerId,
      storyId: id,
      eventType: body.status === "published" ? "publish_confirmation" : "status_change",
      actorRole: actor.role,
      actorName: actor.name,
      fromStatus,
      toStatus: body.status,
      reviewerName: typeof body.reviewerName === "string" ? body.reviewerName.trim() : undefined,
      humanReviewNote:
        typeof body.humanReviewNote === "string" ? body.humanReviewNote.trim() : undefined,
      publishReadiness,
    });

    return NextResponse.json({ success: true, actor, publishReadiness, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
