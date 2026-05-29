// GEN-94: Single source of truth for the /api/people/[id]/context-pack
// response contract consumed by the Story Writer client. Convex
// `getContextPack` (convex/vault.ts) returns a large structured object; the
// client only relies on the subset modeled below. We validate the
// load-bearing fields strictly (so server/client drift throws visibly and the
// privacy gate cannot silently disable itself) while allowing the many extra
// structured fields to pass through untouched.
import { z } from "zod";

const MediaNeedingPrivacyReviewSchema = z.object({
  title: z.string(),
  privacyLevel: z.string(),
  reviewStatus: z.string(),
  rightsStatus: z.string(),
  aiUseAllowed: z.boolean(),
});

const HistoricalContextEntrySchema = z
  .object({
    _id: z.string(),
    title: z.string(),
    packType: z.string().optional(),
    templateVersion: z.string().optional(),
    privacyLevel: z.string().optional(),
    reviewStatus: z.string().optional(),
    aiUseAllowed: z.boolean().optional(),
  })
  .loose();

const StoryClaimReadinessSchema = z
  .object({
    unresolvedProvisionalRelatives: z.number().optional(),
    unresolvedImportWarnings: z.array(z.string()).optional(),
    mediaNeedingPrivacyReview: z.array(MediaNeedingPrivacyReviewSchema).optional(),
  })
  .loose();

const StructuredSchema = z
  .object({
    person: z
      .object({
        displayName: z.string(),
        fsId: z.string().optional(),
        living: z.boolean().optional(),
      })
      .loose(),
    stats: z
      .object({
        sources: z.number(),
        memories: z.number(),
        places: z.number(),
        imports: z.number(),
      })
      .loose(),
    historicalContext: z.array(HistoricalContextEntrySchema).optional(),
    storyClaimReadiness: StoryClaimReadinessSchema.optional(),
  })
  .loose();

export const ContextPackResponseSchema = z
  .object({
    success: z.boolean(),
    structured: StructuredSchema,
    markdown: z.string(),
  })
  .loose();

export type ContextPackResponse = z.infer<typeof ContextPackResponseSchema>;
