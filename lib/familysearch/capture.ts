import { z } from "zod";
import {
  EvidencePackSchema,
  type EvidencePack,
  type Source,
} from "@/features/source-docs/lib/schemas";

const RelatedPersonSchema = z.object({
  familySearchId: z.string().optional(),
  name: z.string(),
  role: z.string().optional(),
});

const PlaceMentionSchema = z.object({
  familySearchId: z.string().optional(),
  name: z.string(),
  fullName: z.string().optional(),
  role: z.string().optional(),
});

const MemorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  mediaType: z.string().optional(),
  imageUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  memoryUrl: z.string().optional(),
  familySearchUrl: z.string().optional(),
  createdAt: z.string().optional(),
  attachedBy: z.string().optional(),
  relatedPeople: z.array(RelatedPersonSchema).default([]),
  placeMentions: z.array(PlaceMentionSchema).default([]),
  notes: z.string().optional(),
});

const CaptureDiagnosticsSchema = z.object({
  mode: z.enum(["standard", "admin"]),
  totalSources: z.number().default(0),
  totalMemories: z.number().default(0),
  expandedSections: z.number().default(0),
  failedExpansions: z.number().default(0),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      sourceId: z.string().optional(),
    })
  ),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      fatal: z.boolean(),
    })
  ),
});

export const CapturePackageSchema = z.object({
  schemaVersion: z.literal("2.0"),
  captureId: z.string(),
  capturedAt: z.string(),
  extractorVersion: z.string(),
  extractionDurationMs: z.number(),
  pageType: z.enum(["sources", "memories", "person"]),
  pageUrl: z.string(),
  pageTitle: z.string(),
  uiLocale: z.string(),
  person: z.object({
    familySearchId: z.string(),
    name: z.string(),
    birthDate: z.string().optional(),
    deathDate: z.string().optional(),
    portraitUrl: z.string().optional(),
  }),
  sources: z.array(
    EvidencePackSchema.shape.sources.element.extend({
      relatedPeople: z.array(RelatedPersonSchema).default([]),
      placeMentions: z.array(PlaceMentionSchema).default([]),
      outboundUrls: z.array(z.string()).default([]),
    })
  ).default([]),
  memories: z.array(MemorySchema).default([]),
  placeMentions: z.array(PlaceMentionSchema).default([]),
  diagnostics: CaptureDiagnosticsSchema,
});

export type CapturePackage = z.infer<typeof CapturePackageSchema>;
export type CaptureSource = CapturePackage["sources"][number];
export type CaptureMemory = z.infer<typeof MemorySchema>;

export interface ParsedCapturePackage {
  capture: CapturePackage;
  compatibilityMode: boolean;
  legacyEvidencePack?: EvidencePack;
}

export function parseCapturePackage(input: unknown): ParsedCapturePackage {
  const captureResult = CapturePackageSchema.safeParse(input);
  if (captureResult.success) {
    return {
      capture: captureResult.data,
      compatibilityMode: false,
      legacyEvidencePack:
        captureResult.data.pageType === "sources" && captureResult.data.sources.length > 0
          ? toLegacyEvidencePack(captureResult.data)
          : undefined,
    };
  }

  const legacyResult = EvidencePackSchema.safeParse(input);
  if (!legacyResult.success) {
    throw new z.ZodError([
      ...captureResult.error.issues,
      ...legacyResult.error.issues,
    ]);
  }

  const capture = fromLegacyEvidencePack(legacyResult.data);
  return {
    capture,
    compatibilityMode: true,
    legacyEvidencePack: legacyResult.data,
  };
}

export function fromLegacyEvidencePack(pack: EvidencePack): CapturePackage {
  return {
    schemaVersion: "2.0",
    captureId: pack.runId,
    capturedAt: pack.capturedAt,
    extractorVersion: pack.extractorVersion,
    extractionDurationMs: pack.extractionDurationMs,
    pageType: "sources",
    pageUrl: pack.sourceUrl,
    pageTitle: pack.pageTitle,
    uiLocale: pack.uiLocale,
    person: {
      familySearchId: pack.person.familySearchId,
      name: pack.person.name,
      birthDate: pack.person.birthDate,
      deathDate: pack.person.deathDate,
    },
    sources: pack.sources.map((source) => ({
      ...source,
      relatedPeople: extractRelatedPeople(source),
      placeMentions: extractPlaceMentions(source),
      outboundUrls: [source.webPageUrl].filter(Boolean) as string[],
    })),
    memories: [],
    placeMentions: [],
    diagnostics: {
      mode: pack.diagnostics.mode,
      totalSources: pack.diagnostics.totalSources,
      totalMemories: 0,
      expandedSections: pack.diagnostics.expandedSections,
      failedExpansions: pack.diagnostics.failedExpansions,
      warnings: pack.diagnostics.warnings,
      errors: pack.diagnostics.errors,
    },
  };
}

export function toLegacyEvidencePack(capture: CapturePackage): EvidencePack {
  return {
    schemaVersion: "1.0",
    runId: capture.captureId,
    capturedAt: capture.capturedAt,
    extractorVersion: capture.extractorVersion,
    extractionDurationMs: capture.extractionDurationMs,
    sourceUrl: capture.pageUrl,
    pageTitle: capture.pageTitle,
    uiLocale: capture.uiLocale,
    person: {
      familySearchId: capture.person.familySearchId,
      name: capture.person.name,
      birthDate: capture.person.birthDate,
      deathDate: capture.person.deathDate,
    },
    sources: capture.sources.map((source) => stripCaptureSource(source)),
    diagnostics: {
      mode: capture.diagnostics.mode,
      totalSources: capture.diagnostics.totalSources,
      expandedSections: capture.diagnostics.expandedSections,
      failedExpansions: capture.diagnostics.failedExpansions,
      warnings: capture.diagnostics.warnings.map((warning) => ({
        code:
          warning.code === "VIRTUALIZED_LIST" ||
          warning.code === "EXPAND_TIMEOUT" ||
          warning.code === "MISSING_FIELD" ||
          warning.code === "RATE_LIMITED"
            ? warning.code
            : "MISSING_FIELD",
        message: warning.message,
        sourceId: warning.sourceId,
      })),
      errors: capture.diagnostics.errors,
    },
  };
}

function stripCaptureSource(source: CaptureSource): Source {
  const { relatedPeople: _relatedPeople, placeMentions: _placeMentions, outboundUrls: _outboundUrls, ...legacy } =
    source;
  return legacy;
}

function extractRelatedPeople(source: Source): Array<{ name: string; role?: string }> {
  return source.indexed.fields
    .filter((field) => /name/i.test(field.label) && field.value.trim().length > 0)
    .map((field) => ({
      name: field.value.trim(),
      role: field.label,
    }));
}

function extractPlaceMentions(source: Source): Array<{ name: string; role?: string }> {
  return source.indexed.fields
    .filter((field) => /place|residence|location|parish/i.test(field.label) && field.value.trim().length > 0)
    .map((field) => ({
      name: field.value.trim(),
      role: field.label,
    }));
}

