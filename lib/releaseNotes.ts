export type ReleaseCategory = "created" | "fixed" | "upgraded";
export type ImpactTier = "major" | "meaningful" | "supporting";
export type ReleaseStatus = "Local" | "In review" | "Backend live" | "Public & live";

export type ReleaseItem = {
  id: string;
  category: ReleaseCategory;
  impactTier: ImpactTier;
  impactRank: number;
  short: string;
  long: { what: string; why: string; where?: string };
  sourceRefs: string[];
  audiences?: Array<"public" | "signed-in" | "admin" | "agent">;
};

export type ReleaseEntry = {
  version: string;
  status: ReleaseStatus;
  releasedAt: string;
  timezone: string;
  title: string;
  summary: string;
  items: ReleaseItem[];
  whatToCheck?: string[];
};

const tierOrder: Record<ImpactTier, number> = { major: 0, meaningful: 1, supporting: 2 };

export function sortReleaseItems(items: ReleaseItem[]) {
  return [...items].sort((a, b) =>
    tierOrder[a.impactTier] - tierOrder[b.impactTier]
    || a.impactRank - b.impactRank
    || a.id.localeCompare(b.id),
  );
}

export function releaseItemsForCategory(entry: ReleaseEntry, category: ReleaseCategory) {
  return sortReleaseItems(entry.items.filter((item) => item.category === category));
}

export const appVersion = "1.1.1";

export const releaseNotes: ReleaseEntry[] = [
  {
    version: appVersion,
    status: "In review",
    releasedAt: "2026-08-12T16:08:00-07:00",
    timezone: "America/Phoenix",
    title: "Your AI can preserve the research trail",
    summary: "A first private, stateless connection now gives compatible AI clients a durable Family History work surface while keeping the person, evidence, and publication boundaries in charge.",
    items: [
      {
        id: "chosen-ai-workspace",
        category: "created",
        impactTier: "major",
        impactRank: 1,
        short: "Created a private chosen-AI workspace connection for real research-to-story work.",
        long: {
          what: "Twelve workflow tools help an AI orient, search, read connected records, preserve people and relationships, save evidence and findings, draft stories, and continue assigned Queue work.",
          why: "Useful research no longer has to disappear when a chat ends; the structured result can live beside the people, sources, questions, and stories it belongs to.",
          where: "Connect AI at /ai; compatible clients use the remote /mcp address.",
        },
        sourceRefs: ["AWF-0033"],
        audiences: ["public", "signed-in", "agent"],
      },
      {
        id: "ai-setup-guide",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Created human and agent setup guides with honest Current, Partial, and Later boundaries.",
        long: {
          what: "The new setup page explains the product relationship in plain language, while /ai.txt gives an AI the exact first-call, evidence, correction, and safety workflow.",
          why: "People can understand what connecting does before consenting, and an AI can work productively without guessing at Family History's vocabulary or authority.",
          where: "Public /ai, /ai.txt, and /llms.txt routes.",
        },
        sourceRefs: ["AWF-0033"],
        audiences: ["public", "agent"],
      },
      {
        id: "queue-oauth-handoff",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Fixed new Queue directives so they can wait for the bounded OAuth chosen-AI identity.",
        long: {
          what: "A directive created in the Queue is now assigned to the same narrowly identified AI actor exposed through the connection instead of remaining permanently disconnected.",
          why: "The four Queue states now support a real handoff while preserving the rule that nothing runs automatically and Queue context grants no wider record authority.",
          where: "Signed-in Queue creation and the MCP get_queue/update_queue tools.",
        },
        sourceRefs: ["AWF-0033"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "durable-write-safety",
        category: "upgraded",
        impactTier: "major",
        impactRank: 1,
        short: "Upgraded AI saves with provenance, replay protection, stale-edit checks, and human publication gates.",
        long: {
          what: "Writes use stable record keys and operation receipts; corrections require the version that was read; sources, citations, evidence status, and AI activity stay attached to the result.",
          why: "Retries do not create accidental duplicates, one AI cannot overwrite a newer correction silently, and evidence or a draft cannot become a public conclusion without the person-controlled review path.",
          where: "All MCP save tools and the canonical private vault records they update.",
        },
        sourceRefs: ["AWF-0033"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "tenant-and-living-privacy",
        category: "upgraded",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Upgraded chosen-AI privacy with server-selected tenancy and bounded living-person context.",
        long: {
          what: "The verified sign-in selects the vault on the server, tools accept no tenant identifier, broad reads withhold living-person notes, and loose context or media must be reviewed and allowed for AI use.",
          why: "A client cannot ask for another family's workspace, and ordinary discovery does not turn sensitive family notes into ambient AI context.",
          where: "OAuth MCP resource boundary, brief/search, and person context.",
        },
        sourceRefs: ["AWF-0033"],
        audiences: ["signed-in", "agent"],
      },
    ],
    whatToCheck: [
      "Read /ai on desktop or phone and confirm the setup and Partial boundaries are clear.",
      "If you have a sanctioned compatible client, confirm all twelve tools appear before saving anything.",
    ],
  },
  {
    version: "0.1.0",
    status: "Public & live",
    releasedAt: "2026-06-19T09:09:20-04:00",
    timezone: "America/New_York",
    title: "Initial release-log baseline",
    summary: "This started the public, privacy-safe release log for Discover Their Stories.",
    items: [
      {
        id: "updates-baseline",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Created the What's New page and its durable release-note source.",
        long: { what: "A standard public release route and data source were added.", why: "Future product changes can be explained without exposing private vault material.", where: "/updates and the public footer." },
        sourceRefs: ["commit-7820e06", "commit-6168c63"],
        audiences: ["public"],
      },
      {
        id: "updates-route",
        category: "fixed",
        impactTier: "supporting",
        impactRank: 1,
        short: "Fixed the missing /updates route.",
        long: { what: "The intended address now resolves to the release log.", why: "People have one dependable place to see public product changes.", where: "/updates." },
        sourceRefs: ["commit-6168c63"],
        audiences: ["public"],
      },
      {
        id: "updates-smoke",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short: "Upgraded route checks and quiet navigation to protect the release log.",
        long: { what: "Footer discovery and smoke coverage were added.", why: "The release log stays findable and a broken route is caught during release verification.", where: "Public footer and route smoke checks." },
        sourceRefs: ["commit-6168c63"],
        audiences: ["public"],
      },
    ],
  },
];
