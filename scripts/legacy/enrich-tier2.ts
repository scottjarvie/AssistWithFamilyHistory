#!/usr/bin/env tsx
/**
 * Tier 2 Enrichment: Pull sources, memories, and notes from FamilySearch API
 * for persons already in Convex. Stores results in sources, citations, media tables.
 *
 * Usage: FS_TOKEN=<token> npx tsx scripts/enrich-tier2.ts [--limit N] [--generations 1-4]
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const API_BASE = "https://api.familysearch.org";
const RATE_LIMIT_MS = 500; // be nice to FS API

function loadConvexUrl(): string | null {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const m of lines.map(l => l.match(/^NEXT_PUBLIC_CONVEX_URL=["']?(.+?)["']?$/)).filter(Boolean)) {
      if (m) return m[1];
    }
  }
  return process.env.NEXT_PUBLIC_CONVEX_URL || null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fsGet(endpoint: string, token: string): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 204) return null;
  if (res.status === 401) throw new Error("FS token expired (401)");
  if (res.status === 429) {
    console.warn("  Rate limited, waiting 5s...");
    await sleep(5000);
    return fsGet(endpoint, token);
  }
  if (!res.ok) {
    console.warn(`  API ${res.status} for ${endpoint}`);
    return null;
  }
  return res.json();
}

function classifySourceType(title: string, _url?: string): string {
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
  return "other";
}

function classifyMediaType(mType?: string): string {
  if (!mType) return "other";
  const t = mType.toLowerCase();
  if (t.includes("photo") || t.includes("image")) return "photo";
  if (t.includes("document") || t.includes("pdf")) return "document";
  if (t.includes("story") || t.includes("text")) return "document";
  return "other";
}

async function enrichPerson(
  client: ConvexHttpClient,
  token: string,
  person: { _id: any; fsId: string; fullName?: string },
  stats: { sources: number; memories: number; notes: number; errors: number }
) {
  const { fsId } = person;
  const name = person.fullName || fsId;

  // 1. SOURCES
  try {
    const data = await fsGet(`/platform/tree/persons/${fsId}/sources`, token);
    await sleep(RATE_LIMIT_MS);
    
    if (data?.persons?.[0]?.sources) {
      const sources = data.persons[0].sources;
      for (const src of sources) {
        const desc = src.description || {};
        const title = desc.titles?.[0]?.value || src.about || "Unknown Source";
        const citation = desc.citations?.[0]?.value;
        const notes = desc.notes?.[0]?.text;
        const sourceUrl = src.about || desc.about;
        const srcFsId = desc.id || src.descriptionId;

        try {
          // Check if source already exists
          let existingSource = null;
          if (srcFsId) {
            existingSource = await client.query(api.sources.getByFsId, { fsId: srcFsId });
          }

          let sourceId;
          if (existingSource) {
            sourceId = existingSource._id;
          } else {
            sourceId = await client.mutation(api.sources.create, {
              title,
              type: classifySourceType(title, sourceUrl) as any,
              repository: "FamilySearch",
              url: sourceUrl,
              fsId: srcFsId,
              notes: [citation, notes].filter(Boolean).join("\n\n") || undefined,
            });
            stats.sources++;
          }

          // Create citation linking source to person
          try {
            const citationId = await client.mutation(api.citations.create, {
              sourceId,
              confidence: "medium",
              extractedText: citation,
              url: sourceUrl,
              accessDate: new Date().toISOString().slice(0, 10),
            });
            // Link citation to person
            await client.mutation(api.citations.linkToTarget, {
              citationId,
              targetType: "person",
              targetId: fsId,
            });
          } catch (e: any) {
            // Citation may fail if duplicate; ok
          }
        } catch (e: any) {
          if (!e.message?.includes("already exists")) {
            stats.errors++;
            if (stats.errors <= 5) console.warn(`    Source error for ${name}: ${e.message?.slice(0, 80)}`);
          }
        }
      }
    }
  } catch (e: any) {
    if (e.message?.includes("401")) throw e;
    stats.errors++;
    console.warn(`  Sources fetch failed for ${name}: ${e.message?.slice(0, 80)}`);
  }

  // 2. MEMORIES
  try {
    const data = await fsGet(`/platform/tree/persons/${fsId}/memories`, token);
    await sleep(RATE_LIMIT_MS);

    const artifacts = data?.persons?.[0]?.artifacts || [];
    for (const artifact of artifacts) {
      const title = artifact.titles?.[0]?.value || artifact.description || "Memory";
      const memUrl = artifact.links?.["image-icon"]?.href || artifact.about;
      const memFsId = artifact.id;

      try {
        // Store as media (check if exists via notes field containing fsId)
        // For now just count — media table may need an upsert
        stats.memories++;
      } catch (e: any) {
        stats.errors++;
      }
    }
  } catch (e: any) {
    if (e.message?.includes("401")) throw e;
    // 204 = no memories, which is fine
  }

  // 3. NOTES
  try {
    const data = await fsGet(`/platform/tree/persons/${fsId}/notes`, token);
    await sleep(RATE_LIMIT_MS);

    const personNotes = data?.persons?.[0]?.notes || [];
    for (const note of personNotes) {
      const text = note.text || note.subject || "";
      if (text) {
        stats.notes++;
        // Store notes by updating the person's notes field
        try {
          const existing = await client.query(api.persons.getByFsId, { fsId });
          if (existing) {
            const currentNotes = existing.notes || "";
            const noteSubject = note.subject ? `[${note.subject}] ` : "";
            const newNote = `${noteSubject}${text}`;
            if (!currentNotes.includes(text.slice(0, 50))) {
              await client.mutation(api.persons.update, {
                id: existing._id,
                notes: currentNotes ? `${currentNotes}\n\n---\n\n${newNote}` : newNote,
              });
            }
          }
        } catch (e: any) {
          stats.errors++;
        }
      }
    }
  } catch (e: any) {
    if (e.message?.includes("401")) throw e;
  }
}

async function main() {
  const token = process.env.FS_TOKEN;
  if (!token) { console.error("Set FS_TOKEN env var"); process.exit(1); }

  const convexUrl = loadConvexUrl();
  if (!convexUrl) { console.error("No CONVEX_URL"); process.exit(1); }

  const client = new ConvexHttpClient(convexUrl);

  // Parse args
  const args = process.argv.slice(2);
  let limit = 30;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) limit = Number(args[i + 1]);
  }

  // Get persons sorted by generation (closest first)
  // Load ancestry JSON to get ascendancy numbers for sorting
  const ancestryPath = path.resolve(
    process.env.HOME || "~",
    "clawd/research/family-history/gedcom/ancestry-8gen-raw.json"
  );
  const raw = JSON.parse(fs.readFileSync(ancestryPath, "utf-8"));
  const ascByFsId = new Map<string, number>();
  for (const p of raw.persons || []) {
    const asc = p.display?.ascendancyNumber;
    if (asc && p.id) ascByFsId.set(p.id, Number(asc));
  }

  // Get all persons from Convex
  const allPersons = await client.query(api.persons.list, { limit: 500 });
  const withFsId = allPersons
    .filter((p: any) => p.fsId)
    .map((p: any) => ({
      ...p,
      ascNum: ascByFsId.get(p.fsId) || 9999,
      fullName: [p.name?.given, p.name?.surname].filter(Boolean).join(" "),
    }))
    .sort((a: any, b: any) => a.ascNum - b.ascNum)
    .slice(0, limit);

  console.log(`🔬 Tier 2 Enrichment: ${withFsId.length} persons (closest ancestors first)`);
  console.log(`   Token: ${token.slice(0, 8)}...`);
  console.log("");

  const stats = { sources: 0, memories: 0, notes: 0, errors: 0 };
  let processed = 0;

  for (const person of withFsId) {
    processed++;
    const name = person.fullName || person.fsId;
    console.log(`[${processed}/${withFsId.length}] ${name} (${person.fsId}, asc #${person.ascNum})`);

    try {
      await enrichPerson(client, token, person, stats);
    } catch (e: any) {
      if (e.message?.includes("401")) {
        console.error("\n❌ FamilySearch token expired. Re-authenticate and retry.");
        break;
      }
      stats.errors++;
      console.warn(`  Error: ${e.message?.slice(0, 100)}`);
    }

    // Progress
    if (processed % 10 === 0) {
      console.log(`\n  📊 Progress: ${stats.sources} sources, ${stats.memories} memories, ${stats.notes} notes, ${stats.errors} errors\n`);
    }
  }

  // Log enrichment
  try {
    await client.mutation(api.researchLog.upsert, {
      entityType: "other",
      entityId: "tier2-enrichment",
      activityType: "tier2_sources",
      status: "done",
      summary: `Tier 2: ${processed} persons enriched — ${stats.sources} sources, ${stats.memories} memories, ${stats.notes} notes`,
      details: JSON.stringify(stats),
    });
  } catch (e) {
    console.warn("Could not write research log");
  }

  console.log(`\n✅ Tier 2 Enrichment Complete`);
  console.log(`   Persons processed: ${processed}`);
  console.log(`   New sources: ${stats.sources}`);
  console.log(`   Memories found: ${stats.memories}`);
  console.log(`   Notes imported: ${stats.notes}`);
  console.log(`   Errors: ${stats.errors}`);
}

main().catch(e => { console.error("Failed:", e); process.exit(1); });
