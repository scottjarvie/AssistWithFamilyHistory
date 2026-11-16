/**
 * Convex People API Route
 * 
 * Purpose: List people from Convex (server-side) for People Explorer
 */

import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexReadyStatus, getConvexRuntimeIssue } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET(request: Request) {
  try {
    const client = await getAuthedConvexClient();
    const { vaultOwnerId } = await getVaultAccessContext();
    const params = new URL(request.url).searchParams;
    const page = await client.action(api.vaultReads.getPeopleExplorerPage, { vaultOwnerId, cursor: params.get("cursor"), search: params.get("q") || undefined });
    const ready = getConvexReadyStatus();

    return NextResponse.json({
      success: true,
      backendState: ready.state,
      backendTitle: ready.title,
      backendDescription: ready.description,
      people: page.page,
      count: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    });
  } catch (error) {
    console.error("Convex people list error:", error);
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
