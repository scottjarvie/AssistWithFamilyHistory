/**
 * GEN-83: Anonymous → signed-in vault migration.
 *
 * When a visitor uses the anonymous-vault preview (cookie `vault-preview-id`
 * set by proxy.ts), their rows are tagged with `vaultOwnerId = "guest_<UUID>"`.
 * On sign-up, `getVaultAccessContext` switches to the new Clerk `userId`, and
 * the guest-tagged rows become orphaned.
 *
 * This file provides a single mutation that re-tags every owner-scoped row
 * from a guest UUID to a Clerk user id. The destination must equal the
 * authenticated Convex identity. The raw guest UUID is not a signed principal,
 * so shadow mode logs and permits this legacy migration while enforce mode
 * denies it until a signed guest capability exists.
 *
 * Structural checks:
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
import { authorizeTenantMutation, handlePolicyViolationMutation } from "./access";

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
  "queueItems",
  "queueActivity",
  "queueCommandReceipts",
  "documents",
  "stories",
  "storyReviewEvents",
  "provisionalRelatives",
  "researchChecks",
  "historicalContext",
  "apiKeys",
  "agentActivity",
] as const satisfies readonly TableNames[];

export const GUEST_PREFIX = "guest_";
export const USER_PREFIX = "user_";

export type MigrationResult = { total: number; perTable: Record<string, number> };

/**
 * Pure guard for the migrate-guest invariants. Throws on any violation, returns
 * void on success. Exported so the unit tests can assert the guard logic
 * without a Convex runtime. The mutation calls this before touching the db.
 *
 *   - `fromVaultOwnerId` MUST be a `guest_*` id (the cookie format).
 *   - `toVaultOwnerId` MUST be a `user_*` id (the Clerk user id prefix).
 *   - The two ids must differ.
 */
export function assertMigrationOwners(fromVaultOwnerId: string, toVaultOwnerId: string): void {
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
}

/**
 * Minimal db surface the re-tag loop needs. The Convex `ctx.db` satisfies this
 * structurally; the tests pass a fake implementation backed by seeded rows.
 */
export type RetagDb = {
  query: (table: string) => {
    withIndex: (
      indexName: string,
      filter: (q: { eq: (field: string, value: string) => unknown }) => unknown,
    ) => { collect: () => Promise<Array<{ _id: unknown }>> };
  };
  patch: (id: unknown, fields: { vaultOwnerId: string }) => Promise<unknown>;
};

/**
 * Pure decision/loop for the migration: for each owned table, re-tag the rows
 * owned by `fromVaultOwnerId` to `toVaultOwnerId` and tally counts. No guards
 * here — callers must run `assertMigrationOwners` first. Exported so tests can
 * drive it with a fake db and assert exact per-table counts and the total.
 */
export async function retagGuestRows(
  db: RetagDb,
  fromVaultOwnerId: string,
  toVaultOwnerId: string,
  tables: readonly string[] = OWNED_TABLES,
): Promise<MigrationResult> {
  const perTable: Record<string, number> = {};
  let total = 0;

  for (const table of tables) {
    const rows = await db
      .query(table)
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", fromVaultOwnerId))
      .collect();

    for (const row of rows) {
      await db.patch(row._id, { vaultOwnerId: toVaultOwnerId });
    }
    perTable[table] = rows.length;
    total += rows.length;
  }

  return { total, perTable };
}

export const migrateGuestVault = mutation({
  args: {
    fromVaultOwnerId: v.string(),
    toVaultOwnerId: v.string(),
  },
  handler: async (ctx, { fromVaultOwnerId, toVaultOwnerId }) => {
    const { owner: authenticatedDestination } = await authorizeTenantMutation(
      ctx,
      "vaultMigration.migrateGuestVault",
      toVaultOwnerId,
    );
    assertMigrationOwners(fromVaultOwnerId, authenticatedDestination);

    // A raw guest UUID is not a verified principal. Shadow mode records any
    // legitimate reliance on this legacy migration path; enforce mode denies
    // it until the guest supplies a signed Convex-verifiable capability.
    await handlePolicyViolationMutation(
      ctx,
      "vaultMigration.migrateGuestVault",
      "guest_source_unverified",
    );

    // ctx.db structurally satisfies RetagDb; the casts keep the index/table
    // names loose the same way the original inline loop did.
    return retagGuestRows(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.db as any,
      fromVaultOwnerId,
      authenticatedDestination,
    );
  },
});
