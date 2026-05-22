/**
 * App Layout
 * 
 * Purpose: Layout wrapper for all /app routes with sidebar
 * 
 * Key Elements:
 * - Sidebar navigation
 * - Main content area
 * - Responsive layout
 * 
 * Dependencies:
 * - @/components/layout/AppSidebar
 * 
 * Last Updated: Initial setup
 */

import { AppMobileNav, AppSidebar } from "@/components/layout/AppSidebar";
import type { Metadata } from "next";
import Link from "next/link";
import { isClerkEnabled } from "@/lib/clerk/config";
import { createPageMetadata } from "@/lib/seo";
import { getVaultAccessContext } from "@/lib/vault/server";

export const metadata: Metadata = createPageMetadata({
  title: "Workspace",
  description: "Use the Discover Their Stories workspace tools for import, analysis, and output generation.",
  path: "/app",
});

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accessContext = await getVaultAccessContext();

  return (
    <div className="min-h-screen bg-stone-50">
      <AppSidebar
        accountMode={accessContext.mode}
        vaultOwnerId={accessContext.vaultOwnerId}
        clerkEnabled={isClerkEnabled()}
      />
      <AppMobileNav
        accountMode={accessContext.mode}
        vaultOwnerId={accessContext.vaultOwnerId}
        clerkEnabled={isClerkEnabled()}
      />
      <main className="min-h-screen pt-16 transition-all duration-300 md:ml-64 md:pt-0">
        {children}
        <footer className="border-t border-stone-200 px-4 py-6 text-sm text-stone-500 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
            <span>Discover Their Stories</span>
            <Link href="/privacy" className="hover:text-stone-900 hover:underline" suppressHydrationWarning>
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-stone-900 hover:underline" suppressHydrationWarning>
              Contact
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
