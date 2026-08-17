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

export const appVersion = "2.1.0";

export const releaseNotes: ReleaseEntry[] = [
  {
    version: "2.2.0",
    // Deliberately "Local": every item below is real in this repository's
    // source and passes its tests, and none of it has run against the
    // deployed site. Calling it live before the deploy would be the easiest
    // lie on this page to tell.
    status: "Local",
    releasedAt: "2026-08-17T22:10:00-07:00",
    timezone: "America/Phoenix",
    title: "Bring the AI you already use, and let it read the record",
    summary: "You can approve a narrow, revocable connection for the AI you already use, and give it the actual scanned record to read rather than only its title. Built and tested here; not yet running on the live site.",
    items: [
      {
        id: "media-evidence-bytes",
        category: "created",
        impactTier: "major",
        impactRank: 1,
        short: "Created real file delivery, so your AI can read the scan instead of only its title.",
        long: {
          what: "You can upload a scan, photograph, record PDF, transcript, or recording to a person from the Memories tab. It is stored privately here, and once you mark it reviewed with usable rights and allow AI use, a connected AI receives the file itself through the connection. Nothing is ever handed over as a link. An item that only points at a file somewhere else says so honestly instead of pretending.",
          why: "Family history runs on scanned records and photographs. An assistant that cannot see the census page cannot do the work.",
          where: "Person workspace Memories tab, and the chosen-AI connection.",
        },
        sourceRefs: ["AWF-0045", "AWF-WO-011"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "upload-is-not-permission",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Created a clear separation between storing a file and letting an AI read it.",
        long: {
          what: "Every uploaded file arrives private, unreviewed, and not allowed for AI use, and replacing a file resets its review. Allowing AI use stays a separate, deliberate step you take in the review panel.",
          why: "Putting a family photograph somewhere safe should never quietly widen what any assistant can see.",
          where: "Person workspace Memories tab.",
        },
        sourceRefs: ["AWF-0045", "AWF-WO-011"],
        audiences: ["signed-in"],
      },
      {
        id: "memories-had-no-way-in",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Fixed a Memories tab that could only ever be filled by an import.",
        long: {
          what: "The Memories tab offered no way to add anything of your own: the only route in was a FamilySearch import, so a scan on your desk had nowhere to go. It now takes files directly, and each item says plainly whether the file is held here or only pointed at somewhere else.",
          why: "Much of the evidence a family already has never came from a provider, and the product should be able to hold it.",
          where: "Person workspace Memories tab.",
        },
        sourceRefs: ["AWF-0045", "AWF-WO-011"],
        audiences: ["signed-in"],
      },
      {
        id: "connection-is-a-grant",
        category: "created",
        impactTier: "major",
        impactRank: 2,
        short: "Created a connection permission you approve, narrow, and take back at any time.",
        long: {
          what: "Signing in no longer behaves like blanket authority. A connection carries the permission you approved, limited to the people you chose and the six things it may do, and turning it off denies its very next request rather than waiting for a sign-in to expire.",
          why: "You should be able to hand an assistant a narrow, reversible piece of your research rather than all of it.",
          where: "Settings, AI connections.",
        },
        sourceRefs: ["AWF-0040", "AWF-0042", "AWF-WO-011"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "one-call-record-saves",
        category: "upgraded",
        impactTier: "meaningful",
        impactRank: 2,
        short: "Upgraded saving so a whole source's worth of records lands in one approval.",
        long: {
          what: "An assistant can save the people, relationships, events, evidence, and story work from one source in a single call, reporting each row's own outcome instead of discarding the whole pass because one row was wrong.",
          why: "Approving thirty tiny writes one at a time is how careful review turns into reflexive clicking.",
          where: "The chosen-AI connection, reflected in the normal workspace.",
        },
        sourceRefs: ["AWF-0041", "AWF-WO-011"],
        audiences: ["signed-in", "agent"],
      },
    ],
    whatToCheck: [
      "Open a person, go to Memories, and upload a scan or photograph.",
      "Confirm it arrives private, unreviewed, and not allowed for AI use.",
      "Mark it reviewed with usable rights, allow AI use, and confirm a connected AI receives the file itself.",
      "Confirm an item that only holds a link elsewhere reports honestly that it cannot be delivered.",
      "Open Settings, AI connections, and confirm approving, narrowing, and revoking behave as described.",
    ],
  },
  {
    version: appVersion,
    status: "Public & live",
    releasedAt: "2026-08-14T08:48:22-07:00",
    timezone: "America/Phoenix",
    title: "Begin with one private family connection",
    summary: "A newcomer can now create two people and their known relationship directly in a private workspace, with clear evidence boundaries and an optional chosen-AI handoff.",
    items: [
      {
        id: "private-family-first-start",
        category: "created",
        impactTier: "major",
        impactRank: 1,
        short: "Created a direct private first start with one person and one known relationship.",
        long: {
          what: "An empty workspace now guides someone through two people, explicit living or deceased status, their relationship, and a review step before saving the connected pair.",
          why: "Family history should begin with the family connection someone already knows, without requiring an import or AI connection.",
          where: "Signed-in empty dashboard, People, and the new private first-start flow.",
        },
        sourceRefs: ["AWF-0006", "AWF-WO-010"],
        audiences: ["signed-in"],
      },
      {
        id: "first-start-provenance-boundary",
        category: "upgraded",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Made the starting statement and its missing evidence visible after save.",
        long: {
          what: "The product records who supplied the starting people and relationship, marks the statements as unsourced, and keeps that cue visible in People and the person workspace.",
          why: "A known family connection is a useful starting statement, but it should not quietly become a proven fact.",
          where: "Private first-start review, People list, and person workspace.",
        },
        sourceRefs: ["AWF-0006", "AWF-WO-010"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "empty-workspace-family-wayfinding",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 1,
        short: "Fixed the empty workspace so its primary action begins with family, not a provider or AI.",
        long: {
          what: "The dashboard and People empty state now lead to the private family connection flow, while reviewed capture and AI setup remain nearby optional paths.",
          why: "A newcomer should not need another service or tool before the product can hold the first thing they know about their family.",
          where: "Signed-in empty dashboard and People.",
        },
        sourceRefs: ["AWF-0006", "AWF-WO-010"],
        audiences: ["signed-in"],
      },
      {
        id: "optional-first-ai-handoff",
        category: "upgraded",
        impactTier: "meaningful",
        impactRank: 2,
        short: "Kept the chosen-AI handoff off by default and created it only after an explicit choice.",
        long: {
          what: "Someone may ask their chosen AI to research the newly saved connection, but the private records are committed first and no Queue directive exists unless the person selects that option.",
          why: "AI should be a chosen participant in the workflow, not a condition of starting a family record.",
          where: "Private first-start review and Queue.",
        },
        sourceRefs: ["AWF-0006", "AWF-WO-010"],
        audiences: ["signed-in", "agent"],
      },
    ],
    whatToCheck: [
      "Open an empty signed-in workspace and choose Add your first connection.",
      "Review two people, explicit living or deceased states, and the relationship before saving.",
      "Confirm People and the person workspace retain the connected record and its needs-a-source cue.",
      "Confirm Queue stays empty unless Ask your chosen AI is explicitly selected.",
    ],
  },
  {
    version: "2.0.2",
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
