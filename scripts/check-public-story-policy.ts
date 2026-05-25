import { readFileSync } from "fs";
import path from "path";
import { canRenderPublicStory } from "../lib/stories/publicStoryPolicy";

const publicRoutePath = path.join(process.cwd(), "app", "stories", "[id]", "page.tsx");
const convexVaultPath = path.join(process.cwd(), "convex", "vault.ts");
const publicRoute = readFileSync(publicRoutePath, "utf8");
const convexVault = readFileSync(convexVaultPath, "utf8");

const failures: string[] = [];

if (canRenderPublicStory("draft")) {
  failures.push("Draft stories must not render publicly");
}

if (canRenderPublicStory("review")) {
  failures.push("Review stories must not render publicly");
}

if (!canRenderPublicStory("published")) {
  failures.push("Published stories must render publicly");
}

if (!publicRoute.includes("canRenderPublicStory(bundle.story.status)")) {
  failures.push("Public story page must enforce the shared public story policy");
}

if (!convexVault.includes('story.status !== "published"')) {
  failures.push("Convex getPublishedStory must reject non-published stories before building a public bundle");
}

// GEN-77: public Convex queries must use buildPublicStoryBundle (explicit
// field allowlist), not buildStoryBundle({publicView: true}) which only
// gated 2 of 12 fields and returned the full internal review bundle.
if (!convexVault.includes("export function buildPublicStoryBundle")) {
  failures.push("convex/vault.ts must export buildPublicStoryBundle (the public DTO)");
}

const publicQueryBlock = (() => {
  const start = convexVault.indexOf("export const getPublishedStory");
  if (start < 0) return "";
  const end = convexVault.indexOf("export const getPersonResearchChecks", start);
  return convexVault.slice(start, end > 0 ? end : start + 2000);
})();

if (!publicQueryBlock.includes("buildPublicStoryBundle(")) {
  failures.push("getPublishedStory / getPublishedStoryByIdentifier must call buildPublicStoryBundle, not buildStoryBundle({publicView: true})");
}

if (/buildStoryBundle\([^)]*publicView/.test(publicQueryBlock)) {
  failures.push("Public queries must not call buildStoryBundle with publicView; the leaky 2-field gate has been replaced by buildPublicStoryBundle");
}

// Behavioral: assert the public bundle shape does NOT carry forbidden
// internal fields. Parse buildPublicStoryBundle's return statement and
// confirm none of these keys appear at the top level.
const publicBundleBlock = (() => {
  const start = convexVault.indexOf("export function buildPublicStoryBundle");
  if (start < 0) return "";
  // Find the matching closing brace by walking the body.
  const bodyStart = convexVault.indexOf("{", start);
  let depth = 0;
  for (let i = bodyStart; i < convexVault.length; i++) {
    if (convexVault[i] === "{") depth++;
    else if (convexVault[i] === "}") {
      depth--;
      if (depth === 0) return convexVault.slice(start, i + 1);
    }
  }
  return convexVault.slice(start);
})();

const forbiddenInPublicBundle = [
  "contextCoverage:",
  "reviewHistory:",
  "provisionalRelatives:",
  "researchChecks:",
  "publishWarnings:",
  "readiness:",
  "relatedStories:",
];
for (const forbidden of forbiddenInPublicBundle) {
  if (publicBundleBlock.includes(forbidden)) {
    failures.push(`buildPublicStoryBundle returns forbidden field: ${forbidden} (this is a reviewer-only internal field, must not be exposed to unauthenticated clients)`);
  }
}

if (failures.length > 0) {
  console.error("Public story policy assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Public story policy assertions passed");
