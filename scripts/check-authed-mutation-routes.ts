/**
 * Authenticated Convex mutation-route contract (GEN-103).
 *
 * Every API route that performs a Convex mutation must resolve the authenticated
 * server client so the caller's Clerk token can reach Convex. The authenticated
 * helper safely falls back to the raw client when no Clerk identity is available.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const apiDir = path.join(process.cwd(), "app", "api");
const failures: string[] = [];

function listRouteFiles(dir: string): string[] {
  const routeFiles: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routeFiles.push(...listRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      routeFiles.push(fullPath);
    }
  }

  return routeFiles;
}

const routeFiles = listRouteFiles(apiDir).sort();
let mutatingRouteCount = 0;

for (const routeFile of routeFiles) {
  const source = readFileSync(routeFile, "utf8");
  if (!source.includes(".mutation(")) continue;

  mutatingRouteCount += 1;
  const relativePath = path.relative(process.cwd(), routeFile);

  if (source.includes("getConvexClient().mutation(")) {
    failures.push(
      `${relativePath}: calls getConvexClient().mutation(); mutating API routes must use getAuthedConvexClient().`
    );
  } else if (source.includes("getConvexClient(")) {
    failures.push(
      `${relativePath}: references getConvexClient(); all Convex access in a mutating API route must use getAuthedConvexClient().`
    );
  }

  if (!source.includes("getAuthedConvexClient(")) {
    failures.push(
      `${relativePath}: performs a mutation without resolving getAuthedConvexClient().`
    );
  }
}

const importRoute = path.join(apiDir, "import", "route.ts");
const importSource = readFileSync(importRoute, "utf8");

if (/client\s*:\s*getConvexClient\s*\(\s*\)/.test(importSource)) {
  failures.push(
    "app/api/import/route.ts: passes getConvexClient() into the importer; use await getAuthedConvexClient()."
  );
}

if (!/client\s*:\s*await\s+getAuthedConvexClient\s*\(\s*\)/.test(importSource)) {
  failures.push(
    "app/api/import/route.ts: must pass await getAuthedConvexClient() as the importer client."
  );
}

if (failures.length > 0) {
  console.error("check:authed-mutation-routes failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `check:authed-mutation-routes — ${mutatingRouteCount} mutating route(s) all use the authed Convex client`
);
