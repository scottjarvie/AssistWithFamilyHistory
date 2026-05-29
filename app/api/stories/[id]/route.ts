import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

// GEN-94: zod request-body contract. The story type enum narrows into the
// Convex mutation arg type. Invalid/absent type falls back to undefined to
// preserve prior behavior; tags are trimmed and emptied as before.
const StoryTypeEnum = z.enum([
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

const RequestSchema = z.object({
  title: z.string().transform((value) => value.trim()),
  content: z.string().transform((value) => value.trim()),
  type: StoryTypeEnum.optional().catch(undefined),
  tags: z
    .array(z.unknown())
    .optional()
    .transform((value) =>
      Array.isArray(value)
        ? value
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined
    ),
});

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
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Story title and content are required", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, content, type, tags } = parsed.data;

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
