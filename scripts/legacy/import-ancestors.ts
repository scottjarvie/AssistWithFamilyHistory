#!/usr/bin/env tsx
/**
 * Import ancestors from markdown files into Convex database
 * 
 * Usage: npx tsx scripts/import-ancestors.ts
 */

import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load environment variables
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
if (!CONVEX_URL) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL not found in environment");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

// Path to ancestor files
const ANCESTORS_DIR = path.join(process.env.HOME!, "clawd/research/family-history/ancestors");

// Files to import
const ANCESTOR_FILES = [
  "john-strathearn-jarvie-KWCJ-4XD.md",
  "jennie-kathryn-gill-KWCJ-4X6.md",
  "raymond-scott-jarvie-LFST-LKJ.md",
  "kathleen-russell-lamson-KW41-SHF.md",
  "rodchell-gill-L211-4X5.md",
  "russell-orrin-lamson-K8F7-FQ6.md",
  "pauline-redfearn-shockley-K41S-WW7.md",
];

interface ParsedPerson {
  fsId: string;
  name: {
    given: string;
    surname: string;
  };
  sex: "male" | "female" | "unknown";
  living: boolean;
  birth?: {
    date?: {
      original: string;
      year?: number;
      month?: number;
      day?: number;
    };
    place?: {
      original: string;
    };
  };
  death?: {
    date?: {
      original: string;
      year?: number;
      month?: number;
      day?: number;
    };
    place?: {
      original: string;
    };
  };
  spouses: Array<{
    name: string;
    fsId?: string;
    marriageDate?: string;
    marriagePlace?: string;
  }>;
  parents: Array<{
    name: string;
    fsId?: string;
  }>;
  children: Array<{
    name: string;
    fsId?: string;
  }>;
  events: Array<{
    type: string;
    date?: string;
    place?: string;
    description?: string;
  }>;
}

/**
 * Parse a date string like "February 3, 1890" or "1890" into components
 */
function parseDate(dateStr: string): { original: string; year?: number; month?: number; day?: number } {
  const result: any = { original: dateStr };
  
  // Try to extract year (4 digits)
  const yearMatch = dateStr.match(/\b(\d{4})\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]);
  }
  
  // Try to extract month and day
  const months: { [key: string]: number } = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
  };
  
  for (const [monthName, monthNum] of Object.entries(months)) {
    const regex = new RegExp(`\\b${monthName}\\b`, "i");
    if (regex.test(dateStr)) {
      result.month = monthNum;
      
      // Try to find day before month name
      const dayMatch = dateStr.match(new RegExp(`(\\d{1,2})\\s+${monthName}`, "i"));
      if (dayMatch) {
        result.day = parseInt(dayMatch[1]);
      }
      break;
    }
  }
  
  return result;
}

/**
 * Parse markdown file into structured person data
 */
