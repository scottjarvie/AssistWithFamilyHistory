import { describe, expect, test } from "vitest";
import { FIRST_START_EMPTY_TABLES, getDashboardSummary, getVaultSnapshot, isFirstStartEligible } from "./vault";

const OWNER = "synthetic_budget_owner";
type Row = { vaultOwnerId: string; payload?: string };
type Snapshot = Awaited<ReturnType<typeof getVaultSnapshot>>;

function fixture(rows: Record<string, Row[]> = {}, allowSnapshot = false) {
  const reads: string[] = [];
  return {
    reads,
    ctx: {
      db: {
        query(table: string) {
          return {
            withIndex(index: string, select: (q: { eq: (field: string, owner: string) => void }) => void) {
              expect(index).toBe("by_owner");
              let owner: string | undefined;
              select({ eq(field, value) { expect(field).toBe("vaultOwnerId"); owner = value; } });
              expect(owner).toBe(OWNER);
              return {
                async first() { reads.push(table); return rows[table]?.find(row => row.vaultOwnerId === owner) ?? null; },
                async collect() {
                  if (!allowSnapshot) throw new Error("Eligibility must never collect an owner table");
                  reads.push(`${table}:collect`); return (rows[table] ?? []).filter(row => row.vaultOwnerId === owner);
                },
              };
            },
          };
        },
      },
    } as never,
  };
}

function snapshot() {
  return Object.fromEntries(FIRST_START_EMPTY_TABLES.filter(table => table !== "queueItems").map(table => [table === "persons" ? "people" : table, []])) as Snapshot;
}

describe("first-start read budget", () => {
  test("a populated family needs one indexed person read without loading other large bodies", async () => {
    const f = fixture({ persons: Array.from({ length: 5_000 }, () => ({ vaultOwnerId: OWNER })), documents: [{ vaultOwnerId: OWNER, payload: "synthetic-body".repeat(50_000) }] });
    await expect(isFirstStartEligible(f.ctx, OWNER)).resolves.toBe(false);
    expect(f.reads).toEqual(["persons"]);
  });

  test("an empty workspace reads each of the 21 owner indexes at most once", async () => {
    const f = fixture();
    await expect(isFirstStartEligible(f.ctx, OWNER)).resolves.toBe(true);
    expect(f.reads).toHaveLength(21);
    expect([...f.reads].sort()).toEqual([...FIRST_START_EMPTY_TABLES].sort());
  });

  test.each(FIRST_START_EMPTY_TABLES)("%s alone blocks first start; another owner's row does not", async table => {
    await expect(isFirstStartEligible(fixture({ [table]: [{ vaultOwnerId: OWNER }] }).ctx, OWNER)).resolves.toBe(false);
    await expect(isFirstStartEligible(fixture({ [table]: [{ vaultOwnerId: "other_synthetic_owner" }] }).ctx, OWNER)).resolves.toBe(true);
  });

  test("dashboard reuses an empty owned snapshot and reads only Queue", async () => {
    const f = fixture();
    await expect(isFirstStartEligible(f.ctx, OWNER, snapshot())).resolves.toBe(true);
    expect(f.reads).toEqual(["queueItems"]);
  });

  test("dashboard reuses occupied snapshot without redundant indexed reads", async () => {
    const f = fixture();
    const existing = snapshot(); existing.people = [{ vaultOwnerId: OWNER }] as Snapshot["people"];
    await expect(isFirstStartEligible(f.ctx, OWNER, existing)).resolves.toBe(false);
    expect(f.reads).toEqual([]);
  });

  test("Queue still blocks first start when the existing graph snapshot is empty", async () => {
    const f = fixture({ queueItems: [{ vaultOwnerId: OWNER }] });
    await expect(isFirstStartEligible(f.ctx, OWNER, snapshot())).resolves.toBe(false);
    expect(f.reads).toEqual(["queueItems"]);
  });
});


test("actual dashboard handler reuses its snapshot without 20 duplicate first reads", async () => {
  const f = fixture({}, true);
  const result = await getDashboardSummary._handler(f.ctx, { vaultOwnerId: OWNER });
  expect(result.firstStartEligible).toBe(true);
  expect(f.reads.filter(read => read.endsWith(":collect"))).toHaveLength(20);
  expect(f.reads.filter(read => !read.endsWith(":collect"))).toEqual(["queueItems"]);
});
