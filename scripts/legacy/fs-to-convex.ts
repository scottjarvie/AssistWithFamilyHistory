#!/usr/bin/env tsx
/**
 * Import FamilySearch extracted data into Convex database
 * 
 * This script takes JSON output from fs-extractor.js or fs-sources-extractor.js
 * and writes it to the Convex database.
 * 
 * Usage:
 *   # Import person data
 *   npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json
 * 
 *   # Import sources data
 *   npx tsx scripts/fs-to-convex.ts --sources sources-KWCJ-4XD.json
 * 
 *   # Import both (person first, then sources)
 *   npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json sources-KWCJ-4XD.json
 */

import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

// Load environment variables
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
if (!CONVEX_URL) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL not found in environment");
  console.error("   Make sure you're running this from the discover-their-stories directory");
  console.error("   and that .env.local is configured.");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

// ===== TYPES =====
interface ExtractedPerson {
  fsId: string;
  name: {
    given: string;
    surname: string;
    suffix?: string;
    prefix?: string;
    nickname?: string;
  };
  alternateNames?: Array<{
    type: string;
    given: string;
    surname: string;
  }>;
  sex: "male" | "female" | "unknown";
  living: boolean;
  qualityScore?: string;
  birth?: {
    date?: {
      original: string;
      year?: number;
      month?: number;
      day?: number;
      approximate?: boolean;
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
      approximate?: boolean;
    };
    place?: {
      original: string;
    };
  };
  burial?: {
    date?: {
      original: string;
      year?: number;
      month?: number;
      day?: number;
      approximate?: boolean;
    };
    place?: {
      original: string;
    };
  };
  events?: Array<{
    type: string;
    customType?: string;
    date?: {
      original: string;
      year?: number;
      month?: number;
      day?: number;
      approximate?: boolean;
    };
    place?: {
      original: string;
    };
    description?: string;
  }>;
  parents?: Array<{
    name: string;
    fsId?: string;
  }>;
  spouses?: Array<{
    name: string;
    fsId?: string;
    marriageDate?: string;
    marriagePlace?: string;
  }>;
  children?: Array<{
    name: string;
    fsId?: string;
  }>;
  sourceCount?: number;
  memoryCount?: number;
  lastChanged?: {
    date: string;
    contributor: string;
  };
  extractedAt: string;
  extractedFrom: string;
}

interface ExtractedSources {
  fsId: string;
  sources: Array<{
    order: number;
    title?: string;
    type: string;
    repository?: string;
    fsSourceUrl?: string;
    fsSourceId?: string;
    externalUrl?: string;
    confidence: string;
    citations: Array<{
      text: string;
    }>;
  }>;
  extractedAt: string;
  extractedFrom: string;
}

