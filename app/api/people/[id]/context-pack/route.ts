import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET(
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
    const format = request.nextUrl.searchParams.get("format") || "json";
    const client = getConvexClient();
    const { vaultOwnerId } = await getVaultAccessContext();
    const contextPack = await client.query(api.vault.getContextPack, {
      vaultOwnerId,
      personIdentifier,
    });

    if (!contextPack) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (format === "markdown") {
      return new NextResponse(contextPack.markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
        },
      });
    }

    return NextResponse.json({
      success: true,
      ...contextPack,
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
