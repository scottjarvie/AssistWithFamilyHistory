/**
 * family_history_save_records — the census case.
 *
 * The behaviour that matters: one call, per-item results, in-batch createKey
 * cross-references, and one bad row never discarding a good pass.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_batch_owner_AAAAAAAAAAAA";
const OTHER = "user_batch_owner_BBBBBBBBBBBB";

function principal(subject = OWNER) {
  return {
    issuer: "https://identity.example.test",
    subject,
    clientId: "synthetic-mcp-client",
    scopes: [],
  };
}

function personRow(createKey: string, given: string) {
  return {
    mode: "create" as const,
    createKey,
    name: { given, surname: "Kowalczyk" },
    sex: "unknown" as const,
    living: false,
    researchStatus: "in_progress" as const,
    tags: ["synthetic-batch-proof"],
  };
}

/** One census page: a household of four, related and placed in one call. */
function censusBatch(operationSuffix: string) {
  return {
    summary: "Extracted the 1900 census household on sheet 4.",
    people: [
      personRow(`person:census:${operationSuffix}:head`, "Jan"),
      personRow(`person:census:${operationSuffix}:wife`, "Maria"),
      personRow(`person:census:${operationSuffix}:child`, "Stefan"),
    ],
    relationships: [
      {
        mode: "create" as const,
        createKey: `rel:census:${operationSuffix}:couple`,
        type: "Couple" as const,
        person1CreateKey: `person:census:${operationSuffix}:head`,
        person2CreateKey: `person:census:${operationSuffix}:wife`,
      },
      {
        mode: "create" as const,
        createKey: `rel:census:${operationSuffix}:parent`,
        type: "ParentChild" as const,
        person1CreateKey: `person:census:${operationSuffix}:head`,
        person2CreateKey: `person:census:${operationSuffix}:child`,
      },
    ],
    events: [
      {
        mode: "create" as const,
        createKey: `event:census:${operationSuffix}:residence`,
        type: "census" as const,
        date: { original: "1900" },
        place: { original: "Synthetic Township" },
        personRoles: [
          { personCreateKey: `person:census:${operationSuffix}:head`, role: "primary" as const },
          { personCreateKey: `person:census:${operationSuffix}:wife`, role: "family" as const },
        ],
      },
    ],
  };
}

