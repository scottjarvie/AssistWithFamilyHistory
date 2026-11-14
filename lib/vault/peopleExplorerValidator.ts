import { v, type Infer } from "convex/values";
export const peopleExplorerPayload = v.object({
  _id: v.string(), routeId: v.string(), displayName: v.string(), living: v.boolean(),
  researchStatus: v.union(v.literal("not_started"), v.literal("basic"), v.literal("in_progress"), v.literal("thorough"), v.literal("complete")),
  birth: v.optional(v.object({date: v.object({year: v.optional(v.number())})})),
  death: v.optional(v.object({date: v.object({year: v.optional(v.number())})})),
  creationProvenance: v.optional(v.object({evidenceStatus: v.union(v.literal("unsourced"), v.literal("source_linked"))})),
  stats: v.object({sources: v.number(), memories: v.number(), documents: v.number(), stories: v.number(), imports: v.number()}),
  latestImport: v.union(v.object({importedAt: v.number()}), v.null()),
});
export type PeopleExplorerPayload = Infer<typeof peopleExplorerPayload>;
