/**
 * Provenance across every MCP write path.
 *
 * The promise this file protects: **a person can always tell which records their
 * AI put there.** Not by joining through an internal mapping table, not by
 * remembering when they turned a connection on — by looking at the record.
 *
 * Before this suite, provenance was asserted in exactly one place
 * (`convex/mcpBatch.test.ts`, the batch receipt) while the vault had roughly a
 * dozen write paths, and `persons` — the record a family history is actually
 * made of — carried no stamp at all. An AI-created person was indistinguishable
 * from a hand-entered one.
 *
 * Every stamp asserted here is **server-derived**. The suite ends by trying to
 * forge each one from the client side and proving it cannot be done.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_provenance_owner_AAAAAAAA";
const CLIENT_ID = "synthetic-provenance-client";
const ISSUER = "https://identity.example.test";

function principal(subject = OWNER) {
  return { issuer: ISSUER, subject, clientId: CLIENT_ID, scopes: [] };
}

function personInput(createKey: string, given: string) {
  return {
    mode: "create",
    createKey,
    name: { given, surname: "Provenance" },
    sex: "unknown",
    living: false,
    researchStatus: "in_progress",
    tags: ["synthetic-provenance-proof"],
  };
}

/** What the server must have derived for every record written in one call. */
function expectedStamp(operationId: string) {
  return {
    actorKind: "chosen_ai",
    actorId: CLIENT_ID,
    method: "mcp",
    evidenceStatus: "unsourced",
    operationId,
  };
}

async function rows(t: ReturnType<typeof convexTest>, table: string) {
  return await t.run(async (ctx) =>
    (ctx.db as unknown as {
      query(name: string): {
        withIndex(index: string, fn: (q: { eq(field: string, value: string): unknown }) => unknown): { collect(): Promise<Record<string, unknown>[]> };
      };
    })
      .query(table)
      .withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER))
      .collect(),
  );
}

