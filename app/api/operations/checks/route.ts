import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { validateAgentResearchCheckUpdate } from "@/lib/operations/agentQualityGate";
import { getVaultAccessContext } from "@/lib/vault/server";

function isStatus(value: unknown): value is "missing" | "in_progress" | "complete" | "not_applicable" | "needs_review" {
  return (
    value === "missing" ||
    value === "in_progress" ||
    value === "complete" ||
    value === "not_applicable" ||
    value === "needs_review"
  );
}

function isApplicability(value: unknown): value is "required" | "recommended" | "not_applicable" | "unknown" {
  return value === "required" || value === "recommended" || value === "not_applicable" || value === "unknown";
}

function isCompletionSource(value: unknown): value is "user" | "ai_agent" {
  return value === "user" || value === "ai_agent";
}

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const body = await request.json();
    const personIdentifier =
      typeof body.personIdentifier === "string"
        ? body.personIdentifier
        : typeof body.personFsId === "string"
          ? body.personFsId
          : "";
    const checkKey = typeof body.checkKey === "string" ? body.checkKey : "";
    const status = isStatus(body.status) ? body.status : null;
    const applicability = isApplicability(body.applicability) ? body.applicability : undefined;
    const completionSource = isCompletionSource(body.completionSource) ? body.completionSource : "user";
    const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
    const summary = typeof body.summary === "string" ? body.summary.trim() : undefined;
    const confidence = typeof body.confidence === "number" ? body.confidence : 0.95;

    if (!personIdentifier || !checkKey || !status) {
      return NextResponse.json({ error: "Missing personIdentifier, checkKey, or status" }, { status: 400 });
    }

    const qualityGateErrors = validateAgentResearchCheckUpdate({
      completionSource,
      status,
      confidence,
      summary,
      notes,
    });

    if (qualityGateErrors.length > 0) {
      return NextResponse.json(
        {
          error: "Agent quality gate failed",
          details: qualityGateErrors.join(" "),
          qualityGateErrors,
        },
        { status: 400 }
      );
    }

    const client = getConvexClient();
    const workspace = await client.query(api.vault.getPersonWorkspace, {
      vaultOwnerId,
      personIdentifier,
    });

    if (!workspace) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const existing = workspace.researchChecks.find((check: { checkKey: string }) => check.checkKey === checkKey);
    const result = await client.mutation(api.vaultMutations.upsertResearchCheck, {
      vaultOwnerId,
      personId: workspace.person._id,
      personFsId: workspace.person.fsId,
      checkKey,
      status,
      applicability: applicability || existing?.applicability || "recommended",
      completionSource,
      confidence,
      summary: summary || existing?.summary,
      notes: notes || existing?.notes,
      linkedSourceIds: existing?.linkedSourceIds || [],
      linkedPlaceIds: existing?.linkedPlaceIds || [],
      linkedPersonIds: existing?.linkedPersonIds || [],
      lastReviewedAt: Date.now(),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
