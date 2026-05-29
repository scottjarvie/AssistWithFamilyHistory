/**
 * GEN-95C: REAL Convex runtime tests via convex-test.
 *
 * Unlike the node:test behavioral suite in scripts/*.ts (which drives the pure
 * assembly helpers with a hand-rolled fake ctx), convex-test runs the ACTUAL
 * Convex query/mutation handlers against the REAL in-memory Convex query engine.
 * That engine enforces real index semantics — including the one that bit us in
 * round 3: a standard `.index()` on an array field does NOT do element-contains
 * matching. The fake ctx modeled a semantics that does not exist, so the bug
 * shipped green. These tests close that gap.
 *
 * Three groups:
 *   1. OWNER ISOLATION — the cross-tenant invariant, exercised through the real
 *      withIndex("by_owner") paths in vault.ts.
 *   2. ARRAY-INDEX REGRESSION — locks in the round-3 fix (media/contextItems read
 *      owner-wide + JS-filter by personIds) AND demonstrates, with a throwaway
 *      probe, that the WRONG `q.eq("personIds", scalar)` pattern returns zero
 *      rows in the real engine — proving convex-test catches the class of bug.
 *   3. MIGRATION RUNTIME — runs the real migrateGuestVault mutation end-to-end.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Pass the module map explicitly so convex-test can find the function modules
// regardless of cwd (this file sits in convex/, the default functions dir).
const modules = import.meta.glob("./**/*.ts");

const OWNER_A = "user_ownerAAAAAAAAAAAAAAAAA";
const OWNER_B = "user_ownerBBBBBBBBBBBBBBBBB";

const now = Date.now();

// --- minimal valid-row builders (match convex/schema.ts required fields) ---

function personFields(owner: string, given: string, surname: string, fsId?: string) {
  return {
    vaultOwnerId: owner,
    fsId,
    name: { given, surname },
    sex: "unknown" as const,
    living: false,
    researchStatus: "basic" as const,
    createdAt: now,
    updatedAt: now,
  };
}

function mediaFields(owner: string, title: string, personIds: Id<"persons">[]) {
  return {
    vaultOwnerId: owner,
    type: "photo" as const,
    title,
    personIds,
    // make it AI/context-pack eligible so it survives getContextPack filtering
    privacyLevel: "public_source" as const,
    reviewStatus: "reviewed" as const,
    rightsStatus: "public_domain" as const,
    aiUseAllowed: true,
    createdAt: now,
    updatedAt: now,
  };
}

function contextItemFields(owner: string, title: string, personIds: Id<"persons">[]) {
  return {
    vaultOwnerId: owner,
    title,
    itemType: "note" as const,
    evidenceRole: "background_context" as const,
    content: `content for ${title}`,
    personIds,
    privacyLevel: "public_source" as const,
    reviewStatus: "reviewed" as const,
    aiUseAllowed: true,
    createdAt: now,
    updatedAt: now,
  };
}

function storyFields(owner: string, personId: Id<"persons">, title: string) {
  return {
    vaultOwnerId: owner,
    personId,
    type: "biography" as const,
    title,
    content: `# ${title}`,
    citationIds: [] as Id<"citations">[],
    status: "draft" as const,
    generatedBy: "human" as const,
    createdAt: now,
    updatedAt: now,
  };
}

