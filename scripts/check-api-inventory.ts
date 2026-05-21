import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const apiRoot = path.join(process.cwd(), "app", "api");
const inventoryPath = path.join(process.cwd(), "docs", "api", "route-inventory.md");
const manifestPath = path.join(process.cwd(), "docs", "api", "capability-manifest.json");
const allowedAgentSupport = new Set([
  "not-supported",
  "restricted",
  "guarded-write",
  "future-read-only",
  "future-import-agent",
  "future-research-operator",
  "future-story-writer",
  "legacy-internal",
]);
const allowedRisk = new Set(["low", "medium", "high"]);

function walkRouteFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkRouteFiles(fullPath));
    } else if (entry === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function toApiPath(filePath: string) {
  const relative = path.relative(apiRoot, filePath);
  const segments = relative.split(path.sep).slice(0, -1);
  return `/api/${segments.join("/")}`;
}

const inventory = readFileSync(inventoryPath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  routes?: Array<{
    route?: string;
    methods?: string[];
    capability?: string;
    environment?: string;
    agentSupport?: string;
    reviewLevel?: string;
    risk?: string;
    scopes?: string[];
    notes?: string;
  }>;
};
const routes = walkRouteFiles(apiRoot).map(toApiPath).sort();
const missing = routes.filter((route) => !inventory.includes(`\`${route}\``));
const manifestRoutes = manifest.routes ?? [];
const manifestRouteNames = manifestRoutes.map((entry) => entry.route).filter(Boolean);
const missingFromManifest = routes.filter((route) => !manifestRouteNames.includes(route));
const staleManifestRoutes = manifestRouteNames.filter((route) => !routes.includes(route));
const duplicateManifestRoutes = manifestRouteNames.filter((route, index) => manifestRouteNames.indexOf(route) !== index);
const invalidManifestEntries = manifestRoutes.flatMap((entry) => {
  const errors: string[] = [];
  const label = entry.route || "<missing route>";

  if (!entry.capability) errors.push(`${label}: missing capability`);
  if (!entry.environment) errors.push(`${label}: missing environment`);
  if (!entry.reviewLevel) errors.push(`${label}: missing reviewLevel`);
  if (!entry.notes) errors.push(`${label}: missing notes`);
  if (!entry.methods || entry.methods.length === 0) errors.push(`${label}: missing methods`);
  if (!entry.agentSupport || !allowedAgentSupport.has(entry.agentSupport)) {
    errors.push(`${label}: invalid agentSupport ${entry.agentSupport || "<missing>"}`);
  }
  if (!entry.risk || !allowedRisk.has(entry.risk)) {
    errors.push(`${label}: invalid risk ${entry.risk || "<missing>"}`);
  }
  if (!Array.isArray(entry.scopes)) {
    errors.push(`${label}: scopes must be an array`);
  }

  return errors;
});

if (missing.length > 0) {
  console.error("API routes missing from docs/api/route-inventory.md:");
  for (const route of missing) {
    console.error(`- ${route}`);
  }
  process.exit(1);
}

if (missingFromManifest.length > 0) {
  console.error("API routes missing from docs/api/capability-manifest.json:");
  for (const route of missingFromManifest) {
    console.error(`- ${route}`);
  }
  process.exit(1);
}

if (staleManifestRoutes.length > 0) {
  console.error("Stale routes in docs/api/capability-manifest.json:");
  for (const route of staleManifestRoutes) {
    console.error(`- ${route}`);
  }
  process.exit(1);
}

if (duplicateManifestRoutes.length > 0) {
  console.error("Duplicate routes in docs/api/capability-manifest.json:");
  for (const route of duplicateManifestRoutes) {
    console.error(`- ${route}`);
  }
  process.exit(1);
}

if (invalidManifestEntries.length > 0) {
  console.error("Invalid capability manifest entries:");
  for (const error of invalidManifestEntries) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("API inventory assertions passed");
