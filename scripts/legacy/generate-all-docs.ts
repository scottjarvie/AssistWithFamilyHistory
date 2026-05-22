#!/usr/bin/env tsx
/**
 * Generate ancestor documents for ALL persons in the database.
 */
import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { execFileSync } from "child_process";

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
  const persons = await client.query(api.persons.list, { limit: 500 });
  
  const outDir = path.resolve(process.env.HOME || "~", "clawd/research/family-history/ancestor-docs");
  fs.mkdirSync(outDir, { recursive: true });

  let generated = 0, skipped = 0, errors = 0;

  for (const person of persons) {
    if (!person.fsId) { skipped++; continue; }
    
    const safeName = `${person.name.given}-${person.name.surname}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const outPath = path.join(outDir, `${person.fsId}-${safeName}.md`);
    
    // Skip if already generated today
    if (fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath);
      const age = Date.now() - stat.mtimeMs;
      if (age < 86400000) { skipped++; continue; } // less than 24h old
    }

    try {
      execFileSync("npx", ["tsx", path.resolve(__dirname, "generate-ancestor-doc.ts"), person.fsId, "--out", outPath], {
        cwd: path.resolve(__dirname, ".."),
        timeout: 60000,
        stdio: "pipe",
      });
      generated++;
      if (generated % 25 === 0) console.log(`  ... ${generated} generated, ${skipped} skipped`);
    } catch (e: any) {
      errors++;
      if (errors <= 5) console.error(`  Error for ${person.fsId}: ${e.message?.slice(0, 100)}`);
    }
  }

  console.log(`\n✅ Batch Generation Complete:`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