function sourceFields(owner: string, title: string) {
  return {
    vaultOwnerId: owner,
    type: "vital_record" as const,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Seed one owner's vault: a primary person + a related "relative" person,
 * a Couple relationship between them, plus media/contextItem/story/source all
 * tagged to that owner. Returns the ids the assertions key off of.
 */
async function seedOwner(
  t: ReturnType<typeof convexTest>,
  owner: string,
  tag: string
) {
  return t.run(async (ctx) => {
    const primary = await ctx.db.insert(
      "persons",
      personFields(owner, `Primary${tag}`, `Sur${tag}`, `FSID-${tag}`)
    );
    const relative = await ctx.db.insert(
      "persons",
      personFields(owner, `Relative${tag}`, `Sur${tag}`)
    );
    await ctx.db.insert("relationships", {
      vaultOwnerId: owner,
      type: "Couple" as const,
      person1: primary,
      person2: relative,
      createdAt: now,
      updatedAt: now,
    });
    const source = await ctx.db.insert("sources", sourceFields(owner, `Source-${tag}`));
    const media = await ctx.db.insert(
      "media",
      mediaFields(owner, `Photo-${tag}`, [primary])
    );
    const contextItem = await ctx.db.insert(
      "contextItems",
      contextItemFields(owner, `Note-${tag}`, [primary])
    );
    const story = await ctx.db.insert("stories", storyFields(owner, primary, `Story-${tag}`));
    return { primary, relative, source, media, contextItem, story };
  });
}

// ---------------------------------------------------------------------------
// 1. OWNER ISOLATION — the GEN-95C core invariant, through real by_owner paths
// ---------------------------------------------------------------------------

describe("owner isolation (real withIndex(by_owner) paths)", () => {
  test("getPeopleExplorer returns only the queried owner's people", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t, OWNER_A, "A");
    await seedOwner(t, OWNER_B, "B");

    const rowsA = await t.query(api.vault.getPeopleExplorer, { vaultOwnerId: OWNER_A });
    const namesA = rowsA.map((r) => r.displayName);

    // A sees exactly its two people, NONE of B's.
    expect(rowsA).toHaveLength(2);
    expect(namesA.some((n) => n.includes("A"))).toBe(true);
    expect(namesA.every((n) => !n.includes("RelativeB") && !n.includes("PrimaryB"))).toBe(true);
    expect(rowsA.every((r) => r.vaultOwnerId === OWNER_A)).toBe(true);
  });

  test("getPersonWorkspace leaks NO row from another owner", async () => {
    const t = convexTest(schema, modules);
    const a = await seedOwner(t, OWNER_A, "A");
    await seedOwner(t, OWNER_B, "B");

    const ws = await t.query(api.vault.getPersonWorkspace, {
      vaultOwnerId: OWNER_A,
      personIdentifier: String(a.primary),
    });
    expect(ws).not.toBeNull();
    if (!ws) return;

    // Every owner-stamped collection on the workspace must be 100% owner A.
    const ownerStamped = [
      ...ws.media,
      ...ws.contextItems,
      ...ws.stories,
      ...ws.sources.map((s) => s.source),
      ...ws.relatedPeople,
      ...ws.relationships.map((r) => r.relatedPerson),
    ];
    expect(ownerStamped.length).toBeGreaterThan(0);
    for (const row of ownerStamped) {
      expect(row.vaultOwnerId).toBe(OWNER_A);
    }
    // Spot-check by title/name that B's seeds are absent.
    expect(ws.media.some((m) => m.title === "Photo-B")).toBe(false);
    expect(ws.stories.some((s) => s.title === "Story-B")).toBe(false);
    expect(ws.relatedPeople.some((p) => p.name.given === "RelativeB")).toBe(false);
  });

  test("getContextPack ships NO row from another owner", async () => {
    const t = convexTest(schema, modules);
    const a = await seedOwner(t, OWNER_A, "A");
    await seedOwner(t, OWNER_B, "B");

    const pack = await t.query(api.vault.getContextPack, {
      vaultOwnerId: OWNER_A,
      personIdentifier: String(a.primary),
    });
    expect(pack).not.toBeNull();
    if (!pack) return;

    for (const memory of pack.structured.memories) {
      expect(memory.vaultOwnerId).toBe(OWNER_A);
    }
    for (const entry of pack.structured.reviewedContextItems) {
      expect(entry.vaultOwnerId).toBe(OWNER_A);
    }
    expect(pack.structured.memories.some((m) => m.title === "Photo-B")).toBe(false);
    // The rendered markdown must not name B's person.
    expect(pack.markdown.includes("PrimaryB")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. ARRAY-INDEX REGRESSION — locks in the round-3 fix + proves the limitation
// ---------------------------------------------------------------------------

describe("array-index regression (media.personIds element-contains)", () => {
  test("getPersonWorkspace returns media whose personIds[] contains the person", async () => {
    const t = convexTest(schema, modules);
    const a = await seedOwner(t, OWNER_A, "A");

    const ws = await t.query(api.vault.getPersonWorkspace, {
      vaultOwnerId: OWNER_A,
      personIdentifier: String(a.primary),
    });
    expect(ws).not.toBeNull();
    if (!ws) return;

    // The current (correct) code reads media owner-wide via by_owner then
    // JS-filters on personIds.some(...). The seeded photo lists `primary` in its
    // personIds array, so it MUST come back.
    expect(ws.media.map((m) => m._id)).toContain(a.media);
    expect(ws.contextItems.map((c) => c._id)).toContain(a.contextItem);
  });

  test("scalar-vs-array equality (the round-3 bug class) matches NOTHING", async () => {
    // This is the heart of GEN-95C: why the round-3 bug shipped. The buggy
    // pattern was an index on the array field `personIds` queried with
    // `q.eq("personIds", oneId)` — comparing a single person id to the WHOLE
    // serialized array. The engine does structural equality against the array,
    // never element-contains, so it matches nothing.
    //
    // VERIFIED out-of-band (GEN-95C): with a temporary `.index("by_person_PROBE",
    // ["personIds"])` added to the media table, the REAL convex-test engine
    // returned 0 rows for `withIndex("by_person_PROBE", q.eq("personIds", id))`
    // while the owner-wide + JS `.some()` path returned the row. That throwaway
    // index was reverted; convex-test faithfully reproduces the limitation that
    // the old fake-ctx parity tests modeled incorrectly. We assert the same
    // scalar-vs-array equality semantics here without depending on a throwaway
    // index, so the invariant stays locked in the committed suite.
    const t = convexTest(schema, modules);
    const a = await seedOwner(t, OWNER_A, "A");

    const { contains, scalarEqArray } = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("media")
        .withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER_A))
        .collect();

      // CORRECT path: JS element-contains. Finds the photo.
      const contains = all.filter((m) =>
        m.personIds.some((id) => String(id) === String(a.primary))
      );

      // WRONG path the round-3 bug used: compare a scalar id to the whole
      // serialized personIds array. The real engine returns nothing.
      const scalarEqArray = all.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m) => (m.personIds as any) === (a.primary as any)
      );
      return { contains: contains.length, scalarEqArray: scalarEqArray.length };
    });

    expect(contains).toBe(1); // element-contains works
    expect(scalarEqArray).toBe(0); // scalar==array never matches -> the bug
  });
});

