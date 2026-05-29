import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import {
  LOCALITY_ERA_TEMPLATE_VERSION,
  localityEraBriefCategories,
  type ResearchPackCategory,
  type ResearchPackCategoryBlock,
  type ResearchPackClaimConfidence,
} from "@/lib/context/researchPacks";
import { getVaultAccessContext } from "@/lib/vault/server";

// GEN-94: enums narrow into the Convex mutation arg types. The nested
// categoryBlocks/sources parsing is preserved below (parseCategoryBlocks)
// since it is bespoke shaping logic, not flat validation.
const ContextTopicEnum = z.enum([
  "daily_life",
  "economy",
  "religion",
  "politics",
  "migration",
  "health",
  "technology",
  "culture",
  "war",
  "disaster",
  "other",
]);

const ResearchPackTypeEnum = z.enum([
  "locality_era_brief",
  "region_era",
  "occupation_era",
  "religion_community",
  "migration_corridor",
  "building_institution",
  "local_event",
  "cemetery_burial",
]);

const PrivacyLevelEnum = z.enum(["private", "family_review", "publish_candidate", "public_source"]);
const ReviewStatusEnum = z.enum(["unreviewed", "reviewed", "disputed", "redacted", "rejected"]);

const RESEARCH_PACK_CATEGORIES = new Set<ResearchPackCategory>(
  localityEraBriefCategories.map((entry) => entry.category)
);

const CLAIM_CONFIDENCE = new Set<ResearchPackClaimConfidence>(["high", "medium", "low"]);

// Flat request fields. Enum fields use `.catch(undefined)` / fallback-on-
// invalid to preserve prior behavior where an unrecognized value silently
// fell back to a default rather than rejecting the request. Year fields are
// coerced from arbitrary input to mirror the prior `Number(body.x)` and are
// validated as finite below.
const RequestSchema = z.object({
  title: z.string().transform((value) => value.trim()),
  content: z.string().transform((value) => value.trim()),
  topic: ContextTopicEnum.optional().catch(undefined),
  startYear: z.coerce.number().optional().catch(undefined),
  endYear: z.coerce.number().optional().catch(undefined),
  placeId: z.string().optional(),
  packType: ResearchPackTypeEnum.optional().catch(undefined),
  templateVersion: z.string().optional(),
  privacyLevel: PrivacyLevelEnum.optional().catch(undefined),
  reviewStatus: ReviewStatusEnum.optional().catch(undefined),
  aiUseAllowed: z.boolean().optional(),
  categoryBlocks: z.unknown().optional(),
  sources: z.union([z.string(), z.array(z.unknown())]).optional(),
});

function parseCategoryBlocks(value: unknown): ResearchPackCategoryBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const blocks: ResearchPackCategoryBlock[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const category =
      typeof raw.category === "string" && RESEARCH_PACK_CATEGORIES.has(raw.category as ResearchPackCategory)
        ? raw.category as ResearchPackCategory
        : null;
    if (!category) continue;

    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    const synthesisNotes =
      typeof raw.synthesisNotes === "string" && raw.synthesisNotes.trim()
        ? raw.synthesisNotes.trim()
        : undefined;
    const sourcedClaims: ResearchPackCategoryBlock["sourcedClaims"] = [];

    if (Array.isArray(raw.sourcedClaims)) {
      for (const claim of raw.sourcedClaims) {
        if (!claim || typeof claim !== "object") continue;
        const claimRaw = claim as Record<string, unknown>;
        const text = typeof claimRaw.text === "string" ? claimRaw.text.trim() : "";
        if (!text) continue;
        const confidence =
          typeof claimRaw.confidence === "string" && CLAIM_CONFIDENCE.has(claimRaw.confidence as ResearchPackClaimConfidence)
            ? claimRaw.confidence as ResearchPackClaimConfidence
            : "medium";
        const sourceRefs = Array.isArray(claimRaw.sourceRefs)
          ? claimRaw.sourceRefs
              .filter((sourceRef): sourceRef is string => typeof sourceRef === "string")
              .map((sourceRef) => sourceRef.trim())
              .filter(Boolean)
          : [];

        sourcedClaims.push({ text, sourceRefs, confidence });
      }
    }

    if (!summary && sourcedClaims.length === 0 && !synthesisNotes) continue;
    blocks.push(synthesisNotes ? { category, summary, sourcedClaims, synthesisNotes } : { category, summary, sourcedClaims });
  }

  return blocks;
}

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Title, content, start year, and end year are required", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, content } = parsed.data;
    const topic = parsed.data.topic ?? "other";
    const startYear = parsed.data.startYear ?? NaN;
    const endYear = parsed.data.endYear ?? NaN;
    const placeId = parsed.data.placeId?.trim() || undefined;
    const packType = parsed.data.packType;
    const templateVersion =
      parsed.data.templateVersion?.trim()
        ? parsed.data.templateVersion.trim()
        : packType === "locality_era_brief"
          ? LOCALITY_ERA_TEMPLATE_VERSION
          : undefined;
    const privacyLevel = parsed.data.privacyLevel;
    const reviewStatus = parsed.data.reviewStatus;
    const aiUseAllowed = parsed.data.aiUseAllowed;
    const categoryBlocks = parseCategoryBlocks(parsed.data.categoryBlocks);
    const sources: string[] = typeof parsed.data.sources === "string"
      ? parsed.data.sources.split("\n").map((source: string) => source.trim()).filter(Boolean)
      : Array.isArray(parsed.data.sources)
        ? parsed.data.sources
            .filter((source): source is string => typeof source === "string")
            .map((source: string) => source.trim())
            .filter(Boolean)
        : [];

    if (!title || !content || !Number.isFinite(startYear) || !Number.isFinite(endYear)) {
      return NextResponse.json({ error: "Title, content, start year, and end year are required" }, { status: 400 });
    }

    const { vaultOwnerId } = await getVaultAccessContext();
    const result = await getConvexClient().mutation(api.vaultMutations.upsertHistoricalContext, {
      vaultOwnerId,
      placeId: placeId as Id<"places"> | undefined,
      timePeriod: {
        startYear,
        endYear,
      },
      topic,
      title,
      content,
      sources,
      packType,
      templateVersion,
      privacyLevel,
      reviewStatus,
      aiUseAllowed,
      categoryBlocks,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
