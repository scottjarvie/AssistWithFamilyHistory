import type { Metadata } from "next";
import {
  Archive,
  Bot,
  Braces,
  CheckCircle2,
  Eye,
  FileSearch,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { SafeLink } from "@/components/layout/SafeLink";
import {
  FAMILY_HISTORY_SCOPE_INFO,
  FAMILY_HISTORY_TOOLS,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
} from "@/lib/mcp/catalog";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Connect your AI",
  description: "Connect a compatible AI to your private family-history workspace through OAuth and MCP.",
  path: "/ai",
});

/**
 * The three jobs the catalog actually covers, each counting its own real tools
 * so this page cannot claim a capability the server does not register. The tool
 * names, the permission list, and both never-lists on this page all come from
 * `lib/mcp/catalog.ts` — the same module the MCP edge enforces with.
 */
const toolGroups = [
  {
    label: "Orient",
    icon: FileSearch,
    scopes: ["family_history:context:read", "family_history:queue:read"] as const,
    copy: "Your AI starts with a compact map, searches summaries, then opens only the people, evidence, events, research, or stories the work needs — inside the boundary you approved.",
  },
  {
    label: "Preserve",
    icon: Archive,
    scopes: [
      "family_history:evidence:read",
      "family_history:evidence:write",
      "family_history:research:write",
    ] as const,
    copy: "Reviewed files can be read, new evidence can be placed into private person-only review, and structured saves land in the same vault the web workspace reads. Evidence stays separate from conclusions, with citations and provenance intact.",
  },
  {
    label: "Continue",
    icon: ScrollText,
    scopes: ["family_history:story:draft", "family_history:queue:work"] as const,
    copy: "A whole source's worth of records saves in one call with per-item results, while private drafts and the four-state Queue keep long work understandable across sessions.",
  },
] as const;

function toolsForScopes(scopes: readonly string[]) {
  return FAMILY_HISTORY_TOOLS.filter((tool) => scopes.includes(tool.requiredScope));
}

const TOOL_COUNT = FAMILY_HISTORY_TOOLS.length;
const ALIAS_COUNT = FAMILY_HISTORY_TOOLS.filter((tool) => tool.alias).length;

/**
 * What exists, is deployed to this site, and passes its tests. Deliberately NOT
 * a claim about any particular assistant: no client has proved a whole
 * lifecycle here, and saying one has would be the easiest lie on this page to
 * tell.
 */
const currentInSource = [
  `${TOOL_COUNT} Family History tools share one stateless connection address, with ${ALIAS_COUNT} older names kept working as aliases.`,
  "Signing in never grants authority on its own: every request resolves the permission the person approved, and fails closed without one.",
  "Turning a connection off takes effect on its very next request, because the permission is re-checked every time rather than waiting for a sign-in to expire.",
  "A whole source's worth of records saves in one call, reporting each row's own outcome instead of discarding the pass.",
  "Reviewed, AI-allowed files are delivered through the connection itself; a storage link is never handed to a model.",
  "A scan or photograph you upload is stored privately here, so your AI can read the record itself rather than only its title — and an item that holds a link somewhere else says so honestly instead of pretending.",
  "An unknown tool, a tool outside the permission, and another person's record all return the same refusal, so nothing can be discovered by probing.",
];