// ===== IMPORT PERSON =====
async function importPerson(data: ExtractedPerson): Promise<Id<"persons"> | null> {
  console.log(`\n📝 Importing person: ${data.name.given} ${data.name.surname} (${data.fsId})`);
  console.log(`   Extracted: ${new Date(data.extractedAt).toLocaleString()}`);
  
  try {
    // Check if person already exists
    const existing = await client.query(api.persons.getByFsId, { fsId: data.fsId });
    
    if (existing) {
      console.log(`⚠️  Person already exists with ID: ${existing._id}`);
      console.log(`   Do you want to update? (This will require manual editing or a new mutation)`);
      console.log(`   For now, skipping import. Use the web UI to update existing persons.`);
      return existing._id;
    }
    
    // Create the person
    const personId = await client.mutation(api.persons.create, {
      fsId: data.fsId,
      name: data.name,
      alternateNames: data.alternateNames,
      sex: data.sex,
      living: data.living,
      birth: data.birth,
      death: data.death,
      researchStatus: "basic",
      tags: ["imported", "familysearch"],
      notes: data.lastChanged 
        ? `Imported from FamilySearch on ${new Date(data.extractedAt).toLocaleDateString()}.\nLast changed on FamilySearch: ${data.lastChanged.date} by ${data.lastChanged.contributor}.`
        : `Imported from FamilySearch on ${new Date(data.extractedAt).toLocaleDateString()}.`,
    });
    
    console.log(`✅ Created person: ${personId}`);
    
    // Import burial as an event if present
    if (data.burial) {
      const burialEventId = await client.mutation(api.events.create, {
        type: "burial",
        date: data.burial.date,
        place: data.burial.place,
      });
      
      await client.mutation(api.personEvents.create, {
        personId,
        eventId: burialEventId,
        role: "primary",
      });
      
      console.log(`   ✓ Added burial event`);
    }
    
    // Import other events
    if (data.events && data.events.length > 0) {
      for (const event of data.events) {
        try {
          // Map custom event types to schema types
          let eventType: any = event.type;
          const validTypes = [
            "birth", "death", "burial", "baptism", "christening",
            "marriage", "divorce", "immigration", "emigration",
            "residence", "occupation", "military", "census",
            "naturalization", "probate", "land_record", "custom"
          ];
          
          if (!validTypes.includes(eventType)) {
            eventType = "custom";
          }
          
          const eventId = await client.mutation(api.events.create, {
            type: eventType,
            customType: event.customType || event.type,
            date: event.date,
            place: event.place,
            description: event.description,
          });
          
          await client.mutation(api.personEvents.create, {
            personId,
            eventId,
            role: "primary",
          });
        } catch (error: any) {
          console.warn(`   ⚠️  Could not import event "${event.type}": ${error.message}`);
        }
      }
      console.log(`   ✓ Added ${data.events.length} events`);
    }
    
    // Store relationships for later (need to import related persons first)
    if (data.parents && data.parents.length > 0) {
      console.log(`   📋 Parents: ${data.parents.map(p => `${p.name} (${p.fsId || 'no ID'})`).join(', ')}`);
    }
    
    if (data.spouses && data.spouses.length > 0) {
      console.log(`   💑 Spouses: ${data.spouses.map(s => `${s.name} (${s.fsId || 'no ID'})`).join(', ')}`);
    }
    
    if (data.children && data.children.length > 0) {
      console.log(`   👶 Children: ${data.children.length} listed (${data.children.map(c => c.name).join(', ')})`);
    }
    
    console.log(`\n💡 To link relationships, import related persons first, then use the web UI or create a relationship script.`);
    
    return personId;
    
  } catch (error: any) {
    console.error(`❌ Error importing person: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return null;
  }
}

// ===== IMPORT SOURCES =====
async function importSources(data: ExtractedSources): Promise<void> {
  console.log(`\n📚 Importing sources for person: ${data.fsId}`);
  console.log(`   Found ${data.sources.length} sources`);
  
  // Get the person by FamilySearch ID
  const person = await client.query(api.persons.getByFsId, { fsId: data.fsId });
  
  if (!person) {
    console.error(`❌ Person with FamilySearch ID ${data.fsId} not found in database.`);
    console.error(`   Import the person first using: npx tsx scripts/fs-to-convex.ts person-${data.fsId}.json`);
    return;
  }
  
  console.log(`✓ Found person: ${person.name.given} ${person.name.surname} (${person._id})`);
  
  let sourcesCreated = 0;
  let citationsCreated = 0;
  
  for (const sourceData of data.sources) {
    try {
      // Create the source
      const sourceId = await client.mutation(api.sources.create, {
        title: sourceData.title || "Untitled Source",
        type: sourceData.type as any,
        repository: sourceData.repository,
        url: sourceData.externalUrl || sourceData.fsSourceUrl,
        fsId: sourceData.fsSourceId,
      });
      
      sourcesCreated++;
      console.log(`   ✓ Source ${sourceData.order}: ${sourceData.title || '(untitled)'}`);
      
      // Create citations for this source
      for (const citationData of sourceData.citations) {
        const citationId = await client.mutation(api.citations.create, {
          sourceId,
          confidence: sourceData.confidence as any,
          extractedText: citationData.text,
        });
        
        // Link citation to the person
        await client.mutation(api.citations.linkToTarget, {
          citationId,
          targetType: "person",
          targetId: person._id,
        });
        
        citationsCreated++;
      }
      
      if (sourceData.citations.length > 0) {
        console.log(`     └─ ${sourceData.citations.length} citation(s) linked to person`);
      }
      
    } catch (error: any) {
      console.warn(`   ⚠️  Error importing source "${sourceData.title}": ${error.message}`);
    }
  }
  
  console.log(`\n✅ Imported ${sourcesCreated} sources with ${citationsCreated} citations`);
}

// ===== MAIN =====
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  FamilySearch to Convex Importer                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ No input files specified.\n');
    console.log('Usage:');
    console.log('  npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json');
    console.log('  npx tsx scripts/fs-to-convex.ts --sources sources-KWCJ-4XD.json');
    console.log('  npx tsx scripts/fs-to-convex.ts person.json sources.json');
    console.log('');
    process.exit(1);
  }
  
  const personFiles: string[] = [];
  const sourceFiles: string[] = [];
  let nextIsSource = false;
  
  // Parse arguments
  for (const arg of args) {
    if (arg === '--sources') {
      nextIsSource = true;
    } else if (nextIsSource) {
      sourceFiles.push(arg);
      nextIsSource = false;
    } else {
      // Auto-detect based on filename
      if (arg.includes('source')) {
        sourceFiles.push(arg);
      } else {
        personFiles.push(arg);
      }
    }
  }
  
  // Import persons first
  for (const file of personFiles) {
    const filePath = path.resolve(file);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }
    
    console.log(`\n📂 Reading: ${path.basename(filePath)}`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data: ExtractedPerson = JSON.parse(content);
      
      await importPerson(data);
      
    } catch (error: any) {
      console.error(`❌ Error processing file: ${error.message}`);
    }
  }
  
  // Then import sources
  for (const file of sourceFiles) {
    const filePath = path.resolve(file);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }
    
    console.log(`\n📂 Reading: ${path.basename(filePath)}`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data: ExtractedSources = JSON.parse(content);
      
      await importSources(data);
      
    } catch (error: any) {
      console.error(`❌ Error processing file: ${error.message}`);
    }
  }
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Import Complete!                                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🔗 View in Convex Dashboard:');
  console.log(`   ${CONVEX_URL.replace('https://', 'https://dashboard.convex.dev/d/').replace('.convex.cloud', '')}`);
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   • Use the web UI to link relationships (parents, spouses, children)');
  console.log('   • Review and enhance the imported data');
  console.log('   • Generate stories using the AI features');
  console.log('');
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
