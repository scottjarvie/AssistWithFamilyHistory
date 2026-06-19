import packageJson from "@/package.json";

export type ReleaseEntry = {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  created: string[];
  fixed: string[];
  upgraded: string[];
};

export const appVersion = packageJson.version;

export const releaseNotes = [
  {
    version: appVersion,
    releasedAt: "2026-06-19T09:09:20-04:00",
    title: "Initial release-log baseline",
    summary:
      "This starts the public release log for Discover Their Stories. Notes stay intentionally user-safe: private vault data, living-person details, raw source records, and unfinished internal work do not belong here.",
    created: [
      "Added the standard What's New page at /updates for release notes.",
      "Added a small release-note data source so future releases can update the log without changing the page layout.",
    ],
    fixed: [
      "The /updates route now resolves to a real page instead of returning a missing-route response.",
    ],
    upgraded: [
      "Footer and workspace footer links now include a quiet Updates path without adding clutter to primary navigation.",
      "Route smoke coverage now includes /updates so the release log is checked with the rest of the public app surface.",
    ],
  },
] satisfies ReleaseEntry[];
