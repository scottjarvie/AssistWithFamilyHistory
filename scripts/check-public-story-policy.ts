import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import ts from "typescript";
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
const publishedStoryStart = convexVault.indexOf("export const getPublishedStory =");
const publishedStoryByIdentifierStart = convexVault.indexOf("export const getPublishedStoryByIdentifier =");
const researchChecksStart = convexVault.indexOf("export const getPersonResearchChecks =");
assert.ok(publishedStoryStart >= 0, "convex/vault.ts must define getPublishedStory");
assert.ok(
  publishedStoryByIdentifierStart > publishedStoryStart,
  "getPublishedStoryByIdentifier must follow getPublishedStory in convex/vault.ts",
);
assert.ok(
  researchChecksStart > publishedStoryByIdentifierStart,
  "getPersonResearchChecks must follow the public story queries in convex/vault.ts",
);

for (const [name, source] of [
  ["getPublishedStory", convexVault.slice(publishedStoryStart, publishedStoryByIdentifierStart)],
  ["getPublishedStoryByIdentifier", convexVault.slice(publishedStoryByIdentifierStart, researchChecksStart)],
]) {
  if (!source.includes("buildPublicStoryBundle(")) {
    failures.push(`${name} must call buildPublicStoryBundle`);
  }
  if (/buildStoryBundle\([^)]*publicView/.test(source)) {
    failures.push(`${name} must not call buildStoryBundle with publicView`);
  }
}

// Require the exported DTO builder and its complete body before checking for
// forbidden fields. TypeScript handles braces in strings, comments and types.
const vaultModule = ts.createSourceFile(convexVaultPath, convexVault, ts.ScriptTarget.Latest, true);
const publicBundle = vaultModule.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "buildPublicStoryBundle",
);
assert.ok(
  publicBundle?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  "convex/vault.ts must export buildPublicStoryBundle (the public DTO)",
);
const publicBundleEnd = publicBundle.body?.getLastToken();
assert.ok(
  publicBundleEnd?.kind === ts.SyntaxKind.CloseBraceToken && publicBundleEnd.getWidth() > 0,
  "buildPublicStoryBundle must have a complete function body",
);
const publicBundleBlock = publicBundle.getText();

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
