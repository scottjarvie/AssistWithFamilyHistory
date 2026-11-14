/* eslint-disable @typescript-eslint/no-explicit-any */
// Source-owned mutation builders: keep derived search fields atomic, including helper writes.
export * from "./_generated/server";
import { mutation as baseMutation, internalMutation as baseInternalMutation } from "./_generated/server";
import { applyExplorerChanges, type ExplorerChange } from "./peopleExplorer";
import { withSearchWrites } from "./searchWrites";
function tracked(builder: any): any {
  return (definition: any) => builder({ ...definition, handler: async (ctx: any, args: any) => {const changes: ExplorerChange[] = []; const result = await definition.handler(withSearchWrites(ctx, changes), args); await applyExplorerChanges(ctx, changes); return result;} });
}
export const mutation: typeof baseMutation = tracked(baseMutation);
export const internalMutation: typeof baseInternalMutation = tracked(baseInternalMutation);
