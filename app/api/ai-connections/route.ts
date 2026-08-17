/**
 * /api/ai-connections — the connection centre's write path.
 *
 * The connection centre at /app/settings/ai is a client component, and this repo
 * has no Convex React provider, so person-initiated grant changes travel through
 * this Clerk-protected route exactly like every other app mutation.
 *
 * This route decides nothing. It validates the shape, derives the vault owner
 * from the signed-in session (never from the body), and hands the decision to
 * the owner-scoped Convex mutations in `convex/mcpGrants.ts`, which authorize
 * again. Widening a grant is deliberately not reachable here: `reduce` only ever
 * narrows, and more permission requires a fresh approval so the person sees a
 * new consent screen.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  approveGrantRef,
  denyGrantRef,
  reduceGrantScopesRef,
  removeGrantRef,
  revokeGrantRef,
} from "@/lib/mcp/connectionApi";
import { FAMILY_HISTORY_SCOPES } from "@/lib/mcp/catalog";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

const ScopeEnum = z.enum(FAMILY_HISTORY_SCOPES);

const BoundarySchema = z.object({
  kind: z.enum(["whole_workspace", "selected_people", "queue_only"]),
  personIds: z.array(z.string().min(1)).max(500).optional(),
  queueItemIds: z.array(z.string().min(1)).max(500).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    grantId: z.string().min(1),
    label: z.string().min(1).max(80),
    scopes: z.array(ScopeEnum).min(1),
    boundary: BoundarySchema,
    expiresInDays: z.number().int().min(1).max(365).optional(),
  }),
  z.object({
    action: z.literal("deny"),
    grantId: z.string().min(1),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal("reduce"),
    grantId: z.string().min(1),
    scopes: z.array(ScopeEnum).min(1),
  }),
  z.object({
    action: z.literal("revoke"),
    grantId: z.string().min(1),
    reason: z.string().max(300).optional(),
  }),
  z.object({ action: z.literal("remove"), grantId: z.string().min(1) }),
]);

/**
 * Convex throws a plain Error for a refused lifecycle change ("Connection not
 * found", "Widening a connection requires a fresh approval"). Those messages are
 * written for the person and name no record, so they are safe to return; the
 * Convex wrapper prefix is not useful to anyone and is stripped.
 */
function personFacingMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const uncaught = raw.match(/Uncaught Error:\s*([^\n]+)/);
  const message = (uncaught?.[1] ?? raw).split("\n")[0]?.trim();
  if (!message || message.length > 300) return "That connection change could not be applied.";
  return message;
}

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  let vaultOwnerId: string;
  try {
    ({ vaultOwnerId } = await getVaultAccessContext());
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That connection change was not understood.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    const client = await getAuthedConvexClient();
    switch (body.action) {
      case "approve": {
        const result = await client.mutation(approveGrantRef, {
          vaultOwnerId,
          grantId: body.grantId,
          label: body.label,
          scopes: body.scopes,
          boundary: body.boundary,
          expiresInDays: body.expiresInDays,
        });
        return NextResponse.json({ success: true, ...result });
      }
      case "deny": {
        const result = await client.mutation(denyGrantRef, {
          vaultOwnerId,
          grantId: body.grantId,
          reason: body.reason,
        });
        return NextResponse.json({ success: true, ...result });
      }
      case "reduce": {
        const result = await client.mutation(reduceGrantScopesRef, {
          vaultOwnerId,
          grantId: body.grantId,
          scopes: body.scopes,
        });
        return NextResponse.json({ success: true, ...result });
      }
      case "revoke": {
        const result = await client.mutation(revokeGrantRef, {
          vaultOwnerId,
          grantId: body.grantId,
          reason: body.reason,
        });
        return NextResponse.json({ success: true, ...result });
      }
      case "remove": {
        const result = await client.mutation(removeGrantRef, {
          vaultOwnerId,
          grantId: body.grantId,
        });
        return NextResponse.json({ success: true, ...result });
      }
    }
  } catch (error) {
    return NextResponse.json({ error: personFacingMessage(error) }, { status: 400 });
  }
}
