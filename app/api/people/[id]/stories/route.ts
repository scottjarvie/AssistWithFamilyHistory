import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import type { StoryWriterMode } from "@/lib/ai/storyWriter";
import { getVaultAccessContext } from "@/lib/vault/server";

function isStoryWriterMode(value: unknown): value is StoryWriterMode {
  return value === "short_story" || value === "narrative_draft" || value === "research_gap_notes";
}

function mapModeToStoryType(mode: StoryWriterMode) {
  switch (mode) {
    case "short_story":
      return "biography" as const;
    case "narrative_draft":
      return "family_narrative" as const;
    case "research_gap_notes":
      return "research_summary" as const;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json(
      {
        success: false,
        backendState: issue.state,
        backendTitle: issue.title,
        backendDescription: issue.description,
        error: issue.title,
        details: issue.description,
      },
      { status: issue.statusCode }
    );
  }

  try {
    const { id: personIdentifier } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const promptUsed = typeof body.promptUsed === "string" ? body.promptUsed : undefined;
    const modelUsed = typeof body.modelUsed === "string" ? body.modelUsed : undefined;
    const mode = isStoryWriterMode(body.mode) ? body.mode : null;
    const contextPackIds = Array.isArray(body.contextPackIds)
      ? body.contextPackIds
          .filter((contextPackId: unknown): contextPackId is string => typeof contextPackId === "string")
          .map((contextPackId: string) => contextPackId.trim())
          .filter(Boolean)
          .slice(0, 12)
      : undefined;
    const generatedBy =
      body.generatedBy === "human" || body.generatedBy === "ai_edited" ? body.generatedBy : "ai";

    if (!title || !content || !mode) {
      return NextResponse.json(
        { error: "Missing required fields: title, content, and mode" },
        { status: 400 }
      );
    }

    const client = getConvexClient();
    const workspace = await client.query(api.vault.getPersonWorkspace, {
      vaultOwnerId,
      personIdentifier,
    });

    if (!workspace) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const storyType = mapModeToStoryType(mode);
    const result = await client.mutation(api.vaultMutations.upsertStoryDraft, {
      vaultOwnerId,
      personId: workspace.person._id,
      type: storyType,
      title,
      content,
      status: "draft",
      generatedBy,
      promptUsed,
      modelUsed,
      tags: ["story-writer", mode],
      contextPackIds: contextPackIds as Id<"historicalContext">[] | undefined,
    });

    await client.mutation(api.researchLog.upsert, {
      vaultOwnerId,
      entityType: "person",
      entityId: workspace.person._id,
      activityType: "tier3_narrative",
      status: "done",
      summary: `Saved story draft: ${title}`,
      details: `Story Writer saved a ${storyType.replace(/_/g, " ")} draft.`,
      outputRefs: [`story:${String(result.storyId)}`],
      model: modelUsed,
    });

    await client.mutation(api.vaultMutations.bulkRefreshResearchChecks, {
      vaultOwnerId,
      personId: workspace.person._id,
      source: generatedBy === "ai" ? "ai_agent" : "user",
    });

    return NextResponse.json({
      success: true,
      storyId: String(result.storyId),
      created: result.created,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);

    return NextResponse.json(
      {
        success: false,
        backendState: issue.state,
        backendTitle: issue.title,
        backendDescription: issue.description,
        error: issue.title,
        details: issue.description,
      },
      { status: issue.statusCode }
    );
  }
}
