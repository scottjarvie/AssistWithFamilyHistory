/// <reference types="vite/client" />
/**
 * The research permission is "proposals only" (lib/mcp/catalog.ts): a
 * connected AI may propose people, facts and corrections, but it cannot accept
 * a conclusion for the person or rewrite a person the owner entered.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_mcp_proposal_AAAAAAAAAAAA";

const principal = {
  issuer: "https://identity.example.test",
  subject: OWNER,
  clientId: "synthetic-mcp-client",
  scopes: ["family_history:read", "family_history:write"],
};

async function ownerEnteredPerson(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("persons", {
      vaultOwnerId: OWNER,
      name: { given: "Owner", surname: "Entered" },
      sex: "female",
      living: true,
      researchStatus: "basic",
      creationProvenance: {
        actorKind: "user",
        actorId: OWNER,
        method: "manual_first_start",
        evidenceStatus: "unsourced",
        operationId: "synthetic-first-start",
        recordedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
  });
}

function evidence(personId: string, status: string, factKey = "fact:proposal:birth") {
  return {
    source: { mode: "create", createKey: `source:${factKey}`, title: "Synthetic parish register", type: "church_record" },
    citation: { mode: "create", createKey: `citation:${factKey}`, confidence: "high", page: "Folio 3" },
    facts: [{ factKey, personId, factType: "birth", label: "Birth", value: "1881", confidence: "high", status }],
  };
}

describe("proposals-only research authority", () => {
  test("an AI cannot save a source fact as accepted, and the refused call saves nothing", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const personId = String(await ownerEnteredPerson(t));
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal, grantId, operationId: "proposal-accepted", requestHash: "hash-accepted",
      input: evidence(personId, "accepted"),
    })).rejects.toThrow(/FORBIDDEN/);
    const rows = await t.run(async (ctx) => ({
      sources: await ctx.db.query("sources").collect(),
      facts: await ctx.db.query("sourceFacts").collect(),
    }));
    expect(rows.sources).toEqual([]);
    expect(rows.facts).toEqual([]);

    const candidate = await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal, grantId, operationId: "proposal-candidate", requestHash: "hash-candidate",
      input: evidence(personId, "candidate"),
    });
    expect(candidate.evidence.factIds).toHaveLength(1);
  });

  test("an AI cannot overwrite a fact the person accepted", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const personId = String(await ownerEnteredPerson(t));
    const saved = await t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal, grantId, operationId: "proposal-first", requestHash: "hash-first",
      input: evidence(personId, "candidate"),
    });
    const factId = saved.evidence.factIds[0] as Id<"sourceFacts">;
    // The person accepts it in Family History.
    await t.run(async (ctx) => ctx.db.patch(factId, { status: "accepted" }));
    await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence, {
      principal, grantId, operationId: "proposal-overwrite", requestHash: "hash-overwrite",
      input: { ...evidence(personId, "rejected"), facts: [{ ...evidence(personId, "rejected").facts[0], value: "1890" }] },
    })).rejects.toThrow(/FORBIDDEN/);
    const fact = await t.run(async (ctx) => ctx.db.get(factId));
    expect(fact).toMatchObject({ status: "accepted", value: "1881" });
  });

  test("an AI cannot rewrite who an owner-entered person is, but can update research fields", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const personId = await ownerEnteredPerson(t);
    const before = await t.run(async (ctx) => ctx.db.get(personId));
    for (const [key, change] of Object.entries({
      name: { name: { given: "Rewritten", surname: "Entered" } },
      living: { living: false },
      birth: { birth: { date: { original: "1881" } } },
      sex: { sex: "male" },
    })) {
      await expect(t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal, grantId, operationId: `proposal-person-${key}`, requestHash: `hash-person-${key}`,
        input: { mode: "update", personId: String(personId), expectedUpdatedAt: before!.updatedAt, ...change },
      })).rejects.toThrow(/FORBIDDEN/);
    }
    const unchanged = await t.run(async (ctx) => ctx.db.get(personId));
    expect(unchanged).toMatchObject({ name: { given: "Owner", surname: "Entered" }, living: true, sex: "female" });

    const research = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal, grantId, operationId: "proposal-person-research", requestHash: "hash-person-research",
      input: { mode: "update", personId: String(personId), expectedUpdatedAt: before!.updatedAt, researchStatus: "in_progress", notes: "Check the 1881 register." },
    });
    expect(research.person).toMatchObject({ created: false });
    expect(await t.run(async (ctx) => ctx.db.get(personId))).toMatchObject({ researchStatus: "in_progress", name: { given: "Owner" } });
  });

  test("an AI can still correct a person it created itself", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const created = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal, grantId, operationId: "proposal-ai-create", requestHash: "hash-ai-create",
      input: { mode: "create", createKey: "person:proposal:ai", name: { given: "Ai", surname: "Made" }, sex: "unknown", living: false },
    });
    const corrected = await t.mutation(internal.mcpFamilyHistory.savePerson, {
      principal, grantId, operationId: "proposal-ai-correct", requestHash: "hash-ai-correct",
      input: { mode: "update", personId: String(created.person.id), expectedUpdatedAt: created.person.updatedAt, name: { given: "Aileen", surname: "Made" } },
    });
    expect(corrected.person).toMatchObject({ created: false });
    expect(await t.run(async (ctx) => ctx.db.get(created.person.id as Id<"persons">))).toMatchObject({ name: { given: "Aileen" } });
  });
});
