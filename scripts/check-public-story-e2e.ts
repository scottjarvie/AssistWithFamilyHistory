import { readFileSync } from "fs";
import path from "path";
import { buildPublicStoryMetadata, canRenderPublicStory } from "../lib/stories/publicStoryPolicy";

const failures: string[] = [];
const publicRoutePath = path.join(process.cwd(), "app", "stories", "[id]", "page.tsx");
const statusRoutePath = path.join(process.cwd(), "app", "api", "stories", "[id]", "status", "route.ts");
const publicRoute = readFileSync(publicRoutePath, "utf8");
const statusRoute = readFileSync(statusRoutePath, "utf8");

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

if (!publicRoute.includes("generateMetadata")) {
  failures.push("Public story page should generate story-specific metadata");
}

if (!publicRoute.includes("getPublishedStory")) {
  failures.push("Public story route must load through getPublishedStory");
}

if (!statusRoute.includes("eventType: body.status === \"published\" ? \"publish_confirmation\" : \"status_change\"")) {
  failures.push("Status route should record publish confirmation and unpublish/status rollback events");
}

if (failures.length > 0) {
  console.error("Public story E2E policy assertions failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Public story E2E policy assertions passed");
