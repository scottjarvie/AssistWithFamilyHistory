/**
 * Unit tests for the anonymous->authed vault migration guard + re-tag logic
 * (GEN-95). migrateGuestVault re-tags every owner-scoped row from a guest UUID
 * to a Clerk user id on sign-up — the highest-blast-radius recent feature and
 * previously the only one with zero coverage. We test the two pure helpers the
 * mutation is built from (assertMigrationOwners, retagGuestRows) without a
 * Convex runtime, mirroring the dependency-injection style of test-vault-core.ts.
 */
import assert from "node:assert/strict";
import {
  assertMigrationOwners,
  retagGuestRows,
  type RetagDb,
} from "@/convex/vaultMigration";

// --- assertMigrationOwners: the guards that bind a migration to guest->user ---

const GUEST = "guest_aaaaaaaa-1111-2222-3333-444444444444";
const USER = "user_2abcDEF";

// Happy path: a guest_ source and a user_ destination that differ -> no throw.
assert.doesNotThrow(() => assertMigrationOwners(GUEST, USER));

// from must be a guest_ id (a signed-in user cannot be the migration source).
assert.throws(() => assertMigrationOwners(USER, USER), /must start with "guest_"/);

// to must be a user_ id (cannot migrate INTO another guest vault).
assert.throws(() => assertMigrationOwners(GUEST, GUEST), /must start with "user_"/);

// from and to must differ: a guest_ id migrating to an identical guest_ id is
// rejected by the user_ prefix guard before the equality guard, which is fine —
// the invariant (you can't no-op-migrate a guest onto itself) still holds.
assert.throws(() => assertMigrationOwners(GUEST, GUEST), /must start with "user_"/);

// --- retagGuestRows: only the guest's rows move, counts are exact ---

type Row = { _id: string; vaultOwnerId: string };

function makeFakeDb(seed: Record<string, Row[]>) {
  // Keep live references so patch() mutates the same row objects the test reads.
  const tables = seed;
  const patched: Array<{ id: string; vaultOwnerId: string }> = [];

  const db: RetagDb = {
    query(table: string) {
      return {
        withIndex(
          _indexName: string,
          filter: (q: { eq: (field: string, value: string) => unknown }) => unknown,
        ) {
          let captured: string | undefined;
          const q = {
            eq(_field: string, value: string) {
              captured = value;
              return q;
            },
          };
          filter(q);
          return {
            async collect() {
              return (tables[table] ?? []).filter((r) => r.vaultOwnerId === captured);
            },
          };
        },
      };
    },
    async patch(id: unknown, fields: { vaultOwnerId: string }) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((r) => r._id === id);
        if (row) row.vaultOwnerId = fields.vaultOwnerId;
      }
      patched.push({ id: id as string, vaultOwnerId: fields.vaultOwnerId });
      return undefined;
    },
  };

  return { db, tables, patched };
}

const otherGuest = "guest_cccccccc-9999-8888-7777-666666666666";
const seed: Record<string, Row[]> = {
  persons: [
    { _id: "persons:1", vaultOwnerId: GUEST },
    { _id: "persons:2", vaultOwnerId: GUEST },
    { _id: "persons:3", vaultOwnerId: USER }, // already the destination user
    { _id: "persons:4", vaultOwnerId: otherGuest }, // a different guest vault
  ],
  sources: [{ _id: "sources:1", vaultOwnerId: GUEST }],
  media: [{ _id: "media:1", vaultOwnerId: otherGuest }], // none of this guest's rows
};

async function main() {
  const { db, tables, patched } = makeFakeDb(seed);
  const result = await retagGuestRows(db, GUEST, USER, ["persons", "sources", "media"]);

  // Exact per-table counts: 2 persons + 1 source + 0 media of GUEST were re-tagged.
  assert.deepEqual(result.perTable, { persons: 2, sources: 1, media: 0 });
  assert.equal(result.total, 3);
  assert.equal(patched.length, 3);

  // Only GUEST rows moved to USER; the destination-user and other-guest rows are untouched.
  assert.equal(tables.persons.find((r) => r._id === "persons:1")!.vaultOwnerId, USER);
  assert.equal(tables.persons.find((r) => r._id === "persons:2")!.vaultOwnerId, USER);
  assert.equal(tables.persons.find((r) => r._id === "persons:3")!.vaultOwnerId, USER); // unchanged (was already USER)
  assert.equal(tables.persons.find((r) => r._id === "persons:4")!.vaultOwnerId, otherGuest); // NOT stolen
  assert.equal(tables.media.find((r) => r._id === "media:1")!.vaultOwnerId, otherGuest); // NOT stolen

  console.log("Vault migration test checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
