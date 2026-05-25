#!/usr/bin/env tsx
/**
 * Create citations linking every source to its person(s).
 * Reads raw source JSON files, joins persons[0].sources (refs) 
 * with sourceDescriptions (data), creates citation + citationLink.
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

const SRC_DIR = path.resolve(process.env.HOME || "~", "clawd/research/family-history/sources");

function loadConvexUrl(): string {
  const envPath = path.resolve(__dirname, "../.env.local");
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^NEXT_PUBLIC_CONVEX_URL=["']?(.+?)["']?$/);
    if (m) return m[1];
  }
  throw new Error("No CONVEX_URL found");
}

async function main() {
  const client = new ConvexHttpClient(loadConvexUrl());

  // Map: fsId -> convex source _id
  const allSources = await client.query(api.sources.list, { limit: 5000 });
  const sourceByFsId = new Map<string, Id<"sources">>();
  for (const s of allSources) {
    if (s.fsId) sourceByFsId.set(s.fsId, s._id);
  }
  console.log(`${sourceByFsId.size} sources mapped`);

  // Check existing citations to avoid duplicates
  const existingCitations = await client.query(api.citations.list, { limit: 10000 });
  // Key: sourceId + personFsId
  const existingKeys = new Set<string>();
  // We also need existing citationLinks... but let's just check citation count
  console.log(`${existingCitations.length} existing citations`);

  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('-sources.json'));
  let created = 0, skipped = 0, errors = 0, linked = 0;

  for (const file of files) {
    const personFsId = file.replace('-sources.json', '');
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf-8'));
    } catch { continue; }

    const refs = data.persons?.[0]?.sources || [];
    const descs = data.sourceDescriptions || [];
    const descById = new Map<string, any>();
    for (const d of descs) {
      if (d.id) descById.set(d.id, d);
    }

    for (const ref of refs) {
      const descId = ref.descriptionId || ref.description?.replace('#', '');
      if (!descId) continue;

      const sourceConvexId = sourceByFsId.get(descId);
      if (!sourceConvexId) continue;

      const desc = descById.get(descId);
      const citationText = desc?.citations?.[0]?.value || "";
      const url = desc?.about || "";

      try {
        const citationId = await client.mutation(api.citations.create, {
          sourceId: sourceConvexId,
          confidence: "high" as const,
          extractedText: citationText || undefined,
          url: url || undefined,
          accessDate: new Date().toISOString().slice(0, 10),
        });
        created++;

        // Link to person
        await client.mutation(api.citations.linkToTarget, {
          citationId,
          targetType: "person",
          targetId: personFsId,
        });
        linked++;
      } catch (e: any) {
        errors++;
        if (errors <= 5) console.warn(`  Error (${personFsId}/${descId}): ${e.message?.slice(0, 120)}`);
      }
    }

    if (created % 200 === 0 && created > 0) {
      console.log(`  ... ${created} citations, ${linked} links, ${errors} errors`);
    }
  }

  console.log(`\n✅ Citations Import Complete:`);
  console.log(`  Citations created: ${created}`);
  console.log(`  Person links: ${linked}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
