/**
 * What the vault will hold as a media file, and what it calls it.
 *
 * Shared by the upload route, the review panel, and the checks that keep the
 * two honest. The accepted list is deliberately narrow: the things family
 * history research actually produces — scans, photographs, record PDFs,
 * transcripts, and recorded interviews.
 */

/**
 * The largest single file the vault stores.
 *
 * This is bigger than one protected AI delivery on purpose. A person should be
 * able to keep a full-resolution scan; whether a given AI call can carry it is
 * a separate question answered by `FAMILY_HISTORY_MCP_LIMITS`, which skips an
 * over-budget item with `TOO_LARGE` and says what to do instead.
 */
export const MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_MEDIA_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/heic",
  "application/pdf",
  "text/plain",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

/** The `accept` attribute for the upload control, kept in step with the list above. */
export const MEDIA_UPLOAD_ACCEPT_ATTRIBUTE = ACCEPTED_MEDIA_UPLOAD_TYPES.join(",");

export function isAcceptedMediaUploadType(mimeType: string): boolean {
  return (ACCEPTED_MEDIA_UPLOAD_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

export type MediaUploadKind = "photo" | "document" | "scan" | "video" | "audio" | "other";

/**
 * Map a MIME type onto the product's media vocabulary.
 *
 * Images become `photo` rather than `scan` because the product cannot tell a
 * photograph from a scanned page by its bytes, and `photo` is the honest,
 * least-claiming label. The person can say otherwise in review.
 */
export function classifyMediaUpload(mimeType: string): MediaUploadKind {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return "photo";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  if (normalized === "application/pdf" || normalized.startsWith("text/")) return "document";
  return "other";
}
