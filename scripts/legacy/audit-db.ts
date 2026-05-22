#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

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

async function main() {
  const client = new ConvexHttpClient(loadConvexUrl()!);
  
  // Count persons
  const persons = await client.query(api.persons.list, { limit: 500 });
  console.log(`\n📊 DATABASE AUDIT`);
  console.log(`═══════════════════`);
  console.log(`Persons: ${persons.length}`);
  
  // Count sources
  const sources = await client.query(api.sources.list, { limit: 5000 });
  console.log(`Sources: ${sources.length}`);
  
  // Sample a source to check quality
  if (sources.length > 0) {
    const sample = sources[Math.floor(Math.random() * Math.min(sources.length, 50))];
    console.log(`\n📄 Sample Source:`);
    console.log(`  Title: ${sample.title?.slice(0, 100)}`);
    console.log(`  Type: ${sample.type}`);
    console.log(`  URL: ${sample.url?.slice(0, 80) || 'none'}`);
    console.log(`  fsId: ${sample.fsId || 'none'}`);
    console.log(`  Notes: ${(sample.notes || '').slice(0, 150) || 'none'}`);
  }

  // Count citations  
  const citations = await client.query(api.citations.list, { limit: 5000 });
  console.log(`\nCitations: ${citations.length}`);
  
  if (citations.length > 0) {
    const sample = citations[Math.floor(Math.random() * Math.min(citations.length, 50))];
    console.log(`\n📝 Sample Citation:`);
    console.log(`  Extracted text: ${(sample.extractedText || '').slice(0, 200) || 'none'}`);
    console.log(`  URL: ${sample.url?.slice(0, 80) || 'none'}`);
  }

  // Check persons with notes
  const withNotes = persons.filter((p: any) => p.notes && p.notes.length > 10);
  console.log(`\nPersons with notes: ${withNotes.length}`);

  // Check persons with fsId
  const withFsId = persons.filter((p: any) => p.fsId);
  console.log(`Persons with FamilySearch ID: ${withFsId.length}`);

  // Source type breakdown
  const typeCount: Record<string, number> = {};
  for (const s of sources) {
    typeCount[s.type] = (typeCount[s.type] || 0) + 1;
  }
  console.log(`\n📊 Source Types:`);
  for (const [type, count] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Check raw file counts for comparison
  const srcDir = path.resolve(process.env.HOME || "~", "clawd/research/family-history/sources");
  const memDir = path.resolve(process.env.HOME || "~", "clawd/research/family-history/memories");
  const notDir = path.resolve(process.env.HOME || "~", "clawd/research/family-history/notes");
  
  let rawSources = 0, rawMemories = 0, rawNotes = 0;
  
  if (fs.existsSync(srcDir)) {
    for (const f of fs.readdirSync(srcDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf-8'));
        rawSources += d.persons?.[0]?.sources?.length || 0;
      } catch {}
    }
  }
  if (fs.existsSync(memDir)) {
    for (const f of fs.readdirSync(memDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(memDir, f), 'utf-8'));
        rawMemories += d.sourceDescriptions?.length || 0;
      } catch {}
    }
  }
  if (fs.existsSync(notDir)) {
    for (const f of fs.readdirSync(notDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(notDir, f), 'utf-8'));
        rawNotes += d.persons?.[0]?.notes?.length || 0;
      } catch {}
    }
  }

  console.log(`\n🔍 RAW FILES vs DATABASE:`);
  console.log(`  Raw sources files: ${rawSources}`);
  console.log(`  Database sources: ${sources.length}`);
  console.log(`  Raw memories files: ${rawMemories}`);
  console.log(`  Database memories: (not yet imported)`);
  console.log(`  Raw notes: ${rawNotes}`);
  console.log(`  Persons with notes: ${withNotes.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
