import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNavigationList } from "../components/layout/AppNavigationList";
import { appNavigationSections } from "../components/layout/appNavigation";

const navigationItems = appNavigationSections.flatMap((section) => section.items);

const collapsedMarkup = renderToStaticMarkup(
  <AppNavigationList
    collapsed
    pathname="/app/people"
    sections={appNavigationSections}
    variant="desktop"
  />
);

for (const item of navigationItems) {
  const accessibleName = `${item.label}${"comingSoon" in item && item.comingSoon ? " (coming soon)" : ""}`;
  assert.match(
    collapsedMarkup,
    new RegExp(`aria-label="${accessibleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    `Collapsed navigation must expose the accessible name: ${accessibleName}`
  );
  assert.match(
    collapsedMarkup,
    new RegExp(`title="${accessibleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    `Collapsed navigation must expose a hover tooltip: ${accessibleName}`
  );
}

const expandedMarkup = renderToStaticMarkup(
  <AppNavigationList
    pathname="/app/people"
    sections={appNavigationSections}
    variant="desktop"
  />
);
for (const item of navigationItems) {
  assert.match(expandedMarkup, new RegExp(`>${item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
}

const sidebarSource = readFileSync(
  new URL("../components/layout/AppSidebar.tsx", import.meta.url),
  "utf8"
);

const mobileSheetClassMatch = sidebarSource.match(
  /<SheetContent[\s\S]*?className="([^"]*)"/
);
assert.ok(mobileSheetClassMatch, "The mobile sheet must declare its layout classes");
const mobileSheetClasses = new Set(mobileSheetClassMatch[1].split(/\s+/));
for (const className of ["h-dvh", "max-h-dvh", "overflow-hidden", "gap-0"]) {
  assert.ok(
    mobileSheetClasses.has(className),
    `The mobile sheet must retain ${className}`
  );
}

const mobileNavClassMatch = sidebarSource.match(/<nav className="([^"]*)"/);
assert.ok(mobileNavClassMatch, "The mobile navigation region must declare its layout classes");
const mobileNavClasses = new Set(mobileNavClassMatch[1].split(/\s+/));
for (const className of [
  "min-h-0",
  "flex-1",
  "overflow-y-auto",
  "overscroll-contain",
  "pb-[calc(1rem+env(safe-area-inset-bottom))]",
]) {
  assert.ok(
    mobileNavClasses.has(className),
    `The mobile navigation region must retain ${className}`
  );
}
assert.match(
  sidebarSource,
  /<div className="[^"]*shrink-0[^"]*border-b[^"]*">[\s\S]*?Discover Their Stories/,
  "The mobile sheet header must remain fixed while navigation scrolls"
);
assert.match(
  sidebarSource,
  /aria-label=\{collapsed \? "Discover Their Stories home" : undefined\}/
);
assert.match(
  sidebarSource,
  /aria-label=\{collapsed \? "Settings" : undefined\}/
);
assert.match(
  sidebarSource,
  /title=\{collapsed \? "Settings" : undefined\}/
);
assert.match(
  sidebarSource,
  /title=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}/
);

const navIndex = sidebarSource.indexOf("<AppNavigationList");
const settingsIndex = sidebarSource.indexOf('href="/app/settings"');
const accountIndex = sidebarSource.indexOf("<VaultAccountPanel", settingsIndex);
assert.ok(navIndex >= 0 && navIndex < settingsIndex && settingsIndex < accountIndex);

assert.match(sidebarSource, /<SheetTrigger asChild>/);
assert.match(sidebarSource, /aria-label="Open app navigation"/);
assert.match(sidebarSource, /<SheetClose\s+asChild>\s*\{link\}\s*<\/SheetClose>/);
assert.match(
  sidebarSource,
  /<SheetClose asChild>[\s\S]*?href="\/app\/settings"[\s\S]*?<\/SheetClose>/
);

const sheetSource = readFileSync(
  new URL("../components/ui/sheet.tsx", import.meta.url),
  "utf8"
);
assert.match(sheetSource, /<SheetPrimitive\.Root data-slot="sheet"/);
assert.match(sheetSource, /<SheetPrimitive\.Trigger data-slot="sheet-trigger"/);
assert.match(sheetSource, /<SheetPrimitive\.Overlay/);
assert.match(sheetSource, /<SheetPrimitive\.Content/);
assert.match(sheetSource, /<SheetPrimitive\.Close/);

console.log("Navigation accessibility contract assertions passed");