describe("family_history_save_records", () => {
  test("one census page creates the whole household and resolves in-batch createKeys", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });

    const saved = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(),
      grantId,
      operationId: "batch-census-household",
      requestHash: "hash-census-household",
      input: censusBatch("a"),
    });

    expect(saved.counts).toMatchObject({ created: 6, failed: 0 });
    expect(saved.results.people.map((row: { status: string }) => row.status)).toEqual([
      "created",
      "created",
      "created",
    ]);
    expect(saved.results.relationships).toHaveLength(2);
    expect(saved.provenance).toMatchObject({ clientId: "synthetic-mcp-client", grantId });

    // The relationships really point at the people created in the same call.
    const headId = saved.results.people[0].id;
    const relationships = await t.run(async (ctx) =>
      ctx.db.query("relationships").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(relationships).toHaveLength(2);
    expect(relationships.every((row) => String(row.person1) === headId)).toBe(true);

    const roles = await t.run(async (ctx) =>
      ctx.db.query("personEvents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(roles).toHaveLength(2);
  });

  test("one bad row does not discard the pass, and says what to do about it", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const foreign = await t.run(async (ctx) =>
      ctx.db.insert("persons", {
        vaultOwnerId: OTHER,
        name: { given: "Other", surname: "Vault" },
        sex: "unknown",
        living: false,
        researchStatus: "basic",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const saved = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(),
      grantId,
      operationId: "batch-partial-failure",
      requestHash: "hash-partial-failure",
      input: {
        summary: "One good person, one row that names a person in someone else's vault.",
        people: [personRow("person:partial:good", "Good")],
        relationships: [
          {
            mode: "create",
            createKey: "rel:partial:bad",
            type: "Couple",
            person1CreateKey: "person:partial:good",
            person2: String(foreign),
          },
          {
            mode: "create",
            createKey: "rel:partial:unresolvable",
            type: "Couple",
            person1CreateKey: "person:partial:good",
            person2CreateKey: "person:partial:never-created",
          },
        ],
      },
    });

    expect(saved.counts).toMatchObject({ created: 1, failed: 2 });
    expect(saved.results.people[0].status).toBe("created");
    for (const row of saved.results.relationships) {
      expect(row.status).toBe("failed");
      expect(row.reason).toBeTruthy();
      expect(row.whatToDo).toBeTruthy();
    }
    expect(saved.note).toContain("Some rows did not save");

    // The good row really is in the vault.
    const people = await t.run(async (ctx) =>
      ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(people).toHaveLength(1);
  });

  test("replaying the same operationId is idempotent and creates nothing twice", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const call = {
      principal: principal(),
      grantId,
      operationId: "batch-replay",
      requestHash: "hash-replay",
      input: censusBatch("b"),
    };

    const first = await t.mutation(internal.mcpFamilyHistory.saveRecords, call);
    expect(first.deduplicated).toBe(false);

    const replay = await t.mutation(internal.mcpFamilyHistory.saveRecords, call);
    expect(replay.deduplicated).toBe(true);
    expect(replay.counts).toEqual(first.counts);

    const people = await t.run(async (ctx) =>
      ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(people).toHaveLength(3);

    // A fresh operationId reusing the same createKeys reuses the records too.
    const again = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      ...call,
      operationId: "batch-replay-new-operation",
      requestHash: "hash-replay-new-operation",
    });
    expect(again.counts.created).toBe(0);
    // Every row is recognised as already saved: three people, two relationships,
    // and one event.
    expect(again.counts.skipped).toBe(6);
    const stillThree = await t.run(async (ctx) =>
      ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(stillThree).toHaveLength(3);
  });

  test("a row that fails part-way leaves nothing of itself behind", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });

    const saved = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(),
      grantId,
      operationId: "batch-atomic-rows",
      requestHash: "hash-atomic-rows",
      input: {
        summary: "One good source, one whose content is empty and fails after its source and citation are written.",
        evidence: [
          {
            source: { mode: "create", createKey: "source:atomic:good", title: "Atomic good source", type: "census" },
            citation: { mode: "create", createKey: "citation:atomic:good", confidence: "high" },
          },
          {
            source: { mode: "create", createKey: "source:atomic:bad", title: "Atomic half-saved source", type: "census" },
            citation: { mode: "create", createKey: "citation:atomic:bad", confidence: "high" },
            contents: [{ contentKey: "content:atomic:empty", kind: "transcription", madeBy: { kind: "person" } }],
          },
        ],
      },
    });

    expect(saved.results.evidence.map((row: { status: string }) => row.status)).toEqual(["created", "failed"]);
    expect(saved.results.evidence[1].reason).toMatch(/VALIDATION_ERROR/);
    const sources = await t.run(async (ctx) =>
      ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(sources.map((row) => row.title)).toEqual(["Atomic good source"]);
    const citations = await t.run(async (ctx) => ctx.db.query("citations").collect());
    expect(citations).toHaveLength(1);

    // The failed row's keys were never claimed, so the corrected row saves cleanly.
    const retry = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(),
      grantId,
      operationId: "batch-atomic-rows-retry",
      requestHash: "hash-atomic-rows-retry",
      input: {
        summary: "The corrected row.",
        evidence: [{
          source: { mode: "create", createKey: "source:atomic:bad", title: "Atomic half-saved source", type: "census" },
          citation: { mode: "create", createKey: "citation:atomic:bad", confidence: "high" },
          contents: [{ contentKey: "content:atomic:empty", kind: "transcription", madeBy: { kind: "person" }, text: "Line 4" }],
        }],
      },
    });
    expect(retry.results.evidence[0].status).toBe("created");
  });

  test("a failed update leaves the record at its original version", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const first = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(),
      grantId,
      operationId: "batch-update-seed",
      requestHash: "hash-update-seed",
      input: {
        summary: "Seed one source and citation.",
        evidence: [{
          source: { mode: "create", createKey: "source:update:one", title: "Original title", type: "census" },
          citation: { mode: "create", createKey: "citation:update:one", confidence: "high" },
        }],
      },
    });
    const citationId = first.results.evidence[0].id;
    const source = await t.run(async (ctx) => (await ctx.db.query("sources").collect())[0]);

    const stale = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(),
      grantId,
      operationId: "batch-update-stale",
      requestHash: "hash-update-stale",
      input: {
        summary: "Fresh source update, stale citation update.",
        evidence: [{
          source: { mode: "update", sourceId: String(source._id), expectedUpdatedAt: source.updatedAt, title: "Changed title" },
          citation: { mode: "update", citationId, expectedUpdatedAt: 1, page: "p. 9" },
        }],
      },
    });
    expect(stale.results.evidence[0].status).toBe("failed");
    const after = await t.run(async (ctx) => ctx.db.get(source._id));
    expect(after?.title).toBe("Original title");
    expect(after?.updatedAt).toBe(source.updatedAt);
  });

  test("a citation createKey reused on another source is refused, not attached to the first source", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const person = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(), grantId, operationId: "batch-citation-person", requestHash: "hash-citation-person",
      input: { summary: "One person.", people: [personRow("person:citation:one", "Ada")] },
    });
    const personId = person.results.people[0].id;
    await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(), grantId, operationId: "batch-citation-a", requestHash: "hash-citation-a",
      input: {
        summary: "Source A.",
        evidence: [{
          source: { mode: "create", createKey: "source:citation:a", title: "Source A", type: "census" },
          citation: { mode: "create", createKey: "citation:shared", confidence: "high" },
        }],
      },
    });

    const reused = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(), grantId, operationId: "batch-citation-b", requestHash: "hash-citation-b",
      input: {
        summary: "Source B reusing source A's citation key.",
        evidence: [{
          source: { mode: "create", createKey: "source:citation:b", title: "Source B", type: "census" },
          citation: { mode: "create", createKey: "citation:shared", confidence: "high" },
          links: [{ targetType: "person", targetId: personId }],
        }],
      },
    });
    expect(reused.results.evidence[0].status).toBe("failed");
    expect(reused.results.evidence[0].reason).toMatch(/IDEMPOTENCY_CONFLICT/);
    const links = await t.run(async (ctx) => ctx.db.query("citationLinks").collect());
    expect(links).toHaveLength(0);
    const titles = await t.run(async (ctx) => (await ctx.db.query("sources").collect()).map((row) => row.title));
    expect(titles).toEqual(["Source A"]);

    // The single-source tool refuses it too, and writes nothing.
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal: principal(), grantId, operationId: "single-citation-b", requestHash: "hash-single-citation-b",
      input: {
        source: { mode: "create", createKey: "source:citation:b2", title: "Source B2", type: "census" },
        citation: { mode: "create", createKey: "citation:shared", confidence: "high" },
        links: [{ targetType: "person", targetId: personId }],
      },
    })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    expect(await t.run(async (ctx) => (await ctx.db.query("citationLinks").collect()).length)).toBe(0);

    // Reusing the key on its own source is still an idempotent retry.
    const same = await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(), grantId, operationId: "batch-citation-a-again", requestHash: "hash-citation-a-again",
      input: {
        summary: "Source A again.",
        evidence: [{
          source: { mode: "create", createKey: "source:citation:a", title: "Source A", type: "census" },
          citation: { mode: "create", createKey: "citation:shared", confidence: "high" },
        }],
      },
    });
    expect(same.results.evidence[0].status).toBe("updated");
  });

  test("a batch over its cap is refused before anything is written", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    await expect(
      t.mutation(internal.mcpFamilyHistory.saveRecords, {
        principal: principal(),
        grantId,
        operationId: "batch-over-cap",
        requestHash: "hash-over-cap",
        input: {
          summary: "Too many people for one call.",
          people: Array.from({ length: 51 }, (_, index) => personRow(`person:cap:${index}`, `Person${index}`)),
        },
      }),
    ).rejects.toThrow(/VALIDATION_ERROR/);
    const people = await t.run(async (ctx) =>
      ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    );
    expect(people).toHaveLength(0);
  });
});
