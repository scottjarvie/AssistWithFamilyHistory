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

export const appVersion = "2.0.2";

export const releaseNotes: ReleaseEntry[] = [
  {
    version: appVersion,
    status: "In review",
    releasedAt: "2026-08-13T20:47:34-07:00",
    timezone: "America/Phoenix",
    title: "Queue leads back to the work your AI saved",
    summary: "A completed chosen-AI handoff now gives newcomers a safe path from the Queue result into the private person and story records preserved in their workspace.",
    items: [
      {
        id: "queue-saved-work-bridge",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Created an Open saved work bridge for completed Queue handoffs.",
        long: {
          what: "When a chosen AI completes a directive with canonical Family History result paths, Queue presents direct actions for the saved person workspace, private story draft, or research view.",
          why: "A newcomer should not have to search the whole vault after the handoff says the result is done.",
          where: "Signed-in Queue detail for completed directives.",
        },
        sourceRefs: ["AWF-0037", "AWF-WO-009"],
        audiences: ["signed-in"],
      },
      {
        id: "queue-result-reference-guidance",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 2,
        short: "Fixed Queue completion guidance so a chosen AI returns usable Family History paths.",
        long: {
          what: "The MCP Queue tool now tells a connected AI to include the signed-in person and story paths when it hands back durable work.",
          why: "The product already preserved result references, but neither the AI contract nor Queue made them useful to the person receiving the result.",
          where: "Remote update_queue tool guidance and signed-in Queue result presentation.",
        },
        sourceRefs: ["AWF-0037"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "bounded-joined-acceptance-cleanup",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short: "Upgraded live workflow proof with exact synthetic-fixture cleanup guards.",
        long: {
          what: "The acceptance rail is restricted to one labeled test identity, one production deployment, unique marked run keys, bounded scans, and an explicit confirmation; it refuses any graph reused by unmarked work.",
          why: "Soft-launch proof can exercise the real joined workflow without broad deletion or contact with another family's records.",
          where: "User-scoped production acceptance support and focused adversarial tests.",
        },
        sourceRefs: ["AWF-0037", "AWF-WO-009"],
        audiences: ["admin", "agent"],
      },
    ],
    whatToCheck: [
      "Complete a marked Queue directive through a sanctioned chosen-AI connection and confirm Saved in your workspace offers the person and private story actions.",
      "Open both actions and confirm they stay inside the signed-in owner's Family History workspace.",
      "Confirm external or opaque result references never become Queue navigation links.",
    ],
  },
  {
    version: "2.0.1",
    status: "Public & live",
    releasedAt: "2026-08-13T15:55:48-07:00",
    timezone: "America/Phoenix",
    title: "A useful first step in an empty workspace",
    summary: "Newcomers now see the two working ways to begin and reach the current OAuth MCP setup from the signed-in workspace and Queue.",
    items: [
      {
        id: "empty-workspace-first-step",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Fixed the empty dashboard so its first actions work before any family records exist.",
        long: {
          what: "A genuinely empty vault now offers a reviewed capture or chosen-AI connection instead of sending someone to story review and research operations with nothing to work on.",
          why: "A new person should understand how to begin without guessing which downstream workspace might create the first record.",
          where: "Signed-in dashboard when people, places, stories, imports, documents, and open tasks are all empty.",
        },
        sourceRefs: ["AWF-0036", "PR-45"],
        audiences: ["signed-in"],
      },
      {
        id: "current-ai-setup-route",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 2,
        short: "Fixed signed-in AI wayfinding so normal setup leads to the current OAuth MCP guide.",
        long: {
          what: "Your AI navigation and the Queue connection note now link to Connect your AI. The older key console remains available by direct address but clearly describes itself as a partial developer path.",
          why: "Newcomers should not be sent to copy a key for a verification path that is still rolling out when the safer account-based connection is already live.",
          where: "App navigation, Queue, /ai, and the legacy /app/api page.",
        },
        sourceRefs: ["AWF-0036", "PR-45"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "legacy-api-hydration",
        category: "fixed",
        impactTier: "supporting",
        impactRank: 1,
        short: "Fixed the legacy API console's browser hydration error.",
        long: {
          what: "Server and browser output now use the same canonical product address in the example commands.",
          why: "Direct compatibility visitors no longer encounter a hidden React mismatch while deciding which AI connection path to use.",
          where: "Legacy /app/api developer console.",
        },
        sourceRefs: ["AWF-0036", "PR-45"],
        audiences: ["signed-in"],
      },
      {
        id: "empty-workspace-privacy-cue",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short: "Added a first-screen reminder that imports, research, and publishing remain person-controlled.",
        long: {
          what: "The empty state says plainly that nothing enters the vault, runs, or publishes automatically.",
          why: "The first screen should establish the authority boundary before someone brings private family material into the workspace.",
          where: "Signed-in empty dashboard.",
        },
        sourceRefs: ["AWF-0036", "PR-45"],
        audiences: ["signed-in"],
      },
    ],
    whatToCheck: [
      "Sign into an empty workspace and confirm the first actions are Bring in a capture and Connect your AI.",
      "Open Your Queue and use See setup to reach /ai without creating a directive.",
      "Open Your AI in app navigation and confirm it leads to current OAuth MCP setup, not the legacy key console.",
    ],
  },
  {
    version: "2.0.0",
    status: "Public & live",
    releasedAt: "2026-08-13T14:23:32-07:00",
    timezone: "America/Phoenix",
    title: "One clear home for family-history work",
    summary: "The product, workspace, AI connection, and normal public address now share one enduring identity: Assist With Family History.",
    items: [
      {
        id: "assist-with-family-history-identity",
        category: "upgraded",
        impactTier: "major",
        impactRank: 1,
        short: "Unified the public site, signed-in workspace, Queue, extension, metadata, and guides under Assist With Family History.",
        long: {
          what: "Retired the old product name from current user-facing surfaces while preserving the archival compass, parchment, evidence-thread design, and historical or required technical identifiers.",
          why: "People should encounter the same product promise and name before sign-in, inside the workspace, and when connecting their chosen AI.",
          where: "Public pages, app shell, Queue language, FamilySearch capture extension, metadata, social images, and current setup documentation.",
        },
        sourceRefs: ["AWF-0035", "PR-43"],
        audiences: ["public", "signed-in"],
      },
      {
        id: "canonical-family-history-domain",
        category: "fixed",
        impactTier: "major",
        impactRank: 2,
        short: "Made assistwithfamilyhistory.com the normal product and sign-in destination.",
        long: {
          what: "Reversed the temporary compatibility redirect so old product and deployment addresses resolve to the enduring Family History domain while preserving protected paths and safe redirect targets.",
          why: "The earlier emergency repair restored the form, but it left the retired identity in the address bar. The product-correct repair keeps the secure sign-in boundary and the new canonical home together.",
          where: "Public routes, /sign-in, /sign-up, protected /app routes, canonical metadata, and legacy-domain redirects.",
        },
        sourceRefs: ["AWF-0035", "AWF-WO-007", "PR-42", "PR-43"],
        audiences: ["public", "signed-in"],
      },
      {
        id: "research-to-story-front-door",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Created a clearer research-to-story front door and practical FAQ.",
        long: {
          what: "The homepage now explains the person / your AI / durable workspace split, shows the clue-to-evidence-to-story trail, and answers eight concrete questions about privacy, authority, imports, evidence, and current capability.",
          why: "A careful family-history workspace should be understandable before someone signs in or grants an AI connection.",
          where: "Homepage and Connect your AI setup page.",
        },
        sourceRefs: ["AWF-0035", "Family-History-Project-Philosophy-1.7.0"],
        audiences: ["public", "agent"],
      },
    ],
    whatToCheck: [
      "Open assistwithfamilyhistory.com on desktop and phone and confirm the Assist With Family History identity, research-to-story promise, FAQ, and current-status language are clear.",
      "Open assistwithfamilyhistory.com/app while signed out, complete the normal sign-in journey, and confirm the workspace stays on the Family History address.",
      "Confirm /ai, /ai.txt, /llms.txt, /mcp discovery, and the anonymous OAuth challenge all use the Family History resource address.",
    ],
  },
  {
    version: "1.1.1",
    status: "Backend live",
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
      "If you have a sanctioned compatible client, confirm all twelve tools appear before saving anything. Fresh-device email verification and immediate JWT revocation remain Partial.",
    ],
  },
  {
    version: "0.1.0",
    status: "Public & live",
    releasedAt: "2026-06-19T09:09:20-04:00",
    timezone: "America/New_York",
    title: "Initial release-log baseline",
    summary: "This started the public, privacy-safe release log under the product's former Discover Their Stories name.",
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
