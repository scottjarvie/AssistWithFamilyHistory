import { readFileSync } from "fs";
import path from "path";
import { canRenderPublicStory } from "../lib/stories/publicStoryPolicy";
import {
  extractImplementationWithDelegatedHelpers,
  findUniqueExportedVariable,
  findUniqueFunctionDeclaration,
  findUniqueIndex,
  readConcernFiles,
} from "./lib/sourceGuards";

const publicRoutePath = path.join(process.cwd(), "app", "stories", "[id]", "page.tsx");
const publicRoute = readFileSync(publicRoutePath, "utf8");
const vaultEntryFile = readConcernFiles(["convex/vault.ts"]);
const storyBundleFiles = readConcernFiles([
  "convex/vault.ts",
  "convex/lib/storyBundles.ts",
]);

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

// GEN-77: public Convex queries must use buildPublicStoryBundle (explicit
// field allowlist), not buildStoryBundle({publicView: true}) which only
// gated 2 of 12 fields and returned the full internal review bundle.
const publishedStorySource = extractImplementationWithDelegatedHelpers(
  findUniqueExportedVariable(vaultEntryFile, "getPublishedStory", { stripComments: true }),
  storyBundleFiles,
  { stripComments: true },
);
const publishedStoryByIdentifierSource = extractImplementationWithDelegatedHelpers(
  findUniqueExportedVariable(vaultEntryFile, "getPublishedStoryByIdentifier", {
    stripComments: true,
  }),
  storyBundleFiles,
  { stripComments: true },
);

for (const [name, storyVariable, source] of [
  ["getPublishedStory", "story", publishedStorySource],
  ["getPublishedStoryByIdentifier", "candidate", publishedStoryByIdentifierSource],
]) {
  const buildBundle = findUniqueIndex(
    source,
    "buildPublicStoryBundle(",
    `${name} buildPublicStoryBundle call`,
  );
  const beforeBundle = source.slice(0, buildBundle);
  const rejectUnpublished = new RegExp(
    String.raw`if\s*\([^)]*\b${storyVariable}\.status\s*!==\s*"published"[^)]*\)\s*return\s+null\b`,
  );
  if (!rejectUnpublished.test(beforeBundle)) {
    failures.push(`${name} must reject non-published stories before building a public bundle`);
  }
  if (!/if\s*\([^)]*\bperson\.living\s*\)\s*return\s+null\b/.test(beforeBundle)) {
    failures.push(`${name} must reject living subjects before building a public bundle`);
  }
  if (/buildStoryBundle\([^)]*publicView/.test(source)) {
    failures.push(`${name} must not call buildStoryBundle with publicView`);
  }
}

// Require the exported DTO builder and its complete body before checking for
// forbidden fields. TypeScript handles braces in strings, comments and types.
const publicBundleBlock = findUniqueFunctionDeclaration(
  storyBundleFiles,
  "buildPublicStoryBundle",
  { exportedOnly: true, stripComments: true },
).text;

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
