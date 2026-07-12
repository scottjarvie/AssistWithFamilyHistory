import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_publishGateOwner";
const GUEST = "guest_aaaaaaaa-1111-2222-3333-444444444444";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedPerson(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Ada", surname: "Example" },
      sex: "female",
      living: false,
      birth: { date: { original: "1820", year: 1820 } },
      death: { date: { original: "1890", year: 1890 } },
      researchStatus: "basic",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function seedStory(
  t: ReturnType<typeof convexTest>,
  status: "draft" | "review" | "published",
) {
  const personId = await seedPerson(t);
  const storyId = await t.run((ctx) =>
    ctx.db.insert("stories", {
      vaultOwnerId: OWNER,
      personId,
      type: "biography",
      title: "Backend gate fixture",
      content: "This intentionally short fixture cannot pass publication readiness.",
      citationIds: [],
      status,
      generatedBy: "human",
      publicSlug: "ada-example-backend-gate-fixture",
      publicIndexing: "noindex",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return { personId, storyId };
}

describe("backend story publish gate", () => {
  test("direct published upsert is denied in enforce mode", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const personId = await seedPerson(t);

    await expect(
      t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.upsertStoryDraft, {
        vaultOwnerId: OWNER,
        personId,
        type: "biography",
        title: "Bypass attempt",
        content: "A direct mutation must not bypass the backend publish workflow.",
        status: "published",
        generatedBy: "human",
      }),
    ).rejects.toThrow(/direct_publish_bypass/);
  });

  test("a route-layer bypass cannot publish a backend-blocked story", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const { storyId } = await seedStory(t, "draft");

    await expect(
      t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.updateStoryStatus, {
        vaultOwnerId: OWNER,
        storyId,
        status: "published",
        humanReviewConfirmed: true,
        humanReviewNote: "I reviewed this fixture directly through the backend test.",
      }),
    ).rejects.toThrow(/publish_gate_failed/);

    const story = await t.run((ctx) => ctx.db.get(storyId));
    expect(story?.status).toBe("draft");
  });

  test("editing an already-published story requires a new review cycle", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    const { storyId } = await seedStory(t, "published");

    await expect(
      t.withIdentity({ subject: OWNER }).mutation(api.vaultMutations.updateStoryDraft, {
        vaultOwnerId: OWNER,
        storyId,
        title: "Changed after publication",
        content: "This edit must not silently change public content.",
      }),
    ).rejects.toThrow(/published_edit_requires_review/);
  });
});

describe("guest migration enforcement", () => {
  test("enforce mode never trusts an unsigned guest source identifier", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("persons", {
        vaultOwnerId: GUEST,
        name: { given: "Guest", surname: "Fixture" },
        sex: "unknown",
        living: false,
        researchStatus: "not_started",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity({ subject: OWNER }).mutation(api.vaultMigration.migrateGuestVault, {
        fromVaultOwnerId: GUEST,
        toVaultOwnerId: OWNER,
      }),
    ).rejects.toThrow(/guest_source_unverified/);

    const guestRows = await t.run((ctx) =>
      ctx.db
        .query("persons")
        .withIndex("by_owner", (q) => q.eq("vaultOwnerId", GUEST))
        .collect(),
    );
    expect(guestRows).toHaveLength(1);
  });
});
