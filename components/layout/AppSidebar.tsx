/**
 * AppSidebar Component
 * 
 * Purpose: Sidebar navigation for the app section
 * 
 * Key Elements:
 * - Logo/brand
 * - Tool navigation links
 * - Settings link
 * - Collapse functionality
 * 
 * Dependencies:
 * - next/link
 * - next/navigation
 * - lucide-react icons
 * 
 * Last Updated: Initial setup
 */

"use client";

import { usePathname } from "next/navigation";
import { SafeLink } from "@/components/layout/SafeLink";
import { 
  BookOpen, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppNavigationList } from "@/components/layout/AppNavigationList";
import {
  appNavigationSections,
  isNavItemActive,
} from "@/components/layout/appNavigation";
import { VaultAccountPanel } from "@/components/layout/VaultAccountPanel";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface SidebarAccessProps {
  accountMode: "user" | "local" | "anonymous";
  vaultOwnerId: string;
  clerkEnabled: boolean;
}

export function AppMobileNav({ accountMode, vaultOwnerId, clerkEnabled }: SidebarAccessProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-900 text-white md:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <SafeLink href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-sm">Discover Their Stories</span>
        </SafeLink>

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open app navigation"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-700 text-stone-200"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="border-stone-800 bg-stone-900 p-0 text-white">
            <SheetHeader className="sr-only">
              <SheetTitle>App navigation</SheetTitle>
              <SheetDescription>
                Navigate between people, places, imports, research, and settings.
              </SheetDescription>
            </SheetHeader>
            <div className="p-4 border-b border-stone-800">
              <SafeLink href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-sm">Discover Their Stories</span>
              </SafeLink>
            </div>
            <nav className="flex-1 py-4 px-2">
              <AppNavigationList
                pathname={pathname}
                sections={appNavigationSections}
                variant="mobile"
                wrapNavigableItem={(link) => (
                  <SheetClose asChild>{link}</SheetClose>
                )}
              />
              <div className="mt-4 border-t border-stone-800 pt-4">
                <SheetClose asChild>
                  <SafeLink
                    href="/app/settings"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5",
                      isNavItemActive(pathname, "/app/settings")
                        ? "bg-amber-700 text-white"
                        : "text-stone-300 hover:bg-stone-800"
                    )}
                  >
                    <Settings className="w-5 h-5 flex-shrink-0" />
                    <span>Settings</span>
                  </SafeLink>
                </SheetClose>
                <div className="mt-3">
                  <VaultAccountPanel
                    clerkEnabled={clerkEnabled}
                    mode={accountMode}
                    vaultOwnerId={vaultOwnerId}
                  />
                </div>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

export function AppSidebar({ accountMode, vaultOwnerId, clerkEnabled }: SidebarAccessProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 hidden flex-col bg-stone-900 text-white transition-all duration-300 md:flex",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-stone-800">
        <SafeLink href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm">Discover Their Stories</span>
          )}
        </SafeLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <AppNavigationList
          collapsed={collapsed}
          pathname={pathname}
          sections={appNavigationSections}
          variant="desktop"
        />
      </nav>

      {/* Settings */}
      <div className="border-t border-stone-800 p-2">
        <SafeLink
          href="/app/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
            isNavItemActive(pathname, "/app/settings")
              ? "bg-amber-700 text-white"
              : "text-stone-400 hover:text-white hover:bg-stone-800",
            collapsed && "justify-center px-2"
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </SafeLink>
        <div className="mt-3">
          <VaultAccountPanel
            clerkEnabled={clerkEnabled}
            mode={accountMode}
            vaultOwnerId={vaultOwnerId}
            collapsed={collapsed}
          />
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="absolute -right-3 top-20 w-6 h-6 bg-stone-800 border border-stone-700 rounded-full flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-700 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
