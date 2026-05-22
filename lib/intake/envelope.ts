import { z } from "zod";
import type { CapturePackage } from "@/lib/familysearch/capture";

export const IntakeProviderSchema = z.enum([
  "familysearch",
  "gedcom",
  "ancestry",
  "findagrave",
  "local_upload",
  "manual",
]);

export const IntakeEnvelopeSchema = z.object({
  schemaVersion: z.literal("1.0"),
  provider: IntakeProviderSchema,
  providerRecordId: z.string(),
  capturedAt: z.string(),
  subject: z.object({
    externalId: z.string().optional(),
    name: z.string(),
    birthDate: z.string().optional(),
    deathDate: z.string().optional(),
  }),
  sources: z.array(
    z.object({
      providerSourceId: z.string().optional(),
      sourceKey: z.string(),
      title: z.string(),
      url: z.string().optional(),
      evidenceText: z.string().optional(),
      indexedFields: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      ),
    })
  ),
  relatedPeople: z.array(
    z.object({
      externalId: z.string().optional(),
      name: z.string(),
      role: z.string().optional(),
      sourceKey: z.string().optional(),
    })
  ),
  places: z.array(
    z.object({
      externalId: z.string().optional(),
      name: z.string(),
      fullName: z.string().optional(),
      role: z.string().optional(),
      sourceKey: z.string().optional(),
    })
  ),
  media: z.array(
    z.object({
      providerMediaId: z.string().optional(),
      title: z.string(),
      mediaType: z.string().optional(),
      url: z.string().optional(),
      privacySignal: z.enum(["private", "unknown", "public_hint"]).default("unknown"),
      rightsSignal: z.enum(["unknown", "owned", "permitted", "public_domain", "restricted"]).default("unknown"),
    })
  ),
  diagnostics: z.object({
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    rawArtifactRefs: z.array(z.string()),
  }),
});

export type IntakeEnvelope = z.infer<typeof IntakeEnvelopeSchema>;

export function familySearchCaptureToIntakeEnvelope(capture: CapturePackage): IntakeEnvelope {
  return {
    schemaVersion: "1.0",
    provider: "familysearch",
    providerRecordId: capture.captureId,
    capturedAt: capture.capturedAt,
    subject: {
      externalId: capture.person.familySearchId,
      name: capture.person.name,
      birthDate: capture.person.birthDate,
      deathDate: capture.person.deathDate,
    },
    sources: capture.sources.map((source) => ({
      providerSourceId: source.id,
      sourceKey: source.sourceKey,
      title: source.title,
      url: source.webPageUrl,
      evidenceText: source.rawText || source.citation,
      indexedFields: source.indexed.fields.map((field) => ({
        label: field.label,
        value: field.value,
      })),
    })),
    relatedPeople: capture.sources.flatMap((source) =>
      source.relatedPeople.map((person) => ({
        externalId: person.familySearchId,
        name: person.name,
        role: person.role,
        sourceKey: source.sourceKey,
      }))
    ),
    places: [
      ...capture.placeMentions.map((place) => ({
        externalId: place.familySearchId,
        name: place.name,
        fullName: place.fullName,
        role: place.role,
      })),
      ...capture.sources.flatMap((source) =>
        source.placeMentions.map((place) => ({
          externalId: place.familySearchId,
          name: place.name,
          fullName: place.fullName,
          role: place.role,
          sourceKey: source.sourceKey,
        }))
      ),
    ],
    media: capture.memories.map((memory) => ({
      providerMediaId: memory.id,
      title: memory.title,
      mediaType: memory.mediaType,
      url: memory.familySearchUrl || memory.memoryUrl || memory.imageUrl || memory.thumbnailUrl,
      privacySignal: "unknown",
      rightsSignal: "unknown",
    })),
    diagnostics: {
      warnings: capture.diagnostics.warnings.map((warning) => warning.message),
      errors: capture.diagnostics.errors.map((error) => error.message),
      rawArtifactRefs: [capture.pageUrl],
    },
  };
}
