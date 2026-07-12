/**
 * GEN-83: Anonymous → signed-in vault migration trigger.
 *
 * POST /api/vault/migrate-guest
 *
 * Mounted on the authenticated app shell (called once from
 * GuestVaultMigrationGate on mount). The route:
 *   1. Reads the `vault-preview-id` cookie set by proxy.ts during the
 *      anonymous-preview window.
 *   2. Confirms the caller is signed in via Clerk.
 *   3. Calls the Convex `vaultMigration.migrateGuestVault` mutation to
 *      re-tag every owner-scoped row from the guest UUID to the Clerk
 *      user id.
 *   4. Deletes the cookie so the guest vault no longer reappears on
 *      sign-out.
 *
 * No-ops (200 with `migrated: false`) when there's no cookie, no auth, or
 * Clerk isn't configured. Errors during the Convex call propagate as 500 so
 * the client can show a generic failure; the cookie is preserved on failure
 * so a retry is possible.
 */
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { isClerkEnabled } from "@/lib/clerk/config";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { VAULT_PREVIEW_COOKIE } from "@/lib/vault/constants";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isClerkEnabled() || !isConvexConfigured()) {
    return NextResponse.json({ migrated: false, reason: "not-configured" }, { status: 200 });
  }

  const authState = await auth();
  if (!authState.userId) {
    return NextResponse.json({ migrated: false, reason: "not-authenticated" }, { status: 200 });
  }

  const cookieStore = await cookies();
  const guestId = cookieStore.get(VAULT_PREVIEW_COOKIE)?.value?.trim();
  if (!guestId) {
    return NextResponse.json({ migrated: false, reason: "no-guest-cookie" }, { status: 200 });
  }

  // Defense in depth: the Convex mutation also enforces this prefix, but
  // failing fast here lets us skip the round trip when there's nothing to do
  // (e.g. an old/malformed cookie from before the guest_<UUID> format).
  if (!guestId.startsWith("guest_")) {
    cookieStore.delete(VAULT_PREVIEW_COOKIE);
    return NextResponse.json({ migrated: false, reason: "non-guest-cookie-cleared" }, { status: 200 });
  }

  try {
    const client = await getAuthedConvexClient();
    const result = await client.mutation(api.vaultMigration.migrateGuestVault, {
      fromVaultOwnerId: guestId,
      toVaultOwnerId: authState.userId,
    });

    cookieStore.delete(VAULT_PREVIEW_COOKIE);

    return NextResponse.json(
      {
        migrated: true,
        total: result.total,
        perTable: result.perTable,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[vault.migrate-guest] failed:", message);
    return NextResponse.json(
      { migrated: false, reason: "convex-error", error: message },
      { status: 500 },
    );
  }
}
