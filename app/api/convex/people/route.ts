/**
 * Convex People API Route
 * 
 * Purpose: List people from Convex (server-side) for People Explorer
 */

import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexReadyStatus, getConvexRuntimeIssue } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET() {
  try {
    const client = getConvexClient();
    const { vaultOwnerId } = await getVaultAccessContext();
    const peopleWithDocs = await client.query(api.vault.getPeopleExplorer, { vaultOwnerId });
    const ready = getConvexReadyStatus();

    return NextResponse.json({
      success: true,
      backendState: ready.state,
      backendTitle: ready.title,
      backendDescription: ready.description,
      people: peopleWithDocs,
      count: peopleWithDocs.length,
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
