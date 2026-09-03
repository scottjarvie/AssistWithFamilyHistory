import sharp from "sharp";
import type { EvidenceB2Head } from "./evidenceB2";
import { sha256Hex } from "./evidenceB2";
import { extractEvidenceMetadata } from "./evidenceMetadata";
import {
  EVIDENCE_RENDITION_MAX_BYTES,
  hasEmbeddedImageMetadata,
  privateEvidenceObjectKey,
  sniffEvidenceImage,
  type EvidenceMetadataProposal,
  type EvidenceRenditionSlot,
  type ExactEvidenceObject,
} from "./evidenceStandard";

export type EvidenceVerificationStore = {
  config: {
    bucket: string;
    bucketClass: "private" | "public";
    environment: "development" | "preview" | "production";
  };
  head(objectKey: string, versionId?: string): Promise<EvidenceB2Head>;
  read(objectKey: string, versionId: string): Promise<Uint8Array>;
  put(input: { objectKey: string; bytes: Uint8Array; contentType: string }): Promise<{
    versionId: string;
    sha256: string;
  }>;
  deleteVersion(objectKey: string, versionId: string): Promise<void>;
};

export type FinalizedEvidenceImage = {
  original: ExactEvidenceObject;
  renditions: Record<EvidenceRenditionSlot, ExactEvidenceObject>;
  metadataProposal: EvidenceMetadataProposal;
};

const EDGE: Record<EvidenceRenditionSlot, number> = {
  tiny: 192,
  medium: 1_200,
  large: 2_400,
};

const QUALITY = [84, 72, 60, 48] as const;

async function cleanRendition(
  original: Uint8Array,
  slot: EvidenceRenditionSlot,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  for (const quality of QUALITY) {
    const encoded = await sharp(Buffer.from(original), { failOn: "warning" })
      .rotate()
      .resize({
        width: EDGE[slot],
        height: EDGE[slot],
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const bytes = new Uint8Array(encoded.data);
    if (bytes.byteLength > EVIDENCE_RENDITION_MAX_BYTES) continue;
    if (hasEmbeddedImageMetadata(bytes, "image/jpeg")) {
      throw new Error(`${slot} evidence rendition retained embedded metadata.`);
    }
    return { bytes, width: encoded.info.width, height: encoded.info.height };
  }
  throw new Error(`${slot} evidence rendition exceeded its byte ceiling.`);
}

/**
 * Verify the provider's exact version, hash, length and decoded image before
 * writing three metadata-clean renditions. Partial rendition writes are
 * removed by exact version if any later step fails.
 */
export async function finalizeEvidenceImage(input: {
  store: EvidenceVerificationStore;
  uploadRef: string;
  objectKey: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  expectedSha256: string;
  fileModifiedTime?: string;
  scanTime?: string;
  inferredHistoricalEventDate?: string;
  now?: string;
}): Promise<FinalizedEvidenceImage> {
  const verifiedAt = input.now ?? new Date().toISOString();
  const head = await input.store.head(input.objectKey);
  if (head.sizeBytes !== input.declaredSizeBytes) throw new Error("Evidence byte length changed.");
  if (head.contentType.toLowerCase() !== input.declaredContentType.toLowerCase()) {
    throw new Error("Evidence stored content type changed.");
  }
  const originalBytes = await input.store.read(input.objectKey, head.versionId);
  if (originalBytes.byteLength !== head.sizeBytes) throw new Error("Evidence downloaded length changed.");
  const sha256 = sha256Hex(originalBytes);
  if (sha256 !== input.expectedSha256) throw new Error("Evidence SHA-256 did not match the declared original.");
  const sniffed = sniffEvidenceImage(originalBytes);
  if (!sniffed || sniffed.contentType !== input.declaredContentType.toLowerCase()) {
    throw new Error("Evidence bytes do not match the declared image type.");
  }

  // A successful pixel decode is separate from header sniffing.
  await sharp(Buffer.from(originalBytes), { failOn: "warning" }).raw().toBuffer();

  const original: ExactEvidenceObject = {
    bucketClass: input.store.config.bucketClass,
    bucketName: input.store.config.bucket,
    objectKey: input.objectKey,
    versionId: head.versionId,
    sha256,
    contentType: sniffed.contentType,
    sizeBytes: originalBytes.byteLength,
    width: sniffed.width,
    height: sniffed.height,
    metadataClean: false,
    verifiedAt,
  };

  const written: Array<{ objectKey: string; versionId: string }> = [];
  try {
    const prepared = await Promise.all((Object.keys(EDGE) as EvidenceRenditionSlot[]).map(async (slot) => ({
      slot,
      rendition: await cleanRendition(originalBytes, slot),
      objectKey: privateEvidenceObjectKey(input.store.config.environment, input.uploadRef, slot),
    })));
    const settled = await Promise.allSettled(prepared.map(async ({ slot, rendition, objectKey }) => {
      const stored = await input.store.put({ objectKey, bytes: rendition.bytes, contentType: "image/jpeg" });
      return { slot, rendition, objectKey, stored };
    }));
    for (const result of settled) {
      if (result.status === "fulfilled") {
        written.push({ objectKey: result.value.objectKey, versionId: result.value.stored.versionId });
      }
    }
    const failed = settled.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const entries = settled.map((result) => {
      if (result.status !== "fulfilled") throw new Error("Evidence rendition write failed.");
      const { slot, rendition, objectKey, stored } = result.value;
      return [slot, {
        bucketClass: input.store.config.bucketClass,
        bucketName: input.store.config.bucket,
        objectKey,
        versionId: stored.versionId,
        sha256: stored.sha256,
        contentType: "image/jpeg",
        sizeBytes: rendition.bytes.byteLength,
        width: rendition.width,
        height: rendition.height,
        metadataClean: true,
        verifiedAt,
        transformation: `decoded, auto-oriented, resized within ${EDGE[slot]}px, flattened, JPEG re-encoded without metadata`,
        sourceSha256: sha256,
      } satisfies ExactEvidenceObject] as const;
    });

    return {
      original,
      renditions: Object.fromEntries(entries) as Record<EvidenceRenditionSlot, ExactEvidenceObject>,
      metadataProposal: await extractEvidenceMetadata(originalBytes, sha256, verifiedAt, {
        fileModifiedTime: input.fileModifiedTime,
        scanTime: input.scanTime,
        inferredHistoricalEventDate: input.inferredHistoricalEventDate,
      }),
    };
  } catch (error) {
    await Promise.all(written.map(async (part) => {
      try { await input.store.deleteVersion(part.objectKey, part.versionId); } catch { /* reconciliation can retry */ }
    }));
    throw error;
  }
}
