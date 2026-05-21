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

if (failures.length > 0) {
  console.error("Public story policy assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Public story policy assertions passed");
