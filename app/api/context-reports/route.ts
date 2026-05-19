import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
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
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
