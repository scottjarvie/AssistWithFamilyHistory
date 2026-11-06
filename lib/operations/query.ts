import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { normalizeOperationFilters, operationFilterKeys, type OperationFilters } from "@/lib/vault/operationsRows";
type QueryArgs = Omit<FunctionArgs<typeof api.vaultReads.getOperationsQueue>, "vaultOwnerId" | "limit">;
/** The page and handoff export must apply precisely the same supported vault facets. */
export function operationQueryArguments(input: OperationFilters): QueryArgs {
 const f=normalizeOperationFilters(input);
 return {
  search:f.q||undefined,
  rowType:f.type==="person"||f.type==="provisional"?f.type:undefined,
  storyStatus:f.storyStatus==="has_story"||f.storyStatus==="no_story"?f.storyStatus:undefined,
  storyWorkflow:f.storyWorkflow==="needs_genealogy_evidence"||f.storyWorkflow==="needs_context_research"||f.storyWorkflow==="ready_to_draft"||f.storyWorkflow==="ready_to_review"||f.storyWorkflow==="published"?f.storyWorkflow:undefined,
  staleOnly:f.staleOnly==="true"?true:undefined,
  sortBy:f.sortBy==="completion"||f.sortBy==="lastTouched"||f.sortBy==="sourceCount"||f.sortBy==="storyReadiness"||f.sortBy==="newestImport"||f.sortBy==="missingCritical"?f.sortBy:"missingCritical",
  sortDirection:f.sortDirection==="asc"||f.sortDirection==="desc"?f.sortDirection:"desc",
  missingCheck:f.missingCheck||undefined,
 };
}
export function operationFiltersFromURL(search:URLSearchParams):OperationFilters {
 return normalizeOperationFilters(Object.fromEntries(operationFilterKeys.map(key=>[key,search.get(key)||""])));
}
