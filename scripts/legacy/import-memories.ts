#!/usr/bin/env tsx
/**
 * Import memories from raw FamilySearch JSON files into Convex media table.
 * Memories include photos, documents, stories uploaded by family members.
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

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

function classifyMemoryType(mediaType?: string, qualifiers?: any[]): string {
  if (mediaType?.startsWith("image/")) return "photo";
  if (mediaType?.startsWith("video/")) return "video";
  if (mediaType?.startsWith("audio/")) return "audio";
  if (mediaType?.includes("pdf")) return "document";
  // Check qualifiers for stories/documents
  const qNames = (qualifiers || []).map((q: any) => q.name || "");
  if (qNames.some((n: string) => n.includes("Story"))) return "document";
  if (qNames.some((n: string) => n.includes("Document"))) return "document";
  if (qNames.some((n: string) => n.includes("Photo"))) return "photo";
  return "other";
}

async function main() {
  const client = new ConvexHttpClient(loadConvexUrl()!);

  // Build person fsId -> convex ID map
  const persons = await client.query(api.persons.list, { limit: 500 });
  const personByFsId = new Map<string, Id<"persons">>();
  for (const p of persons) {
    if (p.fsId) personByFsId.set(p.fsId, p._id);
  }
  console.log(`${personByFsId.size} persons mapped`);

  // Check existing media to avoid duplicates
  const existingMedia = await client.query(api.media.list, { limit: 10000 });
  const existingUrls = new Set(existingMedia.map((m: any) => m.familySearchUrl).filter(Boolean));
  console.log(`${existingMedia.length} existing media items (${existingUrls.size} with FS URLs)`);

  const files = fs.readdirSync(MEM_DIR).filter(f => f.endsWith('-memories.json'));
  let created = 0, skipped = 0, errors = 0;

  for (const file of files) {
    const personFsId = file.replace('-memories.json', '');
    const personId = personByFsId.get(personFsId);
    if (!personId) continue;

    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(path.join(MEM_DIR, file), 'utf-8'));
    } catch { continue; }

    const descriptions = data.sourceDescriptions || [];

    for (const desc of descriptions) {
      const imageUrl = desc.about || desc.links?.image?.href || "";
      const thumbUrl = desc.links?.["image-thumbnail"]?.href || desc.links?.["image-icon"]?.href || "";
      const fsUrl = desc.links?.memory?.href || imageUrl;
      
      // Skip if already imported
      if (fsUrl && existingUrls.has(fsUrl)) { skipped++; continue; }

      const title = desc.titles?.[0]?.value || 
                    desc.descriptions?.[0]?.value ||
                    desc.artifactMetadata?.[0]?.filename || 
                    "Memory";
      const description = desc.descriptions?.[0]?.value || "";
      const mimeType = desc.mediaType || "";
      const qualifiers = desc.artifactMetadata?.[0]?.qualifiers || [];
      const memType = classifyMemoryType(mimeType, qualifiers);

      // Extract date from created timestamp
      let dateObj: { year?: number; month?: number; day?: number } | undefined;
      if (desc.created) {
        const d = new Date(desc.created);
        dateObj = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
      }

      try {
        await client.mutation(api.media.create, {
          type: memType as any,
          title,
          description: description || undefined,
          url: imageUrl || thumbUrl || undefined,
          mimeType: mimeType || undefined,
          date: dateObj,
          personIds: [personId],
          familySearchUrl: fsUrl || undefined,
        });
        created++;
        if (fsUrl) existingUrls.add(fsUrl);
      } catch (e: any) {
        errors++;
        if (errors <= 3) console.warn(`  Error: ${e.message?.slice(0, 100)}`);
      }
    }

    if (created % 50 === 0 && created > 0) {
      console.log(`  ... ${created} created, ${skipped} skipped, ${errors} errors`);
    }
  }

  console.log(`\n✅ Memories Import Complete:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