describe("every MCP write path stamps where the record came from", () => {
  test("a person saved through MCP carries a server-derived creationProvenance", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

    await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(),
      grantId,
      operationId: "provenance-person",
      requestHash: "hash-provenance-person",
      input: personInput("person:provenance:one", "Agnieszka"),
    });

    const people = await rows(t, "persons");
    expect(people).toHaveLength(1);
    // This is the whole point of the stage: the row itself says an AI made it.
    expect(people[0].creationProvenance).toMatchObject(expectedStamp("provenance-person"));
    expect(typeof (people[0].creationProvenance as { recordedAt: number }).recordedAt).toBe("number");
  });

  test("a relationship saved through MCP carries both its provenance stamp and its mcp: importKey", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

    const one = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), grantId, operationId: "provenance-rel-p1", requestHash: "h1",
      input: personInput("person:provenance:rel-1", "Jozef"),
    });
    const two = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), grantId, operationId: "provenance-rel-p2", requestHash: "h2",
      input: personInput("person:provenance:rel-2", "Halina"),
    });

    await t.mutation(internal.mcpFamilyHistory.saveRelationship, {
      principal: principal(), grantId, operationId: "provenance-relationship", requestHash: "h3",
      input: {
        mode: "create",
        createKey: "relationship:provenance:couple",
        type: "Couple",
        person1: one.person.id,
        person2: two.person.id,
      },
    });

    const relationships = await rows(t, "relationships");
    expect(relationships).toHaveLength(1);
    expect(relationships[0].creationProvenance).toMatchObject(expectedStamp("provenance-relationship"));
    // The pre-existing stamp must survive; this stage adds, it does not replace.
    expect(relationships[0].importKey).toBe("mcp:relationship:provenance:couple");
  });

  test("a research finding carries server provenance, and its model string is only self-reported", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), grantId, operationId: "provenance-finding-person", requestHash: "h1",
      input: personInput("person:provenance:finding", "Wanda"),
    });

    await t.mutation(internal.mcpFamilyHistory.saveResearchWork, {
      principal: principal(), grantId, operationId: "provenance-finding", requestHash: "h2",
      input: {
        task: {
          mode: "create",
          createKey: "task:provenance:one",
          type: "record_search",
          title: "Locate the 1910 sheet",
          status: "todo",
        },
        finding: {
          mode: "create",
          createKey: "finding:provenance:one",
          entityType: "person",
          entityId: person.person.id,
          activityType: "tier3_deep_research",
          status: "done",
          summary: "Synthetic finding for the provenance proof.",
          // A client claiming to be something else. It is kept as a display
          // hint and is emphatically not what identifies the writer.
          model: "definitely-a-human-typing",
        },
      },
    });

    const findings = await rows(t, "researchLog");
    expect(findings).toHaveLength(1);
    expect(findings[0].creationProvenance).toMatchObject(expectedStamp("provenance-finding"));
    // The self-reported string is stored as given, and it disagrees with the
    // server's own answer. The server's answer is the one that counts.
    expect(findings[0].model).toBe("definitely-a-human-typing");
    expect((findings[0].creationProvenance as { actorKind: string }).actorKind).toBe("chosen_ai");

    // The task on the same call keeps its own long-standing server-side stamps.
    const tasks = await rows(t, "researchTasks");
    expect(tasks[0]).toMatchObject({ aiSuggested: true, assignedTo: "chosen_ai_mcp" });
  });

  test("sources, citations, and candidate facts keep their mcp: importKey stamps", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), grantId, operationId: "provenance-evidence-person", requestHash: "h1",
      input: personInput("person:provenance:evidence", "Eliza"),
    });

    await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal: principal(), grantId, operationId: "provenance-evidence", requestHash: "h2",
      input: {
        source: {
          mode: "create", createKey: "source:provenance:census", title: "1900 synthetic census",
          type: "census", repository: "Synthetic proof repository",
        },
        citation: {
          mode: "create", createKey: "citation:provenance:line-12", confidence: "high",
          page: "Sheet 4, line 12", extractedText: "Synthetic evidence line.",
        },
        links: [{ targetType: "person", targetId: person.person.id, field: "residence" }],
        facts: [{
          factKey: "fact:provenance:residence", personId: person.person.id,
          factType: "census_residence", label: "1900 residence", value: "Synthetic Township",
          confidence: "high", status: "candidate",
        }],
      },
    });

    expect((await rows(t, "sources"))[0].importKey).toBe("mcp:source:provenance:census");
    expect((await rows(t, "citations"))[0].importKey).toBe("mcp:citation:provenance:line-12");
    // sourceFacts has no `aiSuggested` column; its stamp is the required
    // `mcp:` importKey, plus `status: "candidate"` — an AI proposes, it never
    // accepts a conclusion on the person's behalf.
    expect((await rows(t, "sourceFacts"))[0]).toMatchObject({
      importKey: "mcp:fact:provenance:residence",
      status: "candidate",
    });
  });

  test("an event saved through MCP keeps its mcp: importKey", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), grantId, operationId: "provenance-event-person", requestHash: "h1",
      input: personInput("person:provenance:event", "Stefan"),
    });

    await t.mutation(internal.mcpFamilyHistory.saveEvent, {
      principal: principal(), grantId, operationId: "provenance-event", requestHash: "h2",
      input: {
        mode: "create", createKey: "event:provenance:residence", type: "residence",
        date: { original: "1910" }, place: { original: "Synthetic Township" },
        personRoles: [{ personId: person.person.id, role: "primary" }],
      },
    });

    expect((await rows(t, "events"))[0].importKey).toBe("mcp:event:provenance:residence");
  });

  test("a story drafted through MCP is marked generatedBy ai", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), grantId, operationId: "provenance-story-person", requestHash: "h1",
      input: personInput("person:provenance:story", "Mara"),
    });

    await t.mutation(internal.mcpFamilyHistory.saveStoryWork, {
      principal: principal(), grantId, operationId: "provenance-story", requestHash: "h2",
      input: {
        mode: "create", createKey: "story:provenance:one", personId: person.person.id,
        type: "biography", title: "A synthetic draft", content: "Synthetic private draft.", status: "draft",
      },
    });

    expect((await rows(t, "stories"))[0].generatedBy).toBe("ai");
  });

  test("a batch save stamps every person and relationship it creates, under one operation id", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

    await t.mutation(internal.mcpFamilyHistory.saveRecords, {
      principal: principal(), grantId, operationId: "provenance-batch", requestHash: "h1",
      input: {
        summary: "One synthetic household in one pass.",
        people: [
          personInput("person:provenance:batch-head", "Jan"),
          personInput("person:provenance:batch-wife", "Maria"),
        ],
        relationships: [{
          mode: "create",
          createKey: "relationship:provenance:batch-couple",
          type: "Couple",
          person1CreateKey: "person:provenance:batch-head",
          person2CreateKey: "person:provenance:batch-wife",
        }],
      },
    });

    const people = await rows(t, "persons");
    expect(people).toHaveLength(2);
    // Not "at least one" — every row. A batch that stamps only its first record
    // is a batch that hides the rest.
    for (const person of people) {
      expect(person.creationProvenance).toMatchObject(expectedStamp("provenance-batch"));
    }
    const relationships = await rows(t, "relationships");
    expect(relationships).toHaveLength(1);
    expect(relationships[0].creationProvenance).toMatchObject(expectedStamp("provenance-batch"));
  });

  test("a complete-result save stamps the person it creates alongside its story and finding", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

    await t.mutation(internal.mcpFamilyHistory.saveCompleteResult, {
      principal: principal(), grantId, operationId: "provenance-complete", requestHash: "h1",
      input: {
        summary: "One synthetic all-or-nothing pass.",
        person: personInput("person:provenance:complete", "Zofia"),
        research: {
          finding: {
            mode: "create", createKey: "finding:provenance:complete", entityType: "other",
            activityType: "tier3_deep_research", status: "done",
            summary: "Synthetic complete-result finding.",
          },
        },
      },
    });

    expect((await rows(t, "persons"))[0].creationProvenance).toMatchObject(expectedStamp("provenance-complete"));
    expect((await rows(t, "researchLog"))[0].creationProvenance).toMatchObject(expectedStamp("provenance-complete"));
  });

  /**
   * The stamp is only worth something if the party being stamped cannot write
   * it. These are the forgery attempts.
   */
  describe("a client cannot forge its own provenance", () => {
    test("creationProvenance sent in the tool arguments is ignored entirely", async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

      await t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: principal(), grantId, operationId: "provenance-forgery", requestHash: "h1",
        input: {
          ...personInput("person:provenance:forgery", "Forged"),
          // An AI trying to pass its work off as the person's own hand entry.
          creationProvenance: {
            actorKind: "user",
            actorId: OWNER,
            method: "manual_first_start",
            evidenceStatus: "source_linked",
            operationId: "not-the-real-operation",
            recordedAt: 0,
          },
          creationRole: "starting_person",
        },
      });

      const person = (await rows(t, "persons"))[0];
      expect(person.creationProvenance).toMatchObject(expectedStamp("provenance-forgery"));
      expect((person.creationProvenance as { actorKind: string }).actorKind).not.toBe("user");
      expect((person.creationProvenance as { method: string }).method).toBe("mcp");
      expect((person.creationProvenance as { operationId: string }).operationId).not.toBe("not-the-real-operation");
      expect((person.creationProvenance as { recordedAt: number }).recordedAt).toBeGreaterThan(0);
    });

    test("actorId is the verified OAuth client, not anything the arguments claim", async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

      await t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: principal(), grantId, operationId: "provenance-actor", requestHash: "h1",
        input: { ...personInput("person:provenance:actor", "Actor"), actorId: "some-other-client" },
      });

      expect((await rows(t, "persons"))[0].creationProvenance).toMatchObject({ actorId: CLIENT_ID });
    });

    test("a correction cannot rewrite who first created the record", async () => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });

      const created = await t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: principal(), grantId, operationId: "provenance-immutable-create", requestHash: "h1",
        input: personInput("person:provenance:immutable", "Immutable"),
      });

      await t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: principal(), grantId, operationId: "provenance-immutable-update", requestHash: "h2",
        input: {
          mode: "update",
          personId: created.person.id,
          expectedUpdatedAt: created.person.updatedAt,
          researchStatus: "complete",
          creationProvenance: { actorKind: "user", actorId: OWNER, method: "legacy", evidenceStatus: "source_linked", operationId: "x", recordedAt: 1 },
        },
      });

      const person = (await rows(t, "persons"))[0];
      expect(person.researchStatus).toBe("complete");
      // Origin is history. A later write may change the record; it may not
      // change where the record came from.
      expect(person.creationProvenance).toMatchObject(expectedStamp("provenance-immutable-create"));
    });
  });
});
