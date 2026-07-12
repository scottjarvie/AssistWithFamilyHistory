import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const OWNER_A = "user_ownerAAAAAAAAAAAAAAAAA";
const OWNER_B = "user_ownerBBBBBBBBBBBBBBBBB";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedPerson(t: ReturnType<typeof convexTest>, owner = OWNER_A) {
  return t.run((ctx) =>
    ctx.db.insert("persons", {
      vaultOwnerId: owner,
      fsId: "SAFE-PUBLIC-1",
      name: { given: "Mary", surname: "Example" },
      sex: "female",
      living: false,
      birth: { date: { original: "1820", year: 1820 } },
      death: { date: { original: "1899", year: 1899 } },
      researchStatus: "complete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("TRUST_BOUNDARY_MODE", () => {
  test("unset mode defaults to shadow, allows an anonymous private read, and persists the denial", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "");
    const t = convexTest(schema, modules);
    await seedPerson(t);

    const rows = await t.action(api.vaultReads.getPeopleExplorer, {
      vaultOwnerId: OWNER_A,
    });
    expect(rows).toHaveLength(1);

    const logs = await t.run((ctx) => ctx.db.query("trustBoundaryShadowLog").collect());
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      functionName: "vault.getPeopleExplorer",
      caller: "<anonymous>",
      callerKind: "anonymous",
      reason: "missing_identity",
    });
  });

  test("enforce mode denies an anonymous private read without touching tenant data", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await seedPerson(t);

    await expect(
      t.action(api.vaultReads.getPeopleExplorer, { vaultOwnerId: OWNER_A }),
    ).rejects.toThrow(/missing_identity/);

    const logs = await t.run((ctx) => ctx.db.query("trustBoundaryShadowLog").collect());
    expect(logs).toHaveLength(0);
  });

  test("enforce mode denies an authenticated cross-tenant read", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await seedPerson(t);

    await expect(
      t.withIdentity({ subject: OWNER_B }).action(api.vaultReads.getPeopleExplorer, {
        vaultOwnerId: OWNER_A,
      }),
    ).rejects.toThrow(/owner_mismatch/);
  });

  test("enforce mode denies a foreign record reference before it is linked", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const foreignSourceId = await t.run((ctx) =>
      ctx.db.insert("sources", {
        vaultOwnerId: OWNER_B,
        title: "Foreign source",
        type: "other",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity({ subject: OWNER_A }).mutation(api.vaultMutations.upsertCitation, {
        vaultOwnerId: OWNER_A,
        sourceId: foreignSourceId,
        isEvidence: true,
        confidence: "high",
      }),
    ).rejects.toThrow(/reference_owner_mismatch/);

    const citations = await t.run((ctx) => ctx.db.query("citations").collect());
    expect(citations).toHaveLength(0);
  });

  test("shadow mode records and preserves a legacy foreign-reference call", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
    const t = convexTest(schema, modules);
    const foreignSourceId = await t.run((ctx) =>
      ctx.db.insert("sources", {
        vaultOwnerId: OWNER_B,
        title: "Foreign source",
        type: "other",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await t.withIdentity({ subject: OWNER_A }).mutation(api.vaultMutations.upsertCitation, {
      vaultOwnerId: OWNER_A,
      sourceId: foreignSourceId,
      isEvidence: true,
      confidence: "high",
    });

    const logs = await t.run((ctx) => ctx.db.query("trustBoundaryShadowLog").collect());
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      functionName: "vaultMutations.upsertCitation",
      caller: OWNER_A,
      reason: "reference_owner_mismatch",
    });
  });

  test("draft and review stories remain unreadable anonymously", async () => {
    const t = convexTest(schema, modules);
    const personId = await seedPerson(t);
    for (const status of ["draft", "review"] as const) {
      const storyId = await t.run((ctx) =>
        ctx.db.insert("stories", {
          vaultOwnerId: OWNER_A,
          personId,
          type: "biography",
          title: `${status} private story`,
          content: "This content must not cross the public Convex boundary.",
          citationIds: [],
          status,
          generatedBy: "human",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
      await expect(t.query(api.vault.getPublishedStory, { storyId })).resolves.toBeNull();
    }
  });

  test("a published flag never exposes a living source person", async () => {
    const t = convexTest(schema, modules);
    const personId = await t.run((ctx) =>
      ctx.db.insert("persons", {
        vaultOwnerId: OWNER_A,
        name: { given: "Living", surname: "Fixture" },
        sex: "unknown",
        living: true,
        researchStatus: "basic",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const storyId = await t.run((ctx) =>
      ctx.db.insert("stories", {
        vaultOwnerId: OWNER_A,
        personId,
        type: "biography",
        title: "Incorrectly flagged public",
        content: "Even a corrupt legacy status must not expose a living person.",
        citationIds: [],
        status: "published",
        generatedBy: "human",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(t.query(api.vault.getPublishedStory, { storyId })).resolves.toBeNull();
  });

  test("a published story remains anonymously readable and is redacted server-side", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const personId = await seedPerson(t);
    const storyId = await t.run((ctx) =>
      ctx.db.insert("stories", {
        vaultOwnerId: OWNER_A,
        personId,
        type: "biography",
        title: "A public family story",
        content:
          "Mary wrote from 1234 Fictional Valley Road. Contact person@example.test or 602-555-0199. Identifier 123-45-6789.",
        citationIds: [],
        status: "published",
        generatedBy: "human",
        publicSlug: "mary-example-public-family-story",
        publicIndexing: "noindex",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const bundle = await t.query(api.vault.getPublishedStory, { storyId });
    expect(bundle).not.toBeNull();
    expect(bundle?.publicationSafety).toEqual({
      published: true,
      redactionApplied: true,
      redactionVersion: "public-text-v1",
    });
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("1234 Fictional Valley Road");
    expect(serialized).not.toContain("person@example.test");
    expect(serialized).not.toContain("602-555-0199");
    expect(serialized).not.toContain("123-45-6789");
    expect(serialized).toContain("[EMAIL REDACTED]");
  });
});

describe("shadow-log summary", () => {
  test("is always fail-closed and returns bounded counts only to a configured super-admin", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("trustBoundaryShadowLog", {
        functionName: "vault.getPeopleExplorer",
        caller: "<anonymous>",
        callerKind: "anonymous",
        reason: "missing_identity",
        timestamp: Date.now(),
      });
    });

    await expect(
      t.query(api.trustBoundary.getShadowLogSummary, {}),
    ).rejects.toThrow(/super-admin/);

    vi.stubEnv("TRUST_BOUNDARY_SUPER_ADMIN_IDS", OWNER_A);
    const summary = await t
      .withIdentity({ subject: OWNER_A })
      .query(api.trustBoundary.getShadowLogSummary, {});
    expect(summary.total).toBe(1);
    expect(summary.byFunction).toEqual([
      { value: "vault.getPeopleExplorer", count: 1 },
    ]);
    expect(summary.byReason).toEqual([{ value: "missing_identity", count: 1 }]);
  });
});
