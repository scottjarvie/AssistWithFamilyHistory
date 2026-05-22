import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import {
  LOCALITY_ERA_TEMPLATE_VERSION,
  localityEraBriefCategories,
  type ResearchPackCategory,
  type ResearchPackCategoryBlock,
  type ResearchPackClaimConfidence,
  type ResearchPackType,
} from "@/lib/context/researchPacks";
import { getVaultAccessContext } from "@/lib/vault/server";

const CONTEXT_TOPICS = new Set([
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

const RESEARCH_PACK_TYPES = new Set<ResearchPackType>([
  "locality_era_brief",
  "region_era",
  "occupation_era",
  "religion_community",
  "migration_corridor",
  "building_institution",
  "local_event",
  "cemetery_burial",
]);

const RESEARCH_PACK_CATEGORIES = new Set<ResearchPackCategory>(
  localityEraBriefCategories.map((entry) => entry.category)
);

const CLAIM_CONFIDENCE = new Set<ResearchPackClaimConfidence>(["high", "medium", "low"]);
const PRIVACY_LEVELS = new Set(["private", "family_review", "publish_candidate", "public_source"]);
const REVIEW_STATUSES = new Set(["unreviewed", "reviewed", "disputed", "redacted", "rejected"]);

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
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const topic = typeof body.topic === "string" && CONTEXT_TOPICS.has(body.topic) ? body.topic : "other";
    const startYear = Number(body.startYear);
    const endYear = Number(body.endYear);
    const placeId = typeof body.placeId === "string" && body.placeId.trim() ? body.placeId.trim() : undefined;
    const packType =
      typeof body.packType === "string" && RESEARCH_PACK_TYPES.has(body.packType as ResearchPackType)
        ? body.packType as ResearchPackType
        : undefined;
    const templateVersion =
      typeof body.templateVersion === "string" && body.templateVersion.trim()
        ? body.templateVersion.trim()
        : packType === "locality_era_brief"
          ? LOCALITY_ERA_TEMPLATE_VERSION
          : undefined;
    const privacyLevel =
      typeof body.privacyLevel === "string" && PRIVACY_LEVELS.has(body.privacyLevel)
        ? body.privacyLevel as "private" | "family_review" | "publish_candidate" | "public_source"
        : undefined;
    const reviewStatus =
      typeof body.reviewStatus === "string" && REVIEW_STATUSES.has(body.reviewStatus)
        ? body.reviewStatus as "unreviewed" | "reviewed" | "disputed" | "redacted" | "rejected"
        : undefined;
    const aiUseAllowed = typeof body.aiUseAllowed === "boolean" ? body.aiUseAllowed : undefined;
    const categoryBlocks = parseCategoryBlocks(body.categoryBlocks);
    const sources: string[] = typeof body.sources === "string"
      ? body.sources.split("\n").map((source: string) => source.trim()).filter(Boolean)
      : Array.isArray(body.sources)
        ? (body.sources as unknown[])
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
