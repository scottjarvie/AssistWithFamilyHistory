/**
 * /api/keys — owner API-key management (Clerk-protected; a signed-in user manages
 * their OWN vault's keys).
 *
 *   POST → mint a key. The raw secret is generated + hashed HERE (server-side)
 *          and returned to the caller exactly ONCE; only the hash is persisted.
 *   GET  → list the owner's keys (never includes the secret hash).
 *
 * Minting does not need the agent-auth middleware — it's a normal session-authed
 * route. Using a minted key to call the API (resolution) is a separate change.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { generateApiKey } from "@/lib/auth/apiKey";
import {
  fullOwnDataScopes,
  isScopePreset,
  presetScopes,
  presetTier,
  sanitizeScopes,
  scopesRequireAdmin,
  tierForScopes,
  type ApiKeyTier,
  type Scope,
} from "@/lib/auth/scopes";
import { isAdminUser } from "@/lib/auth/admin";

const MintSchema = z.object({
  label: z.string().transform((value) => value.trim()),
  preset: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  scopeChoice: z.enum(["full", "chosen"]).optional(),
  expiresAt: z.number().optional(),
});

export async function POST(request: NextRequest) {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }

  try {
    const { vaultOwnerId, userId } = await getVaultAccessContext();
    const parsed = MintSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !parsed.data.label) {
      return NextResponse.json({ error: "A label is required to mint a key" }, { status: 400 });
    }

    let scopes: Scope[];
    let tier: ApiKeyTier;
    if (parsed.data.preset && isScopePreset(parsed.data.preset)) {
      scopes = presetScopes(parsed.data.preset);
      tier = presetTier(parsed.data.preset);
    } else if (parsed.data.scopes !== undefined) {
      scopes = sanitizeScopes(parsed.data.scopes);
      tier = tierForScopes(scopes);
    } else {
      if (parsed.data.preset !== undefined) return NextResponse.json({ error: "Unknown preset" }, { status: 400 });
      scopes = fullOwnDataScopes();
      tier = "standard";
    }


    // Admin/operator scopes require the admin role (shared-model: Admin is a role).
    if (scopesRequireAdmin(scopes) && !isAdminUser(userId)) {
      return NextResponse.json(
        { error: "Admin scopes require an operator role on your account" },
        { status: 403 },
      );
    }

    const generated = generateApiKey();
    const client = await getAuthedConvexClient();
    await client.mutation(api.apiKeys.mintKey, {
      vaultOwnerId,
      keyId: generated.keyId,
      hashedSecret: generated.hashedSecret,
      label: parsed.data.label,
      scopes,
      scopeChoice: parsed.data.scopeChoice === "full" || parsed.data.preset === "full" || (parsed.data.preset === undefined && parsed.data.scopes === undefined) ? "full" : "chosen",
      tier,
      expiresAt: parsed.data.expiresAt,
      createdByUserId: userId ?? undefined,
    });

    // The raw key is returned exactly once — it is never recoverable later.
    return NextResponse.json({
      success: true,
      key: generated.fullKey,
      keyId: generated.keyId,
      label: parsed.data.label,
      scopes,
      tier,
    });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}

export async function GET() {
  if (!isConvexConfigured()) {
    const issue = getConvexRuntimeIssue();
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
  try {
    const { vaultOwnerId } = await getVaultAccessContext();
    const client = await getAuthedConvexClient();
    const keys = await client.action(api.apiKeys.listKeys, { vaultOwnerId });
    return NextResponse.json({ success: true, keys });
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({ error: issue.title, details: issue.description }, { status: issue.statusCode });
  }
}
