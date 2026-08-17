/**
 * AWF-0046: the owner's route for settling a source-fact conflict.
 *
 * This is deliberately the ONLY way a fact leaves `conflict` status. It runs
 * through the signed-in Clerk session, so a connected AI — which reaches Convex
 * through the OAuth MCP gateway and only ever dispatches to `internal.*`
 * functions — cannot call it. Deciding which record to believe stays the
 * person's judgment call.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { CONFLICT_REASON_MIN } from "@/lib/vault/conflictResolution";

const RequestSchema = z.object({
  sourceFactId: z.string().min(1),
  resolution: z.enum(["accepted", "rejected"]),
  reason: z.string().transform((value) => value.trim()),
});

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose which reading you believe", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { sourceFactId, resolution, reason } = parsed.data;
    if (reason.length < CONFLICT_REASON_MIN) {
      return NextResponse.json(
        {
          error: `Write at least ${CONFLICT_REASON_MIN} characters explaining which record you believed and why.`,
        },
        { status: 400 }
      );
    }

    const client = await getAuthedConvexClient();
    const result = await client.mutation(api.vaultMutations.resolveSourceFactConflict, {
      vaultOwnerId,
      // The client hands back the `_id` the person workspace rendered. The
      // mutation re-checks ownership before it touches the row.
      sourceFactId: sourceFactId as Id<"sourceFacts">,
      resolution,
      reason,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
