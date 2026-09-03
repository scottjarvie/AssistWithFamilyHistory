/**
 * Provider-free rules for durable family-history evidence bytes.
 *
 * The original is evidence and therefore stays byte-for-byte exact. Anything
 * shown in the ordinary product or delivered to a connected AI is a named,
 * freshly encoded rendition with its transformation recorded. Provider URLs
 * and provider coordinates never cross this module's public types.
 */

export const EVIDENCE_UPLOAD_TTL_SECONDS = 30 * 60;
export const EVIDENCE_ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;
export const EVIDENCE_RENDITION_MAX_BYTES = 3 * 1024 * 1024;

export const EVIDENCE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type EvidenceImageType = (typeof EVIDENCE_IMAGE_TYPES)[number];

export const EVIDENCE_MEDIA_STATES = [
  "authorized",
  "uploaded",
  "ready",
  "failed",
  "deleting",
  "deleted",
] as const;
export type EvidenceMediaState = (typeof EVIDENCE_MEDIA_STATES)[number];

export type EvidenceRenditionSlot = "tiny" | "medium" | "large";

export type ExactEvidenceObject = {
  bucketClass: "private" | "public";
  bucketName: string;
  objectKey: string;
  versionId: string;
  sha256: string;
  contentType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  metadataClean: boolean;
  verifiedAt: string;
  transformation?: string;
  sourceSha256?: string;
};

export type ProposedTemporalEvidence = {
  cameraCaptureTime?: string;
  scanTime?: string;
  fileModifiedTime?: string;
  uploadTime: string;
  inferredHistoricalEventDate?: string;
};

export type ProposedLocationEvidence = {
  latitude: number;
  longitude: number;
  source: "embedded_gps";
  status: "proposed";
  association: "person_media" | "event" | "place";
  precision: "exact_private";
  disclosurePrecision: "withheld" | "locality" | "region";
};

export type EvidenceMetadataProposal = {
  temporal: ProposedTemporalEvidence;
  location?: ProposedLocationEvidence;
  extractedFromOriginalSha256: string;
  extractedAt: string;
  reversible: true;
  decision: "pending" | "accepted" | "declined";
  acceptedAt?: string;
  declinedAt?: string;
};

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset < 0 || offset + value.length > bytes.length) return false;
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function be16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function be32(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000
    + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

function le24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export type SniffedEvidenceImage = {
  contentType: EvidenceImageType;
  width?: number;
  height?: number;
};

function sniffJpeg(bytes: Uint8Array): SniffedEvidenceImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = be16(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) {
      return {
        contentType: "image/jpeg",
        height: be16(bytes, offset + 5),
        width: be16(bytes, offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { contentType: "image/jpeg" };
}

function sniffPng(bytes: Uint8Array): SniffedEvidenceImage | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  return { contentType: "image/png", width: be32(bytes, 16), height: be32(bytes, 20) };
}

function sniffWebp(bytes: Uint8Array): SniffedEvidenceImage | null {
  if (bytes.length < 16 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return null;
  if (bytes.length >= 30 && ascii(bytes, 12, "VP8X")) {
    return {
      contentType: "image/webp",
      width: 1 + le24(bytes, 24),
      height: 1 + le24(bytes, 27),
    };
  }
  return { contentType: "image/webp" };
}

/** Determine the admitted upload type from bytes, never from a header or name. */
export function sniffEvidenceImage(bytes: Uint8Array): SniffedEvidenceImage | null {
  return sniffJpeg(bytes) ?? sniffPng(bytes) ?? sniffWebp(bytes);
}

/** Display copies must contain no EXIF, XMP, IPTC, or textual metadata blocks. */
export function hasEmbeddedImageMetadata(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = be16(bytes, offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if (marker === 0xe1 || marker === 0xed) return true;
      offset += 2 + length;
    }
    return false;
  }
  if (contentType === "image/png") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = be32(bytes, offset);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (["eXIf", "iTXt", "tEXt", "zTXt"].includes(type)) return true;
      offset += 12 + length;
    }
    return false;
  }
  if (contentType === "image/webp") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
      const length = bytes[offset + 4]
        | (bytes[offset + 5] << 8)
        | (bytes[offset + 6] << 16)
        | (bytes[offset + 7] << 24);
      if (type === "EXIF" || type === "XMP ") return true;
      if (length < 0 || offset + 8 + length > bytes.length) break;
      offset += 8 + length + (length % 2);
    }
  }
  return false;
}

export function assertEvidenceUploadShape(contentType: string, sizeBytes: number): void {
  if (!(EVIDENCE_IMAGE_TYPES as readonly string[]).includes(contentType.toLowerCase())) {
    throw new Error("This evidence upload currently accepts JPEG, PNG, or WebP images.");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > EVIDENCE_ORIGINAL_MAX_BYTES) {
    throw new Error("Evidence image size is outside the allowed range.");
  }
}

export function assertSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("Expected SHA-256 must be 64 hexadecimal characters.");
  return normalized;
}

export function remainingEvidenceUploadTtl(expiresAt: number, now = Date.now()): number {
  const remaining = Math.min(EVIDENCE_UPLOAD_TTL_SECONDS, Math.floor((expiresAt - now) / 1000));
  if (remaining < 1) throw new Error("Evidence upload session expired.");
  return remaining;
}

/** Opaque keys disclose no person, title, place, relationship, or living status. */
export function privateEvidenceObjectKey(
  environment: "development" | "preview" | "production",
  uploadRef: string,
  slot: "original" | EvidenceRenditionSlot,
): string {
  const opaqueRef = uploadRef.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!opaqueRef) throw new Error("Evidence upload reference is invalid.");
  return `private/v1/${environment}/family-evidence/${opaqueRef}/${slot}`;
}
