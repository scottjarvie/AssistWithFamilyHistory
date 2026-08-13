import {
  BookOpen,
  ClipboardList,
  Clock,
  ExternalLink,
  FileUp,
  FlaskConical,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  PenTool,
  ShieldAlert,
  TableProperties,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppNavigationItem = Readonly<{
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  comingSoon?: boolean;
}>;

export type AppNavigationSection = Readonly<{
  label: string;
  items: readonly AppNavigationItem[];
}>;

export const appNavigationSections = [
  {
    label: "Workflow",
    items: [
      {
        href: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        href: "/app/queue",
        label: "Your Queue",
        icon: Inbox,
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
    label: "Research",
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
  {
    label: "Your AI",
    items: [
      {
        href: "/app/api",
        label: "AI access",
        icon: KeyRound,
      },
      {
        href: "/app/api/admin",
        label: "Admin API",
        icon: ShieldAlert,
      },
    ],
  },
  {
    label: "Lab",
    items: [
      {
        href: "/app/experiments",
        label: "Experiments",
        icon: FlaskConical,
      },
    ],
  },
] as const satisfies readonly AppNavigationSection[];

/**
 * Match the pathname behavior used by both app-shell navigation variants.
 *
 * Next.js usePathname() excludes query strings, so a registry href containing
 * `?` does not match here. Query-aware selection and most-specific prefix
 * matching are separate product decisions; this foundation characterizes the
 * existing behavior instead of changing it during a structural extraction.
 */
export function isNavItemActive(
  pathname: string,
  href: string,
  exact?: boolean
): boolean {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}
