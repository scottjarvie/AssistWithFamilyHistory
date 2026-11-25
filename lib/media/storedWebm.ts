import { sniffAudioType } from "../../convex/lib/media/audio";

const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const CLUSTER = 0x1f43b675;
const segmentChildren = new Set([TRACKS, CLUSTER, 0x114d9b74, 0x1549a966, 0x1c53bb6b, 0x1941a469, 0x1043a770, 0x1254c367]);

function vint(bytes: Uint8Array, at: number, end: number, maxWidth: number, keepMarker = false) {
  const first = bytes[at];
  for (let width = 1, marker = 0x80; width <= maxWidth; width++, marker >>= 1) {
    if (!(first & marker)) continue;
    if (at + width > end) return null;
    let value = keepMarker ? first : first & (marker - 1);
    let unknown = !keepMarker && value === marker - 1;
    for (let i = 1; i < width; i++) {
      value = value * 256 + bytes[at + i];
      unknown = unknown && bytes[at + i] === 0xff;
    }
    return unknown || Number.isSafeInteger(value) ? { value, next: at + width, unknown } : null;
  }
  return null;
}

type Element = { id: number; body: number; end: number; unknown: boolean };

/** Check sizes in Block/SimpleBlock lacing without interpreting frame bytes. */
function hasCompleteWebmFrames(bytes: Uint8Array, start: number, end: number, lacing: number): boolean {
  if (start >= end) return false;
  if (lacing === 0) return true;

  let at = start;
  const count = bytes[at++] + 1;
  if (count < 2 || end - at < count) return false;
  if (lacing === 2) return (end - at) % count === 0;

  let previousSize = 0;
  let declaredBytes = 0;
  // The final frame consumes the remainder. All other sizes are in the lace header.
  for (let frame = 0; frame < count - 1; frame++) {
    let size = 0;
    if (lacing === 1) {
      let next: number;
      do {
        if (at >= end) return false;
        next = bytes[at++];
        size += next;
        if (size > end - at - declaredBytes) return false;
      } while (next === 0xff);
    } else {
      const length = vint(bytes, at, end, 8);
      if (!length || !Number.isSafeInteger(length.value)) return false;
      // After the first EBML frame size, each VINT is a signed delta.
      const bias = 2 ** (7 * (length.next - at) - 1) - 1;
      size = frame === 0 ? length.value : previousSize + length.value - bias;
      at = length.next;
    }
    if (size <= 0 || size > end - at - declaredBytes) return false;
    declaredBytes += size;
    previousSize = size;
  }
  return declaredBytes < end - at;
}

/** Check stored WebM framing and a video-track block. Codec payloads stay opaque. */
export function hasStoredWebmVideo(bytes: Uint8Array): boolean {
  if (sniffAudioType(bytes.subarray(0, 64 * 1024)) !== "audio/webm") return false;
  let remaining = 32_768;
  function element(at: number, end: number): Element {
    if (--remaining < 0) throw new Error("Too many WebM elements.");
    const id = vint(bytes, at, end, 4, true);
    const size = id && vint(bytes, id.next, end, 8);
    if (!id || !size || (!size.unknown && size.value > end - size.next)) {
      throw new Error("Invalid WebM element bounds.");
    }
    return { id: id.value, body: size.next, end: size.unknown ? end : size.next + size.value, unknown: size.unknown };
  }

  function* children(parent: Element) {
    for (let at = parent.body; at < parent.end;) {
      const child = element(at, parent.end);
      if (child.unknown) throw new Error("Unexpected unknown WebM element size.");
      yield child;
      at = child.end;
    }
  }

  function unsigned(e: Element) {
    const width = e.end - e.body;
    if (width < 1 || width > 8) return 0;
    let value = 0;
    for (let at = e.body; at < e.end; at++) value = value * 256 + bytes[at];
    return Number.isSafeInteger(value) ? value : 0;
  }

  const videoTracks = new Set<number>();
  const tracks = new Set<number>();
  const blockTracks = new Set<number>();
  function readTracks(parent: Element) {
    for (const entry of children(parent)) {
      if (entry.id !== 0xae) continue;
      let number = 0;
      let type = 0;
      for (const field of children(entry)) {
        if (field.id === 0xd7) number = unsigned(field);
        if (field.id === 0x83) type = unsigned(field);
      }
      if (!number || !type || tracks.has(number)) throw new Error("Invalid WebM track.");
      tracks.add(number);
      if (type === 1) videoTracks.add(number);
    }
  }

  function readBlock(block: Element) {
    const track = vint(bytes, block.body, block.end, 8);
    // After the track number come a signed two-byte timestamp, flags and data.
    if (!track || track.unknown || !track.value || block.end - track.next <= 3) {
      throw new Error("Invalid WebM block framing.");
    }
    const lacing = (bytes[track.next + 2] >> 1) & 3;
    if (!hasCompleteWebmFrames(bytes, track.next + 3, block.end, lacing)) {
      throw new Error("Invalid WebM frame boundaries.");
    }
    blockTracks.add(track.value);
  }

  function readCluster(cluster: Element) {
    for (let at = cluster.body; at < cluster.end;) {
      const child = element(at, cluster.end);
      if (segmentChildren.has(child.id)) {
        if (cluster.unknown) return at;
        throw new Error("Unexpected segment element inside a WebM cluster.");
      }
      if (child.unknown) throw new Error("Unexpected unknown WebM cluster child size.");
      if (child.id === 0xa3) readBlock(child);
      if (child.id === 0xa0) {
        for (const field of children(child)) {
          if (field.id === 0xa1) readBlock(field);
        }
      }
      at = child.end;
    }
    return cluster.end;
  }

  try {
    const header = element(0, bytes.length);
    let segmentSeen = false;
    for (let root = header.end; root < bytes.length;) {
      const segment = element(root, bytes.length);
      if (!segment.unknown && (segment.id === 0xec || segment.id === 0xbf)) {
        root = segment.end;
        continue;
      }
      if (segment.id !== SEGMENT || segmentSeen) return false;
      segmentSeen = true;
      for (let at = segment.body; at < segment.end;) {
        const child = element(at, segment.end);
        if (child.id === CLUSTER) {
          at = readCluster(child);
          continue;
        }
        if (child.unknown) return false;
        if (child.id === TRACKS) readTracks(child);
        at = child.end;
      }
      root = segment.end;
    }
    return [...blockTracks].every(track => tracks.has(track)) && [...videoTracks].some(track => blockTracks.has(track));
  } catch {
    return false;
  }
}
