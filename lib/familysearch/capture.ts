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

export interface CaptureImportReadiness {
  canImport: boolean;
  errors: string[];
  warnings: string[];
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

export function assessCapturePackageForImport(
  capture: CapturePackage,
  options: { compatibilityMode?: boolean } = {}
): CaptureImportReadiness {
  const errors: string[] = [];
  const warnings: string[] = [];

  const familySearchId = capture.person.familySearchId.trim();
  if (!familySearchId) {
    errors.push("Capture package is missing the FamilySearch person ID.");
  } else if (!/^[A-Z0-9]{4}-[A-Z0-9]{3}$/i.test(familySearchId)) {
    warnings.push(`FamilySearch person ID has an unexpected shape: ${familySearchId}.`);
  }

  if (!capture.person.name.trim()) {
    errors.push("Capture package is missing the person name.");
  }

  const capturedAtMs = Date.parse(capture.capturedAt);
  if (Number.isNaN(capturedAtMs)) {
    errors.push("Capture package has an invalid capturedAt timestamp.");
  } else if (capturedAtMs > Date.now() + 10 * 60 * 1000) {
    errors.push("Capture package capturedAt timestamp is in the future.");
  }

  const pageUrl = parseUrl(capture.pageUrl);
  if (!pageUrl) {
    errors.push("Capture package pageUrl is not a valid URL.");
  } else if (!pageUrl.hostname.endsWith("familysearch.org")) {
    errors.push("Capture package pageUrl must come from familysearch.org.");
  } else if (!pageUrl.pathname.includes("/tree/person/")) {
    errors.push("Capture package pageUrl is not a FamilySearch person page.");
  } else if (capture.pageType === "sources" && !pageUrl.pathname.includes("/sources/")) {
    warnings.push("Capture is marked as sources, but the pageUrl does not include /sources/.");
  } else if (capture.pageType === "memories" && !pageUrl.pathname.includes("/memories/")) {
    warnings.push("Capture is marked as memories, but the pageUrl does not include /memories/.");
  }

  if (capture.sources.length === 0 && capture.memories.length === 0) {
    errors.push("Capture package contains no sources or memories.");
  }

  if (capture.pageType === "sources" && capture.sources.length === 0) {
    warnings.push("Source capture has no sources. Confirm the FamilySearch page truly had no attached sources.");
  }

  if (capture.pageType === "memories" && capture.memories.length === 0) {
    warnings.push("Memory capture has no memories. Confirm the FamilySearch page truly had no attached memories.");
  }

  if (capture.diagnostics.totalSources !== capture.sources.length) {
    warnings.push(
      `Diagnostics totalSources (${capture.diagnostics.totalSources}) does not match captured sources (${capture.sources.length}).`
    );
  }

  if (capture.diagnostics.totalMemories !== capture.memories.length) {
    warnings.push(
      `Diagnostics totalMemories (${capture.diagnostics.totalMemories}) does not match captured memories (${capture.memories.length}).`
    );
  }

  if (capture.diagnostics.mode === "admin") {
    warnings.push("Capture package was produced in admin mode and needs explicit review before merge.");
  }

  if (capture.diagnostics.failedExpansions > 0) {
    warnings.push(`${capture.diagnostics.failedExpansions} source expansion(s) failed during capture.`);
  }

  const sourceKeys = new Set<string>();
  for (const source of capture.sources) {
    if (!source.title.trim()) {
      warnings.push(`Source ${source.id || source.orderIndex} is missing a title.`);
    }
    if (sourceKeys.has(source.sourceKey)) {
      warnings.push(`Duplicate sourceKey detected: ${source.sourceKey}.`);
    }
    sourceKeys.add(source.sourceKey);

    if (source.webPageUrl && !parseUrl(source.webPageUrl)) {
      warnings.push(`Source ${source.id || source.sourceKey} has an invalid webPageUrl.`);
    }
  }

  const birthYear = parseYear(capture.person.birthDate);
  if (!capture.person.deathDate && (!birthYear || birthYear > new Date().getFullYear() - 110)) {
    warnings.push("Person may be living or private; review before importing or exposing generated work.");
  }

  if (options.compatibilityMode) {
    warnings.push("Legacy evidence-pack compatibility mode was used; v2 capture diagnostics may be incomplete.");
  }

  return {
    canImport: errors.length === 0,
    errors,
    warnings,
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

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function parseYear(value?: string) {
  const match = value?.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function stripCaptureSource(source: CaptureSource): Source {
  return {
    id: source.id,
    orderIndex: source.orderIndex,
    sourceKey: source.sourceKey,
    sourceType: source.sourceType,
    title: source.title,
    date: source.date,
    citation: source.citation,
    webPageUrl: source.webPageUrl,
    attachedBy: source.attachedBy,
    attachedAt: source.attachedAt,
    reasonAttached: source.reasonAttached,
    tags: source.tags,
    indexed: source.indexed,
    rawText: source.rawText,
    expanded: source.expanded,
    expansionAttempts: source.expansionAttempts,
    expansionSucceeded: source.expansionSucceeded,
  };
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
