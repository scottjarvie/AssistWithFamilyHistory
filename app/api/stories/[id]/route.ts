import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const STORY_TYPES = new Set([
  "biography",
  "day_in_life",
  "historical_context",
  "migration_story",
  "family_narrative",
  "anecdote",
  "timeline",
  "letter",
  "interview",
  "research_summary",
  "custom",
]);

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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const type = typeof body.type === "string" && STORY_TYPES.has(body.type) ? body.type : undefined;
    const tags: string[] | undefined = Array.isArray(body.tags)
      ? (body.tags as unknown[])
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : undefined;

    if (!title || !content) {
      return NextResponse.json({ error: "Story title and content are required" }, { status: 400 });
    }

    const { vaultOwnerId } = await getVaultAccessContext();
    const result = await getConvexClient().mutation(api.vaultMutations.updateStoryDraft, {
      vaultOwnerId,
      storyId: id as Id<"stories">,
      title,
      content,
      type,
      tags,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
