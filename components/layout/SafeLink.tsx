"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ForwardedRef, ReactNode } from "react";
import { forwardRef } from "react";

/**
 * SafeLink wraps Next.js `<Link>` and applies `suppressHydrationWarning` so
 * we don't surface hydration warnings when a user has a browser extension
 * installed that injects attributes onto anchor elements during SSR→CSR
 * transition (e.g. some FamilySearch helpers, password managers, translation
 * extensions). The suppression only hides the React dev warning — it does
 * not silently change behavior.
 *
 * Use this in app-shell and navigation surfaces instead of writing
 * `<Link ... suppressHydrationWarning>` everywhere; that pattern is easy to
 * forget for new links and the suppression is only documented in one place.
 *
 * If we ever isolate the root-cause extension or attribute, replace this
 * with a targeted fix and remove SafeLink.
 */
export const SafeLink = forwardRef(function SafeLink(
  { children, ...props }: LinkProps & {
    children?: ReactNode;
    className?: string;
  } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>,
  ref: ForwardedRef<HTMLAnchorElement>
) {
  return (
    <Link ref={ref} suppressHydrationWarning {...props}>
      {children}
    </Link>
  );
});

/**
 * SafeAnchor is the bare-anchor counterpart of SafeLink for `<a>` elements
 * that link to API routes, external URLs, or download endpoints — places
 * Next.js Link isn't right. Same rationale as above.
 */
export const SafeAnchor = forwardRef(function SafeAnchor(
  { children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>,
  ref: ForwardedRef<HTMLAnchorElement>
) {
  return (
    <a ref={ref} suppressHydrationWarning {...props}>
      {children}
    </a>
  );
});
