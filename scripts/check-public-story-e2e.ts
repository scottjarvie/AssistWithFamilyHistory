import { readFileSync } from "fs";
import path from "path";
import { buildPublicStoryMetadata, canRenderPublicStory } from "../lib/stories/publicStoryPolicy";
import { buildStoryPublicSlug, publicStoryPath } from "../lib/stories/slug";

const failures: string[] = [];
const publicRoutePath = path.join(process.cwd(), "app", "stories", "[id]", "page.tsx");
const statusRoutePath = path.join(process.cwd(), "app", "api", "stories", "[id]", "status", "route.ts");
const publicRoute = readFileSync(publicRoutePath, "utf8");
const statusRoute = readFileSync(statusRoutePath, "utf8");
const vaultMutations = readFileSync(path.join(process.cwd(), "convex", "vaultMutations.ts"), "utf8");
const ogRoute = readFileSync(path.join(process.cwd(), "app", "stories", "[id]", "opengraph-image.tsx"), "utf8");

const statuses = [
  { status: "draft" as const, shouldRender: false },
  { status: "review" as const, shouldRender: false },
  { status: "published" as const, shouldRender: true },
];

for (const entry of statuses) {
  if (canRenderPublicStory(entry.status) !== entry.shouldRender) {
    failures.push(`${entry.status}: public render policy mismatch`);
  }
}

const publishedMetadata = buildPublicStoryMetadata({
  story: {
    status: "published",
    title: "Crossing The Plains",
    content:
      "A public story grounded in wagon company records, local context, and source citations that should become useful share metadata.",
  },
  person: { displayName: "Jane Example", lifespan: "1830 to 1901" },
});

if (!publishedMetadata.title.includes("Jane Example") || !publishedMetadata.title.includes("Crossing The Plains")) {
  failures.push("Published metadata should include person and story title");
}

if (publishedMetadata.description.includes("not published")) {
  failures.push("Published metadata should not use unpublished fallback copy");
}

const draftMetadata = buildPublicStoryMetadata({
  story: { status: "draft", title: "Private Draft" },
  person: { displayName: "Jane Example" },
});

if (draftMetadata.robots.index !== false || draftMetadata.robots.follow !== false) {
  failures.push("Unpublished metadata must be noindex/nofollow");
}

const indexedMetadata = buildPublicStoryMetadata({
  story: { status: "published", title: "Indexed Story", publicIndexing: "index" },
  person: { displayName: "Jane Example" },
});

if (indexedMetadata.robots.index !== true || indexedMetadata.robots.follow !== true) {
  failures.push("Published story metadata should support explicit index/follow launch toggle");
}

const slug = buildStoryPublicSlug({
  storyId: "storyabc12345678",
  title: "Public Memory",
  personName: "Jane Example",
});

if (!publicStoryPath(slug).startsWith("/stories/jane-example-public-memory-")) {
  failures.push("Slug routes should use readable public story identifiers");
}

if (!publicRoute.includes("generateMetadata")) {
  failures.push("Public story page should generate story-specific metadata");
}

if (!publicRoute.includes("getPublishedStoryByIdentifier")) {
  failures.push("Public story route must load through slug/ID identifier resolution");
}

if (!publicRoute.includes("redirect(publicStoryPath(story.publicSlug))")) {
  failures.push("Public story route should redirect legacy ID routes to canonical slugs");
}

if (!ogRoute.includes("getPublishedStoryByIdentifier") || !ogRoute.includes("Story not available")) {
  failures.push("Public story OG route must avoid leaking unpublished story data");
}

if (
  !vaultMutations.includes('eventType: "publish_confirmation"') ||
  !vaultMutations.includes('if (args.status === "published" && publishReadiness)')
) {
  failures.push("Backend status mutation should atomically record publish confirmation events");
}

if (
  !statusRoute.includes('if (body.status !== "published")') ||
  !statusRoute.includes('eventType: "status_change"')
) {
  failures.push("Status route should record non-publish status changes without duplicating publish confirmation");
}

if (failures.length > 0) {
  console.error("Public story E2E policy assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Public story E2E policy assertions passed");
