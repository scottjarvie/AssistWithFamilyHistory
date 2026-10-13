/**
 * The Convex-site upload relay: the route that lets files up to 20 MiB reach
 * private storage, where the old product-hostname relay stopped near 4.5 MB.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("evidence upload relay", () => {
  test("refuses an upload with no valid length, an unlisted type, or an unknown capability", async () => {
    const t = convexTest(schema, modules);
    const tooBig = await t.fetch("/evidence-upload/family_evidence_x/token", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "Content-Length": String(20 * 1024 * 1024 + 1) },
      body: new Uint8Array(4),
    });
    expect(tooBig.status).toBe(413);

    const wrongType = await t.fetch("/evidence-upload/family_evidence_x/token", {
      method: "PUT",
      headers: { "Content-Type": "application/zip", "Content-Length": "4" },
      body: new Uint8Array(4),
    });
    expect(wrongType.status).toBe(415);

    const unknown = await t.fetch("/evidence-upload/family_evidence_x/token", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "Content-Length": "5" },
      body: new TextEncoder().encode("%PDF-"),
    });
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("cache-control")).toBe("private, no-store");
  });
});
