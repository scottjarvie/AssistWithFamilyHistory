type QueuePayload = {
  summary: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
};

export type OperationsHandoffPacket = {
  packetVersion: "2026-05-21";
  generatedAt: string;
  summary: Record<string, unknown>;
  rows: Array<{
    rowType: unknown;
    id: unknown;
    displayName: unknown;
    personIdentifier: unknown;
    anchorPersonIdentifier: unknown;
    missingCritical: unknown;
    nextActions: unknown;
    completionPercent: unknown;
    sourceCount: unknown;
    memoryCount: unknown;
    documentCount: unknown;
    contextReportCount: unknown;
    storyWorkflow: unknown;
    staleChecksCount: unknown;
    routes: {
      operations: string;
      personWorkspace?: string;
      contextPack?: string;
      anchorWorkspace?: string;
    };
    handoff: {
      recommendedAgent: "researcher" | "intake-reviewer" | "story-writer" | "human-identity-review";
      reviewLevel: "agent-can-draft" | "human-review-required";
      reason: string;
      prompt: string;
    };
  }>;
};

export function buildOperationsHandoffPacket(
  payload: QueuePayload,
  options: { generatedAt?: string } = {},
): OperationsHandoffPacket {
  return {
    packetVersion: "2026-05-21",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summary: payload.summary,
    rows: payload.rows.map((row) => ({
      rowType: row.rowType,
      id: row.id,
      displayName: row.displayName,
      personIdentifier: row.personIdentifier,
      anchorPersonIdentifier: row.anchorPersonIdentifier,
      missingCritical: row.missingCritical,
      nextActions: row.nextActions,
      completionPercent: row.completionPercent,
      sourceCount: row.sourceCount,
      memoryCount: row.memoryCount,
      documentCount: row.documentCount,
      contextReportCount: row.contextReportCount,
      storyWorkflow: row.storyWorkflow,
      staleChecksCount: row.staleChecksCount,
      routes: buildRoutes(row),
      handoff: classifyHandoff(row),
    })),
  };
}

function classifyHandoff(row: Record<string, unknown>): OperationsHandoffPacket["rows"][number]["handoff"] {
  const displayName = String(row.displayName || "this row");
  const personIdentifier = typeof row.personIdentifier === "string" ? row.personIdentifier : "";
  const nextActions = Array.isArray(row.nextActions)
    ? row.nextActions.map((action) => String(action)).filter(Boolean)
    : [];

  if (row.rowType === "provisional") {
    return {
      recommendedAgent: "human-identity-review",
      reviewLevel: "human-review-required",
      reason: "Provisional relatives change the identity graph and should not be promoted or merged by agents yet.",
      prompt: [
        `Review provisional relative ${displayName}.`,
        "Compare the provisional evidence against the anchor workspace before recommending promote, merge, or dismiss.",
        "Do not execute the final identity-graph change without explicit human review.",
      ].join(" "),
    };
  }

  const missingCritical = Array.isArray(row.missingCritical) ? row.missingCritical : [];
  const storyWorkflow = String(row.storyWorkflow || "");

  if (missingCritical.includes("identity_review") || missingCritical.includes("relationships")) {
    return {
      recommendedAgent: "intake-reviewer",
      reviewLevel: "human-review-required",
      reason: "Identity or relationship checks are missing before downstream story work should proceed.",
      prompt: [
        `Review intake evidence for ${displayName}${personIdentifier ? ` (${personIdentifier})` : ""}.`,
        nextActions.length > 0 ? `Start with: ${nextActions.join(" ")}` : "Start with missing identity and relationship checks.",
        "Leave evidence-backed notes before marking checks complete.",
      ].join(" "),
    };
  }

  if (storyWorkflow === "ready_to_draft" || storyWorkflow === "ready_to_review") {
    return {
      recommendedAgent: "story-writer",
      reviewLevel: "agent-can-draft",
      reason: "Evidence coverage is high enough to prepare or refine a draft for human review.",
      prompt: [
        `Use the context pack for ${displayName}${personIdentifier ? ` (${personIdentifier})` : ""} to draft or refine story work.`,
        "Keep claims tied to cited evidence and leave unresolved gaps visible for review.",
      ].join(" "),
    };
  }

  return {
    recommendedAgent: "researcher",
    reviewLevel: "agent-can-draft",
    reason: "The row still needs evidence gathering, context work, or research-task cleanup.",
    prompt: [
      `Continue research operations for ${displayName}${personIdentifier ? ` (${personIdentifier})` : ""}.`,
      nextActions.length > 0 ? `Start with: ${nextActions.join(" ")}` : "Start with the operations queue next action.",
      "Prefer evidence collection and notes over irreversible graph changes.",
    ].join(" "),
  };
}

function buildRoutes(row: Record<string, unknown>): OperationsHandoffPacket["rows"][number]["routes"] {
  const personIdentifier = typeof row.personIdentifier === "string" ? row.personIdentifier : "";
  const anchorPersonIdentifier = typeof row.anchorPersonIdentifier === "string" ? row.anchorPersonIdentifier : "";

  return {
    operations: "/app/operations",
    personWorkspace: personIdentifier ? `/app/people/${personIdentifier}` : undefined,
    contextPack: personIdentifier ? `/api/people/${personIdentifier}/context-pack?format=markdown` : undefined,
    anchorWorkspace: anchorPersonIdentifier ? `/app/people/${anchorPersonIdentifier}` : undefined,
  };
}
