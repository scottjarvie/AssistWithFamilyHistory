import type { TableNames } from "../../convex/_generated/dataModel";

/**
 * What the export carries, table by table. Left out on purpose: hashed API
 * keys, replay receipts and internal key maps (machinery, not the person's
 * records), and the evidence-upload sessions (expiring tokens).
 */
export const EXPORT_TABLES = [
  "persons", "relationships", "events", "personEvents", "places", "sources", "citations", "citationLinks",
  "sourceFacts", "sourceContents", "recordPersonas", "topics", "connections", "media", "contextItems",
  "importRuns", "familySearchSync", "researchTasks", "researchLog",
  "queueItems", "queueActivity", "documents", "stories", "storyReviewEvents", "provisionalRelatives",
  "researchChecks", "historicalContext", "agentActivity", "mcpGrants",
] as const satisfies readonly TableNames[];

export type ExportTable = (typeof EXPORT_TABLES)[number];
