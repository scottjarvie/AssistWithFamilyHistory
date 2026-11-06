import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

type OperationsQueue = FunctionReturnType<typeof api.vaultReads.getOperationsQueue>;
/** Explicit browser boundary. Never forward research-check documents or their private notes. */
export function projectOperationRow(row: OperationsQueue["rows"][number]) {
  return {
    id: row.id, rowType: row.rowType, personIdentifier: row.personIdentifier,
    name: row.displayName, lifespan: row.lifespan, places: row.keyPlaces,
    coverage: row.completionPercent, sources: row.sourceCount, memories: row.memoryCount,
    documents: row.documentCount, context: row.contextReportCount, stories: row.storyCount,
    workflow: row.storyWorkflow, missing: row.missingCritical, nextActions: row.nextActions,
    stale: row.staleChecksCount, anchor: row.anchorPersonIdentifier || null, badge: row.badge,
  };
}
export type OperationCollectionRow = ReturnType<typeof projectOperationRow>;
export type OperationSummary = OperationsQueue["summary"];
export const operationWorkflowLabels: Record<string, string> = {
  needs_genealogy_evidence: "Needs genealogy evidence", needs_context_research: "Needs context research",
  ready_to_draft: "Ready to draft", ready_to_review: "Ready to review", published: "Published",
};
export const operationFilterKeys = ["q", "type", "storyStatus", "storyWorkflow", "staleOnly", "sortBy", "sortDirection", "missingCheck"] as const;
export type OperationFilters = Record<typeof operationFilterKeys[number], string>;
export function normalizeOperationFilters(input: Record<string, string | string[] | undefined>): OperationFilters {
  const filters=Object.fromEntries(operationFilterKeys.map(key => [key, typeof input[key] === "string" ? input[key] : Array.isArray(input[key]) ? input[key][0] || "" : ""])) as OperationFilters;
  filters.staleOnly=filters.staleOnly==="true"?"true":"";
  return filters;
}
