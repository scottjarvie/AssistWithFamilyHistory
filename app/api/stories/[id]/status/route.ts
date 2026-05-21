import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { requireHumanReviewConfirmation } from "@/lib/operations/reviewGates";
import { buildStoryHandoffPacket } from "@/lib/stories/handoff";
import { assessStoryPublishReadiness } from "@/lib/stories/publishSafety";
import { getVaultAccessContext } from "@/lib/vault/server";

function isStoryStatus(value: unknown): value is "draft" | "review" | "published" {
  return value === "draft" || value === "review" || value === "published";
}

async function getStoryBundle(vaultOwnerId: string, storyId: string) {
  return getConvexClient().query(api.vault.getStoryReview, {
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
    const bundle = await getStoryBundle(vaultOwnerId, id);

    if (!bundle) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const preview = buildPublishPreview(bundle);
    const format = request.nextUrl.searchParams.get("format");

    return NextResponse.json({
      success: true,
      preview: true,
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

    if (!isStoryStatus(body.status)) {
      return NextResponse.json({ error: "Invalid story status" }, { status: 400 });
    }

    const { vaultOwnerId } = await getVaultAccessContext();
    let publishReadiness;

    if (body.status === "published") {
      const bundle = await getStoryBundle(vaultOwnerId, id);

      if (!bundle) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
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

    const result = await getConvexClient().mutation(api.vaultMutations.updateStoryStatus, {
      vaultOwnerId,
      storyId: id as Id<"stories">,
      status: body.status,
    });

    return NextResponse.json({ success: true, publishReadiness, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
