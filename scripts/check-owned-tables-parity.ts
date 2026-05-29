/**
 * Owned-tables parity check (GEN-95).
 *
 * convex/vaultMigration.ts re-tags every owner-scoped row from a guest UUID to
 * a Clerk user id, iterating over a hand-maintained `OWNED_TABLES` list. That
 * list MUST stay in sync with the set of tables that actually declare a
 * `by_owner` index in convex/schema.ts. If a new owner-scoped table is added to
 * the schema but not to OWNED_TABLES, guest rows in that table would silently
 * fail to migrate on sign-up (orphaned data); the reverse drift would crash the
 * mutation at runtime.
 *
 * This check extracts both sets and fails (exit 1) if they differ, printing the
 * diff. The regex parsing mirrors scripts/check-convex-visibility.ts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "convex", "schema.ts");
const migrationPath = path.join(process.cwd(), "convex", "vaultMigration.ts");

const schemaSource = readFileSync(schemaPath, "utf8");
const migrationSource = readFileSync(migrationPath, "utf8");

/**
 * Extract every table that declares a `by_owner` index in schema.ts.
 *
 * Tables are declared as `tableName: defineTable({ ... })` followed by a chain
 * of `.index(...)` calls. We walk each `defineTable(` declaration and, for the
 * slice up to the next table declaration, check whether it contains a
 * `.index("by_owner", ...)` call.
 */
function extractSchemaOwnedTables(source: string): Set<string> {
  const owned = new Set<string>();

  // Find every `name: defineTable(` with its start offset.
  const tableRegex = /(\w+)\s*:\s*defineTable\s*\(/g;
  const tables: Array<{ name: string; start: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(source)) !== null) {
    tables.push({ name: match[1], start: match.index });
  }

  for (let i = 0; i < tables.length; i += 1) {
    const { name, start } = tables[i];
    const end = i + 1 < tables.length ? tables[i + 1].start : source.length;
    const block = source.slice(start, end);
    if (/\.index\(\s*["']by_owner["']/.test(block)) {
      owned.add(name);
    }
  }

  return owned;
}

/**
 * Extract the OWNED_TABLES array literal from vaultMigration.ts.
 */
function extractMigrationOwnedTables(source: string): Set<string> {
  const arrayMatch = source.match(/const\s+OWNED_TABLES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  if (!arrayMatch) {
    console.error("check-owned-tables-parity: could not locate OWNED_TABLES array in convex/vaultMigration.ts");
    process.exit(1);
  }
  const owned = new Set<string>();
  const entryRegex = /["'](\w+)["']/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryRegex.exec(arrayMatch[1])) !== null) {
    owned.add(entry[1]);
  }
  return owned;
}

const schemaOwned = extractSchemaOwnedTables(schemaSource);
const migrationOwned = extractMigrationOwnedTables(migrationSource);

const missingFromMigration = [...schemaOwned].filter((t) => !migrationOwned.has(t)).sort();
const missingFromSchema = [...migrationOwned].filter((t) => !schemaOwned.has(t)).sort();

if (missingFromMigration.length > 0 || missingFromSchema.length > 0) {
  console.error("Owned-tables parity check failed: OWNED_TABLES is out of sync with schema by_owner indexes.");
  if (missingFromMigration.length > 0) {
    console.error(
      `- Tables with a by_owner index in convex/schema.ts but MISSING from OWNED_TABLES (vaultMigration.ts): ${missingFromMigration.join(", ")}`,
    );
    console.error("  Guest rows in these tables would NOT migrate on sign-up. Add them to OWNED_TABLES.");
  }
  if (missingFromSchema.length > 0) {
    console.error(
      `- Tables in OWNED_TABLES (vaultMigration.ts) but with NO by_owner index in convex/schema.ts: ${missingFromSchema.join(", ")}`,
    );
    console.error("  These would crash migrateGuestVault at runtime. Remove them or add the index.");
  }
  process.exit(1);
}

console.log(`Owned-tables parity check passed (${schemaOwned.size} owner-scoped tables in sync).`);
