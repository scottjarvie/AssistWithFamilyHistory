import { readFileSync } from "node:fs";

const files = {
  processRoute: read("app/api/process/route.ts"),
  openRouter: read("lib/ai/openrouter.ts"),
  privacy: read("lib/ai/privacy.ts"),
  sourceAiPage: read("app/app/source-docs/[personId]/ai/page.tsx"),
  storyWriter: read("components/vault/StoryWriterStudio.tsx"),
  schema: read("convex/schema.ts"),
  importer: read("lib/familysearch/importer.ts"),
  vault: read("convex/vault.ts"),
  mediaReview: read("components/vault/MediaPrivacyReviewPanel.tsx"),
  safeLog: read("lib/server/safeLog.ts"),
  convexServer: read("lib/convex/server.ts"),
};

assert(files.processRoute.includes("privacyAcknowledged"), "AI process route must require privacy acknowledgement.");
assert(files.processRoute.includes("redactionMode"), "AI process route must require redaction mode.");
assert(files.processRoute.includes("AI redaction mode required"), "AI process route must reject missing redaction mode when data is present.");
assert(files.openRouter.includes("sanitizeAiProviderError"), "OpenRouter errors must be sanitized.");
assert(files.privacy.includes("getAiPrivacyDisclosure"), "AI privacy disclosure helper is missing.");
assert(files.sourceAiPage.includes("Use redacted data before sending living-person indicators"), "Source-doc AI page must block unredacted living-person submissions.");
assert(files.storyWriter.includes("will not send living-person context"), "Story Writer must block living-person external generation.");
assert(files.storyWriter.includes("Review media privacy and AI-use permissions"), "Story Writer must block unreviewed media external generation.");
assert(files.schema.includes("privacyLevel"), "Media schema must include privacy level.");
assert(files.schema.includes("reviewStatus"), "Media schema must include review status.");
assert(files.schema.includes("rightsStatus"), "Media schema must include rights status.");
assert(files.importer.includes('privacyLevel: "private"'), "FamilySearch memories must import as private.");
assert(files.importer.includes('reviewStatus: "unreviewed"'), "FamilySearch memories must import as unreviewed.");
assert(files.importer.includes("aiUseAllowed: false"), "FamilySearch memories must not allow AI use by default.");
assert(files.vault.includes("isPublicStoryMedia"), "Public story media filter is missing.");
assert(files.vault.includes("media_privacy_review"), "Publish warnings must include media privacy review.");
assert(files.vault.includes("mediaNeedingPrivacyReview"), "Context packs must expose media privacy review state.");
assert(files.mediaReview.includes("Media review saved"), "Media privacy review UI is missing.");
assert(files.safeLog.includes("SECRET_LIKE"), "Safe server logging must filter sensitive fields.");
assert(files.openRouter.includes("logServerFailure"), "OpenRouter failures must produce safe server logs.");
assert(files.convexServer.includes("logServerFailure"), "Convex runtime failures must produce safe server logs.");

console.log("Privacy and AI safety checks passed.");

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
