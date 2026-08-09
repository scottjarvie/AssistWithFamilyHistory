import type { QueueOperation } from "./contract";

export const QUEUE_AGENT_TOOLS = [
  {
    name: "list_queue_items",
    description: "List a bounded page of the signed-in owner's Queue items without reading unrelated vault records.",
    requiredScope: "queue:read",
    mutates: false,
  },
  {
    name: "get_queue_item",
    description: "Read one Queue directive, its explicitly attached context references, and a bounded activity page.",
    requiredScope: "queue:read",
    mutates: false,
  },
  {
    name: "claim_queue_item",
    description: "Claim Waiting work for a bounded lease. This grants no domain-record permission.",
    requiredScope: "queue:claim",
    mutates: true,
  },
  {
    name: "checkpoint_queue_item",
    description: "Record the current step for work already claimed by this AI.",
    requiredScope: "queue:update",
    mutates: true,
  },
  {
    name: "request_user_action",
    description: "Pause claimed work with the smallest exact question or action only the user can provide.",
    requiredScope: "queue:update",
    mutates: true,
  },
  {
    name: "complete_queue_item",
    description: "Attach a readable result to work claimed by this AI and mark the Queue handoff Done.",
    requiredScope: "queue:complete",
    mutates: true,
  },
  {
    name: "report_queue_failure",
    description: "Record a bounded failure and either schedule a retry or ask the user for the exact next decision.",
    requiredScope: "queue:update",
    mutates: true,
  },
] as const satisfies ReadonlyArray<{
  name: string;
  description: string;
  requiredScope: QueueOperation;
  mutates: boolean;
}>;

export type QueueAgentToolName = (typeof QUEUE_AGENT_TOOLS)[number]["name"];

export type VerifiedQueuePrincipal = {
  ownerId: string;
  actorId: string;
  actorKind: "chosen_ai" | "first_party_ai";
  scopes: readonly string[];
  credentialId: string;
};

export function authorizeQueueAgentTool(
  principal: VerifiedQueuePrincipal,
  toolName: QueueAgentToolName,
): { ownerId: string; actorId: string; actorKind: VerifiedQueuePrincipal["actorKind"] } {
  const tool = QUEUE_AGENT_TOOLS.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error("Unknown Queue tool");
  if (!principal.ownerId.trim() || !principal.actorId.trim() || !principal.credentialId.trim()) {
    throw new Error("Queue principal must come from a verified credential");
  }
  if (!principal.scopes.includes(tool.requiredScope)) {
    throw new Error(`Queue tool requires ${tool.requiredScope}`);
  }
  return {
    ownerId: principal.ownerId,
    actorId: principal.actorId,
    actorKind: principal.actorKind,
  };
}

export function assertNoBroadQueueAgentTools(): void {
  const forbidden = /delete|publish|merge|purchase|invite|access|identity/i;
  for (const tool of QUEUE_AGENT_TOOLS) {
    if (forbidden.test(tool.name)) throw new Error(`Broad Queue tool is forbidden: ${tool.name}`);
  }
}
