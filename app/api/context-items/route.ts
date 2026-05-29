import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

// GEN-94: zod request-body contract. Enums narrow into the Convex mutation arg
// types. `.catch(default)` preserves the prior behavior where an
// unknown/invalid enum value silently fell back to its default rather than
// rejecting the request.
const ItemTypeEnum = z
  .enum([
    "note",
    "document_ref",
    "research_snippet",
    "memory_note",
    "place_context",
    "building_context",
    "generated_summary",
    "other",
  ])
  .catch("note");
const EvidenceRoleEnum = z
  .enum([
    "raw_material",
    "researcher_conclusion",
    "generated_summary",
    "lead_or_hint",
    "background_context",
  ])
  .catch("raw_material");
const PrivacyLevelEnum = z
  .enum(["private", "family_review", "publish_candidate", "public_source"])
  .catch("private");
const ReviewStatusEnum = z
  .enum(["unreviewed", "reviewed", "disputed", "redacted", "rejected"])
  .catch("unreviewed");

// Trim and coerce empty strings to undefined so optional text fields match the
// prior hand-rolled `body.x?.trim() || undefined` behavior.
const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const RequestSchema = z.object({
  personIdentifier: z.string().transform((value) => value.trim()),
  title: z.string().transform((value) => value.trim()),
  content: z.string().transform((value) => value.trim()),
  itemType: ItemTypeEnum.optional(),
  evidenceRole: EvidenceRoleEnum.optional(),
  privacyLevel: PrivacyLevelEnum.optional(),
  reviewStatus: ReviewStatusEnum.optional(),
  aiUseAllowed: z.boolean().optional(),
  sourceLabel: optionalTrimmed,
  sourceUrl: optionalTrimmed,
  provenanceNote: optionalTrimmed,
  reviewNote: optionalTrimmed,
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
        { error: "Missing person, title, or content", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { personIdentifier, title, content } = parsed.data;
    const itemType = parsed.data.itemType ?? "note";
    const evidenceRole = parsed.data.evidenceRole ?? "raw_material";
    const privacyLevel = parsed.data.privacyLevel ?? "private";
    const reviewStatus = parsed.data.reviewStatus ?? "unreviewed";
    const aiUseAllowed = parsed.data.aiUseAllowed === true;

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
      sourceLabel: parsed.data.sourceLabel,
      sourceUrl: parsed.data.sourceUrl,
      provenanceNote: parsed.data.provenanceNote,
      privacyLevel,
      reviewStatus,
      aiUseAllowed,
      reviewNote: parsed.data.reviewNote,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