function parseMarkdownFile(filePath: string): ParsedPerson | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  
  // Extract name from title (first line)
  const titleMatch = lines[0].match(/^#\s+(.+?)\s*\((\d{4})–(\d{4}|Living)\)/);
  if (!titleMatch) {
    console.error(`Failed to parse title in ${filePath}`);
    return null;
  }
  
  const fullName = titleMatch[1];
  const birthYear = parseInt(titleMatch[2]);
  const deathYear = titleMatch[3] === "Living" ? null : parseInt(titleMatch[3]);
  const living = titleMatch[3] === "Living";
  
  // Parse name into given/surname
  const nameParts = fullName.split(" ");
  const surname = nameParts[nameParts.length - 1];
  const given = nameParts.slice(0, -1).join(" ");
  
  // Extract FamilySearch ID
  const fsIdMatch = content.match(/FamilySearch ID:\*\*\s+([A-Z0-9-]+)/);
  const fsId = fsIdMatch ? fsIdMatch[1] : "";
  
  // Determine sex from context (simple heuristic - can be improved)
  let sex: "male" | "female" | "unknown" = "unknown";
  if (content.includes("**Father:**") || content.includes("husband") || content.includes("Son ")) {
    sex = "male";
  } else if (content.includes("**Mother:**") || content.includes("wife") || content.includes("Daughter ")) {
    sex = "female";
  }
  
  const person: ParsedPerson = {
    fsId,
    name: { given, surname },
    sex,
    living,
    spouses: [],
    parents: [],
    children: [],
    events: [],
  };
  
  // Extract birth info from Vitals section
  const birthMatch = content.match(/\*\*Born:\*\*\s+([^,]+),?\s*(.+)/);
  if (birthMatch) {
    const birthDate = birthMatch[1].trim();
    const birthPlace = birthMatch[2].trim();
    person.birth = {
      date: parseDate(birthDate),
      place: { original: birthPlace },
    };
  }
  
  // Extract death info
  const deathMatch = content.match(/\*\*Died:\*\*\s+([^,]+),?\s*(.+?)(?:\s*\(age\s+\d+\))?$/m);
  if (deathMatch) {
    const deathDate = deathMatch[1].trim();
    const deathPlace = deathMatch[2].trim();
    person.death = {
      date: parseDate(deathDate),
      place: { original: deathPlace },
    };
  }
  
  // Extract spouse info
  const spouseMatch = content.match(/\*\*Spouse:\*\*\s+(.+?)\s*\((\d{4})–(\d{4}|Living),?\s*([A-Z0-9-]+)\),?\s*married\s+([^,]+),?\s*(.+)/);
  if (spouseMatch) {
    person.spouses.push({
      name: spouseMatch[1].trim(),
      fsId: spouseMatch[4],
      marriageDate: spouseMatch[5].trim(),
      marriagePlace: spouseMatch[6].trim(),
    });
  }
  
  // Extract parents
  const fatherMatch = content.match(/\*\*Father:\*\*\s+(.+?)\s*\((\d{4})–(\d{4}|Living),?\s*([A-Z0-9-]+)\)/);
  if (fatherMatch) {
    person.parents.push({
      name: fatherMatch[1].trim(),
      fsId: fatherMatch[4],
    });
  }
  
  const motherMatch = content.match(/\*\*Mother:\*\*\s+(.+?)\s*\((\d{4})–(\d{4}|Living),?\s*([A-Z0-9-]+)\)/);
  if (motherMatch) {
    person.parents.push({
      name: motherMatch[1].trim(),
      fsId: motherMatch[4],
    });
  }
  
  // Extract children (numbered list)
  const childrenSection = content.match(/##\s+Children.*?\n([\s\S]+?)(?=\n##|\n---|\Z)/);
  if (childrenSection) {
    const childLines = childrenSection[1].split("\n");
    for (const line of childLines) {
      const childMatch = line.match(/\d+\.\s+(.+?)\s*\((\d{4})–(\d{4}|Living|present)\)/);
      if (childMatch) {
        person.children.push({
          name: childMatch[1].trim(),
        });
      }
    }
  }
  
  // Extract events from timeline table
  const timelineMatch = content.match(/\|\s*Year\s*\|\s*Event\s*\|\s*Location\s*\|([\s\S]+?)(?=\n##|\n---|\Z)/);
  if (timelineMatch) {
    const rows = timelineMatch[1].split("\n").filter((line) => line.trim() && !line.includes("---|"));
    for (const row of rows) {
      const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        const year = cols[0];
        const event = cols[1];
        const location = cols[2];
        
        // Categorize event type
        let eventType = "custom";
        if (event.toLowerCase().includes("birth") || event.toLowerCase().includes("born")) {
          eventType = "birth";
        } else if (event.toLowerCase().includes("death") || event.toLowerCase().includes("died")) {
          eventType = "death";
        } else if (event.toLowerCase().includes("marr")) {
          eventType = "marriage";
        } else if (event.toLowerCase().includes("military") || event.toLowerCase().includes("service")) {
          eventType = "military";
        } else if (event.toLowerCase().includes("residence") || event.toLowerCase().includes("census")) {
          eventType = "residence";
        } else if (event.toLowerCase().includes("burial") || event.toLowerCase().includes("buried")) {
          eventType = "burial";
        }
        
        person.events.push({
          type: eventType,
          date: year,
          place: location !== "—" ? location : undefined,
          description: event,
        });
      }
    }
  }
  
  return person;
}

/**
 * Import all ancestors
 */
async function importAncestors() {
  console.log("🚀 Starting import...\n");
  
  const stats = {
    persons: 0,
    relationships: 0,
    events: 0,
    places: new Set<string>(),
  };
  
  const personIdMap = new Map<string, string>(); // fsId -> Convex ID
  
  // First pass: Create all persons
  console.log("📝 Pass 1: Creating persons...");
  for (const filename of ANCESTOR_FILES) {
    const filePath = path.join(ANCESTORS_DIR, filename);
    console.log(`   Reading ${filename}...`);
    
    const parsed = parseMarkdownFile(filePath);
    if (!parsed) {
      console.log(`   ⚠️  Failed to parse ${filename}`);
      continue;
    }
    
    try {
      const personId = await client.mutation(api.persons.create, {
        fsId: parsed.fsId,
        name: parsed.name,
        sex: parsed.sex,
        living: parsed.living,
        birth: parsed.birth,
        death: parsed.death,
        researchStatus: "basic",
        tags: ["imported", "ancestor"],
      });
      
      personIdMap.set(parsed.fsId, personId);
      stats.persons++;
      console.log(`   ✅ Created ${parsed.name.given} ${parsed.name.surname} (${parsed.fsId})`);
      
      // Track places
      if (parsed.birth?.place) stats.places.add(parsed.birth.place.original);
      if (parsed.death?.place) stats.places.add(parsed.death.place.original);
      
    } catch (error) {
      console.error(`   ❌ Error creating person:`, error);
    }
  }
  
  console.log(`\n✅ Created ${stats.persons} persons\n`);
  
  // Second pass: Create relationships
  console.log("🔗 Pass 2: Creating relationships...");
  for (const filename of ANCESTOR_FILES) {
    const filePath = path.join(ANCESTORS_DIR, filename);
    const parsed = parseMarkdownFile(filePath);
    if (!parsed) continue;
    
    const personId = personIdMap.get(parsed.fsId);
    if (!personId) continue;
    
    // Create parent-child relationships
    for (const parent of parsed.parents) {
      if (parent.fsId && personIdMap.has(parent.fsId)) {
        const parentId = personIdMap.get(parent.fsId)!;
        try {
          await client.mutation(api.relationships.createParentChild, {
            parentId,
            childId: personId,
            relationType: "Biological",
          });
          stats.relationships++;
          console.log(`   ✅ Linked ${parent.name} → ${parsed.name.given}`);
        } catch (error: any) {
          if (!error.message?.includes("already exists")) {
            console.error(`   ⚠️  Error creating relationship:`, error.message);
          }
        }
      }
    }
    
    // Create couple relationships
    for (const spouse of parsed.spouses) {
      if (spouse.fsId && personIdMap.has(spouse.fsId)) {
        const spouseId = personIdMap.get(spouse.fsId)!;
        
        // Create marriage fact
        const marriageFacts = [];
        if (spouse.marriageDate) {
          marriageFacts.push({
            type: "Marriage",
            date: parseDate(spouse.marriageDate),
            place: spouse.marriagePlace ? { original: spouse.marriagePlace } : undefined,
          });
        }
        
        try {
          await client.mutation(api.relationships.createCouple, {
            person1Id: personId,
            person2Id: spouseId,
            facts: marriageFacts.length > 0 ? marriageFacts : undefined,
          });
          stats.relationships++;
          console.log(`   💑 Linked couple ${parsed.name.given} ↔ ${spouse.name}`);
        } catch (error: any) {
          console.error(`   ⚠️  Error creating couple:`, error.message);
        }
      }
    }
  }
  
  console.log(`\n✅ Created ${stats.relationships} relationships\n`);
  
  // Third pass: Create events
  console.log("📅 Pass 3: Creating events...");
  for (const filename of ANCESTOR_FILES) {
    const filePath = path.join(ANCESTORS_DIR, filename);
    const parsed = parseMarkdownFile(filePath);
    if (!parsed) continue;
    
    const personId = personIdMap.get(parsed.fsId);
    if (!personId) continue;
    
    for (const event of parsed.events) {
      // Skip birth/death events (already embedded in person record)
      if (event.type === "birth" || event.type === "death") continue;
      
      try {
        const eventId = await client.mutation(api.events.create, {
          type: event.type as any,
          date: event.date ? parseDate(event.date) : undefined,
          place: event.place ? { original: event.place } : undefined,
          description: event.description,
        });
        
        // Link person to event
        await client.mutation(api.personEvents.create, {
          personId,
          eventId,
          role: "primary",
        });
        
        stats.events++;
        
        if (event.place) stats.places.add(event.place);
      } catch (error: any) {
        // Silently skip events that don't match schema
      }
    }
  }
  
  console.log(`\n✅ Created ${stats.events} events\n`);
  
  // Summary
  console.log("═══════════════════════════════════════");
  console.log("📊 IMPORT COMPLETE!");
  console.log("═══════════════════════════════════════");
  console.log(`Persons:       ${stats.persons}`);
  console.log(`Relationships: ${stats.relationships}`);
  console.log(`Events:        ${stats.events}`);
  console.log(`Places found:  ${stats.places.size}`);
  console.log("");
  console.log("🔗 View in Convex Dashboard:");
  console.log(`   ${CONVEX_URL.replace("https://", "https://dashboard.convex.dev/d/").replace(".convex.cloud", "")}`);
  console.log("");
}

// Run the import
importAncestors().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
