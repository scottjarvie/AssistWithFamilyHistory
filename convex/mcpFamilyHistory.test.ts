import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const OWNER_A = "user_mcp_owner_AAAAAAAAAAAA";
const OWNER_B = "user_mcp_owner_BBBBBBBBBBBB";

function principal(subject = OWNER_A) {
  return {
    issuer: "https://identity.example.test",
    subject,
    clientId: "synthetic-mcp-client",
    scopes: ["family_history:read", "family_history:write"],
  };
}

function personInput(createKey: string, given: string, notes?: string) {
  return {
    mode: "create",
    createKey,
    name: { given, surname: "Evidence" },
    sex: "unknown",
    living: true,
    researchStatus: "in_progress",
    notes,
    tags: ["synthetic-mcp-proof"],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("stateless Family History MCP durable operations", () => {
  test("derives tenancy from the verified principal and deduplicates retries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T15:00:00Z"));
    const t = convexTest(schema, modules);
    const input = personInput("person:owner-a:ada", "Ada", "private living-person note");

    const first = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(),
      operationId: "operation-person-ada",
      requestHash: "hash-person-ada",
      input,
    });
    expect(first).toMatchObject({ deduplicated: false, person: { created: true } });

    const replay = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(),
      operationId: "operation-person-ada",
      requestHash: "hash-person-ada",
      input,
    });
    expect(replay).toMatchObject({ deduplicated: true, person: { created: true } });

    await expect(t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(),
      operationId: "operation-person-ada",
      requestHash: "different-hash",
      input: personInput("person:owner-a:other", "Other"),
    })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);

    const ownerABrief = await t.query(internal.mcpFamilyHistory.getBrief, { principal: principal() });
    expect(ownerABrief.recentPeople).toHaveLength(1);
    expect(ownerABrief.recentPeople[0]).toMatchObject({ name: "Ada Evidence", living: true });
    expect(JSON.stringify(ownerABrief)).not.toContain("private living-person note");

    const ownerBBrief = await t.query(internal.mcpFamilyHistory.getBrief, { principal: principal(OWNER_B) });
    expect(ownerBBrief.recentPeople).toEqual([]);

    const search = await t.query(internal.mcpFamilyHistory.search, {
      principal: principal(),
      query: "Ada",
      kinds: ["person"],
    });
    expect(search.results).toHaveLength(1);
  });

  test("rejects stale corrections and cross-vault relationship references", async () => {
    const t = convexTest(schema, modules);
    const ownerAPerson = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), operationId: "operation-person-owner-a", requestHash: "hash-a",
      input: personInput("person:owner-a:one", "Owner A"),
    });
    const ownerBPerson = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(OWNER_B), operationId: "operation-person-owner-b", requestHash: "hash-b",
      input: personInput("person:owner-b:one", "Owner B"),
    });

    await expect(t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), operationId: "operation-stale-update", requestHash: "hash-stale",
      input: {
        mode: "update",
        personId: ownerAPerson.person.id,
        expectedUpdatedAt: ownerAPerson.person.updatedAt - 1,
        researchStatus: "complete",
      },
    })).rejects.toThrow(/STALE_VERSION/);

    await expect(t.mutation(internal.mcpFamilyHistory.saveRelationship, {
      principal: principal(), operationId: "operation-cross-vault", requestHash: "hash-cross-vault",
      input: {
        mode: "create",
        createKey: "relationship:cross-vault",
        type: "ParentChild",
        person1: ownerAPerson.person.id,
        person2: ownerBPerson.person.id,
      },
    })).rejects.toThrow(/NOT_FOUND/);
  });

  test("saves provenance-rich evidence into canonical UI records", async () => {
    const t = convexTest(schema, modules);
    const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), operationId: "operation-evidence-person", requestHash: "hash-evidence-person",
      input: { ...personInput("person:evidence:one", "Eliza"), living: false },
    });

    const evidence = await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal: principal(), operationId: "operation-evidence-save", requestHash: "hash-evidence-save",
      input: {
        source: {
          mode: "create", createKey: "source:1900-census:eliza", title: "1900 United States census",
          type: "census", repository: "Synthetic proof repository",
        },
        citation: {
          mode: "create", createKey: "citation:1900-census:eliza:line-12", confidence: "high",
          page: "Sheet 4, line 12", extractedText: "Synthetic evidence: Eliza appears in the household.",
        },
        links: [{ targetType: "person", targetId: person.person.id, field: "residence" }],
        facts: [{
          factKey: "fact:1900-residence:eliza", personId: person.person.id,
          factType: "census_residence", label: "1900 residence", value: "Synthetic Township",
          confidence: "high", status: "candidate",
        }],
      },
    });
    expect(evidence.evidence).toMatchObject({ sourceCreated: true, citationCreated: true });
    expect(evidence.evidence.linkIds).toHaveLength(1);
    expect(evidence.evidence.factIds).toHaveLength(1);

    const context = await t.query(internal.mcpFamilyHistory.getRecordContext, {
      principal: principal(), kind: "person", id: person.person.id,
    });
    expect(context).toMatchObject({ kind: "person" });
    expect(JSON.stringify(context)).toContain("1900 United States census");
  });

  test("one complete-result call creates research, event, and private story work atomically", async () => {
    const t = convexTest(schema, modules);
    const person = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal: principal(), operationId: "operation-complete-person", requestHash: "hash-complete-person",
      input: { ...personInput("person:complete:one", "Mara"), living: false },
    });

    const completed = await t.mutation(internal.mcpFamilyHistory.saveCompleteResult, {
      principal: principal(), operationId: "operation-complete-result", requestHash: "hash-complete-result",
      input: {
        personId: person.person.id,
        summary: "Saved a synthetic census finding and a cited draft narrative.",
        events: [{
          mode: "create", createKey: "event:complete:residence-1910", type: "residence",
          date: { original: "1910" }, place: { original: "Synthetic Township" },
          personRoles: [{ personId: person.person.id, role: "primary" }],
        }],
        research: {
          finding: {
            mode: "create", createKey: "finding:complete:1910", entityType: "person",
            entityId: person.person.id, activityType: "tier3_deep_research", status: "done",
            summary: "Synthetic census record supports the 1910 residence.",
          },
        },
        stories: [{
          mode: "create", createKey: "story:complete:mara", personId: person.person.id,
          type: "biography", title: "Mara in 1910", content: "A synthetic private draft.", status: "review",
        }],
      },
    });
    expect(completed).toMatchObject({ deduplicated: false, summary: expect.stringContaining("synthetic census") });

    const workspace = await t.query(internal.vault.getPersonWorkspace, {
      vaultOwnerId: OWNER_A,
      personIdentifier: person.person.id,
    });
    expect(workspace?.events).toHaveLength(1);
    expect(workspace?.stories).toHaveLength(1);
    expect(workspace?.stories[0]).toMatchObject({ title: "Mara in 1910", status: "review", generatedBy: "ai" });
    expect(workspace?.researchLog).toHaveLength(1);

    await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork, {
      principal: principal(), operationId: "operation-forbidden-publish", requestHash: "hash-forbidden-publish",
      input: {
        mode: "create", createKey: "story:forbidden:publish", personId: person.person.id,
        type: "biography", title: "Must remain private", content: "Private draft", status: "published",
      },
    })).rejects.toThrow(/FORBIDDEN/);
  });
});
