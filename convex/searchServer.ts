/* eslint-disable @typescript-eslint/no-explicit-any */
// Source-owned mutation builders: keep derived search fields atomic, including helper writes.
export * from "./_generated/server";
import { mutation as baseMutation, internalMutation as baseInternalMutation } from "./_generated/server";
import { applyExplorerChanges, type ExplorerChange } from "./peopleExplorer";
import { withSearchWrites, flushSearchWrites } from "./searchWrites";
function tracked(builder: any, defer = false): any {
  return (definition: any) => builder({
    ...definition,
    handler: async (ctx: any, args: any) => {
      const changes: ExplorerChange[] = [];
      const trackedCtx = withSearchWrites(ctx, changes, defer);
      let result;
      try {
        result = await definition.handler(trackedCtx, args);
      } finally {
        await flushSearchWrites(trackedCtx);
      }
      await applyExplorerChanges(ctx, changes, defer);
      return result;
    },
  });
}
export const mutation: typeof baseMutation = tracked(baseMutation);
export const internalMutation: typeof baseInternalMutation = tracked(baseInternalMutation);

/** Guest retagging defers projections and avoids capturing unrelated record changes. */
export const deferredExplorerMutation: typeof baseMutation = tracked(baseMutation, true);
