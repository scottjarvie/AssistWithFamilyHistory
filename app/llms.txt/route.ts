/**
 * GET /llms.txt
 *
 * Public pointer for AI agents/crawlers (the emerging llms.txt convention).
 * Tells an agent where to learn how this platform works. Served at the site
 * root (NOT under /api) so it is publicly reachable. No vault data.
 */
const BODY = [
  "# Discover Their Stories",
  "A family-history AI platform. Point your AI agent here to help gather, organize, and tell your family's story.",
  "",
  "## For AI agents",
  "- Human setup and capability truth: /ai",
  "- Plain-text MCP workflow guide: /ai.txt",
  "- Remote MCP endpoint: /mcp (OAuth required; call get_family_history_brief first)",
  "- Storage taxonomy (what kind of thing goes where): /context-schema",
  "- Read the taxonomy first, then store each artifact in the target surface it names.",
  "- You acquire data from external genealogy/record/newspaper sites and own those access decisions.",
  "  This platform stores, organizes, privacy-gates, and helps turn it into grounded stories.",
  "- Everything you store lands PRIVATE and UNREVIEWED until a human reviews it.",
  "- A first stateless remote MCP foundation is present. Named-client OAuth compatibility remains Partial until exact live proof.",
  "",
  "## Principles",
  "- Evidence vs conclusion: raw record data never overwrites confirmed facts — agents propose, humans confirm.",
  "- Privacy by default: living people and private notes are protected.",
  "- Sign-in required: every write is scoped to exactly one owner's vault.",
  "",
].join("\n");

export async function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
