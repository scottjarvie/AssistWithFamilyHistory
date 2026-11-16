import { v, type Infer } from "convex/values";
const check = v.object({ checkKey: v.string(), status: v.string(), applicability: v.string(), lastReviewedAt: v.optional(v.number()) });
export const operationRow = v.object({
    rowType: v.union(v.literal("person"), v.literal("provisional")), id: v.string(), personIdentifier: v.union(v.string(), v.null()), displayName: v.string(), relationshipHint: v.optional(v.string()), lifespan: v.string(), keyPlaces: v.array(v.string()),
    completionPercent: v.number(), sourceCount: v.number(), memoryCount: v.number(), documentCount: v.number(), storyCount: v.number(), openTaskCount: v.number(), contextReportCount: v.number(), storyWorkflow: v.string(), latestImportAt: v.union(v.number(), v.null()), lastTouched: v.number(), missingCritical: v.array(v.string()), nextActions: v.array(v.string()), staleChecksCount: v.number(), researchChecks: v.array(check), storyReadinessScore: v.number(), anchorPersonIdentifier: v.string(), badge: v.string(),
});
export const readinessRow = v.object({ _id: v.id("persons"), displayName: v.string(), routeId: v.string(), lifespan: v.string(), storyWorkflow: v.string(), completionPercent: v.number(), sourceCount: v.number(), contextReportCount: v.number(), storyCount: v.number(), nextActions: v.array(v.string()) });
export const missingFlags = v.object({ identity_review: v.boolean(), biography: v.boolean(), timeline: v.boolean(), relationships: v.boolean(), birth_record: v.boolean(), marriage_record: v.boolean(), death_record: v.boolean(), census: v.boolean(), immigration: v.boolean(), military: v.boolean(), probate_land_newspaper: v.boolean(), church_records: v.boolean(), memories: v.boolean(), place_context: v.boolean() });
export const scoreRowFields = {
    auditWithoutSources: v.optional(v.boolean()), auditWithoutContext: v.optional(v.boolean()), auditWithoutStories: v.optional(v.boolean()),
    recordId: v.string(), vaultOwnerId: v.string(), rowType: v.union(v.literal("person"), v.literal("provisional")), storyWorkflow: v.string(),
    missing: missingFlags, hasStory: v.boolean(),
    operation: operationRow, readiness: v.optional(readinessRow), counts: v.record(v.string(), v.number()), reviews: v.array(v.number()), oldestReview: v.optional(v.number()),
    readinessOrder: v.string(), missingCriticalOrder: v.string(), completionOrder: v.string(), lastTouchedOrder: v.string(), sourceCountOrder: v.string(), storyReadinessOrder: v.string(), newestImportOrder: v.string(),
};
export type OperationRow = Infer<typeof operationRow>;
export type ReadinessRow = Infer<typeof readinessRow>;
export type OperationSummary = {
    visibleRows: number;
    provisionalRows: number;
    missingRequired: number;
    missingRecommended: number;
    staleChecks: number;
    averageCompletion: number;
};
export type OperationsPage = {
    rows: OperationRow[];
    summary: OperationSummary; exact: boolean; summaryScope: "vault" | "loaded";
    continueCursor: string;
    isDone: boolean;
};
export type ReadinessPage = {
    page: ReadinessRow[];
    continueCursor: string;
    isDone: boolean;
};
export const STALE_AGE = 45 * 24 * 60 * 60 * 1000;
export const staleCount = (reviews: number[], now: number) => reviews.filter(t => t > 0 && t < now - STALE_AGE).length;
// Full IEEE precision; stable creation order is also the old readiness tie order.
export function orderedNumber(n: number) {
    if(n===0)n=0; // Canonicalize -0 before encoding the sign bit.
    const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, n); const bits = d.getBigUint64(0); return (n < 0 ? BigInt.asUintN(64, ~bits) : bits ^ 0x8000000000000000n).toString(16).padStart(16, "0"); }
