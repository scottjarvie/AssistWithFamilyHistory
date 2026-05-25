import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const ITEM_TYPES = new Set([
  "note",
  "document_ref",
  "research_snippet",
  "memory_note",
  "place_context",
  "building_context",
  "generated_summary",
  "other",
]);
const EVIDENCE_ROLES = new Set([
  "raw_material",
  "researcher_conclusion",
  "generated_summary",
  "lead_or_hint",
  "background_context",
]);
const PRIVACY_LEVELS = new Set(["private", "family_review", "publish_candidate", "public_source"]);
const REVIEW_STATUSES = new Set(["unreviewed", "reviewed", "disputed", "redacted", "rejected"]);

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const personIdentifier = typeof body.personIdentifier === "string" ? body.personIdentifier.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const itemType = ITEM_TYPES.has(body.itemType) ? body.itemType : "note";
    const evidenceRole = EVIDENCE_ROLES.has(body.evidenceRole) ? body.evidenceRole : "raw_material";
    const privacyLevel = PRIVACY_LEVELS.has(body.privacyLevel) ? body.privacyLevel : "private";
    const reviewStatus = REVIEW_STATUSES.has(body.reviewStatus) ? body.reviewStatus : "unreviewed";
    const aiUseAllowed = body.aiUseAllowed === true;

    if (!personIdentifier || !title || !content) {
      return NextResponse.json({ error: "Missing person, title, or content" }, { status: 400 });
    }

    if (aiUseAllowed && (privacyLevel === "private" || reviewStatus === "unreviewed")) {
      return NextResponse.json(
        { error: "AI use requires reviewed, non-private context." },
        { status: 400 }
      );
    }

    const client = getConvexClient();
    const result = await client.mutation(api.vaultMutations.upsertContextItemForPerson, {
      vaultOwnerId,
      personIdentifier,
      title,
      content,
      itemType,
      evidenceRole,
      sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel.trim() || undefined : undefined,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl.trim() || undefined : undefined,
      provenanceNote: typeof body.provenanceNote === "string" ? body.provenanceNote.trim() || undefined : undefined,
      privacyLevel,
      reviewStatus,
      aiUseAllowed,
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote.trim() || undefined : undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
