import { describe, expect, test } from "vitest";

import { queueResultLink } from "@/lib/queue/presentation";

describe("Queue result presentation", () => {
  test.each([
    ["/app/people/j57abc_def", "Open person workspace"],
    ["/app/stories/k91story-2", "Open story draft"],
    ["/app/research", "Open research findings"],
    [" /app/people ", "Open people"],
  ])("turns a known private product route into a useful link", (ref, label) => {
    expect(queueResultLink(ref)).toEqual({ href: ref.trim(), label });
  });

  test.each([
    "https://example.test/family-record",
    "//example.test/app/people/escape",
    "/app/people/person/extra",
    "/app/settings",
    "source:synthetic-census-1910",
    "javascript:alert(1)",
  ])("keeps an untrusted or opaque reference non-clickable: %s", (ref) => {
    expect(queueResultLink(ref)).toBeNull();
  });
});
