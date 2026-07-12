import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { requireStoryAction, resolveStoryActor } from "@/lib/stories/capabilities";
import { getVaultAccessContext } from "@/lib/vault/server";

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
    const denied = requireStoryAction(actor.role, "story:assign_reviewer");
    if (denied) {
      return NextResponse.json(denied, { status: 403 });
    }

    const assignedReviewer = typeof body.assignedReviewer === "string" ? body.assignedReviewer.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : undefined;
    const secondReviewer = typeof body.secondReviewer === "string" ? body.secondReviewer.trim() : undefined;

    if (!assignedReviewer) {
      return NextResponse.json({ error: "Reviewer name is required" }, { status: 400 });
    }

    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const result = await client.mutation(api.vaultMutations.assignStoryReviewer, {
      vaultOwnerId,
      storyId: id as Id<"stories">,
      assignedReviewer,
      secondReviewRequired: body.secondReviewRequired === true,
      secondReviewer,
      secondReviewApproved: body.secondReviewApproved === true,
      actorRole: actor.role,
      actorName: actor.name,
      note,
    });

    return NextResponse.json({ success: true, actor, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
