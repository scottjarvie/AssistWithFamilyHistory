import { describe, expect, test } from "vitest";
import { releaseItemsForCategory, releaseNotes, sortReleaseItems, type ReleaseItem } from "../../lib/releaseNotes";

describe("release notes contract", () => {
  test("every release provides Created, Fixed, and Upgraded items with educational copy", () => {
    for (const release of releaseNotes) {
      expect(release.releasedAt).toMatch(/T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      expect(release.timezone).toBeTruthy();
      for (const category of ["created", "fixed", "upgraded"] as const) {
        const items = releaseItemsForCategory(release, category);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          expect(item.short).toBeTruthy();
          expect(item.long.what).toBeTruthy();
          expect(item.long.why).toBeTruthy();
          expect(item.sourceRefs.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("impact order is deterministic before a compact top-three view", () => {
    const items: ReleaseItem[] = [
      { id: "support", category: "created", impactTier: "supporting", impactRank: 1, short: "s", long: { what: "w", why: "y" }, sourceRefs: ["x"] },
      { id: "major-two", category: "created", impactTier: "major", impactRank: 2, short: "s", long: { what: "w", why: "y" }, sourceRefs: ["x"] },
      { id: "meaningful", category: "created", impactTier: "meaningful", impactRank: 1, short: "s", long: { what: "w", why: "y" }, sourceRefs: ["x"] },
      { id: "major-one", category: "created", impactTier: "major", impactRank: 1, short: "s", long: { what: "w", why: "y" }, sourceRefs: ["x"] },
    ];
    expect(sortReleaseItems(items).map((item) => item.id)).toEqual(["major-one", "major-two", "meaningful", "support"]);
    expect(sortReleaseItems(items).slice(0, 3)).toHaveLength(3);
  });
});
