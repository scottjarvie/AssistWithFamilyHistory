/**
 * Original records first.
 *
 * The behaviour that matters: a record's own words, indexed fields and the
 * people exactly as it names them are stored verbatim and attributed; an AI's
 * reading sits beside them, never over them; places nest down to a building;
 * religions and ceremonies are topics; and every link an AI proposes stays
 * proposed.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { seedGrant } from "../lib/mcp/testSupport";
import { decideToolAccess } from "../lib/mcp/authorize";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_original_owner_AAAAAAAAAA";
const OTHER = "user_original_owner_BBBBBBBBBB";

function principal(subject = OWNER) {
  return {
    issuer: "https://identity.example.test",
    subject,
    clientId: "synthetic-mcp-client",
    scopes: [],
  };
}

/** A synthetic 1871 baptism entry, saved the way a careful AI would. */
function baptismPass() {
  return {
    summary: "Saved the synthetic 1871 baptism entry with its original wording.",
    places: [
      { mode: "create" as const, createKey: "place:synthland", name: "Synthland", type: "country" as const },
      { mode: "create" as const, createKey: "place:north-shire", name: "North Shire", type: "county" as const, parentCreateKey: "place:synthland" },
      { mode: "create" as const, createKey: "place:millbrook", name: "Millbrook", type: "parish" as const, parentCreateKey: "place:north-shire",
        alternateNames: [{ name: "Milbrooke", endYear: 1800, note: "Older spelling in the register" }] },
      { mode: "create" as const, createKey: "place:st-test-church", name: "St Test's Church", type: "church" as const, parentCreateKey: "place:millbrook" },
    ],
    topics: [
      { mode: "create" as const, createKey: "topic:synthetic-chapel", name: "Synthetic Chapel movement", kind: "religion" as const,
        description: "A synthetic religious community used only in tests.", placeCreateKeys: ["place:millbrook"] },
    ],
    people: [
      { mode: "create" as const, createKey: "person:ada", name: { given: "Ada", surname: "Testwell" }, sex: "female" as const, living: false,
        birth: { date: { original: "3 Mar 1871" }, place: { original: "Millbrook", placeCreateKey: "place:millbrook" } } },
      { mode: "create" as const, createKey: "person:tom", name: { given: "Thomas", surname: "Testwell" }, sex: "male" as const, living: false },
    ],
    events: [
      { mode: "create" as const, createKey: "event:ada-baptism", type: "baptism" as const, date: { original: "12 Mar 1871" },
        place: { original: "St Test's Church, Millbrook", placeCreateKey: "place:st-test-church" },
        personRoles: [{ personCreateKey: "person:ada", role: "primary" as const }, { personCreateKey: "person:tom", role: "family" as const }] },
    ],
    evidence: [
      {
        source: {
          mode: "create" as const,
          createKey: "source:millbrook-baptisms-1871",
          title: "Millbrook parish baptisms, 1871, entry 41",
          type: "church_record" as const,
          recordDate: "12 March 1871",
          recordPlace: { original: "Millbrook", placeCreateKey: "place:millbrook" },
          language: "en",
          citationText: "Synthetic Archive, Millbrook baptisms 1871, p. 6, entry 41.",
          externalIds: [{ system: "synthetic-archive", id: "MB-1871-41" }],
        },
        citation: { mode: "create" as const, createKey: "citation:millbrook-41", page: "p. 6, entry 41", confidence: "high" as const },
        contents: [
          { contentKey: "content:millbrook-41:indexed", kind: "indexed_fields" as const, madeBy: { kind: "indexer" as const, name: "Synthetic Archive indexers" },
            fields: [
              { label: "Child", value: "Ada Testwell", personaKey: "child" },
              { label: "Father", value: "Thos. Testwell", personaKey: "father" },
              { label: "Father's occupation", value: "Miller", personaKey: "father" },
            ] },
          { contentKey: "content:millbrook-41:transcription", kind: "transcription" as const, madeBy: { kind: "chosen_ai" as const, name: "Synthetic AI" },
            text: "No. 41. March 12th. Ada dau. of Thos. & Mary Testwell, Millbrook, Miller. Born 3rd March." },
          { contentKey: "content:millbrook-41:reading", kind: "ai_reading" as const, madeBy: { kind: "chosen_ai" as const, name: "Synthetic AI" },
            text: "My reading: Ada was baptised nine days after birth, which suggests the family attended regularly." },
        ],
        personas: [
          { personaKey: "child", nameAsWritten: "Ada", role: "Child", fields: [{ label: "Born", value: "3rd March" }], personCreateKey: "person:ada", linkReason: "Same name, date and parish." },
          { personaKey: "father", nameAsWritten: "Thos. Testwell", role: "Father", fields: [{ label: "Occupation", value: "Miller" }], personCreateKey: "person:tom" },
          { personaKey: "mother", nameAsWritten: "Mary Testwell", role: "Mother", fields: [] },
        ],
        facts: [
          { factKey: "fact:ada-birth-41", personCreateKey: "person:ada", factType: "birth" as const, label: "Birth", value: "3 March 1871",
            confidence: "medium" as const, originalText: "Born 3rd March.", informationKind: "secondary" as const, personaKey: "child" },
        ],
      },
    ],
    connections: [
      { createKey: "conn:tom-practiced-chapel", from: { kind: "person" as const, createKey: "person:tom" }, to: { kind: "topic" as const, createKey: "topic:synthetic-chapel" },
        relation: "practiced" as const, reason: "Baptised his daughter in the chapel's parish." },
      { createKey: "conn:source-about-church", from: { kind: "source" as const, createKey: "source:millbrook-baptisms-1871" }, to: { kind: "place" as const, createKey: "place:st-test-church" },
        relation: "about" as const },
    ],
  };
}

