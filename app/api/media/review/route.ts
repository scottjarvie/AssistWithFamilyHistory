import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

// GEN-94: zod request-body contract. Enums narrow into the Convex mutation arg
// types and preserve the exact accepted values the hand-rolled Sets allowed.
const PrivacyLevelEnum = z.enum(["private", "family_review", "publish_candidate", "public_source"]);
const ReviewStatusEnum = z.enum(["unreviewed", "reviewed", "redacted", "rejected"]);
const RightsStatusEnum = z.enum(["unknown", "owned", "permitted", "public_domain", "restricted"]);

const RequestSchema = z.object({
  mediaId: z.string().min(1),
  privacyLevel: PrivacyLevelEnum,
  reviewStatus: ReviewStatusEnum,
  rightsStatus: RightsStatusEnum,
  aiUseAllowed: z.boolean().optional(),
  privacyReviewNote: z.string().optional(),
  metadataDecision: z.enum(["pending", "accepted", "declined"]).optional(),
});

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing media review fields", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { mediaId, privacyLevel, reviewStatus, rightsStatus } = parsed.data;
    const aiUseAllowed = parsed.data.aiUseAllowed === true;
    const privacyReviewNote = parsed.data.privacyReviewNote?.trim() || undefined;

    if (aiUseAllowed && (reviewStatus !== "reviewed" || rightsStatus === "unknown" || rightsStatus === "restricted")) {
      return NextResponse.json(
        { error: "AI use requires reviewed media with usable rights. The item may remain private." },
        { status: 400 }
      );
    }

    const client = await getAuthedConvexClient();
    const result = await client.mutation(api.vaultMutations.reviewMedia, {
      vaultOwnerId,
      mediaId: mediaId as Id<"media">,
      privacyLevel,
      reviewStatus,
      rightsStatus,
      aiUseAllowed,
      privacyReviewNote,
      metadataDecision: parsed.data.metadataDecision,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
