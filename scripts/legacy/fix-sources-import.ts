#!/usr/bin/env tsx
/**
 * Fix sources import: reads raw JSON files and properly extracts
 * titles, citations, and URLs from sourceDescriptions.
 * Updates existing sources in Convex with correct data.
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const SRC_DIR = path.resolve(process.env.HOME || "~", "clawd/research/family-history/sources");
const MEM_DIR = path.resolve(process.env.HOME || "~", "clawd/research/family-history/memories");

function loadConvexUrl(): string | null {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^NEXT_PUBLIC_CONVEX_URL=["']?(.+?)["']?$/);
      if (m) return m[1];
    }
  }
  return null;
}

function classifySourceType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("census")) return "census";
  if (t.includes("birth") || t.includes("death") || t.includes("marriage") || t.includes("certificate")) return "vital_record";
  if (t.includes("church") || t.includes("parish") || t.includes("baptism") || t.includes("christening")) return "church_record";
  if (t.includes("military") || t.includes("draft") || t.includes("enlistment")) return "military";
  if (t.includes("immigration") || t.includes("passenger") || t.includes("ship") || t.includes("naturalization")) return "immigration";
  if (t.includes("newspaper") || t.includes("article")) return "newspaper";
  if (t.includes("obituary")) return "obituary";
  if (t.includes("photo") || t.includes("image")) return "photograph";
  if (t.includes("book")) return "book";
  if (t.includes("findagrave") || t.includes("find a grave") || t.includes("billiongraves")) return "website";
  return "other";
}

async function main() {
  const client = new ConvexHttpClient(loadConvexUrl()!);
  
  // Get all existing sources from Convex to update them
  const existingSources = await client.query(api.sources.list, { limit: 5000 });
  const sourceByFsId = new Map<string, any>();
  for (const s of existingSources) {
    if (s.fsId) sourceByFsId.set(s.fsId, s);
  }
  console.log(`Existing sources in DB: ${existingSources.length} (${sourceByFsId.size} with fsId)`);

  let updated = 0, created = 0, errors = 0, citationsCreated = 0;
  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('-sources.json'));
  
  for (const file of files) {
    const personFsId = file.replace('-sources.json', '');
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf-8'));
    } catch { continue; }
    
    const refs = data.persons?.[0]?.sources || [];
    const descs = data.sourceDescriptions || [];
    
    // Build lookup: descriptionId -> sourceDescription
    const descById = new Map<string, any>();
    for (const d of descs) {
      if (d.id) descById.set(d.id, d);
    }
    
    for (const ref of refs) {
      const descId = ref.descriptionId || ref.description?.replace('#', '');
      if (!descId) continue;
      
      const desc = descById.get(descId);
      if (!desc) continue;
      
      const title = desc.titles?.[0]?.value || desc.about || "Unknown Source";
      const citation = desc.citations?.[0]?.value || "";
      const noteText = desc.notes?.[0]?.text || "";
      const url = desc.about || "";
      const sourceType = classifySourceType(title);
      
      const existing = sourceByFsId.get(descId);
      
      if (existing) {
        // Update with real data
        try {
          await client.mutation(api.sources.update, {
            id: existing._id,
            title,
            type: sourceType as any,
            url: url || undefined,
            notes: [citation, noteText].filter(Boolean).join("\n\n") || undefined,
          });
          updated++;
        } catch (e: any) {
          errors++;
        }
      } else {
        // Create new
        try {
          const sourceId = await client.mutation(api.sources.create, {
            title,
            type: sourceType as any,
            repository: "FamilySearch",
            url: url || undefined,
            fsId: descId,
            notes: [citation, noteText].filter(Boolean).join("\n\n") || undefined,
          });
          
          // Create citation linking to person
          try {
            const citationId = await client.mutation(api.citations.create, {
              sourceId,
              confidence: "medium",
              extractedText: citation || undefined,
              url: url || undefined,
              accessDate: new Date().toISOString().slice(0, 10),
            });
            await client.mutation(api.citations.linkToTarget, {
              citationId,
              targetType: "person",
              targetId: personFsId,
            });
            citationsCreated++;
          } catch {}
          
          created++;
        } catch (e: any) {
          errors++;
        }
      }
    }
    
    if ((updated + created) % 100 === 0 && (updated + created) > 0) {
      console.log(`  ... ${updated} updated, ${created} created, ${citationsCreated} citations, ${errors} errors`);
    }
  }

  console.log(`\n✅ Sources Fix Complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Created: ${created}`);
  console.log(`  Citations: ${citationsCreated}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
