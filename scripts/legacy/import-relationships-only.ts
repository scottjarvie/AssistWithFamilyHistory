#!/usr/bin/env tsx
/**
 * Create relationships from the already-imported ancestry persons.
 * Reads ascendancy numbers from Convex persons table, then creates
 * parent-child and couple relationships.
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

const DATA_PATH = path.resolve(
  process.env.HOME || "~",
  "clawd/research/family-history/gedcom/ancestry-8gen-raw.json"
);

function loadConvexUrl(): string | null {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^NEXT_PUBLIC_CONVEX_URL=["']?(.+?)["']?$/);
      if (match) return match[1];
    }
  }
  return process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || null;
}

async function main() {
  const convexUrl = loadConvexUrl();
  if (!convexUrl) { console.error("No CONVEX_URL"); process.exit(1); }

  const client = new ConvexHttpClient(convexUrl);

  // Build ascendancy map from JSON (fsId -> ascendancyNumber)
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  const fsAscMap = new Map<string, string>(); // fsId -> ascendancyNumber
  for (const p of raw.persons || []) {
    const asc = p.display?.ascendancyNumber;
    if (asc && p.id) fsAscMap.set(p.id, asc);
  }
  console.log(`Found ${fsAscMap.size} persons with ascendancy numbers in JSON`);

  // Get all persons from Convex to build ascendancyNumber -> convexId map
  const persons = await client.query(api.persons.list, { limit: 500 });
  const ascToId = new Map<string, Id<"persons">>();
  for (const p of persons) {
    if (p.fsId && fsAscMap.has(p.fsId)) {
      ascToId.set(fsAscMap.get(p.fsId)!, p._id);
    }
  }
  console.log(`Mapped ${ascToId.size} persons to ascendancy numbers in Convex`);

  let parentChild = 0;
  let couples = 0;
  let errors = 0;
  const coupleKeys = new Set<string>();

  for (const [asc, childId] of ascToId.entries()) {
    const ascNum = Number(asc);
    if (!Number.isFinite(ascNum) || ascNum < 1) continue;

    const fatherId = ascToId.get(String(ascNum * 2));
    const motherId = ascToId.get(String(ascNum * 2 + 1));

    if (fatherId) {
      try {
        await client.mutation(api.relationships.createParentChild, {
          parentId: fatherId, childId, relationType: "Biological",
        });
        parentChild++;
      } catch (e: any) {
        if (!e.message?.includes("already exists")) {
          errors++;
          if (errors < 5) console.warn(`  parent-child error: ${e.message?.slice(0, 80)}`);
        }
      }
    }

    if (motherId) {
      try {
        await client.mutation(api.relationships.createParentChild, {
          parentId: motherId, childId, relationType: "Biological",
        });
        parentChild++;
      } catch (e: any) {
        if (!e.message?.includes("already exists")) {
          errors++;
          if (errors < 5) console.warn(`  parent-child error: ${e.message?.slice(0, 80)}`);
        }
      }
    }

    if (fatherId && motherId) {
      const key = [fatherId, motherId].sort().join(":");
      if (!coupleKeys.has(key)) {
        try {
          await client.mutation(api.relationships.createCouple, {
            person1Id: fatherId, person2Id: motherId,
          });
          couples++;
        } catch (e: any) {
          // duplicates expected
        }
        coupleKeys.add(key);
      }
    }

    // Progress every 50
    if (parentChild % 50 === 0 && parentChild > 0) {
      console.log(`  ... ${parentChild} parent-child, ${couples} couples so far`);
    }
  }

  console.log(`\n✅ Relationships created:`);
  console.log(`   Parent-child: ${parentChild}`);
  console.log(`   Couples: ${couples}`);
  console.log(`   Errors: ${errors}`);
}

main().catch(e => { console.error("Failed:", e); process.exit(1); });
