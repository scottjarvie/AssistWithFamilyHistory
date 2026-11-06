import { expect, test } from "vitest";
import { createExportStream } from "../lib/vault/exportStream";

test("export waits for demand, pages completely and stops on cancel", async () => {
  let calls = 0;
  const stream = createExportStream(["persons"], "test", async (_table, cursor) => {
    calls++;
    return { rows: [{ id: calls }], cursor: cursor ? null : "next" };
  });
  const reader = stream.getReader();
  expect(calls).toBe(0);
  await reader.read(); // file header
  await reader.read(); // table header
  expect(calls).toBe(0);
  await reader.read(); // first page
  expect(calls).toBe(1);
  await reader.cancel();
  expect(calls).toBe(1);

  const complete = createExportStream(["persons"], "test", async (_table, cursor) => ({ rows: [cursor ? 2 : 1], cursor: cursor ? null : "next" }));
  expect(JSON.parse(await new Response(complete).text()).tables.persons).toEqual([1, 2]);
});

test("export propagates page errors instead of completing a partial file", async () => {
  const stream = createExportStream(["persons"], "test", async () => { throw new Error("offline"); });
  await expect(new Response(stream).text()).rejects.toThrow("offline");
});
