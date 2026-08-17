import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BookOpen,
  Bot,
  ClipboardList,
  ExternalLink,
  FileUp,
  FlaskConical,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  PenTool,
  PlugZap,
  TableProperties,
  Users,
  Clock,
} from "lucide-react";
import { AppNavigationList } from "../components/layout/AppNavigationList";
import {
  appNavigationSections,
  isNavItemActive,
} from "../components/layout/appNavigation";

const expectedSections = [
  {
    label: "Workflow",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/app/queue", label: "Your Queue", icon: Inbox },
    ],
  },
  {
    label: "Vault",
    items: [
      { href: "/app/people", label: "People", icon: Users },
      { href: "/app/places", label: "Places", icon: MapPinned },
      { href: "/app/imports", label: "Imports", icon: FileUp },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/app/operations", label: "Research Queue", icon: TableProperties },
      { href: "/app/research", label: "Research Log", icon: ClipboardList },
      { href: "/app/audit", label: "Vault Audit", icon: Gauge },
    ],
  },
  {
    label: "Story Studio",
    items: [
      { href: "/app/stories", label: "Story Studio", icon: BookOpen },
      { href: "/app/story-writer", label: "Story Writer", icon: PenTool },
      {
        href: "/app/stories?status=published",
        label: "Published Stories",
        icon: ExternalLink,
      },
      {
        href: "/app/timeline",
        label: "Timeline",
        icon: Clock,
        comingSoon: true,
      },
    ],
  },
  {
    label: "Your AI",
    items: [
      { href: "/ai", label: "Connect your AI", icon: Bot },
      { href: "/app/settings/ai", label: "AI Connections", icon: PlugZap },
      // The API Center and its Admin surface were real pages with no navigation
      // entry at all, so nothing reachable ever linked to them. The
      // isNavItemActive("/app/api/admin", "/app/api") assertion below has always
      // anticipated this entry.
      { href: "/app/api", label: "API Center", icon: KeyRound },
    ],
  },
  {
    label: "Lab",
    items: [{ href: "/app/experiments", label: "Experiments", icon: FlaskConical }],
  },
] as const;

assert.deepEqual(appNavigationSections, expectedSections);

assert.equal(isNavItemActive("/app", "/app", true), true);
assert.equal(isNavItemActive("/app/people", "/app", true), false);
assert.equal(isNavItemActive("/app/people/person-123", "/app/people"), true);

// Characterize today's pathname-only behavior. Query-aware selection is a
// separate product decision, not part of this structural extraction.
assert.equal(
  isNavItemActive("/app/stories", "/app/stories?status=published"),
  false
);
assert.equal(isNavItemActive("/app/stories", "/app/stories"), true);

// Characterize today's prefix behavior. Most-specific matching is deferred.
assert.equal(isNavItemActive("/app/api/admin", "/app/api"), true);
assert.equal(isNavItemActive("/app/api/admin", "/app/api/admin"), true);

const mobileMarkup = renderToStaticMarkup(
  <AppNavigationList
    pathname="/app/people"
    sections={appNavigationSections}
    variant="mobile"
  />
);

assert.match(mobileMarkup, /bg-amber-700 text-white[^>]*><svg[^>]*>.*?<\/svg><span>People<\/span>/);
assert.match(mobileMarkup, /text-stone-300 hover:bg-stone-800/);
assert.match(mobileMarkup, />Timeline<\/span><span class="text-xs bg-stone-700/);
assert.doesNotMatch(mobileMarkup, /href="#"/);

const wrappedMobileMarkup = renderToStaticMarkup(
  <AppNavigationList
    pathname="/app/people"
    sections={appNavigationSections}
    variant="mobile"
    wrapNavigableItem={(link) => <span data-sheet-close="true">{link}</span>}
  />
);
assert.equal(
  (wrappedMobileMarkup.match(/data-sheet-close="true"/g) ?? []).length,
  appNavigationSections
    .flatMap((section) => section.items)
    .filter((item) => !("comingSoon" in item && item.comingSoon)).length
);

const sidebarSource = readFileSync(
  new URL("../components/layout/AppSidebar.tsx", import.meta.url),
  "utf8"
);
assert.match(
  sidebarSource,
  /<SheetClose\s+asChild>\s*\{link\}\s*<\/SheetClose>/
);

const desktopMarkup = renderToStaticMarkup(
  <AppNavigationList
    pathname="/app/people"
    sections={appNavigationSections}
    variant="desktop"
  />
);
assert.match(desktopMarkup, /text-stone-400 hover:text-white hover:bg-stone-800/);
assert.match(desktopMarkup, /href="#"/);
assert.match(desktopMarkup, /cursor-not-allowed/);

const collapsedMarkup = renderToStaticMarkup(
  <AppNavigationList
    collapsed
    pathname="/app/people"
    sections={appNavigationSections}
    variant="desktop"
  />
);
assert.doesNotMatch(collapsedMarkup, />Workflow</);
assert.doesNotMatch(collapsedMarkup, />People</);
assert.doesNotMatch(collapsedMarkup, />Soon</);
assert.match(collapsedMarkup, /justify-center px-2/);

console.log("App navigation contract assertions passed");
