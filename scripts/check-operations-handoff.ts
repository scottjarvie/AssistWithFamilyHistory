import { buildOperationsHandoffPacket } from "@/lib/operations/handoff";
import { readFileSync } from "node:fs";

const packet = buildOperationsHandoffPacket(
  {
    summary: {
      visibleRows: 3,
    },
    rows: [
      {
        rowType: "person",
        id: "KWCJ-4XD",
        displayName: "John Jarvie",
        personIdentifier: "KWCJ-4XD",
        anchorPersonIdentifier: "KWCJ-4XD",
        missingCritical: [],
        nextActions: ["Draft story"],
        completionPercent: 100,
        sourceCount: 10,
        memoryCount: 1,
        storyWorkflow: "ready_to_draft",
        staleChecksCount: 0,
      },
      {
        rowType: "provisional",
        id: "provisional-1",
        displayName: "Possible Parent",
        personIdentifier: null,
        anchorPersonIdentifier: "KWCJ-4XD",
        missingCritical: ["identity_review", "relationships"],
        nextActions: ["Review identity"],
        completionPercent: 0,
        sourceCount: 1,
        memoryCount: 0,
        storyWorkflow: "needs_genealogy_evidence",
        staleChecksCount: 0,
      },
    ],
  },
  { generatedAt: "2026-05-21T12:00:00.000Z" },
);

assert(packet.rows[0].handoff.recommendedAgent === "story-writer", "Ready row should route to story writer.");
assert(
  packet.rows[0].routes.contextPack === "/api/people/KWCJ-4XD/context-pack?format=markdown",
  "Person handoff should include context-pack route.",
);
assert(
  packet.rows[0].handoff.prompt.includes("John Jarvie"),
  "Person handoff should include a paste-ready prompt.",
);
assert(
  packet.rows[1].handoff.reviewLevel === "human-review-required",
  "Provisional row should require human review.",
);
assert(
  packet.rows[1].routes.anchorWorkspace === "/app/people/KWCJ-4XD",
  "Provisional handoff should include anchor workspace route.",
);
assert(
  packet.rows[1].handoff.prompt.includes("Do not execute"),
  "Provisional handoff should warn against irreversible graph changes.",
);
assert(JSON.stringify(packet).includes("2026-05-21"), "Packet should include deterministic generatedAt.");

const operationActionsSource = readFileSync("components/vault/OperationRowActions.tsx", "utf8");
const provisionalRouteSource = readFileSync("app/api/operations/provisional/route.ts", "utf8");

for (const token of [
  "Clipboard unavailable",
  "handoffDialogOpen",
  "reviewNoteReady",
  "Human review required",
  "Minimum 20 characters",
]) {
  assert(operationActionsSource.includes(token), `Operation row actions missing ${token}`);
}

assert(
  provisionalRouteSource.includes("requireHumanReviewConfirmation"),
  "Provisional API route must enforce human review confirmation.",
);

console.log("Operations handoff checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
