import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { requireHumanReviewConfirmation } from "@/lib/operations/reviewGates";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const provisionalId = typeof body.provisionalId === "string" ? body.provisionalId : "";
    const action = body.action === "promote" || body.action === "merge" ? body.action : null;
    const humanReviewNote = typeof body.humanReviewNote === "string" ? body.humanReviewNote.trim() : undefined;

    if (!provisionalId || !action) {
      return NextResponse.json({ error: "Missing provisionalId or action" }, { status: 400 });
    }

    const reviewErrors = requireHumanReviewConfirmation({
      actionName: `Provisional relative ${action}`,
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

    const client = await getAuthedConvexClient();
    if (action === "promote") {
      const result = await client.mutation(api.vaultMutations.promoteProvisionalRelative, {
        vaultOwnerId,
        provisionalId: provisionalId as never,
        humanReviewNote,
      });
      return NextResponse.json({ success: true, ...result });
    }

    const targetPersonIdentifier =
      typeof body.targetPersonIdentifier === "string"
        ? body.targetPersonIdentifier
        : typeof body.targetPersonFsId === "string"
          ? body.targetPersonFsId
          : "";
    const anchorPersonIdentifier =
      typeof body.anchorPersonIdentifier === "string" ? body.anchorPersonIdentifier : "";

    if (!targetPersonIdentifier) {
      return NextResponse.json({ error: "Missing targetPersonIdentifier" }, { status: 400 });
    }

    if (anchorPersonIdentifier && anchorPersonIdentifier === targetPersonIdentifier) {
      return NextResponse.json(
        { error: "Choose a different canonical person than the anchor person" },
        { status: 400 }
      );
    }
    const workspace = await client.action(api.vaultReads.getPersonWorkspace, {
      vaultOwnerId,
      personIdentifier: targetPersonIdentifier,
    });

    if (!workspace) {
      return NextResponse.json({ error: "Target person not found" }, { status: 404 });
    }

    const result = await client.mutation(api.vaultMutations.mergeProvisionalRelative, {
      vaultOwnerId,
      provisionalId: provisionalId as never,
      targetPersonId: workspace.person._id,
      humanReviewNote,
    });
    return NextResponse.json(result);
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
