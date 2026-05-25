/**
 * GEN-83: Anonymous → signed-in vault migration.
 *
 * When a visitor uses the anonymous-vault preview (cookie `vault-preview-id`
 * set by proxy.ts), their rows are tagged with `vaultOwnerId = "guest_<UUID>"`.
 * On sign-up, `getVaultAccessContext` switches to the new Clerk `userId`, and
 * the guest-tagged rows become orphaned.
 *
 * This file provides a single mutation that re-tags every owner-scoped row
 * from a guest UUID to a Clerk user id. The Next.js API route at
 * `/api/vault/migrate-guest` is the only intended caller — it gates on Clerk
 * auth and on the cookie value, then deletes the cookie. We keep the
 * vaultOwnerId-as-arg pattern (the same trust model used by the other
 * `mutation` exports in this codebase).
 *
 * Safety:
 *   - `fromVaultOwnerId` MUST match `guest_*` (the cookie format from proxy.ts).
 *     This prevents any caller from migrating an arbitrary Clerk user's data
 *     out from under them.
 *   - `toVaultOwnerId` MUST match `user_*` (the Clerk user id prefix).
 *   - The two ids must differ.
 *
 * Tables touched: every table that has a `by_owner` index in convex/schema.ts.
 * Counts are returned per-table so the caller can show "we brought back N
 * entries" and so tests can assert exact behavior.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { TableNames } from "./_generated/dataModel";

// All tables with a `by_owner` index in schema.ts. If a new owner-scoped table
// is added, append it here.
const OWNED_TABLES = [
  "persons",
  "relationships",
  "events",
  "personEvents",
  "places",
  "sources",
  "citations",
  "citationLinks",
  "sourceFacts",
  "media",
  "contextItems",
  "importRuns",
  "familySearchSync",
  "researchTasks",
  "researchLog",
  "documents",
  "stories",
  "storyReviewEvents",
  "provisionalRelatives",
  "researchChecks",
  "historicalContext",
] as const satisfies readonly TableNames[];

const GUEST_PREFIX = "guest_";
const USER_PREFIX = "user_";

export const migrateGuestVault = mutation({
  args: {
    fromVaultOwnerId: v.string(),
    toVaultOwnerId: v.string(),
  },
  handler: async (ctx, { fromVaultOwnerId, toVaultOwnerId }) => {
    if (!fromVaultOwnerId.startsWith(GUEST_PREFIX)) {
      throw new Error(
        `migrateGuestVault: fromVaultOwnerId must start with "${GUEST_PREFIX}" (got ${fromVaultOwnerId.slice(0, 8)}…)`,
      );
    }
    if (!toVaultOwnerId.startsWith(USER_PREFIX)) {
      throw new Error(
        `migrateGuestVault: toVaultOwnerId must start with "${USER_PREFIX}" (got ${toVaultOwnerId.slice(0, 8)}…)`,
      );
    }
    if (fromVaultOwnerId === toVaultOwnerId) {
      throw new Error("migrateGuestVault: from and to vault owners are identical");
    }

    const perTable: Record<string, number> = {};
    let total = 0;

    for (const table of OWNED_TABLES) {
      const rows = await ctx.db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query(table as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_owner" as any, (q: any) => q.eq("vaultOwnerId", fromVaultOwnerId))
        .collect();

      for (const row of rows) {
        await ctx.db.patch(row._id, { vaultOwnerId: toVaultOwnerId });
      }
      perTable[table] = rows.length;
      total += rows.length;
    }

    return { total, perTable };
  },
});
