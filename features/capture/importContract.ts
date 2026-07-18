import { z } from "zod";

const CaptureImportValidationSchema = z
  .object({
    canImport: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .loose();

export const CaptureImportReviewSchema = z
  .object({
    reportVersion: z.string(),
    reviewedAt: z.string(),
    canImport: z.boolean(),
    recommendedAction: z.enum(["merge", "fix_package", "human_review"]),
    summary: z.string(),
    package: z
      .object({
        captureId: z.string(),
        schemaVersion: z.string(),
        compatibilityMode: z.boolean(),
        personId: z.string(),
        personName: z.string(),
        pageType: z.enum(["sources", "memories", "person"]),
        pageUrl: z.string(),
        sourceCount: z.number(),
        memoryCount: z.number(),
        diagnosticsMode: z.enum(["standard", "admin"]),
      })
      .loose(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .loose();

export const CaptureImportPreviewResponseSchema = z
  .object({
    success: z.literal(true),
    preview: z.literal(true),
    canImport: z.boolean(),
    compatibilityMode: z.boolean(),
    personId: z.string(),
    personName: z.string(),
    pageType: z.enum(["sources", "memories", "person"]),
    sourceCount: z.number(),
    memoryCount: z.number(),
    validation: CaptureImportValidationSchema,
    review: CaptureImportReviewSchema.optional(),
  })
  .loose();

export const CaptureImportMergeResponseSchema = z
  .object({
    success: z.literal(true),
    compatibilityMode: z.boolean(),
    personId: z.string(),
    runId: z.string(),
    pageType: z.enum(["sources", "memories", "person"]),
    sourceCount: z.number(),
    memoryCount: z.number(),
    importRunId: z.string().nullable(),
    mergeStatus: z.string(),
    warnings: z.array(z.string()),
    validation: CaptureImportValidationSchema,
    review: CaptureImportReviewSchema,
    backendState: z.enum(["ready", "missing", "stale", "error"]),
    backendTitle: z.string(),
    backendDescription: z.string(),
    vaultMerged: z.boolean(),
  })
  .loose();

const CaptureImportErrorResponseSchema = z
  .object({
    error: z.string().optional(),
    details: z.string().optional(),
    validation: z
      .object({
        errors: z.array(z.string()).optional(),
        warnings: z.array(z.string()).optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type CaptureImportReview = z.infer<typeof CaptureImportReviewSchema>;
export type CaptureImportPreviewResponse = z.infer<typeof CaptureImportPreviewResponseSchema>;
export type CaptureImportMergeResponse = z.infer<typeof CaptureImportMergeResponseSchema>;

export function getCaptureImportErrorMessage(payload: unknown, fallback: string) {
  const result = CaptureImportErrorResponseSchema.safeParse(payload);
  if (!result.success) return fallback;

  const validationErrors = result.data.validation?.errors?.join(" ") ?? "";
  return [result.data.error || result.data.details || fallback, validationErrors].filter(Boolean).join(": ");
}
