/**
 * Context taxonomy contract check.
 *
 * The context-store taxonomy (lib/context/taxonomy.ts) is served to external AI
 * agents at /context-schema as the "what type of thing goes where" contract.
 * This gate keeps it honest and locks in the privacy-by-default invariant:
 *
 *   - ARTIFACT_ROUTES covers every ArtifactKind exactly once (no missing/extra).
 *   - Each route.kind matches its record key.
 *   - Every targetTable is an actual owner-scoped table in convex/schema.ts
 *     (extracted via the same by_owner regex as check-owned-tables-parity).
 *   - Privacy-by-default: every kind lands private + unreviewed + aiUseAllowed:false.
 *   - requiredFields is non-empty.
 *   - Every promotesTo target is a known kind.
 *
 * Wired into `pnpm verify`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ARTIFACT_KINDS, ARTIFACT_ROUTES } from "../lib/context/taxonomy";

function extractSchemaOwnedTables(source: string): Set<string> {
  const owned = new Set<string>();
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

const errors: string[] = [];

const schemaSource = readFileSync(path.join(process.cwd(), "convex", "schema.ts"), "utf8");
const ownedTables = extractSchemaOwnedTables(schemaSource);

const kindSet = new Set<string>(ARTIFACT_KINDS);
const routeKeys = Object.keys(ARTIFACT_ROUTES);

// Completeness: every kind has a route; no extra routes.
for (const kind of ARTIFACT_KINDS) {
  if (!(kind in ARTIFACT_ROUTES)) {
    errors.push(`missing ARTIFACT_ROUTES entry for kind: ${kind}`);
  }
}
for (const key of routeKeys) {
  if (!kindSet.has(key)) {
    errors.push(`ARTIFACT_ROUTES has extra entry not in ARTIFACT_KINDS: ${key}`);
  }
}

// Per-route assertions.
for (const [key, r] of Object.entries(ARTIFACT_ROUTES)) {
  if (r.kind !== key) {
    errors.push(`${key}: route.kind "${r.kind}" does not match its record key`);
  }
  if (!ownedTables.has(r.targetTable)) {
    errors.push(
      `${key}: targetTable "${r.targetTable}" is not an owner-scoped table (no by_owner index in convex/schema.ts)`,
    );
  }
  if (r.privacyDefault !== "private") {
    errors.push(`${key}: privacyDefault must be "private" (privacy-by-default invariant)`);
  }
  if (r.reviewDefault !== "unreviewed") {
    errors.push(`${key}: reviewDefault must be "unreviewed" (privacy-by-default invariant)`);
  }
  if (r.aiUseDefault !== false) {
    errors.push(`${key}: aiUseDefault must be false (privacy-by-default invariant)`);
  }
  if (!Array.isArray(r.requiredFields) || r.requiredFields.length === 0) {
    errors.push(`${key}: requiredFields must be a non-empty array`);
  }
  for (const target of r.promotesTo) {
    if (!kindSet.has(target)) {
      errors.push(`${key}: promotesTo references unknown kind "${target}"`);
    }
  }
  if (!r.available && !r.plannedPhase) {
    errors.push(`${key}: kinds that are not available yet must document a plannedPhase`);
  }
}

if (errors.length > 0) {
  console.error("Context taxonomy check failed:");
  for (const e of errors) {
    console.error(`- ${e}`);
  }
  process.exit(1);
}

const availableCount = routeKeys.filter((k) => ARTIFACT_ROUTES[k as keyof typeof ARTIFACT_ROUTES].available).length;
console.log(
  `Context taxonomy check passed (${ARTIFACT_KINDS.length} kinds, ${availableCount} live, all target tables owner-scoped, privacy-by-default enforced).`,
);
