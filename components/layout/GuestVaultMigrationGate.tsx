"use client";

/**
 * GEN-83: Anonymous → signed-in vault migration trigger.
 *
 * Mounted once in the authenticated app shell (`app/app/layout.tsx`). On
 * first mount after sign-in we POST to `/api/vault/migrate-guest`. The
 * server route reads the `vault-preview-id` cookie and Clerk auth, calls
 * the Convex mutation, and deletes the cookie.
 *
 * Idempotence: we use a module-level flag so a strict-mode double-mount
 * (Next 16 dev) doesn't double-call. The server route is also idempotent —
 * once the cookie is cleared it returns `migrated: false`.
 *
 * Surfaces a single-line success toast when rows actually moved. Silent on
 * the common "nothing to migrate" path. Errors log to the console; we don't
 * pop a toast for failures because the user has done nothing wrong and
 * retry happens automatically on next sign-in mount.
 */

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

let migrationAttempted = false;

export function GuestVaultMigrationGate() {
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || migrationAttempted) return;
    migrationAttempted = true;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/vault/migrate-guest", {
          method: "POST",
          cache: "no-store",
        });
        if (cancelled) return;

        const data = (await res.json()) as
          | { migrated: true; total: number; perTable: Record<string, number> }
          | { migrated: false; reason?: string; error?: string };

        if (data.migrated && data.total > 0) {
          toast.success(
            `Brought ${data.total} ${data.total === 1 ? "entry" : "entries"} from your guest vault into your account`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          // Allow a retry on next mount (e.g. after page refresh) by resetting the flag.
          migrationAttempted = false;
          console.warn("[GuestVaultMigrationGate] migration request failed:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return null;
}
