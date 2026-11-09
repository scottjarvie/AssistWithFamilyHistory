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
    queue: { available:!capped,count:capped?null:0,more:false,needsInput:capped?null:0,suggestions:capped?null:0,byState:{waiting_for_your_ai:capped?null:0,working:capped?null:0,done:capped?null:0} },
    ai: { activeConnections: 3, connectionsCapped: capped, savesLast30Days: 0, savesCapped: capped },
  };
}

async function pageText(capped: boolean) {
  action.mockResolvedValue(fixture(capped));
  return renderToStaticMarkup(await YourStatsPage()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

test("partial stats retain sampled indicators while uninitialized exact Queue counts stay unavailable", async () => {
  const text = await pageText(true);
  expect(text).toContain("0+ marked living");
  expect(text).toContain("0+ published");
  expect(text).toContain("Unavailable need your input");
  expect(text).toContain("3+ active connections");
  expect(text).toContain("0+ saves in the last 30 days");
  expect(text).toMatch(/Needs your input\s+Unavailable/);
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


test("the Me summary treats input as a flag and keeps Answered in its own state",async()=>{
 const stats=fixture(false);stats.queue={available:true,count:8,more:false,needsInput:3,suggestions:1,byState:{waiting_for_your_ai:3,working:2,done:2}};action.mockResolvedValue(stats);
 const text=renderToStaticMarkup(await YourStatsPage()).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
 expect(text).toContain("Three work states. Needs your input is a flag across all states, including Answered.");expect(text).toMatch(/AI working\s+2/);expect(text).toMatch(/Answered\s+2/);expect(text).toMatch(/Needs your input\s+3/);expect(text).toMatch(/AI suggestions\s+1/);
});
