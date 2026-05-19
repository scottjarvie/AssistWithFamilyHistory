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

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BookOpen, 
  LayoutDashboard, 
  FileUp,
  Settings, 
  ChevronLeft,
  ChevronRight,
  PenTool,
  Clock,
  Users,
  Menu,
  MapPinned,
  ClipboardList,
  TableProperties,
  ExternalLink,
  Gauge,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
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

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  comingSoon?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Workflow",
    items: [
      {
        href: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: "Vault",
    items: [
      {
        href: "/app/people",
        label: "People",
        icon: Users,
      },
      {
        href: "/app/places",
        label: "Places",
        icon: MapPinned,
      },
      {
        href: "/app/imports",
        label: "Imports",
        icon: FileUp,
      },
    ],
  },
  {
    label: "Research Queue",
    items: [
      {
        href: "/app/operations",
        label: "Research Queue",
        icon: TableProperties,
      },
      {
        href: "/app/research",
        label: "Research Log",
        icon: ClipboardList,
      },
      {
        href: "/app/audit",
        label: "Vault Audit",
        icon: Gauge,
      },
    ],
  },
  {
    label: "Story Studio",
    items: [
      {
        href: "/app/stories",
        label: "Story Studio",
        icon: BookOpen,
      },
      {
        href: "/app/story-writer",
        label: "Story Writer",
        icon: PenTool,
      },
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
];

interface SidebarAccessProps {
  accountMode: "user" | "local" | "anonymous";
  vaultOwnerId: string;
  clerkEnabled: boolean;
}

export function AppMobileNav({ accountMode, vaultOwnerId, clerkEnabled }: SidebarAccessProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-900 text-white md:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-sm">Discover Their Stories</span>
        </Link>

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
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-sm">Discover Their Stories</span>
              </Link>
            </div>
            <nav className="flex-1 py-4 px-2">
              {navSections.map((section) => (
                <div key={section.label} className="mb-5">
                  <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-stone-500">
                    {section.label}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        {item.comingSoon ? (
                          <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-stone-500">
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            <span className="text-xs bg-stone-700 px-2 py-0.5 rounded">Soon</span>
                          </span>
                        ) : (
                          <SheetClose asChild>
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5",
                                isActive(item.href, item.exact)
                                  ? "bg-amber-700 text-white"
                                  : "text-stone-300 hover:bg-stone-800"
                              )}
                            >
                              <item.icon className="w-5 h-5 flex-shrink-0" />
                              <span>{item.label}</span>
                            </Link>
                          </SheetClose>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mt-4 border-t border-stone-800 pt-4">
                <SheetClose asChild>
                  <Link
                    href="/app/settings"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5",
                      isActive("/app/settings")
                        ? "bg-amber-700 text-white"
                        : "text-stone-300 hover:bg-stone-800"
                    )}
                  >
                    <Settings className="w-5 h-5 flex-shrink-0" />
                    <span>Settings</span>
                  </Link>
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

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 hidden flex-col bg-stone-900 text-white transition-all duration-300 md:flex",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-stone-800">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm">Discover Their Stories</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            <div className={cn("px-3 mb-2", collapsed && "px-2")}>
              {!collapsed && (
                <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  {section.label}
                </span>
              )}
            </div>
            <ul className="space-y-1 px-2">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.comingSoon ? "#" : item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      isActive(item.href, item.exact)
                        ? "bg-amber-700 text-white"
                        : item.comingSoon
                          ? "text-stone-500 cursor-not-allowed"
                          : "text-stone-400 hover:text-white hover:bg-stone-800",
                      collapsed && "justify-center px-2"
                    )}
                    onClick={(e) => item.comingSoon && e.preventDefault()}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1">{item.label}</span>
                    )}
                    {!collapsed && item.comingSoon && (
                      <span className="text-xs bg-stone-700 px-2 py-0.5 rounded">
                        Soon
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div className="border-t border-stone-800 p-2">
        <Link
          href="/app/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
            isActive("/app/settings")
              ? "bg-amber-700 text-white"
              : "text-stone-400 hover:text-white hover:bg-stone-800",
            collapsed && "justify-center px-2"
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
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
