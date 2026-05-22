import { readFileSync } from "node:fs";

const files = {
  schema: read("convex/schema.ts"),
  mutations: read("convex/vaultMutations.ts"),
  vault: read("convex/vault.ts"),
  route: read("app/api/context-items/route.ts"),
  panel: read("components/vault/ContextItemsPanel.tsx"),
  personPage: read("app/app/people/[personId]/page.tsx"),
};

assert(files.schema.includes("contextItems"), "Context items table missing.");
assert(files.schema.includes("evidenceRole"), "Context items must distinguish evidence roles.");
assert(files.schema.includes("privacyLevel"), "Context items must track privacy.");
assert(files.schema.includes("aiUseAllowed"), "Context items must track AI-use permission.");
assert(files.mutations.includes("upsertContextItemForPerson"), "Context item mutation missing.");
assert(files.route.includes("AI use requires reviewed, non-private context"), "Context item API must gate AI use.");
assert(files.vault.includes("isContextPackEligibleContextItem"), "Context pack eligibility filter missing.");
assert(files.vault.includes("reviewedContextItems"), "Context packs must include only reviewed loose context.");
assert(files.panel.includes("Loose Context Intake"), "Context intake UI missing.");
assert(files.personPage.includes("ContextItemsPanel"), "Person workspace must expose context intake.");

console.log("Loose-context contract checks passed.");

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
