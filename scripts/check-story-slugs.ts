import { readFileSync } from "fs";
import path from "path";
import { buildStoryPublicSlug, getStoryIdSuffix, publicStoryPath, slugifyStoryPart } from "../lib/stories/slug";
import { buildPublicStoryMetadata, buildPublicStorySharePreview } from "../lib/stories/publicStoryPolicy";

const failures: string[] = [];
const schema = readFileSync(path.join(process.cwd(), "convex", "schema.ts"), "utf8");
const vaultQuery = readFileSync(path.join(process.cwd(), "convex", "vault.ts"), "utf8");
const vaultMutations = readFileSync(path.join(process.cwd(), "convex", "vaultMutations.ts"), "utf8");
const publicRoute = readFileSync(path.join(process.cwd(), "app", "stories", "[id]", "page.tsx"), "utf8");
const ogRoute = readFileSync(path.join(process.cwd(), "app", "stories", "[id]", "opengraph-image.tsx"), "utf8");

if (slugifyStoryPart("Élodie & John: A Family Story!") !== "elodie-john-a-family-story") {
  failures.push("Slugify should normalize accents and punctuation");
}

const slug = buildStoryPublicSlug({
  storyId: "jx7b1234567890",
  title: "Crossing The Plains",
  personName: "Jane Example",
});

if (!slug.startsWith("jane-example-crossing-the-plains-")) {
  failures.push("Public slug should include person and title context");
}

if (!slug.endsWith(getStoryIdSuffix("jx7b1234567890"))) {
  failures.push("Public slug should end with stable story ID suffix");
}

if (publicStoryPath(slug) !== `/stories/${slug}`) {
  failures.push("Public story path helper should route through /stories/[identifier]");
}

if (!schema.includes("publicSlug") || !schema.includes("by_public_slug")) {
  failures.push("Story schema must store and index publicSlug");
}

if (!schema.includes("publicIndexing")) {
  failures.push("Story schema must expose noindex/index launch toggle");
}

if (!vaultQuery.includes("getPublishedStoryByIdentifier") || !vaultQuery.includes("normalizeId(\"stories\"")) {
  failures.push("Public story query must resolve both slug and legacy ID identifiers");
}

if (!vaultMutations.includes("backfillStoryPublicSlugs")) {
  failures.push("Slug rollout needs a backfill mutation for existing stories");
}

if (!publicRoute.includes("redirect(publicStoryPath(story.publicSlug))")) {
  failures.push("Legacy ID route should redirect to the canonical slug when available");
}

if (!ogRoute.includes("getPublishedStoryByIdentifier") || !ogRoute.includes("buildPublicStorySharePreview")) {
  failures.push("Story OG route must use only published story data");
}

const indexedMetadata = buildPublicStoryMetadata({
  story: {
    status: "published",
    title: "Indexed Story",
    content: "A public story that has been explicitly marked ready for search indexing.",
    publicIndexing: "index",
  },
  person: { displayName: "Jane Example" },
});

if (indexedMetadata.robots.index !== true || indexedMetadata.robots.follow !== true) {
  failures.push("Published stories should only index when publicIndexing is set to index");
}

const preview = buildPublicStorySharePreview({
  story: { status: "published", title: "Share Me", content: "Share preview copy." },
  person: { displayName: "Jane Example", lifespan: "1830 to 1901" },
});

if (!preview.eyebrow.includes("Jane Example") || !preview.title.includes("Share Me")) {
  failures.push("Share preview should use published person/story labels");
}

if (failures.length > 0) {
  console.error("Story slug/share assertions failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Story slug/share assertions passed");
