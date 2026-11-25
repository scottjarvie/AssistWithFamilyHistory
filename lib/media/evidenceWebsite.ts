import { MEDIA_UPLOAD_MAX_BYTES } from "./uploadContract";

export const WEBSITE_PHOTO_MAX_BYTES = MEDIA_UPLOAD_MAX_BYTES;
// Bound transient rendition bytes even if all selected items are photos.
export const WEBSITE_PHOTO_COPY_BYTES = { medium: 640 * 1024, tiny: 64 * 1024 } as const;

export const WEBSITE_IMAGE_FORMATS: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/tiff", "tiff"],
  ["image/heic", "heif"],
  ["image/heif", "heif"],
]);
