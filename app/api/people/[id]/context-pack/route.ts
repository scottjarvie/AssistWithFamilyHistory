import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
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

    const cacheControl = "private, max-age=0, must-revalidate";

    if (format === "markdown") {
      const body = contextPack.markdown;
      const etag = 'W/"' + createHash("sha1").update(body).digest("hex") + '"';
      if (request.headers.get("if-none-match") === etag) {
        return new NextResponse(null, {
          status: 304,
          headers: { ETag: etag, "Cache-Control": cacheControl },
        });
      }
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    const jsonBody = JSON.stringify({
      success: true,
      ...contextPack,
    });
    const etag = 'W/"' + createHash("sha1").update(jsonBody).digest("hex") + '"';
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }
    return new NextResponse(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": cacheControl,
      },
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
