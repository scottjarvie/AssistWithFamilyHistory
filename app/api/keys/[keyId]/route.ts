/**
 * DELETE /api/keys/[keyId] — revoke one of the owner's API keys.
 * Clerk-protected; owner isolation is enforced in the Convex mutation
 * (matchesVaultOwner). Revocation is idempotent.
 */
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

/** PATCH → suspend or reactivate a key (operator tooling). Body: { status: "active" | "suspended" }. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
  try {
    const { keyId } = await params;
    const body = (await request.json().catch(() => null)) as { status?: string } | null;
    const status = body?.status;
    if (status !== "active" && status !== "suspended") {
      return NextResponse.json({ error: "status must be 'active' or 'suspended'" }, { status: 400 });
    }
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const result = await client.mutation(api.apiKeys.setKeyStatus, { vaultOwnerId, keyId, status });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
  try {
    const { keyId } = await params;
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const result = await client.mutation(api.apiKeys.revokeKey, { vaultOwnerId, keyId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
