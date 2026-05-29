import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { buildOperationsHandoffPacket } from "@/lib/operations/handoff";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET(request: NextRequest) {
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
    const { vaultOwnerId } = await getVaultAccessContext();
    const searchParams = request.nextUrl.searchParams;
    const client = await getAuthedConvexClient();
    const payload = await client.query(api.vault.getOperationsQueue, {
      vaultOwnerId,
      search: searchParams.get("q") || undefined,
      rowType:
        searchParams.get("type") === "person" || searchParams.get("type") === "provisional"
          ? (searchParams.get("type") as "person" | "provisional")
          : undefined,
      missingCheck: searchParams.get("missingCheck") || undefined,
      storyStatus:
        searchParams.get("storyStatus") === "has_story" || searchParams.get("storyStatus") === "no_story"
          ? (searchParams.get("storyStatus") as "has_story" | "no_story")
          : undefined,
      staleOnly: searchParams.get("staleOnly") === "true" ? true : undefined,
      sortBy:
        searchParams.get("sortBy") === "completion" ||
        searchParams.get("sortBy") === "lastTouched" ||
        searchParams.get("sortBy") === "sourceCount" ||
        searchParams.get("sortBy") === "storyReadiness" ||
        searchParams.get("sortBy") === "newestImport" ||
        searchParams.get("sortBy") === "missingCritical"
          ? (searchParams.get("sortBy") as
              | "completion"
              | "lastTouched"
              | "sourceCount"
              | "storyReadiness"
              | "newestImport"
              | "missingCritical")
          : undefined,
      sortDirection:
        searchParams.get("sortDirection") === "asc" || searchParams.get("sortDirection") === "desc"
          ? (searchParams.get("sortDirection") as "asc" | "desc")
          : undefined,
    });

    if (searchParams.get("format") === "handoff") {
      return NextResponse.json({
        success: true,
        handoff: buildOperationsHandoffPacket(payload),
      });
    }

    return NextResponse.json({
      success: true,
      ...payload,
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
