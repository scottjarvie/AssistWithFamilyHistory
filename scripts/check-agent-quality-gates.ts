import { validateAgentResearchCheckUpdate } from "@/lib/operations/agentQualityGate";

assert(
  validateAgentResearchCheckUpdate({
    completionSource: "user",
    status: "complete",
  }).length === 0,
  "User updates should not be blocked by agent gates.",
);

const weakAgentUpdate = validateAgentResearchCheckUpdate({
  completionSource: "ai_agent",
  status: "complete",
  confidence: 0.5,
  summary: "Done",
  notes: "Looks fine.",
});

assert(weakAgentUpdate.length >= 3, "Weak agent update should fail multiple quality gates.");

const strongAgentUpdate = validateAgentResearchCheckUpdate({
  completionSource: "ai_agent",
  status: "complete",
  confidence: 0.85,
  summary: "Birth evidence is supported by a reviewed indexed source.",
  notes: "Reviewed the imported citation text and linked source fields before marking this check complete.",
});

assert(strongAgentUpdate.length === 0, "Strong agent update should pass quality gates.");

console.log("Agent quality gate checks passed.");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