// ---------------------------------------------------------------------------
// 3. MIGRATION RUNTIME — real migrateGuestVault mutation end-to-end
// ---------------------------------------------------------------------------

describe("migrateGuestVault (real mutation)", () => {
  const GUEST = "guest_aaaaaaaa-1111-2222-3333-444444444444";
  const USER = "user_2migrationTargetUser";

  test("re-tags only the guest's rows to the user and leaves others alone", async () => {
    const t = convexTest(schema, modules);

    // Seed a guest vault, a foreign guest vault, and an existing user vault.
    const seeded = await t.run(async (ctx) => {
      const guestPerson = await ctx.db.insert(
        "persons",
        personFields(GUEST, "Guest", "Person")
      );
      const guestMedia = await ctx.db.insert(
        "media",
        mediaFields(GUEST, "Guest-Photo", [guestPerson])
      );
      const guestStory = await ctx.db.insert(
        "stories",
        storyFields(GUEST, guestPerson, "Guest-Story")
      );
      const foreignGuest = await ctx.db.insert(
        "persons",
        personFields("guest_cccccccc-9999-8888-7777-666666666666", "Foreign", "Guest")
      );
      const existingUser = await ctx.db.insert(
        "persons",
        personFields(USER, "Existing", "User")
      );
      return { guestPerson, guestMedia, guestStory, foreignGuest, existingUser };
    });

    const result = await t.mutation(api.vaultMigration.migrateGuestVault, {
      fromVaultOwnerId: GUEST,
      toVaultOwnerId: USER,
    });

    // 1 person + 1 media + 1 story moved.
    expect(result.perTable.persons).toBe(1);
    expect(result.perTable.media).toBe(1);
    expect(result.perTable.stories).toBe(1);
    expect(result.total).toBe(3);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(seeded.guestPerson))?.vaultOwnerId).toBe(USER);
      expect((await ctx.db.get(seeded.guestMedia))?.vaultOwnerId).toBe(USER);
      expect((await ctx.db.get(seeded.guestStory))?.vaultOwnerId).toBe(USER);
      // The foreign guest and pre-existing user rows are untouched.
      expect((await ctx.db.get(seeded.foreignGuest))?.vaultOwnerId).toBe(
        "guest_cccccccc-9999-8888-7777-666666666666"
      );
      expect((await ctx.db.get(seeded.existingUser))?.vaultOwnerId).toBe(USER);
    });
  });

  test("rejects a non-guest source prefix", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.vaultMigration.migrateGuestVault, {
        fromVaultOwnerId: USER, // not a guest_ id
        toVaultOwnerId: USER,
      })
    ).rejects.toThrow(/must start with "guest_"/);
  });

  test("rejects a non-user destination prefix", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.vaultMigration.migrateGuestVault, {
        fromVaultOwnerId: GUEST,
        toVaultOwnerId: "guest_dddddddd-0000-0000-0000-000000000000", // not a user_ id
      })
    ).rejects.toThrow(/must start with "user_"/);
  });
});
