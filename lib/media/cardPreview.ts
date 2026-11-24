type PreviewItem = {
  _id: string;
  type: string;
  url?: string;
  mimeType?: string;
  storageId?: string;
  b2Original?: { contentType: string };
  b2Renditions?: { medium: { contentType: string } };
};

export function mediaCardPreview(item: PreviewItem) {
  const held = Boolean(item.storageId || item.b2Renditions?.medium || item.b2Original);
  const contentType = item.b2Renditions?.medium.contentType ?? item.b2Original?.contentType ?? item.mimeType;
  const isImage = contentType
    ? contentType.toLowerCase().startsWith("image/")
    : held ? item.type === "photo" || item.type === "scan" : item.type !== "audio" && item.type !== "video";
  const src = isImage ? (held ? `/api/media/${item._id}/file?rendition=tiny` : item.url) : undefined;
  return { held, src };
}
