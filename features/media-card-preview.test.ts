import { expect, test } from "vitest";
import { mediaCardPreview } from "../lib/media/cardPreview";

test("media cards request a small image and leave non-image originals untouched", () => {
  const item = { _id: "synthetic-media", type: "photo", storageId: "synthetic-file" };
  expect(mediaCardPreview(item)).toEqual({ held: true, src: "/api/media/synthetic-media/file?rendition=tiny" });
  for (const contentType of ["application/pdf", "audio/webm", "video/mp4"]) {
    expect(mediaCardPreview({ ...item, b2Original: { contentType } })).toEqual({ held: true, src: undefined });
    expect(mediaCardPreview({ ...item, mimeType: contentType }).src).toBeUndefined();
  }
  expect(mediaCardPreview({ _id: "reference", type: "document", url: "https://example.test/image" }).src)
    .toBe("https://example.test/image");
});
