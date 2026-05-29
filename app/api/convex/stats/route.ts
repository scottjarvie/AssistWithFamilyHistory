/**
 * Convex Stats API Route
 * 
 * Purpose: Basic counts for dashboard/People Explorer insights
 */

import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexReadyStatus, getConvexRuntimeIssue } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

export async function GET() {
  const ready = getConvexReadyStatus();

  try {
    const client = await getAuthedConvexClient();
    const { vaultOwnerId } = await getVaultAccessContext();
    const summary = await client.query(api.vault.getDashboardSummary, { vaultOwnerId });

    return NextResponse.json(
      {
        success: true,
        backendState: ready.state,
        backendTitle: ready.title,
        backendDescription: ready.description,
        counts: summary.counts,
        recentPeople: summary.recentPeople,
        recentImports: summary.recentImports,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Convex stats error:", error);
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
