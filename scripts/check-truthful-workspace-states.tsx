import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppLoading from "@/app/app/loading";
import { VaultStateCard } from "@/components/vault/VaultStateCard";
import { WorkspaceStateCard } from "@/components/vault/WorkspaceStateCard";
import { StoryReviewHistoryPanel } from "@/components/vault/StoryReviewHistoryPanel";

const loadingMarkup = renderToStaticMarkup(createElement(AppLoading));

assert.match(
  loadingMarkup,
  /<p[^>]*role="status"[^>]*aria-live="polite"[^>]*>Loading workspace…<\/p>/,
  "route loading should expose one polite status announcement"
);
assert.match(
  loadingMarkup,
  /<div[^>]*class="[^"]*motion-safe:animate-pulse[^"]*"[^>]*aria-hidden="true"/,
  "decorative skeletons should be hidden and animate only when motion is allowed"
);
assert.doesNotMatch(
  loadingMarkup,
  /aria-hidden="true"[^>]*>[^]*Loading workspace…/,
  "the loading announcement must stay outside the decorative aria-hidden tree"
);

const emptyMarkup = renderToStaticMarkup(
  createElement(WorkspaceStateCard, {
    kind: "empty",
    title: "No review activity yet",
    description: "Review events will appear here after they are recorded.",
    density: "compact",
  })
);
assert.match(emptyMarkup, /data-workspace-state="empty"/);
assert.match(emptyMarkup, /No review activity yet/);
assert.doesNotMatch(emptyMarkup, /role="alert"/);

const errorMarkup = renderToStaticMarkup(
  createElement(WorkspaceStateCard, {
    kind: "error",
    title: "This view did not load",
    description: "Recheck the latest workspace state before repeating a save or import.",
    actions: createElement("button", { type: "button" }, "Try again"),
  })
);
assert.match(errorMarkup, /data-workspace-state="error"/);
assert.match(errorMarkup, /role="alert"/);
assert.match(errorMarkup, /Try again/);
assert.match(
  errorMarkup,
  /flex[^\"]*flex-col[^\"]*sm:flex-row/,
  "recovery actions should stack on narrow screens and align on wider screens"
);

const unavailableMarkup = renderToStaticMarkup(
  createElement(VaultStateCard, {
    title: "Workspace unavailable",
    description: "This view cannot reach the research vault right now.",
  })
);
assert.match(unavailableMarkup, /data-workspace-state="unavailable"/);
assert.match(unavailableMarkup, /This view cannot reach the research vault right now/);

const reviewEmptyMarkup = renderToStaticMarkup(
  createElement(StoryReviewHistoryPanel, { events: [] })
);
assert.match(reviewEmptyMarkup, /data-workspace-state="empty"/);
assert.match(reviewEmptyMarkup, /No review activity yet/);
assert.match(reviewEmptyMarkup, /Review and publication events will appear here after they are recorded/);

const errorSource = readFileSync("app/app/error.tsx", "utf8");
assert.doesNotMatch(errorSource, /Your data is safe/i, "error recovery must not make an unverified safety guarantee");
assert.match(
  errorSource,
  /Recheck the latest workspace state before repeating a save or import/,
  "error recovery should warn against repeating work before state is confirmed"
);
assert.doesNotMatch(
  errorSource,
  /console\.error\([^\n]*,\s*error\s*\)/,
  "error diagnostics must not log the raw thrown object"
);
assert.match(
  errorSource,
  /console\.error\("App route error:", \{ digest: error\.digest \?\? "unavailable" \}\)/,
  "error diagnostics should retain only the opaque framework digest"
);
assert.equal(
  (errorSource.match(/className="min-h-11"/g) ?? []).length,
  2,
  "both recovery actions should keep a 44px minimum touch target"
);

const globalCss = readFileSync("app/globals.css", "utf8");
assert.match(globalCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
for (const motionClass of [
  "animate-rise-in",
  "animate-drift",
  "animate-pulse-ring",
  "shimmer-divider",
]) {
  assert.match(
    globalCss,
    new RegExp(`\\.${motionClass}[^}]*animation:\\s*none\\s*!important`, "s"),
    `${motionClass} should stop when reduced motion is requested`
  );
}

console.log("Truthful workspace state, recovery, loading, and reduced-motion contract passed.");
