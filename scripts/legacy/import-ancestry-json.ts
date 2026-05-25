#!/usr/bin/env tsx
/**
 * Import FamilySearch Ancestry JSON (8-gen) into Convex.
 * - Upserts places by FamilySearch place id/full name
 * - Upserts persons by FamilySearch person id
 * - Creates parent-child + couple relationships from ascendancy numbers
 *
 * Usage: npx tsx scripts/import-ancestry-json.ts
 */

import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

type PlaceMaps = {
  byFsId: Map<string, Id<"places">>;
  byName: Map<string, Id<"places">>;
};

type AncestryPlace = {
  id: string;
  latitude?: number;
  longitude?: number;
  names: Array<{ value: string }>;
};

type AncestryFact = {
  type?: string;
  date?: {
    original?: string;
    formal?: string;
    normalized?: Array<{ value: string }>;
  };
  place?: {
    original?: string;
    description?: string;
    normalized?: Array<{ value: string }>;
  };
};

type AncestryPerson = {
  id: string;
  living: boolean;
  gender?: { type?: string };
  display?: {
    name?: string;
    gender?: string;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    ascendancyNumber?: string;
  };
  names?: Array<{
    nameForms?: Array<{
      fullText?: string;
      parts?: Array<{ type?: string; value?: string }>;
    }>;
  }>;
  facts?: AncestryFact[];
};

const DATA_PATH = path.join(
  process.env.HOME ?? "",
  "clawd/research/family-history/gedcom/ancestry-8gen-raw.json"
);

const PLACE_TYPES = [
  "country",
  "state",
  "county",
  "city",
  "town",
  "village",
  "parish",
  "address",
  "other",
] as const;

function loadConvexUrl(): string {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return process.env.NEXT_PUBLIC_CONVEX_URL;
  }

  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key === "NEXT_PUBLIC_CONVEX_URL") {
        const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
        if (value) {
          process.env.NEXT_PUBLIC_CONVEX_URL = value;
          return value;
        }
      }
    }
  }

  return "";
}

function inferPlaceType(fullName: string): (typeof PLACE_TYPES)[number] {
  const parts = fullName.split(",").map((p) => p.trim()).filter(Boolean);
  const first = parts[0]?.toLowerCase() || "";
  if (first.includes("county")) return "county";
  if (parts.length >= 3) return "city";
  if (parts.length === 2) return "state";
  if (parts.length === 1) return "country";
  return "other";
}

function derivePlaceName(fullName: string): string {
  const [first] = fullName.split(",").map((p) => p.trim()).filter(Boolean);
  return first || fullName;
}

function parseName(person: AncestryPerson): { given: string; surname: string } {
  const form = person.names?.[0]?.nameForms?.[0];
  if (form?.parts) {
    const given = form.parts
      .filter((p) => (p.type || "").toLowerCase().includes("given"))
      .map((p) => p.value)
      .filter(Boolean)
      .join(" ")
      .trim();
    const surname = form.parts
      .filter((p) => (p.type || "").toLowerCase().includes("surname"))
      .map((p) => p.value)
      .filter(Boolean)
      .join(" ")
      .trim();
    if (given && surname) return { given, surname };
  }

  const displayName = person.display?.name || "Unknown Name";
  const parts = displayName.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return { given: parts[0], surname: parts[0] };
  }
  const surname = parts.pop() as string;
  const given = parts.join(" ");
  return { given, surname };
}

function normalizeGender(person: AncestryPerson): "male" | "female" | "unknown" {
  const raw =
    person.display?.gender ||
    person.gender?.type ||
    "";
  const value = raw.toLowerCase();
  if (value.includes("male")) return "male";
  if (value.includes("female")) return "female";
  return "unknown";
}

