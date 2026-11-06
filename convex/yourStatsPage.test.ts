// @vitest-environment node
import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { YourStats } from "./yourData";

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/lib/convex/server", () => ({
  isConvexConfigured: () => true,
  getAuthedConvexClient: async () => ({ action }),
  getConvexRuntimeIssue: vi.fn(),
  getConvexUnavailableState: vi.fn(),
}));
vi.mock("@/lib/vault/server", () => ({
  getVaultAccessContext: async () => ({ vaultOwnerId: "synthetic_stats_owner" }),
}));
vi.mock("@/components/layout/SafeLink", () => ({
  SafeLink: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props),
}));

import YourStatsPage from "../app/app/me/page";

function fixture(capped: boolean): YourStats {
  return {
    people: { count: 5, more: capped, living: 0, byYourAi: 1, fromImports: 2 },
    relationships: { count: 0, more: capped },
    sources: { count: 0, more: capped },
    citations: { count: 0, more: capped },
    stories: { count: 0, more: capped, byStatus: {} },
    queue: { count: 0, more: capped, byState: {} },
    ai: { activeConnections: 3, connectionsCapped: capped, savesLast30Days: 0, savesCapped: capped },
  };
}

async function pageText(capped: boolean) {
  action.mockResolvedValue(fixture(capped));
  return renderToStaticMarkup(await YourStatsPage()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

test("partial stats mark every subset, including an empty sampled Queue state", async () => {
  const text = await pageText(true);
  expect(text).toContain("0+ marked living");
  expect(text).toContain("0+ published");
  expect(text).toContain("0+ need your input");
  expect(text).toContain("3+ active connections");
  expect(text).toContain("0+ saves in the last 30 days");
  expect(text).toMatch(/Needs your input\s+0\+/);
  expect(text).toMatch(/1\+ people were added by your AI\.\s*2\+ people came through an import\./);
  expect(text).not.toContain("of them through an import");
});

test("complete stats show exact counts and independent AI and import categories", async () => {
  const text = await pageText(false);
  expect(text).toContain("0 need your input");
  expect(text).toContain("3 active connections");
  expect(text).toMatch(/1 people were added by your AI\.\s*2 people came through an import\./);
  expect(text).not.toMatch(/\d\+/);
});
