import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

function isStoryStatus(value: unknown): value is "draft" | "review" | "published" {
  return value === "draft" || value === "review" || value === "published";
}

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

    if (!isStoryStatus(body.status)) {
      return NextResponse.json({ error: "Invalid story status" }, { status: 400 });
    }

    const { vaultOwnerId } = await getVaultAccessContext();
    const result = await getConvexClient().mutation(api.vaultMutations.updateStoryStatus, {
      vaultOwnerId,
      storyId: id as Id<"stories">,
      status: body.status,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
