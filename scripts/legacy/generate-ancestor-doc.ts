#!/usr/bin/env tsx
/**
 * Generate a comprehensive ancestor document from Convex database.
 * Compiles all data for a person into one rich long-form document
 * suitable for AI agent consumption and research.
 *
 * Usage: npx tsx scripts/generate-ancestor-doc.ts <FS_ID> [--out <path>]
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id, Doc } from "../convex/_generated/dataModel";

function loadConvexUrl(): string {
  const envPath = path.resolve(__dirname, "../.env.local");
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^NEXT_PUBLIC_CONVEX_URL=["']?(.+?)["']?$/);
    if (m) return m[1];
  }
  throw new Error("No CONVEX_URL found");
}

type Person = Doc<"persons">;
type Source = Doc<"sources">;

function formatDate(d: any): string {
  if (!d) return "unknown date";
  if (d.original) return d.original;
  const parts = [];
  if (d.day) parts.push(d.day);
  if (d.month) parts.push(["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.month] || d.month);
  if (d.year) parts.push(d.year);
  return parts.join(" ") || "unknown date";
}

function formatPlace(p: any): string {
  if (!p) return "unknown place";
  return p.original || "unknown place";
}

function personHeader(p: Person): string {
  const name = `${p.name.prefix ? p.name.prefix + " " : ""}${p.name.given} ${p.name.surname}${p.name.suffix ? " " + p.name.suffix : ""}`;
  const birth = p.birth ? `b. ${formatDate(p.birth.date)}${p.birth.place ? ", " + formatPlace(p.birth.place) : ""}` : "birth unknown";
  const death = p.death ? `d. ${formatDate(p.death.date)}${p.death.place ? ", " + formatPlace(p.death.place) : ""}` : (p.living ? "living" : "death unknown");
  return `# ${name}\n**FamilySearch ID:** ${p.fsId || "N/A"}\n**Sex:** ${p.sex}\n**${birth}**\n**${death}**`;
}

async function main() {
  const args = process.argv.slice(2);
  const fsId = args[0];
  if (!fsId) {
    console.error("Usage: npx tsx scripts/generate-ancestor-doc.ts <FS_ID> [--out <path>]");
    process.exit(1);
  }
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  const client = new ConvexHttpClient(loadConvexUrl());

  // 1. Get the person
  const person = await client.query(api.persons.getByFsId, { fsId });
  if (!person) {
    console.error(`Person with FamilySearch ID '${fsId}' not found`);
    process.exit(1);
  }

  const doc: string[] = [];
  doc.push(personHeader(person));
  doc.push("");

  // Alternate names
  if (person.alternateNames?.length) {
    doc.push("## Alternate Names");
    for (const n of person.alternateNames) {
      doc.push(`- **${n.type}:** ${n.given} ${n.surname}${n.suffix ? " " + n.suffix : ""}`);
    }
    doc.push("");
  }

  // 2. Family relationships
  doc.push("## Family Relationships");
  doc.push("");

  // Parents
  const parentsRaw = await client.query(api.persons.getParents, { personId: person._id });
  const parents = parentsRaw.map((r: any) => r.person || r);
  if (parents.length > 0) {
    doc.push("### Parents");
    for (const p of parents) {
      const bd = p.birth ? ` (b. ${formatDate(p.birth.date)})` : "";
      doc.push(`- **${p.name.given} ${p.name.surname}**${bd} — FS: ${p.fsId || "N/A"}`);
    }
    doc.push("");
  }

  // Spouses
  const spousesRaw = await client.query(api.persons.getSpouses, { personId: person._id });
  const spouses = spousesRaw.map((r: any) => r.person || r);
  if (spouses.length > 0) {
    doc.push("### Spouses");
    for (const s of spouses) {
      const bd = s.birth ? ` (b. ${formatDate(s.birth.date)})` : "";
      doc.push(`- **${s.name.given} ${s.name.surname}**${bd} — FS: ${s.fsId || "N/A"}`);
    }
    doc.push("");
  }

  // Children
  const childrenRaw = await client.query(api.persons.getChildren, { personId: person._id });
  const children = childrenRaw.map((r: any) => r.person || r);
  if (children.length > 0) {
    doc.push("### Children");
    for (const c of children) {
      const bd = c.birth ? ` (b. ${formatDate(c.birth.date)})` : "";
      doc.push(`- **${c.name.given} ${c.name.surname}**${bd} — FS: ${c.fsId || "N/A"}`);
    }
    doc.push("");
  }

  // 3. Couple relationships with marriage facts
  const coupleRels = await client.query(api.relationships.getCouplesForPerson, { personId: person._id });
  if (coupleRels.length > 0) {
    const withFacts = coupleRels.filter((r: any) => r.facts?.length);
    if (withFacts.length > 0) {
      doc.push("### Marriage Details");
      for (const rel of withFacts) {
        for (const fact of rel.facts || []) {
          const date = fact.date ? formatDate(fact.date) : "";
          const place = fact.place ? formatPlace(fact.place) : "";
          doc.push(`- **${fact.type}:** ${[date, place].filter(Boolean).join(", ")}${fact.description ? " — " + fact.description : ""}`);
        }
      }
      doc.push("");
    }
  }

  // 4. Events
  const events = await client.query(api.events.getForPerson, { personId: person._id });
  if (events.length > 0) {
    doc.push("## Life Events");
    doc.push("");
    // Sort by year
    const sorted = [...events].sort((a: any, b: any) => {
      const ya = a.date?.year || 0;
      const yb = b.date?.year || 0;
      return ya - yb;
    });
    for (const e of sorted) {
      const date = e.date ? formatDate(e.date) : "";
      const place = e.place ? formatPlace(e.place) : "";
      const desc = e.description || "";
      doc.push(`- **${e.type.toUpperCase()}** ${[date, place].filter(Boolean).join(", ")}${desc ? " — " + desc : ""}`);
      if (e.notes) doc.push(`  - _Note: ${e.notes}_`);
    }
    doc.push("");
  }

  // 5. Sources with citations
  doc.push("## Sources & Citations");
  doc.push("");

  // getForTarget returns full citations with embedded source objects
  const citationsWithSources = await client.query(api.citations.getForTarget, {
    targetType: "person",
    targetId: fsId,
  });

  if (citationsWithSources.length > 0) {
    // Group by source type
    const byType: Record<string, { source: any; citations: any[] }[]> = {};
    for (const cit of citationsWithSources) {
      const source = cit.source;
      if (!source) continue;
      const type = source.type || "other";
      if (!byType[type]) byType[type] = [];
      
      let entry = byType[type].find((e: any) => e.source._id === source._id);
      if (!entry) {
        entry = { source, citations: [] };
        byType[type].push(entry);
      }
      entry.citations.push(cit);
    }

    // Format by type
    const typeOrder = ["vital_record", "census", "church_record", "military", "immigration", "obituary", "newspaper", "book", "website", "photograph", "other"];
    const typeLabels: Record<string, string> = {
      vital_record: "Vital Records", census: "Census Records", church_record: "Church Records",
      military: "Military Records", immigration: "Immigration Records", obituary: "Obituaries",
      newspaper: "Newspapers", book: "Books", website: "Websites", photograph: "Photographs",
      other: "Other Sources", collection: "Collections", repository: "Repositories", letter: "Letters"
    };

    for (const type of typeOrder) {
      const entries = byType[type];
      if (!entries?.length) continue;
      
      doc.push(`### ${typeLabels[type] || type} (${entries.length})`);
      doc.push("");
      
      for (const { source, citations } of entries) {
        doc.push(`**${source.title}**`);
        if (source.repository) doc.push(`  Repository: ${source.repository}`);
        
        let hadText = false;
        for (const c of citations) {
          if (c.extractedText) {
            hadText = true;
            doc.push(`  > ${c.extractedText}`);
          }
        }
        if (!hadText) {
          // Only show URLs when no citation text exists
          if (source.url) doc.push(`  URL: ${source.url}`);
          for (const c of citations) {
            if (c.url && c.url !== source.url) doc.push(`  Citation URL: ${c.url}`);
          }
        }
        doc.push("");
      }
    }

    // Catch any types not in typeOrder
    for (const [type, entries] of Object.entries(byType)) {
      if (typeOrder.includes(type)) continue;
      doc.push(`### ${typeLabels[type] || type} (${entries.length})`);
      doc.push("");
      for (const { source, citations } of entries) {
        doc.push(`**${source.title}**`);
        if (source.url) doc.push(`  URL: ${source.url}`);
        for (const c of citations) {
          if (c.extractedText) doc.push(`  > ${c.extractedText}`);
        }
        doc.push("");
      }
    }
  } else {
    doc.push("_No citations linked to this person._");
    doc.push("");
  }

  // 6. Memories (media)
  const media = await client.query(api.media.listForPerson, { personId: person._id });
  if (media.length > 0) {
    doc.push("## Memories & Media");
    doc.push("");
    
    const photos = media.filter((m: any) => m.type === "photo");
    const docs_ = media.filter((m: any) => m.type === "document" || m.type === "scan");
    const other = media.filter((m: any) => !["photo", "document", "scan"].includes(m.type));

    if (photos.length > 0) {
      doc.push(`### Photos (${photos.length})`);
      for (const m of photos) {
        doc.push(`- ${m.title}${m.description ? " — " + m.description : ""}${m.url ? "\n  " + m.url : ""}`);
      }
      doc.push("");
    }
    if (docs_.length > 0) {
      doc.push(`### Documents & Scans (${docs_.length})`);
      for (const m of docs_) {
        doc.push(`- ${m.title}${m.description ? " — " + m.description : ""}${m.url ? "\n  " + m.url : ""}`);
      }
      doc.push("");
    }
    if (other.length > 0) {
      doc.push(`### Other Media (${other.length})`);
      for (const m of other) {
        doc.push(`- [${m.type}] ${m.title}${m.url ? "\n  " + m.url : ""}`);
      }
      doc.push("");
    }
  }

  // 7. Research Notes
  if (person.notes) {
    doc.push("## Research Notes");
    doc.push("");
    doc.push(person.notes);
    doc.push("");
  }

  // 8. Research Status
  doc.push("## Research Status");
  doc.push(`- **Status:** ${person.researchStatus}`);
  if (person.researchPriority) doc.push(`- **Priority:** ${person.researchPriority}/10`);
  if (person.tags?.length) doc.push(`- **Tags:** ${person.tags.join(", ")}`);
  doc.push("");

  // 9. Summary stats
  doc.push("---");
  doc.push(`*Generated: ${new Date().toISOString().slice(0, 10)}*`);
  doc.push(`*Sources: ${citationsWithSources.length} citations*`);
  doc.push(`*Media: ${media.length} items*`);
  doc.push(`*Family: ${parents.length} parents, ${spouses.length} spouses, ${children.length} children*`);

  const output = doc.join("\n");
  
  if (outPath) {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, output);
    console.log(`✅ Wrote ${output.length} chars to ${outPath}`);
  } else {
    console.log(output);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
