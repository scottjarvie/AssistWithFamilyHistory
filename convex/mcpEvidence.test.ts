/**
 * family_history_get_evidence gating.
 *
 * Nothing leaves the vault unless the person reviewed it, allowed AI use, and
 * its rights are not restricted — and it is inside the approved boundary. A
 * skipped item always says why and what to do instead.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { FAMILY_HISTORY_MCP_LIMITS } from "../lib/mcp/contract";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_evidence_owner_AAAAAAAAAA";
const OTHER = "user_evidence_owner_BBBBBBBBBB";

function principal(subject = OWNER) {
  return {
    issuer: "https://identity.example.test",
    subject,
    clientId: "synthetic-mcp-client",
    scopes: [],
  };
}

async function seedPerson(t: ReturnType<typeof convexTest>, owner: string, living = false) {
  return await t.run(async (ctx) =>
    ctx.db.insert("persons", {
      vaultOwnerId: owner,
      name: { given: "Evidence", surname: "Subject" },
      sex: "unknown",
      living,
      researchStatus: "basic",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function seedMedia(
  t: ReturnType<typeof convexTest>,
  owner: string,
  personIds: unknown[],
  overrides: Record<string, unknown>,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("media", {
      vaultOwnerId: owner,
      type: "photo",
      title: "Synthetic census scan",
      personIds: personIds as never,
      url: "https://media.example.test/scan.jpg",
      mimeType: "image/jpeg",
      reviewStatus: "reviewed",
      aiUseAllowed: true,
      rightsStatus: "owned",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    }),
  );
}

async function batch(
  t: ReturnType<typeof convexTest>,
  grantId: string,
  items: Array<{ kind: "media" | "document"; id: string }>,
  subject = OWNER,
) {
  return await t.query(internal.mcpEvidence.getEvidenceBatch, {
    principal: principal(subject),
    grantId,
    items,
  });
}

describe("evidence gating", () => {
  test("unreviewed, not-AI-allowed, and rights-restricted items all skip with a reason", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const person = await seedPerson(t, OWNER);

    const unreviewed = await seedMedia(t, OWNER, [person], { reviewStatus: "unreviewed" });
    const notAllowed = await seedMedia(t, OWNER, [person], { aiUseAllowed: false });
    const restricted = await seedMedia(t, OWNER, [person], { rightsStatus: "restricted" });

    const result = await batch(t, grantId, [
      { kind: "media", id: String(unreviewed) },
      { kind: "media", id: String(notAllowed) },
      { kind: "media", id: String(restricted) },
    ]);

    expect(result.delivered).toHaveLength(0);
    expect(result.fetchable).toHaveLength(0);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      "NOT_REVIEWED",
      "AI_USE_NOT_ALLOWED",
      "RIGHTS_RESTRICTED",
    ]);
    for (const row of result.skipped) expect(row.whatToDo.length).toBeGreaterThan(20);
  });

  test("a reviewed, allowed item with a fetchable URL is offered for protected delivery, never as a link", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const person = await seedPerson(t, OWNER);
    const allowed = await seedMedia(t, OWNER, [person], {});

    const result = await batch(t, grantId, [{ kind: "media", id: String(allowed) }]);
    expect(result.fetchable).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    // The URL exists only inside the server, for the transport to fetch. The
    // model-facing shape the transport builds never contains it.
    expect(result.fetchable[0].url).toContain("https://");
  });

  test("a media row with no fetchable bytes is honest about it instead of pretending", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const person = await seedPerson(t, OWNER);
    const referenceOnly = await seedMedia(t, OWNER, [person], {
      url: undefined,
      filePath: "people/synthetic/scan.jpg",
    });

    const result = await batch(t, grantId, [{ kind: "media", id: String(referenceOnly) }]);
    expect(result.skipped[0]).toMatchObject({ reason: "BYTES_NOT_AVAILABLE" });
    expect(result.skipped[0].whatToDo).toContain("not reachable");
  });

  test("person documents come back as real text, and living-person documents do not", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const deceased = await seedPerson(t, OWNER, false);
    const living = await seedPerson(t, OWNER, true);

    const openDoc = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        vaultOwnerId: OWNER,
        personId: String(deceased),
        type: "PS",
        title: "Person sheet",
        contentMarkdown: "# Person sheet\n\nSynthetic research notes.",
        contentText: "Person sheet",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const livingDoc = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        vaultOwnerId: OWNER,
        personId: String(living),
        type: "PS",
        title: "Living person sheet",
        contentMarkdown: "# Living\n\nPrivate.",
        contentText: "Living",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await batch(t, grantId, [
      { kind: "document", id: String(openDoc) },
      { kind: "document", id: String(livingDoc) },
    ]);
    expect(result.delivered).toHaveLength(1);
    expect(result.delivered[0].text).toContain("Synthetic research notes");
    expect(result.skipped).toEqual([
      expect.objectContaining({ reason: "AI_USE_NOT_ALLOWED" }),
    ]);
  });

  test("oversize text skips rather than blowing the delivery budget", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const person = await seedPerson(t, OWNER);
    const huge = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        vaultOwnerId: OWNER,
        personId: String(person),
        type: "CST",
        title: "Enormous sheet",
        contentMarkdown: "x".repeat(FAMILY_HISTORY_MCP_LIMITS.evidencePerItemBytes + 10),
        contentText: "x",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const result = await batch(t, grantId, [{ kind: "document", id: String(huge) }]);
    expect(result.delivered).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("TOO_LARGE");
  });
});

describe("evidence respects the grant", () => {
  test("a selected-people boundary refuses evidence attached to another person", async () => {
    const t = convexTest(schema, modules);
    const inside = await seedPerson(t, OWNER);
    const outside = await seedPerson(t, OWNER);
    const grantId = await seedGrant(t, {
      vaultOwnerId: OWNER,
      boundary: { kind: "selected_people", personIds: [String(inside)] },
    });
    const insideMedia = await seedMedia(t, OWNER, [inside], {});
    const outsideMedia = await seedMedia(t, OWNER, [outside], {});

    const result = await batch(t, grantId, [
      { kind: "media", id: String(insideMedia) },
      { kind: "media", id: String(outsideMedia) },
    ]);
    expect(result.fetchable).toHaveLength(1);
    expect(result.fetchable[0].id).toBe(String(insideMedia));
    expect(result.skipped[0].reason).toBe("OUTSIDE_GRANT_BOUNDARY");
  });

  test("another owner's evidence and an invented id are indistinguishable", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const foreignPerson = await seedPerson(t, OTHER);
    const foreignMedia = await seedMedia(t, OTHER, [foreignPerson], {});

    const result = await batch(t, grantId, [
      { kind: "media", id: String(foreignMedia) },
      { kind: "media", id: "kn700000000000000000000000000" },
    ]);
    expect(result.delivered).toHaveLength(0);
    expect(result.fetchable).toHaveLength(0);
    expect(result.skipped[0].reason).toBe(result.skipped[1].reason);
    expect(result.skipped[0].whatToDo).toBe(result.skipped[1].whatToDo);
  });

  test("a grant without evidence:read cannot call the tool at all", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, {
      vaultOwnerId: OWNER,
      scopes: ["family_history:context:read"],
    });
    const person = await seedPerson(t, OWNER);
    const media = await seedMedia(t, OWNER, [person], {});
    await expect(batch(t, grantId, [{ kind: "media", id: String(media) }])).rejects.toThrow(
      /SCOPE_NOT_GRANTED/,
    );
  });
});
