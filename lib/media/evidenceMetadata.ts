import exifr from "exifr";
import type { EvidenceMetadataProposal } from "./evidenceStandard";

type MetadataHints = {
  fileModifiedTime?: string;
  scanTime?: string;
  inferredHistoricalEventDate?: string;
};

function iso(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function coordinate(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

/**
 * Extract metadata as reversible proposed evidence.
 *
 * An embedded time is camera capture time, never a claimed historical-event
 * date. GPS is kept private and proposed against the person-media association;
 * it is not publication consent and its disclosure precision begins withheld.
 */
export async function extractEvidenceMetadata(
  original: Uint8Array,
  originalSha256: string,
  uploadedAt: string,
  hints: MetadataHints = {},
): Promise<EvidenceMetadataProposal> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await exifr.parse(Buffer.from(original), {
      gps: true,
      exif: true,
      tiff: true,
      translateValues: true,
    })) as Record<string, unknown> ?? {};
  } catch {
    // A full image decoder still decides whether bytes are acceptable. Missing
    // or malformed metadata means no proposal, not an ingest failure.
  }

  const latitude = coordinate(parsed.latitude, -90, 90);
  const longitude = coordinate(parsed.longitude, -180, 180);
  const cameraCaptureTime = iso(
    parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.DateTimeDigitized,
  );

  return {
    temporal: {
      cameraCaptureTime,
      scanTime: iso(hints.scanTime),
      fileModifiedTime: iso(hints.fileModifiedTime),
      uploadTime: uploadedAt,
      inferredHistoricalEventDate: iso(hints.inferredHistoricalEventDate),
    },
    ...(latitude !== undefined && longitude !== undefined
      ? {
          location: {
            latitude,
            longitude,
            source: "embedded_gps" as const,
            status: "proposed" as const,
            association: "person_media" as const,
            precision: "exact_private" as const,
            disclosurePrecision: "withheld" as const,
          },
        }
      : {}),
    extractedFromOriginalSha256: originalSha256,
    extractedAt: uploadedAt,
    reversible: true,
    decision: "pending",
  };
}
