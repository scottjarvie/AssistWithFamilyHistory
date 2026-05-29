"use client";

/**
 * GEN-82: Desktop top bar for the authenticated app shell.
 *
 * Adds the conventional top-right user menu (Clerk `<UserButton>`) that the
 * sidebar-only layout was missing. Sits to the right of the sidebar on
 * desktop and is `md:hidden` on mobile, where the existing AppMobileNav
 * already exposes the account drawer.
 *
 * Intentionally minimal — this is "v1: avatar + sign-out menu in the
 * conventional location" per GEN-82. Breadcrumbs / search / org switcher
 * are not in scope.
 *
 * When Clerk isn't configured (local dev with no auth), the bar still
 * renders so the layout doesn't jump, but the right slot is empty.
 */

import { UserButton } from "@clerk/nextjs";

interface AppTopBarProps {
  clerkEnabled: boolean;
}

export function AppTopBar({ clerkEnabled }: AppTopBarProps) {
  return (
    <div className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b border-stone-200 bg-white/95 px-6 backdrop-blur md:flex">
      {clerkEnabled ? <UserButton afterSignOutUrl="/" /> : null}
    </div>
  );
}
