"use client";

import type { ReactElement, ReactNode } from "react";
import { SafeLink } from "@/components/layout/SafeLink";
import {
  isNavItemActive,
  type AppNavigationSection,
} from "@/components/layout/appNavigation";
import { cn } from "@/lib/utils";

interface AppNavigationListProps {
  sections: readonly AppNavigationSection[];
  pathname: string;
  variant: "mobile" | "desktop";
  collapsed?: boolean;
  wrapNavigableItem?: (link: ReactElement) => ReactNode;
}

export function AppNavigationList({
  sections,
  pathname,
  variant,
  collapsed = false,
  wrapNavigableItem,
}: AppNavigationListProps) {
  return sections.map((section) => (
    <div key={section.label} className="mb-5">
      {variant === "mobile" ? (
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-stone-500">
          {section.label}
        </p>
      ) : (
        <div className={cn("px-3 mb-2", collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
              {section.label}
            </span>
          )}
        </div>
      )}

      <ul className={cn("space-y-1", variant === "mobile" ? undefined : "px-2")}>
        {section.items.map((item) => {
          if (variant === "mobile" && item.comingSoon) {
            return (
              <li key={item.href}>
                <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-stone-500">
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs bg-stone-700 px-2 py-0.5 rounded">Soon</span>
                </span>
              </li>
            );
          }

          const link = (
            <SafeLink
              href={item.comingSoon ? "#" : item.href}
              className={
                variant === "mobile"
                  ? cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5",
                      isNavItemActive(pathname, item.href, item.exact)
                        ? "bg-amber-700 text-white"
                        : "text-stone-300 hover:bg-stone-800"
                    )
                  : cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      isNavItemActive(pathname, item.href, item.exact)
                        ? "bg-amber-700 text-white"
                        : item.comingSoon
                          ? "text-stone-500 cursor-not-allowed"
                          : "text-stone-400 hover:text-white hover:bg-stone-800",
                      collapsed && "justify-center px-2"
                    )
              }
              onClick={
                variant === "desktop"
                  ? (event) => item.comingSoon && event.preventDefault()
                  : undefined
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {variant === "mobile" ? (
                <span>{item.label}</span>
              ) : (
                <>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.comingSoon && (
                    <span className="text-xs bg-stone-700 px-2 py-0.5 rounded">
                      Soon
                    </span>
                  )}
                </>
              )}
            </SafeLink>
          );

          return (
            <li key={item.href}>
              {variant === "mobile" && wrapNavigableItem
                ? wrapNavigableItem(link)
                : link}
            </li>
          );
        })}
      </ul>
    </div>
  ));
}
