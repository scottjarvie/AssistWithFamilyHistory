/* eslint-disable @typescript-eslint/no-explicit-any */
// Source-owned mutation builders: keep derived search fields atomic, including helper writes.
export * from "./_generated/server";
import { mutation as baseMutation, internalMutation as baseInternalMutation } from "./_generated/server";
import { withSearchWrites } from "./searchWrites";
function tracked(builder: any): any {
  return (definition: any) => builder({ ...definition, handler: (ctx: any, args: any) => definition.handler(withSearchWrites(ctx), args) });
}
export const mutation: typeof baseMutation = tracked(baseMutation);
export const internalMutation: typeof baseInternalMutation = tracked(baseInternalMutation);
