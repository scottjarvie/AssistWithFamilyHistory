import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_codex_first_start_owner";
const OTHER_OWNER = "user_codex_other_family";

afterEach(() => vi.unstubAllEnvs());

function firstStartArgs(operationId = "codex-first-start-001") {
  return {
    vaultOwnerId: OWNER,
    operationId,
    startingPerson: { given: "Ada", surname: "Fixture", living: false },
    relatedPerson: { given: "Miriam", surname: "Fixture", living: true },
    relationship: "parent" as const,
  };
}

describe("private first start", () => {
  test("locks the existing canonical people and relationship behavior into one owner-scoped transaction", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);

    await expect(
      t.withIdentity({ subject: OWNER }).action(api.vaultReads.getDashboardSummary, { vaultOwnerId: OWNER }),
    ).resolves.toMatchObject({ firstStartEligible: true, counts: { people: 0 } });

    const created = await t
      .withIdentity({ subject: OWNER })
      .mutation(api.vaultMutations.startPrivateWorkspace, firstStartArgs());

    expect(created.deduplicated).toBe(false);
    const graph = await t.run(async (ctx) => ({
      people: await ctx.db.query("persons").collect(),
      relationships: await ctx.db.query("relationships").collect(),
      queueItems: await ctx.db.query("queueItems").collect(),
    }));
    expect(graph.people).toHaveLength(2);
    expect(graph.relationships).toHaveLength(1);
    expect(graph.queueItems).toHaveLength(0);
    expect(graph.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: { given: "Ada", surname: "Fixture" },
          living: false,
          creationRole: "starting_person",
          creationProvenance: expect.objectContaining({
            actorKind: "user",
            actorId: OWNER,
            method: "manual_first_start",
            evidenceStatus: "unsourced",
            operationId: "codex-first-start-001",
          }),
        }),
        expect.objectContaining({
          name: { given: "Miriam", surname: "Fixture" },
          living: true,
          creationRole: "related_person",
        }),
      ]),
    );
    expect(graph.relationships[0]).toMatchObject({
      type: "ParentChild",
      person1: created.relatedPersonId,
      person2: created.startingPersonId,
      childRelationType: "Unknown",
      creationProvenance: expect.objectContaining({ evidenceStatus: "unsourced" }),
    });

    await expect(
      t.withIdentity({ subject: OWNER }).action(api.vaultReads.getDashboardSummary, { vaultOwnerId: OWNER }),
    ).resolves.toMatchObject({ firstStartEligible: false, counts: { people: 2 } });
  });

  test("replays one operation id without duplicating people or relationships", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const caller = t.withIdentity({ subject: OWNER });
    const first = await caller.mutation(api.vaultMutations.startPrivateWorkspace, firstStartArgs());
    const replay = await caller.mutation(api.vaultMutations.startPrivateWorkspace, firstStartArgs());

    expect(replay).toEqual({ ...first, deduplicated: true });
    await expect(
      t.run(async (ctx) => ({
        people: (await ctx.db.query("persons").collect()).length,
        relationships: (await ctx.db.query("relationships").collect()).length,
      })),
    ).resolves.toEqual({ people: 2, relationships: 1 });
  });

  test("refuses a second first start and rejects another family's owner id", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.startPrivateWorkspace, firstStartArgs());

    await expect(
      t.withIdentity({ subject: OWNER }).mutation(
        api.vaultMutations.startPrivateWorkspace,
        firstStartArgs("codex-first-start-002"),
      ),
    ).rejects.toThrow(/only available in an empty private workspace/);

    await expect(
      t.withIdentity({ subject: OTHER_OWNER }).mutation(
        api.vaultMutations.startPrivateWorkspace,
        firstStartArgs("codex-cross-owner"),
      ),
    ).rejects.toThrow(/owner_mismatch/);

    const owners = await t.run(async (ctx) =>
      (await ctx.db.query("persons").collect()).map((person) => person.vaultOwnerId),
    );
    expect(new Set(owners)).toEqual(new Set([OWNER]));
  });
});
