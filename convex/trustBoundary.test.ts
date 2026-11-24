import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName, type FunctionArgs, type FunctionReference } from "convex/server";
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
  test.each(["shadow", "enforce"])("%s protects private reads, including the media address", async (mode) => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", mode);
    const t = convexTest(schema, modules);
    const personId = await seedPerson(t);
    const { mediaId, storyId, placeId, citationId, sourceId } = await t.run(async (ctx) => {
      const fields = { vaultOwnerId: OWNER_A, createdAt: 1, updatedAt: 1 };
      const storageId = await ctx.storage.store(new Blob(["synthetic file"], { type: "image/png" }));
      const mediaId = await ctx.db.insert("media", { ...fields, storageId, title: "Synthetic file", type: "photo", mimeType: "image/png", personIds: [personId] });
      const storyId = await ctx.db.insert("stories", { ...fields, personId, title: "Synthetic story", content: "Draft", type: "biography", generatedBy: "human", status: "draft", citationIds: [] });
      const placeId = await ctx.db.insert("places", { ...fields, name: "Synthetic place", fullName: "Synthetic place", type: "parish", familySearchId: "PLACE-1" });
      const sourceId = await ctx.db.insert("sources", { ...fields, title: "Synthetic source", type: "other" });
      const citationId = await ctx.db.insert("citations", { ...fields, sourceId, isEvidence: true, confidence: "high" });
      return { mediaId, storyId, placeId, citationId, sourceId };
    });
    const owner = t.withIdentity({ subject: OWNER_A });
    const other = t.withIdentity({ subject: OWNER_B });
    const scope = { vaultOwnerId: OWNER_A };
    const page = { ...scope, cursor: null };
    const person = { ...scope, personIdentifier: String(personId) };
    const legacyDocument = { ...scope, personId: String(personId) };
    const vault = api.vaultReads;
    const cases: Array<() => Promise<void>> = [];
    function check<F extends FunctionReference<"action">>(fn: F, args: FunctionArgs<F>) {
      cases.push(async () => {
        const name = getFunctionName(fn);
        await expect(owner.action(fn, args), name).resolves.not.toBeUndefined();
        await expect(other.action(fn, args), name).rejects.toThrow("Trust boundary denied: owner_mismatch");
        await expect(t.action(fn, args), name).rejects.toThrow("Trust boundary denied: missing_identity");
      });
    }

    check(vault.getOwnedMediaFile, { ...scope, mediaId });
    check(vault.getPeopleExplorerPage, page);
    check(vault.getPersonWorkspace, person);
    check(vault.getStoriesIndex, scope);
    check(vault.getStoryReview, { ...scope, storyId });
    check(vault.getPersonResearchChecks, person);
    check(vault.getProvisionalRelatives, person);
    check(vault.getOperationsQueue, scope);
    check(vault.getOperationsSummary, scope);
    check(vault.getVaultAudit, scope);
    check(vault.getContextCoverage, person);
    check(vault.getStoryReadinessPage, scope);
    check(vault.getPlacesPage, page);
    check(vault.getPlaceSection, { ...page, placeId, section: "people" });
    check(vault.getPlaceMentions, { ...scope, placeId });
    check(vault.getPlaceWorkspace, { ...scope, placeId });
    check(vault.getFirstStartEligibility, scope);
    check(vault.getDashboardSummary, scope);
    check(vault.getResearchTasksPage, page);
    check(vault.getResearchLogPage, page);
    check(vault.getContextPack, person);
    check(api.apiKeys.listKeys, scope);
    check(api.citations.get, { ...scope, id: citationId });
    check(api.citations.getForSource, { ...scope, sourceId });
    check(api.citations.getForTarget, { ...scope, targetType: "person", targetId: personId });
    check(api.citations.list, scope);
    check(api.documents.getDocumentsByPerson, legacyDocument);
    check(api.documents.getDocument, { ...legacyDocument, type: "PS" });
    check(api.documents.list, scope);
    check(api.importRuns.listRecent, scope);
    check(api.importRuns.getByCaptureId, { ...scope, captureId: "synthetic" });
    check(api.places.getByFsId, { ...scope, fsId: "PLACE-1" });
    check(api.places.list, scope);
    check(api.researchLog.listForEntity, { ...scope, entityType: "person", entityId: personId });
    check(api.researchTasks.listResearchTasks, scope);

    for (const run of cases) await run();
    await expect(owner.action(vault.getOwnedMediaFile, { ...scope, mediaId })).resolves.toMatchObject({
      url: expect.stringMatching(/^https?:\/\//), mimeType: "image/png", title: "Synthetic file",
    });
    await expect(other.action(vault.getOwnedMediaFile, { vaultOwnerId: OWNER_B, mediaId })).resolves.toBeNull();
    const logs = await t.run((ctx) => ctx.db.query("trustBoundaryShadowLog").collect());
    expect(logs).toHaveLength(mode === "shadow" ? cases.length * 2 : 0);
  });

  test.each(["shadow", "enforce"])("%s signs a private B2 file only for its owner", async (mode) => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", mode);
    vi.stubEnv("MEDIA_STORAGE_ENVIRONMENT", "development");
    vi.stubEnv("B2_PRIVATE_ENDPOINT", "https://media.example.test");
    vi.stubEnv("B2_PRIVATE_REGION", "us-west-000");
    vi.stubEnv("B2_PRIVATE_BUCKET", "synthetic-private");
    vi.stubEnv("B2_PRIVATE_KEY_ID", "not-a-real-key-id");
    vi.stubEnv("B2_PRIVATE_APPLICATION_KEY", "not-a-real-application-key");
    const t = convexTest(schema, modules);
    const mediaId = await t.run(ctx => ctx.db.insert("media", {
      vaultOwnerId: OWNER_A, title: "Synthetic B2 file", type: "scan", personIds: [], createdAt: 1, updatedAt: 1,
      mediaState: "ready", b2Original: {
        bucketClass: "private", bucketName: "synthetic-private", objectKey: "synthetic-object", versionId: "synthetic-version",
        sha256: "a".repeat(64), contentType: "image/png", sizeBytes: 4, metadataClean: false, verifiedAt: "2026-11-24T00:00:00Z",
      },
    }));
    const args = { vaultOwnerId: OWNER_A, mediaId };
    const read = api.vaultReads.getOwnedMediaFile;
    const file = await t.withIdentity({ subject: OWNER_A }).action(read, args);
    expect(file?.title).toBe("Synthetic B2 file");
    expect(new URL(file!.url).hostname).toMatch(/media\.example\.test$/);
    await expect(t.withIdentity({ subject: OWNER_B }).action(read, args)).rejects.toThrow(/owner_mismatch/);
    await expect(t.action(read, args)).rejects.toThrow(/missing_identity/);
  });

  test("unset mode defaults to shadow, refuses an anonymous private read, and persists the denial", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "");
    const t = convexTest(schema, modules);
    await seedPerson(t);

    await expect(t.action(api.vaultReads.getPeopleExplorerPage, {
      vaultOwnerId: OWNER_A, cursor: null,
    })).rejects.toThrow("Trust boundary denied: missing_identity");

    const logs = await t.run((ctx) => ctx.db.query("trustBoundaryShadowLog").collect());
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      functionName: "vault.getPeopleExplorer",
      caller: "<anonymous>",
      callerKind: "anonymous",
      reason: "missing_identity",
    });
  });

  test.each(["shadow", "enforce"])("%s protects private write results and refuses guest transfers to a foreign destination", async (mode) => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", mode);
    const t = convexTest(schema, modules);
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const personId = await seedPerson(t);
      const owner = t.withIdentity({ subject: OWNER_A });
      const other = t.withIdentity({ subject: OWNER_B });
      const personArgs = { vaultOwnerId: OWNER_A, fsId: "SAFE-PUBLIC-1", name: { given: "Mary", surname: "Example" }, sex: "female" as const };
      await expect(owner.mutation(api.vaultMutations.upsertPerson, personArgs)).resolves.toEqual({ personId, created: false });

      const migrationArgs = { toVaultOwnerId: OWNER_A, fromVaultOwnerId: "guest_synthetic" };
      await expect(other.mutation(api.vaultMutations.upsertPerson, personArgs)).rejects.toThrow("Trust boundary denied: owner_mismatch");
      await expect(t.mutation(api.vaultMutations.upsertPerson, personArgs)).rejects.toThrow("Trust boundary denied: missing_identity");
      await expect(other.mutation(api.vaultMigration.migrateGuestVault, migrationArgs)).rejects.toThrow("Trust boundary denied: owner_mismatch");
      await expect(t.mutation(api.vaultMigration.migrateGuestVault, migrationArgs)).rejects.toThrow("Trust boundary denied: missing_identity");
      expect(log).toHaveBeenCalledTimes(mode === "shadow" ? 4 : 0);
      expect(await t.run((ctx) => ctx.db.query("persons").collect())).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  test("enforce mode denies an anonymous private read without touching tenant data", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await seedPerson(t);

    await expect(
      t.action(api.vaultReads.getPeopleExplorerPage, { vaultOwnerId: OWNER_A, cursor: null }),
    ).rejects.toThrow(/missing_identity/);

    const logs = await t.run((ctx) => ctx.db.query("trustBoundaryShadowLog").collect());
    expect(logs).toHaveLength(0);
  });

  test("enforce mode denies an authenticated cross-tenant read", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = convexTest(schema, modules);
    await seedPerson(t);

    await expect(
      t.withIdentity({ subject: OWNER_B }).action(api.vaultReads.getPeopleExplorerPage, {
        vaultOwnerId: OWNER_A, cursor: null,
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

  test("shadow mode records and refuses a foreign-reference call", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "shadow");
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
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

    try {
      await expect(t.withIdentity({ subject: OWNER_A }).mutation(api.vaultMutations.upsertCitation, {
        vaultOwnerId: OWNER_A,
        sourceId: foreignSourceId,
        isEvidence: true,
        confidence: "high",
      })).rejects.toThrow("Trust boundary denied: reference_owner_mismatch");
      expect(log).toHaveBeenCalledWith("Trust boundary shadow denial", expect.objectContaining({
        functionName: "vaultMutations.upsertCitation",
        caller: OWNER_A,
        reason: "reference_owner_mismatch",
      }));
      expect(await t.run((ctx) => ctx.db.query("citations").collect())).toEqual([]);
    } finally {
      log.mockRestore();
    }
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
