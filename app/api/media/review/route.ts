import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const PRIVACY_LEVELS = new Set(["private", "family_review", "publish_candidate", "public_source"]);
const REVIEW_STATUSES = new Set(["unreviewed", "reviewed", "redacted", "rejected"]);
const RIGHTS_STATUSES = new Set(["unknown", "owned", "permitted", "public_domain", "restricted"]);

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const mediaId = typeof body.mediaId === "string" ? body.mediaId : "";
    const privacyLevel = PRIVACY_LEVELS.has(body.privacyLevel) ? body.privacyLevel : null;
    const reviewStatus = REVIEW_STATUSES.has(body.reviewStatus) ? body.reviewStatus : null;
    const rightsStatus = RIGHTS_STATUSES.has(body.rightsStatus) ? body.rightsStatus : null;
    const aiUseAllowed = body.aiUseAllowed === true;
    const privacyReviewNote =
      typeof body.privacyReviewNote === "string" ? body.privacyReviewNote.trim() : undefined;

    if (!mediaId || !privacyLevel || !reviewStatus || !rightsStatus) {
      return NextResponse.json({ error: "Missing media review fields" }, { status: 400 });
    }

    if (aiUseAllowed && (privacyLevel === "private" || reviewStatus !== "reviewed" || rightsStatus === "unknown" || rightsStatus === "restricted")) {
      return NextResponse.json(
        { error: "AI use requires reviewed, non-private media with usable rights." },
        { status: 400 }
      );
    }

    const client = getConvexClient();
    const result = await client.mutation(api.vaultMutations.reviewMedia, {
      vaultOwnerId,
      mediaId,
      privacyLevel,
      reviewStatus,
      rightsStatus,
      aiUseAllowed,
      privacyReviewNote,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