function parseDateParts(
  value?: string,
  formal?: string
): { original: string; year?: number; month?: number; day?: number } | undefined {
  const original = value || formal;
  if (!original) return undefined;

  const result: {
    original: string;
    year?: number;
    month?: number;
    day?: number;
  } = { original };

  const formalMatch = formal?.match(/([+-]?)(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (formalMatch) {
    result.year = Number(formalMatch[2]);
    if (formalMatch[3]) result.month = Number(formalMatch[3]);
    if (formalMatch[4]) result.day = Number(formalMatch[4]);
    return result;
  }

  const yearMatch = original.match(/(\d{4})/);
  if (yearMatch) {
    result.year = Number(yearMatch[1]);
  }

  const monthMatch = original.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i
  );
  const monthMap: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  if (monthMatch) {
    result.month = monthMap[monthMatch[1].slice(0, 3).toLowerCase()];
  }

  const dayMatch = original.match(/\b(\d{1,2})\b/);
  if (dayMatch) {
    const dayNum = Number(dayMatch[1]);
    if (dayNum >= 1 && dayNum <= 31) {
      result.day = dayNum;
    }
  }

  return result;
}

function findFact(person: AncestryPerson, type: string): AncestryFact | undefined {
  return person.facts?.find((fact) => fact.type === type);
}

function buildLifeEvent(
  person: AncestryPerson,
  type: "Birth" | "Death",
  placeMaps: PlaceMaps
) {
  const fact = findFact(person, `http://gedcomx.org/${type}`);
  const displayDate =
    type === "Birth" ? person.display?.birthDate : person.display?.deathDate;
  const displayPlace =
    type === "Birth" ? person.display?.birthPlace : person.display?.deathPlace;

  const dateValue =
    fact?.date?.normalized?.[0]?.value ||
    fact?.date?.original ||
    displayDate ||
    undefined;
  const date = parseDateParts(dateValue, fact?.date?.formal);

  const descriptionRef = fact?.place?.description?.replace("#", "");
  const normalizedPlace = fact?.place?.normalized?.[0]?.value || displayPlace;
  const placeOriginal = fact?.place?.original || normalizedPlace || displayPlace;

  let placeId: Id<"places"> | undefined = undefined;
  if (descriptionRef && placeMaps.byFsId.has(descriptionRef)) {
    placeId = placeMaps.byFsId.get(descriptionRef);
  } else if (normalizedPlace) {
    const key = normalizedPlace.toLowerCase();
    if (placeMaps.byName.has(key)) {
      placeId = placeMaps.byName.get(key);
    }
  }

  if (!date && !placeOriginal && !placeId) return undefined;

  return {
    date,
    place:
      placeOriginal || placeId
        ? {
            original: placeOriginal || normalizedPlace || descriptionRef || "",
            placeId,
          }
        : undefined,
  };
}

function mergeLifeEvent(existing: any, incoming: any) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return {
    date: existing.date || incoming.date,
    place: existing.place || incoming.place,
    description: existing.description || incoming.description,
  };
}

function mergeTags(existing: string[] | undefined, incoming: string[]): string[] {
  const set = new Set<string>();
  for (const tag of existing || []) set.add(tag);
  for (const tag of incoming) set.add(tag);
  return Array.from(set);
}

function mergeStatus(
  existing: string | undefined,
  incoming: "basic"
): "not_started" | "basic" | "in_progress" | "thorough" | "complete" {
  const order: Record<string, number> = {
    not_started: 0,
    basic: 1,
    in_progress: 2,
    thorough: 3,
    complete: 4,
  };
  if (!existing) return incoming;
  return order[existing] >= order[incoming] ? existing : incoming;
}

async function importPlaces(
  client: ConvexHttpClient,
  places: AncestryPlace[]
): Promise<{ maps: PlaceMaps; created: number; updated: number }> {
  const maps: PlaceMaps = {
    byFsId: new Map(),
    byName: new Map(),
  };

  let created = 0;
  let updated = 0;

  for (const place of places) {
    const fullName = place.names?.[0]?.value?.trim();
    if (!fullName) continue;

    const name = derivePlaceName(fullName);
    const type = inferPlaceType(fullName);
    const result = await client.mutation(api.places.upsert, {
      familySearchId: place.id,
      name,
      fullName,
      type,
      latitude: place.latitude,
      longitude: place.longitude,
    });

    if (result.updated) updated++;
    else created++;

    if (result.placeId) {
      maps.byFsId.set(String(place.id), result.placeId);
      maps.byName.set(fullName.toLowerCase(), result.placeId);
    }
  }

  return { maps, created, updated };
}

async function importPersons(
  client: ConvexHttpClient,
  persons: AncestryPerson[],
  placeMaps: PlaceMaps
): Promise<{
  ascendancyMap: Map<string, Id<"persons">>;
  created: number;
  updated: number;
}> {
  const ascendancyMap = new Map<string, Id<"persons">>();
  let created = 0;
  let updated = 0;

  for (const person of persons) {
    const fsId = person.id;
    const name = parseName(person);
    const sex = normalizeGender(person);
    const ascendancy = person.display?.ascendancyNumber;
    const baseTags = ["imported", "ancestor"];
    if (ascendancy) {
      baseTags.push(`ascendancy:${ascendancy}`);
    }

    const birth = buildLifeEvent(person, "Birth", placeMaps);
    const death = buildLifeEvent(person, "Death", placeMaps);
    const living = person.living ?? false;

    const existing = await client.query(api.persons.getByFsId, { fsId });
    if (existing) {
      const mergedTags = mergeTags(existing.tags, baseTags);
      const mergedBirth = mergeLifeEvent(existing.birth, birth);
      const mergedDeath = mergeLifeEvent(existing.death, death);
      const researchStatus = mergeStatus(existing.researchStatus, "basic");

      await client.mutation(api.persons.update, {
        id: existing._id,
        fsId,
        name,
        sex,
        living: death ? false : living,
        birth: mergedBirth,
        death: mergedDeath,
        researchStatus,
        tags: mergedTags,
        notes: existing.notes || `Imported from Ancestry ascendancy ${ascendancy || "n/a"}`,
      });
      updated++;
      if (ascendancy) {
        ascendancyMap.set(ascendancy, existing._id);
      }
      continue;
    }

    const personId = await client.mutation(api.persons.create, {
      fsId,
      name,
      sex,
      living: death ? false : living,
      birth,
      death,
      researchStatus: "basic",
      tags: baseTags,
      notes: `Imported from Ancestry ascendancy ${ascendancy || "n/a"}`,
    });

    created++;
    if (ascendancy) {
      ascendancyMap.set(ascendancy, personId);
    }
  }

  return { ascendancyMap, created, updated };
}

