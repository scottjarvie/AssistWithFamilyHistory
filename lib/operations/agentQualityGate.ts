type ResearchCheckStatus = "missing" | "in_progress" | "complete" | "not_applicable" | "needs_review";

export type AgentResearchCheckInput = {
  completionSource: "user" | "ai_agent";
  status: ResearchCheckStatus;
  confidence?: number;
  summary?: string;
  notes?: string;
};

export function validateAgentResearchCheckUpdate(input: AgentResearchCheckInput) {
  const errors: string[] = [];

  if (input.completionSource !== "ai_agent") {
    return errors;
  }

  const summary = input.summary?.trim() || "";
  const notes = input.notes?.trim() || "";
  const confidence = typeof input.confidence === "number" ? input.confidence : 0;

  if (summary.length < 20) {
    errors.push("Agent-sourced check updates require a summary of at least 20 characters.");
  }

  if (notes.length < 20) {
    errors.push("Agent-sourced check updates require notes describing the reviewed evidence.");
  }

  if (confidence < 0.7 && input.status === "complete") {
    errors.push("Agent-sourced complete checks require confidence of at least 0.7.");
  }

  if (input.status === "not_applicable" && notes.length < 40) {
    errors.push("Agent-sourced not_applicable checks require notes explaining why the check does not apply.");
  }

  return errors;
}
