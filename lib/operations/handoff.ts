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
    storyWorkflow: unknown;
    staleChecksCount: unknown;
    handoff: {
      recommendedAgent: "researcher" | "intake-reviewer" | "story-writer" | "human-identity-review";
      reviewLevel: "agent-can-draft" | "human-review-required";
      reason: string;
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
      storyWorkflow: row.storyWorkflow,
      staleChecksCount: row.staleChecksCount,
      handoff: classifyHandoff(row),
    })),
  };
}

function classifyHandoff(row: Record<string, unknown>): OperationsHandoffPacket["rows"][number]["handoff"] {
  if (row.rowType === "provisional") {
    return {
      recommendedAgent: "human-identity-review",
      reviewLevel: "human-review-required",
      reason: "Provisional relatives change the identity graph and should not be promoted or merged by agents yet.",
    };
  }

  const missingCritical = Array.isArray(row.missingCritical) ? row.missingCritical : [];
  const storyWorkflow = String(row.storyWorkflow || "");

  if (missingCritical.includes("identity_review") || missingCritical.includes("relationships")) {
    return {
      recommendedAgent: "intake-reviewer",
      reviewLevel: "human-review-required",
      reason: "Identity or relationship checks are missing before downstream story work should proceed.",
    };
  }

  if (storyWorkflow === "ready_to_draft" || storyWorkflow === "ready_to_review") {
    return {
      recommendedAgent: "story-writer",
      reviewLevel: "agent-can-draft",
      reason: "Evidence coverage is high enough to prepare or refine a draft for human review.",
    };
  }

  return {
    recommendedAgent: "researcher",
    reviewLevel: "agent-can-draft",
    reason: "The row still needs evidence gathering, context work, or research-task cleanup.",
  };
}
