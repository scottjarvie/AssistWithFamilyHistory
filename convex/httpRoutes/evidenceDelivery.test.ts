import { expect, test, vi } from "vitest";
import sharp from "sharp";
import type { ActionCtx } from "../_generated/server";
import { deliverEvidence } from "./evidenceDelivery";
import { hasStoredWebmVideo } from "../../lib/media/storedWebm";

function videoWithBlock(flags: number, frameData: number[], grouped: boolean) {
  const element = (id: number[], body: number[]) => [...id, 0x80 | body.length, ...body];
  const header = element([0x1a, 0x45, 0xdf, 0xa3], element([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d]));
  const videoTrack = element([0xae], [...element([0xd7], [1]), ...element([0x83], [1])]);
  const tracks = element([0x16, 0x54, 0xae, 0x6b], videoTrack);
  const payload = [0x81, 0, 0, flags, ...frameData];
  const block = grouped ? element([0xa0], element([0xa1], payload)) : element([0xa3], payload);
  const cluster = element([0x1f, 0x43, 0xb6, 0x75], [...element([0xe7], [0]), ...block]);
  return Uint8Array.from([...header, ...element([0x18, 0x53, 0x80, 0x67], [...tracks, ...cluster])]);
}

test.each([false, true])("validates WebM lace frame boundaries (grouped=%s)", grouped => {
  expect(hasStoredWebmVideo(videoWithBlock(0x02, [1, 2, 0x11, 0x12, 0x21], grouped))).toBe(true);
  expect(hasStoredWebmVideo(videoWithBlock(0x04, [1, 0x11, 0x21], grouped))).toBe(true);
  expect(hasStoredWebmVideo(videoWithBlock(0x06, [2, 0x82, 0xbe, 0x11, 0x12, 0x21, 0x31], grouped))).toBe(true);
  expect(hasStoredWebmVideo(videoWithBlock(0x04, [1], grouped))).toBe(false);
  expect(hasStoredWebmVideo(videoWithBlock(0x04, [1, 0x11, 0x21, 0x31], grouped))).toBe(false);
  expect(hasStoredWebmVideo(videoWithBlock(0x02, [1, 3, 0x11, 0x12, 0x21], grouped))).toBe(false);
  expect(hasStoredWebmVideo(videoWithBlock(0x06, [2, 0x82, 0xbb, 0x11, 0x12, 0x31], grouped))).toBe(false);
});

const inputBytes = 25 * 1024 * 1024;
const principal = { issuer: "https://test.invalid", subject: "synthetic-owner", clientId: "synthetic-client", scopes: [] };

async function fixture(photoCount: number, documentSizes: number[] = []) {
  const jpeg = Uint8Array.from(await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#256490" },
  }).jpeg().toBuffer()).buffer;
  const stored = Array.from({ length: photoCount }, (_, index) => ({
    id: `photo-${index}`, storageId: `storage-${index}`,
    kind: "media" as const, title: `Synthetic photo ${index}`, mimeType: "image/jpeg", sizeBytes: inputBytes, clean: true,
  }));
  const delivered = documentSizes.map((sizeBytes, index) => ({
    id: `document-${index}`, kind: "document" as const, title: "Synthetic document",
    mimeType: "text/markdown", sizeBytes, text: "a".repeat(sizeBytes),
  }));
  let boundary: { kind: string; personIds?: string[] } = { kind: "whole_workspace" };
  const render = vi.fn(async ({ mediaId }: { mediaId: string; expectedSizeBytes: number }) =>
    mediaId === "photo-0" && photoCount === 10 ? null : { medium: jpeg, tiny: jpeg });
  const key = new Uint8Array(32).fill(1).buffer;
  const ctx = {
    runQuery: async () => ({ delivered, stored, b2Stored: [], skipped: [], boundary }),
    runMutation: async () => key,
    runAction: async (_reference: unknown, args: Parameters<typeof render>[0]) => render(args),
  } as unknown as ActionCtx;
  const args = { principal, grantId: "synthetic-grant",
    items: [...delivered, ...stored].map(({ id, kind }) => ({ id, kind })) };
  return {
    read: (cursor?: string) => deliverEvidence(ctx, args, cursor, async () => {}),
    narrow: () => { boundary = { kind: "selected_people", personIds: ["synthetic-person"] }; },
    render,
  };
}

test("ten eligible maximum-size photos page in pairs and a failed attempt consumes its slot", async () => {
  const { read, render } = await fixture(10);
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const result = await read(cursor);
    if (!("delivered" in result.structuredContent)) throw new Error("Expected an evidence page.");
    const summary = result.structuredContent;
    const pair = [`photo-${page * 2}`, `photo-${page * 2 + 1}`];
    const calls = render.mock.calls.slice(page * 2).map(([args]) => args);
    expect(calls.map(call => call.mediaId)).toEqual(pair);
    expect(calls.reduce((total, call) => total + call.expectedSizeBytes, 0)).toBe(50 * 1024 * 1024);
    expect(summary.delivered.map(item => item.id)).toEqual(page === 0 ? [pair[1]] : pair);
    expect(summary.skipped).toMatchObject(page === 0 ? [{ id: pair[0], reason: "CLEAN_COPY_UNAVAILABLE" }] : []);
    cursor = summary.nextCursor;
    if (page < 4) {
      expect(cursor).toMatch(new RegExp(`^e2\\.${(page + 1) * 2}\\.`));
      expect(summary.note).toContain("website photo processing limit");
    }
  }
  expect(cursor).toBeUndefined();
  expect(render).toHaveBeenCalledTimes(10);
});

test("reply budget defers an unopened photo and a changed grant invalidates the cursor before rendering", async () => {
  const { read, render, narrow } = await fixture(2, [750_000, 750_000, 740_000]);
  const first = await read();
  if (!("delivered" in first.structuredContent)) throw new Error("Expected an evidence page.");
  expect(first.structuredContent.delivered.map(item => item.id)).toEqual(["document-0", "document-1", "document-2"]);
  const cursor = first.structuredContent.nextCursor;
  expect(cursor).toMatch(/^e2\.3\./);
  expect(first.structuredContent.note).toContain("reply size limit");
  expect(render).not.toHaveBeenCalled();

  const second = await read(cursor);
  if (!("delivered" in second.structuredContent)) throw new Error("Expected an evidence page.");
  expect(second.structuredContent.delivered.map(item => item.id)).toEqual(["photo-0", "photo-1"]);
  expect(second.structuredContent.nextCursor).toBeUndefined();
  expect(render).toHaveBeenCalledTimes(2);

  narrow();
  expect((await read(cursor)).structuredContent).toMatchObject({ error: { code: "INVALID_MEDIA_CURSOR" } });
  expect(render).toHaveBeenCalledTimes(2);
});
