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
 * so this public endpoint refuses it in every mode until a signed guest
 * capability exists. No caller can lower readiness or move unproven guest data.
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
import { authorizeTenantMutation } from "./access";

// All tables with a `by_owner` index in schema.ts. If a new owner-scoped table
// is added, append it here.
const OWNED_TABLES = [
  "mediaUploadSessions",
  "persons",
  "relationships",
  "events",
  "personEvents",
  "places",
  "sources",
  "citations",
  "citationLinks",
  "sourceFacts",
  "sourceContents",
  "recordPersonas",
  "topics",
  "connections",
  "media",
  "contextItems",
  "importRuns",
  "familySearchSync",
  "researchTasks",
  "researchLog",
  "queueCounters",
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
  "mcpOperations",
  "mcpRecordKeys",
  // A guest can only reach a grant by connecting an AI before signing up, but
  // if one exists it must follow them rather than being orphaned.
  "mcpGrants",
  "mcpGrantHistory", "mcpCarriedRestrictions",
  "mcpClientAliases",
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
 * here — callers must prove source ownership and transfer counted usage in the
 * same transaction. The public endpoint refuses unsigned sources. Exported so tests can
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

/** A raw guest identifier proves no ownership. Until a verified source capability
 * exists, this public endpoint cannot remap records or change usage in any mode. */
export const migrateGuestVault = mutation({
  args: {fromVaultOwnerId:v.string(),toVaultOwnerId:v.string()},
  handler:async(ctx,{fromVaultOwnerId,toVaultOwnerId}):Promise<MigrationResult>=>{
    const {owner:authenticatedDestination}=await authorizeTenantMutation(ctx,"vaultMigration.migrateGuestVault",toVaultOwnerId);
    assertMigrationOwners(fromVaultOwnerId,authenticatedDestination);
    throw new Error("Trust boundary denied: guest_source_unverified (verified source ownership is required)");
  },
});
