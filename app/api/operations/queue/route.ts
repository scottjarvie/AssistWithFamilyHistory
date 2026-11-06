import {operationQueryArguments,operationFiltersFromURL} from "@/lib/operations/query";
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
    const payload = await client.action(api.vaultReads.getOperationsQueue, {
      vaultOwnerId,
      ...operationQueryArguments(operationFiltersFromURL(searchParams)),
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
