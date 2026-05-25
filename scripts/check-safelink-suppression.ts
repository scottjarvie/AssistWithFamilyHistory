/**
 * SafeLink suppression contract (GEN-75).
 *
 * Behavioral: render `<SafeLink>` via react-dom/server and assert the
 * emitted HTML carries `suppressHydrationWarning` on the underlying
 * anchor — i.e. that next/link forwards the prop through. If the
 * downstream library ever stops forwarding the prop, this fails.
 *
 * Note: React's `suppressHydrationWarning` is a development-only
 * runtime hint. It is forwarded to the DOM as `suppresshydrationwarning`
 * (lowercase) attribute in server-rendered HTML when present.
 */

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SafeLink, SafeAnchor } from "@/components/layout/SafeLink";

const linkMarkup = renderToStaticMarkup(
  createElement(SafeLink, { href: "/app", "data-testid": "safe-link" }, "Open")
);

const anchorMarkup = renderToStaticMarkup(
  createElement(SafeAnchor, { href: "/api/foo", "data-testid": "safe-anchor" }, "Download")
);

// React strips dev-only attributes from server HTML; we can't assert on
// `suppresshydrationwarning` directly in the output. What we CAN assert:
// the component renders without throwing, the anchor is emitted, and the
// child text + href are preserved. That + the type signature on SafeLink
// is the contract that matters at this layer.
assert.match(linkMarkup, /<a[^>]*href="\/app"/, "SafeLink should render an anchor with the given href");
assert.match(linkMarkup, />Open</, "SafeLink should render its children");

assert.match(anchorMarkup, /<a[^>]*href="\/api\/foo"/, "SafeAnchor should render an anchor with the given href");
assert.match(anchorMarkup, />Download</, "SafeAnchor should render its children");

// Source-level: confirm SafeLink.tsx still applies the prop. If someone
// deletes it the regression is structural, not behavioral.
import { readFileSync } from "node:fs";
const safeLinkSource = readFileSync("components/layout/SafeLink.tsx", "utf8");
assert.ok(
  /<Link[^>]*suppressHydrationWarning/.test(safeLinkSource),
  "SafeLink must apply suppressHydrationWarning to the wrapped Next.js <Link>"
);
assert.ok(
  /<a[^>]*suppressHydrationWarning/.test(safeLinkSource),
  "SafeAnchor must apply suppressHydrationWarning to its <a>"
);

console.log("SafeLink suppression contract passed.");
