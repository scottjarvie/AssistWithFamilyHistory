/**
 * Serve a stored media file to the person who owns it.
 *
 * Convex file storage is private, and deliberately so: the same property that
 * lets `family_history_get_evidence` deliver a scan to a chosen AI without ever
 * minting a link means the person's own browser cannot load the object either.
 * This route closes that loop. It resolves a short-lived signed URL server-side,
 * streams the bytes back under the person's session, and never returns the
 * signed URL itself.
 *
 * A missing item and someone else's item both answer 404 — a media route must
 * not work as an existence oracle for another person's vault.
 */
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ mediaId: string }> },
) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const { mediaId } = await context.params;

    const client = await getAuthedConvexClient();
    const file = await client.action(api.vaultReads.getOwnedMediaFile, { vaultOwnerId, mediaId });
    if (!file) {
      return NextResponse.json({ error: "That media item is not available." }, { status: 404 });
    }

    const upstream = await fetch(file.url);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "That media item could not be read." }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        // Private vault bytes: a shared cache must never keep a copy, and the
        // browser must not be able to hand the file to a viewer as a download
        // target under a guessed name.
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