async function savePass(t: ReturnType<typeof convexTest>, grantId: string, operationId = "original-baptism-pass") {
  return await t.mutation(internal.mcpFamilyHistory.saveRecords, {
    principal: principal(),
    grantId,
    operationId,
    requestHash: `hash-${operationId}`,
    input: baptismPass(),
  });
}

describe("original records", () => {
  test("one pass stores the original, the people as named, nested places, a topic and proposed links", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const saved = await savePass(t, grantId);

    expect(saved.counts.failed).toBe(0);
    expect(saved.results.places.map((row: { status: string }) => row.status)).toEqual(["created", "created", "created", "created"]);
    expect(saved.results.connections.map((row: { status: string }) => row.status)).toEqual(["created", "created"]);

    const rows = await t.run(async (ctx) => ({
      places: await ctx.db.query("places").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      contents: await ctx.db.query("sourceContents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      personas: await ctx.db.query("recordPersonas").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      facts: await ctx.db.query("sourceFacts").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      events: await ctx.db.query("events").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      persons: await ctx.db.query("persons").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      sources: await ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      connections: await ctx.db.query("connections").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
      topics: await ctx.db.query("topics").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect(),
    }));

    const church = rows.places.find((row) => row.type === "church")!;
    const parish = rows.places.find((row) => row.type === "parish")!;
    expect(church.parentId).toBe(parish._id);
    expect(church.fullName).toBe("St Test's Church, Millbrook, North Shire, Synthland");
    expect(church.creationProvenance?.actorKind).toBe("chosen_ai");

    // placeCreateKey became a real place id everywhere, and never got stored.
    expect(rows.events[0].place).toEqual({ original: "St Test's Church, Millbrook", placeId: church._id });
    expect(rows.persons.find((row) => row.name.given === "Ada")!.birth?.place?.placeId).toBe(parish._id);
    expect(rows.sources[0].recordPlace).toEqual({ original: "Millbrook", placeId: parish._id });
    expect(rows.sources[0].citationText).toContain("entry 41");

    // The original wording and the AI's reading are separate, attributed rows.
    expect(rows.contents.map((row) => row.kind).sort()).toEqual(["ai_reading", "indexed_fields", "transcription"]);
    expect(rows.contents.find((row) => row.kind === "transcription")!.text).toContain("Ada dau. of Thos. & Mary Testwell");
    expect(rows.contents.find((row) => row.kind === "indexed_fields")!.madeBy).toEqual({ kind: "indexer", name: "Synthetic Archive indexers" });

    // People as the record names them; links to researched people are proposals.
    const father = rows.personas.find((row) => row.personaKey === "father")!;
    expect(father.nameAsWritten).toBe("Thos. Testwell");
    expect(father.linkState).toBe("proposed");
    expect(rows.personas.find((row) => row.personaKey === "mother")!.personId).toBeUndefined();

    // The claim quotes its source and points at the persona it was read from.
    const child = rows.personas.find((row) => row.personaKey === "child")!;
    expect(rows.facts[0]).toMatchObject({ originalText: "Born 3rd March.", informationKind: "secondary", personaId: child._id });

    expect(rows.topics[0].placeIds).toEqual([parish._id]);
    expect(rows.connections.every((row) => row.state === "proposed")).toBe(true);
  });

  test("a repeated pass is a replay, not a second copy", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    await savePass(t, grantId, "original-pass-one");
    const second = await savePass(t, grantId, "original-pass-two");
    expect(second.counts.created).toBe(0);
    const counts = await t.run(async (ctx) => ({
      places: (await ctx.db.query("places").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect()).length,
      contents: (await ctx.db.query("sourceContents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect()).length,
      personas: (await ctx.db.query("recordPersonas").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect()).length,
      connections: (await ctx.db.query("connections").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect()).length,
    }));
    expect(counts).toEqual({ places: 4, contents: 3, personas: 3, connections: 2 });
  });

  test("a correction is appended beside the original, and a source read shows both", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    const saved = await savePass(t, grantId);
    const sourceId = await t.run(async (ctx) =>
      String((await ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).first())!._id),
    );
    const transcription = await t.run(async (ctx) =>
      (await ctx.db.query("sourceContents").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).collect()).find((row) => row.kind === "transcription")!,
    );
    expect(saved.counts.failed).toBe(0);

    const added = await t.mutation(internal.mcpFamilyHistory.addSourceContent, {
      principal: principal(),
      grantId,
      operationId: "original-correction",
      requestHash: "hash-original-correction",
      input: {
        sourceId,
        contents: [{ contentKey: "content:millbrook-41:transcription-v2", kind: "transcription", madeBy: { kind: "person" },
          text: "No. 41. March 12th. Ada daur. of Thos. & Mary Testwell, Millbrook, Miller. Born 3rd March.", supersedesId: String(transcription._id) }],
      },
    });
    expect(added.contentIds).toHaveLength(1);

    const context = await t.query(internal.mcpFamilyHistory.getRecordContext, { principal: principal(), kind: "source", id: sourceId });
    const transcriptions = context.contents.filter((row: { kind: string }) => row.kind === "transcription");
    expect(transcriptions).toHaveLength(2);
    expect(transcriptions.find((row: { supersedesId?: string }) => row.supersedesId)?.supersedesId).toBe(transcription._id);
    expect(context.personas).toHaveLength(3);
    expect(context.claims).toHaveLength(1);
    expect(context.connections).toHaveLength(1);
  });

  test("an AI reading must say an AI made it", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    await savePass(t, grantId);
    const sourceId = await t.run(async (ctx) =>
      String((await ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).first())!._id),
    );
    await expect(t.mutation(internal.mcpFamilyHistory.addSourceContent, {
      principal: principal(),
      grantId,
      operationId: "original-mislabelled-reading",
      requestHash: "hash-original-mislabelled-reading",
      input: { sourceId, contents: [{ contentKey: "content:bad-reading", kind: "ai_reading", madeBy: { kind: "record_creator" }, text: "A summary." }] },
    })).rejects.toThrow(/ai_reading/);
  });

  test("another vault's source cannot be written to or read", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER });
    await savePass(t, grantId);
    const sourceId = await t.run(async (ctx) =>
      String((await ctx.db.query("sources").withIndex("by_owner", (q) => q.eq("vaultOwnerId", OWNER)).first())!._id),
    );
    const otherGrant = await seedGrant(t, { vaultOwnerId: OTHER });
    await expect(t.mutation(internal.mcpFamilyHistory.addSourceContent, {
      principal: principal(OTHER),
      grantId: otherGrant,
      operationId: "original-foreign-write",
      requestHash: "hash-original-foreign-write",
      input: { sourceId, contents: [{ contentKey: "content:foreign", kind: "transcription", madeBy: { kind: "person" }, text: "x" }] },
    })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.query(internal.mcpFamilyHistory.getRecordContext, { principal: principal(OTHER), kind: "source", id: sourceId }))
      .rejects.toThrow(/NOT_FOUND/);
  });

  test("a selected-people grant cannot write workspace places or topics", () => {
    const resolution = {
      state: "active" as const,
      grant: {
        grantId: "g", clientId: "c", issuer: "i",
        scopes: ["family_history:research:write"] as never,
        boundary: { kind: "selected_people" as const, personIds: ["p1"] },
      },
    };
    const decision = decideToolAccess({
      toolName: "family_history_save_records",
      resolution,
      now: Date.now(),
      input: { summary: "x", places: [{ mode: "create", createKey: "place:x", name: "X", type: "town" }] },
    });
    expect(decision.allowed).toBe(false);
    const content = decideToolAccess({ toolName: "family_history_add_source_content", resolution, now: Date.now(), input: { sourceId: "s" } });
    expect(content.allowed).toBe(false);
  });
});