export default function AiSetupPage() {
  return (
    <div className="min-h-screen bg-[#f4efe3] text-[#24312c]">
      <MarketingNav />
      <main className="overflow-hidden pt-[4.5rem]">
        <section className="relative isolate border-b border-[#bba988] bg-[#172b25] text-[#fffaf2]">
          <div className="absolute inset-0 -z-10 opacity-35" aria-hidden="true">
            <div className="absolute -left-24 top-20 h-80 w-80 rounded-full border border-[#d8b16d]/30" />
            <div className="absolute left-10 top-36 h-52 w-52 rounded-full border border-[#d8b16d]/20" />
            <div className="absolute right-[-5rem] top-[-3rem] h-[30rem] w-[30rem] rounded-full bg-[#245a43] blur-3xl" />
          </div>
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-28">
            <div className="animate-rise-in">
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#d8b16d]">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Chosen-AI connection
              </p>
              <h1 className="mt-6 max-w-4xl font-[family-name:var(--font-cormorant-garamond)] text-5xl font-semibold leading-[0.94] sm:text-6xl lg:text-7xl">
                Give your AI a place to <span className="text-[#d8b16d]">remember the evidence.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-[#d8e1da] sm:text-lg">
                Assist With Family History is the durable workspace. Your chosen AI researches, compares, corrects, and drafts; the vault keeps people, relationships, events, sources, findings, and stories connected after the chat ends.
              </p>
              <div className="mt-9 flex flex-wrap gap-3 text-sm">
                <SafeLink href="#setup" className="rounded-full bg-[#d8b16d] px-6 py-3 font-semibold text-[#172b25] transition-transform hover:-translate-y-0.5">
                  Connect a compatible AI
                </SafeLink>
                <SafeLink href="/ai.txt" className="rounded-full border border-[#c6d3c9]/35 px-6 py-3 font-semibold text-[#fffaf2] hover:border-[#d8b16d]">
                  Open the agent guide
                </SafeLink>
              </div>
            </div>

            <aside className="relative self-end rounded-[2rem] border border-[#d8b16d]/35 bg-[#fffaf2] p-6 text-[#24312c] shadow-[0_30px_90px_-50px_#000] sm:p-8" aria-label="MCP endpoint">
              <div className="absolute -left-7 top-12 hidden h-px w-14 bg-[#d8b16d] lg:block" aria-hidden="true" />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#98702b]">Canonical connection address</p>
              <code className="mt-4 block overflow-x-auto border-y border-[#d8cfbd] py-5 font-mono text-sm font-semibold text-[#245a43]">
                https://assistwithfamilyhistory.com/mcp
              </code>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div><p className="text-3xl font-semibold">{TOOL_COUNT}</p><p className="mt-1 text-xs leading-5 text-[#687169]">workflow tools from first brief to complete-result save</p></div>
                <div><p className="text-3xl font-semibold">{FAMILY_HISTORY_SCOPE_INFO.length}</p><p className="mt-1 text-xs leading-5 text-[#687169]">permissions you choose from — this is the whole list</p></div>
                <div><p className="text-3xl font-semibold">0</p><p className="mt-1 text-xs leading-5 text-[#687169]">owner or workspace IDs accepted from an AI</p></div>
                <div><p className="text-3xl font-semibold">0</p><p className="mt-1 text-xs leading-5 text-[#687169]">assistants named as working, until one proves it</p></div>
              </div>
              <p className="mt-7 flex gap-2 border-t border-[#d8cfbd] pt-5 text-xs leading-5 text-[#687169]">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#245a43]" aria-hidden="true" />
                Connecting signs into the same private account. No research runs automatically, and no tool can publish or delete family records.
              </p>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#98702b]">One research trail</p>
              <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold leading-tight sm:text-5xl">From a clue to a grounded story—without losing the receipts.</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {toolGroups.map(({ label, icon: Icon, scopes, copy }, index) => (
                <article key={label} className="queue-paper relative rounded-3xl border border-[#cfc3af] p-6 shadow-[0_20px_45px_-38px_#24312c]">
                  <span className="absolute right-5 top-4 font-mono text-[10px] text-[#98702b]">0{index + 1}</span>
                  <Icon className="h-7 w-7 text-[#245a43]" aria-hidden="true" />
                  <h3 className="mt-5 text-2xl font-semibold">{label}</h3>
                  <p className="mt-2 font-mono text-[10px] leading-5 text-[#98702b]">
                    {toolsForScopes(scopes).map((tool) => tool.name).join(" · ")}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-[#5f665f]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="setup" className="border-y border-[#cfc3af] bg-[#fffaf2]">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-10">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#98702b]">Setup</p>
              <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold sm:text-5xl">Use your normal account.</h2>
              <ol className="mt-9 space-y-6">
                {[
                  ["Choose a compatible client", "It must support remote Streamable HTTP MCP and OAuth. Exact menu names differ by client."],
                  ["Add the MCP address", "Use https://assistwithfamilyhistory.com/mcp as the server URL."],
                  ["Sign in, then approve what it may do", "Signing in proves whose workspace it is; it does not decide what the AI may do. Its first call is refused and waits for you at /app/settings/ai, where you choose the permissions, the records, and how long it lasts."],
                  ["Ask for the Family History brief", "Your AI should call family_history_get_brief first, then search and hydrate before changing records."],
                ].map(([title, copy], index) => (
                  <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#98702b]/40 font-mono text-xs font-semibold text-[#98702b]">{index + 1}</span>
                    <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#687169]">{copy}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-[2rem] bg-[#24312c] p-6 text-[#fffaf2] sm:p-8">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d8b16d]"><Bot className="h-4 w-4" aria-hidden="true" /> First-session instruction</p>
              <blockquote className="mt-6 border-l border-[#d8b16d] pl-5 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-9">
                “Start with my Family History brief. Search before creating duplicates, hydrate stable IDs before corrections, preserve source provenance and uncertainty, prefer the complete-result save for a finished pass, and never publish or delete.”
              </blockquote>
              <div className="mt-8 grid gap-3 border-t border-[#53635d] pt-6 sm:grid-cols-2">
                {[
                  [Fingerprint, "Server-derived vault"], [Braces, "Replay-safe writes"], [GitBranch, "Evidence stays linked"], [ShieldCheck, "Human publish gate"],
                ].map(([Icon, label]) => {
                  const ItemIcon = Icon as typeof Fingerprint;
                  return <p key={label as string} className="flex items-center gap-2 text-xs text-[#d8e1da]"><ItemIcon className="h-4 w-4 text-[#d8b16d]" aria-hidden="true" />{label as string}</p>;
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#cfc3af] bg-[#fffaf2]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#98702b]">Permissions</p>
            <h2 className="mt-4 max-w-3xl font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold sm:text-5xl">
              You choose from exactly {FAMILY_HISTORY_SCOPE_INFO.length} permissions. Nothing outside this list can be approved.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5f665f]">
              This list is generated from the same catalog the server enforces, so what you read here
              and what the connection can actually do cannot drift apart.
            </p>
            <ul className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {FAMILY_HISTORY_SCOPE_INFO.map((scope) => (
                <li key={scope.scope} className="rounded-3xl border border-[#cfc3af] bg-[#fffaf2] p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#98702b]">
                    {scope.writes ? "Can change things" : "Read only"}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold">{scope.label}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#5f665f]">{scope.grants}</p>
                  <p className="mt-3 border-t border-[#e3d9c6] pt-3 text-sm leading-7 text-[#687169]">
                    <span className="font-semibold text-[#5f665f]">Still cannot: </span>
                    {scope.limit}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[#cfc3af] p-7">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#98702b]">
                  <Eye className="h-4 w-4" aria-hidden="true" /> Never shown to any AI
                </p>
                <ul className="mt-5 space-y-2 text-sm leading-7 text-[#5f665f]">
                  {NEVER_EXPOSED.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              </article>
              <article className="rounded-3xl border border-[#cfc3af] p-7">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#98702b]">
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Never allowed, whatever you approve
                </p>
                <ul className="mt-5 space-y-2 text-sm leading-7 text-[#5f665f]">
                  {NEVER_PERMITTED.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-3">
            <article className="rounded-3xl border border-[#9eb4a6] bg-[#eff5f0] p-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#245a43]">Built, live, and passing its tests</p>
              <ul className="mt-5 space-y-3">
                {currentInSource.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-6">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#245a43]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-[#9eb4a6] pt-4 text-sm leading-7 text-[#5f665f]">
                All of this is running on this site, and it passes its tests. That is not the same as
                proof that your particular assistant works: no assistant has yet completed a whole
                connection here.
              </p>
            </article>
            <article className="rounded-3xl border border-[#d2bd8d] bg-[#fbf4e4] p-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#98702b]">Not yet proved</p>
              <p className="mt-5 text-sm leading-7 text-[#5f665f]">
                No assistant has completed a full connection here yet — sign in, approve, read, write,
                revoke — so we name none as working. Self-registration is available: the sign-in
                provider does publish a registration endpoint, so a client that registers itself can
                get through. Client identity documents are not offered by the provider yet. Files that
                are only stored as a reference come back saying honestly that their bytes are not
                available rather than pretending to deliver them.
              </p>
            </article>
            <article className="rounded-3xl border border-[#ccb7ad] bg-[#f8efeb] p-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9f5a2d]">Later, not implied</p>
              <p className="mt-5 text-sm leading-7 text-[#5f665f]">
                Publishing, deletion, identity merges, export, sharing changes, acting on FamilySearch
                or any other outside site, and cross-family collaboration are outside this connection
                entirely. They have no tool and no permission that could turn them on.
              </p>
            </article>
          </div>

          <div className="mt-10 rounded-3xl border border-[#cfc3af] bg-[#fffaf2] p-7">
            <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl font-semibold">
              We do not name assistants that work here.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#5f665f]">
              Any assistant that speaks remote Streamable HTTP MCP with OAuth is an intended client.
              None is a claimed one. A name goes on this page only after that exact assistant has been
              taken through the whole thing — discover, approve, list tools, read, save, correct, get
              refused where it should be, lose access the moment the connection is turned off, and
              reconnect — with the receipts kept. Until then, naming one would be a guess dressed up as
              a promise, and you would be the one to find out it was wrong.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