async function createRelationships(
  client: ConvexHttpClient,
  ascendancyMap: Map<string, Id<"persons">>
): Promise<{ parentChild: number; couples: number }> {
  let parentChild = 0;
  let couples = 0;
  const coupleKeys = new Set<string>();

  for (const [asc, childId] of ascendancyMap.entries()) {
    const ascNum = Number(asc);
    if (!Number.isFinite(ascNum)) continue;

    const fatherId = ascendancyMap.get(String(ascNum * 2));
    const motherId = ascendancyMap.get(String(ascNum * 2 + 1));

    if (fatherId) {
      const res = await client.mutation(api.relationships.createParentChild, {
        parentId: fatherId,
        childId,
        relationType: "Biological",
      });
      if (res?.success) parentChild++;
    }

    if (motherId) {
      const res = await client.mutation(api.relationships.createParentChild, {
        parentId: motherId,
        childId,
        relationType: "Biological",
      });
      if (res?.success) parentChild++;
    }

    if (fatherId && motherId) {
      const key = [fatherId, motherId].sort().join(":");
      if (!coupleKeys.has(key)) {
        try {
          await client.mutation(api.relationships.createCouple, {
            person1Id: fatherId,
            person2Id: motherId,
          });
          couples++;
        } catch (error) {
          // Duplicate couple relationships will throw; ignore.
        }
        coupleKeys.add(key);
      }
    }
  }

  return { parentChild, couples };
}

async function logResearchImport(
  client: ConvexHttpClient,
  summary: string,
  details: string
) {
  try {
    await client.mutation(api.researchLog.upsert, {
      entityType: "other",
      entityId: "ancestry-8gen-raw.json",
      activityType: "tier1_bulk_import",
      status: "done",
      summary,
      details,
      outputRefs: [DATA_PATH],
    });
  } catch (error) {
    console.warn("Could not write research log entry:", (error as Error).message);
  }
}

async function main() {
  const convexUrl = loadConvexUrl();
  if (!convexUrl) {
    console.error("❌ NEXT_PUBLIC_CONVEX_URL not set and .env.local missing");
    process.exit(1);
  }

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ Data file not found at ${DATA_PATH}`);
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl);
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  const placesData: AncestryPlace[] = raw.places || [];
  const personsData: AncestryPerson[] = raw.persons || [];

  console.log(`📍 Importing ${placesData.length} places...`);
  const placeResult = await importPlaces(client, placesData);
  console.log(
    `   Places upserted: ${placeResult.created + placeResult.updated} (${placeResult.created} new, ${placeResult.updated} updated)`
  );

  console.log(`🧍 Importing ${personsData.length} persons...`);
  const personResult = await importPersons(client, personsData, placeResult.maps);
  console.log(
    `   Persons upserted: ${personResult.created + personResult.updated} (${personResult.created} new, ${personResult.updated} updated)`
  );

  console.log("🔗 Creating relationships from ascendancy numbers...");
  const relResult = await createRelationships(client, personResult.ascendancyMap);
  console.log(
    `   Relationships created: ${relResult.parentChild} parent-child, ${relResult.couples} couples`
  );

  const summary = `Ancestry 8-gen import: ${personResult.created + personResult.updated} persons (${personResult.created} new, ${personResult.updated} updated), ${placeResult.created + placeResult.updated} places, ${relResult.parentChild} parent-child, ${relResult.couples} couples.`;
  await logResearchImport(client, summary, `Source file: ${DATA_PATH}`);

  console.log("✅ Import complete.");
  console.log(summary);
}

main().catch((error) => {
  console.error("❌ Import failed:", error);
  process.exit(1);
});
