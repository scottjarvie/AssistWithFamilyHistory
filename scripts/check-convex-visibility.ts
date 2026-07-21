/**
 * Convex visibility contract check (GEN-73).
 *
 * After GEN-69 internalized 7 files' worth of unscoped public Convex
 * functions, this check is the guardrail that prevents the bug from
 * recurring. Asserts:
 *
 *   Every `export const x = query(...)` or `export const x = mutation(...)`
 *   in `convex/*.ts` (excluding `_generated/`) either:
 *
 *     (a) is in fact an internalQuery/internalMutation under an aliased
 *         import like `import { internalQuery as query } from "./_generated/server"`,
 *         OR
 *     (b) references `vaultOwnerId` somewhere in the handler body, OR
 *     (c) is in an explicit allowlist of public functions that deliberately
 *         use a different, documented authorization boundary.
 *
 * Anything else → fail.
 *
 * If you genuinely need a public-unscoped function (e.g. the
 * published-story-by-slug query), add it to PUBLIC_UNSCOPED_ALLOWLIST
 * below with a one-line reason.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PUBLIC_UNSCOPED_ALLOWLIST: Record<string, string> = {
  // Public story-by-slug lookup. Bound by `status === "published"` before
  // any data is returned; uses buildPublicStoryBundle which filters fields.
  "vault.ts:getPublishedStory":
    "Public story render path; gated by status==published + buildPublicStoryBundle DTO.",
  "vault.ts:getPublishedStoryByIdentifier":
    "Public story render path; gated by status==published + buildPublicStoryBundle DTO.",
  "trustBoundary.ts:getShadowLogSummary":
    "Control-plane read; always fail-closed behind TRUST_BOUNDARY_SUPER_ADMIN_IDS.",
  // Guest migration binds its destination owner to the authenticated Clerk
  // identity. In enforce mode the unverified guest source capability is denied;
  // in shadow it is logged so the legacy workflow can be measured first.
  "vaultMigration.ts:migrateGuestVault":
    "Destination is bound by authorizeTenantMutation; unsigned guest source is shadow-logged or denied.",
};

const failures: string[] = [];
const convexDir = path.join(process.cwd(), "convex");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "_generated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = listSourceFiles(convexDir);

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const basename = path.basename(file);

  // Detect aliased internal imports — `internalQuery as query` etc.
  const importLine = source.match(/import\s*\{\s*([^}]*)\s*\}\s*from\s*["']\.\/(_generated\/)?server["']/);
  const aliasedToInternal = importLine
    ? /\binternalQuery\s+as\s+query\b/.test(importLine[1]) ||
      /\binternalMutation\s+as\s+mutation\b/.test(importLine[1])
    : false;

  // If the whole file aliases query/mutation to internal, every export in it
  // is effectively internal — accept.
  if (aliasedToInternal) continue;

  // Walk every `export const x = query({` or `export const x = mutation({`.
  const exportRegex = /export\s+const\s+(\w+)\s*=\s*(query|mutation)\s*\(\s*\{([\s\S]*?)\n\}\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(source)) !== null) {
    const [, name, , body] = match;
    const allowKey = `${basename}:${name}`;

    if (PUBLIC_UNSCOPED_ALLOWLIST[allowKey]) {
      // Allowlisted — skip but require the file to have explicit gating.
      continue;
    }

    // Accept if the handler body references vaultOwnerId.
    if (/\bvaultOwnerId\b/.test(body)) continue;

    failures.push(
      `${path.relative(process.cwd(), file)}: public export "${name}" does not reference vaultOwnerId and is not in PUBLIC_UNSCOPED_ALLOWLIST. ` +
        `Either add a vaultOwnerId argument with owner filtering, convert the file to use ` +
        `\`import { internalQuery as query, internalMutation as mutation } from "./_generated/server"\`, ` +
        `or add "${allowKey}" to the allowlist with a reason.`
    );
  }
}

if (failures.length > 0) {
  console.error("Convex visibility contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Convex visibility contract passed.");
