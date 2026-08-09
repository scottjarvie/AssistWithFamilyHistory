# Discover Their Stories — AI Agent Platform: Design & Roadmap

Status: active design/build history. Last reconciled: 2026-08-09.

> **Current Queue correction:** the product Queue backend is now implemented in
> source as `queueItems`, `queueActivity`, idempotent command receipts, bounded
> APIs, and an internal scoped tool boundary. It is not the broader autonomous
> `agentRuns` runtime imagined in this older roadmap, and no live MCP or incoming
> chosen-AI credential path is claimed. See
> [`queue-foundation-design-handoff.md`](queue-foundation-design-handoff.md).

## Vision

Make Discover Their Stories the platform where a person points ANY AI agent (Claude Code,
Codex, Claude Cowork, etc.) at the site and the agent autonomously does family-history work in
plain language — acquiring sources, storing the full spectrum of context with provenance and
privacy, and producing grounded stories + visualizations — while the human watches tasks run and
reviews agent work on the website.

The whole agent layer is built ON the existing trust chokepoints
(`convex/access.ts`, `getVaultAccessContext`, `getContextPack`,
`vaultMutations`, the three-gate predicates, the
contract-drift CI gates), never around them, so the load-bearing invariants extend automatically
to every new surface.

## Audit verdict (current state, verified 2026-05-29)

The data + domain tier is real, tested, and disciplined. The external-agent tier is largely
docs/stubs/proposals.

**Real and wired up:** the GEDCOM X Convex vault (~24 owner-scoped tables); evidence-vs-conclusion
separation (`sources`/`citations.isEvidence`/`sourceFacts` candidate→accepted→conflict→rejected);
the three-gate privacy/AI model as fixture-tested predicates in `convex/vault.ts`; `getContextPack`
(the ideal owner-scoped, privacy-gated, evidence-traced read bundle); the FamilySearch
capture→validate→preview→merge import engine; Story Studio draft→review→publish with an 8-gate
publish-safety engine + human-review confirmation; and strong contract-drift CI gates.

**Still not real (the work):** API-key lifecycle exists, but incoming chosen-AI
credentials do not resolve to a server-trusted principal; the capability
manifest remains internal and there is no MCP server. `researchTasks` now has
guarded transitions, and the separate product Queue has durable bidirectional
handoff, leases, retry and history, but there is no autonomous `agentRuns`
runtime. `researchLog` remains its own mutable-status record, and the extension
makes zero network calls to the app. There is no Convex blob storage (`ctx.storage` unused; `media` uses
`filePath`/`url` strings); visualization/render gaps (stories render literal markdown; Timeline is
"Coming Soon"; the pedigree builder is backend-only/unwired; no viz libs installed).

## Load-bearing invariants (must preserve)

1. **GEDCOM X core** — persons/relationships/events/places as the genealogy model.
2. **Evidence-vs-conclusion separation** — imported source values land as candidates and never
   silently overwrite canonical facts; agents propose, humans confirm.
3. **Split storage** — canonical / evidence-provenance / raw-artifact / provisional / review-blocked.
4. **Three-gate privacy/AI model** — AI-eligible / public-publishable / human-visible predicates;
   missing fields default to NOT eligible; fixture-tested in CI. No fourth filter, no loosening.
5. **Privacy-by-default** — agent/imported content lands private + unreviewed + `aiUseAllowed:false`.

## The four pillars

1. **Agent interface layer.** `apiKeys` + `agentActivity` tables; a `resource:action` scope
   vocabulary (replaces the self-asserted `x-dts-agent-scope` header); an `api_key` branch in
   `getVaultAccessContext` so all owner-scoped routes inherit agent auth; a Convex-trusted identity
   for key principals so the Convex access guard enforces agents identically to Clerk users; a versioned
   `/api/v1` surface + the first-success path (`/me`, `/capabilities`, `/openapi.json`, `/usage`);
   served OpenAPI + enriched manifest + public discovery (`/.well-known/dts-capabilities.json`,
   `/llms.txt`); an MCP server (thin client of `/api/v1`); and a `/developers` onboarding +
   key-mint + usage UI.

2. **Universal context store.** `lib/context/taxonomy.ts` as the single "what goes where" source of
   truth, served at `GET /api/context-schema`; generalize `contextItems` into the universal loose
   landing zone (a `kind` discriminator for newspaper/journal/oral-history/transcript/etc.,
   populate the link arrays the write path currently hardcodes empty, blob pointers); add Convex
   `_storage` to `media`/`documents`/`contextItems`; add `journal`/`oral_history` source types; and
   a `promoteContextItem` mutation (human-confirmed) that mints structured rows preserving
   evidence-vs-conclusion.

3. **Agent action & task framework.** A job/run runtime (`agentRuns` + `agentRunSteps` +
   `agentClaims`, modeled on the `importRuns` discrete-event pattern) an agent drives and a human
   watches live; resurrect the dead `researchTasks` lifecycle; make handoff bidirectional and
   persisted; make `researchLog` append (not overwrite); and the tokened path from the extension /
   any agent to `POST /api/v1/intake` (provider-neutral `IntakeEnvelope`).

4. **Human experience & stories.** A shared `Prose` markdown renderer (fixes literal `#`); Timeline,
   pedigree, map, and stats over existing data (gate-filtered); an **Activity feed** (plain-language,
   live) and a **Review Queue** (approve/promote agent output through existing human-confirmation
   gates, every row stamped human-vs-agent authorship); and the grounded story draft→review→publish
   journey with all safety gates intact.

## Acquisition model (agent-owned + skills library)

Decision (Scott, 2026-05-29): **acquisition is the agent's job; enablement is ours.** Each user's
own AI agent visits the genealogy/record/newspaper sites, fetches the data, and owns the access and
terms-of-service decisions. Discover Their Stories does NOT crawl providers itself. Instead we
provide:

- A robust, provider-neutral ingestion API (`POST /api/v1/intake` over the `IntakeEnvelope`) that
  receives whatever an agent gathered and runs it through the existing importer (dedupe,
  evidence/conclusion split, conflict detection, provisional gating, privacy-default media).
- The served `GET /api/context-schema` taxonomy so an agent knows exactly where each artifact goes.
- A **library of per-site agent "skills"** (FamilySearch, newspapers, FindAGrave, GEDCOM files,
  etc.) — distributable playbooks that teach any agent how to extract data from a given site and
  classify + store it via our API. This is the acquisition strategy: enable great agents, don't
  build crawlers. Scott + Claude dogfood it on their own families.

Our site stays terms-of-service-clean; the agent/user owns the access choices. We still offer the
existing browser extension's user-mediated capture as one convenient path (now with a tokened POST
bridge instead of manual copy-paste).

## Six-phase roadmap

- **Phase 0 — Enforce the data-tier trust boundary (the unblocker).** GEN-87/88 now guard every
  external tenant function, route protected reads through authenticated actions, and enforce the
  publish/redaction boundary in Convex. The code defaults to shadow; production flips only after
  the superadmin summary shows zero legitimate denials. Guest migration is denied in enforce until
  it has a signed capability. Nothing agent-write ships before the observed production flip.
- **Phase 1 — Quick wins (no enforce dependency).** Serve the discovery contract + context taxonomy;
  fix story markdown rendering; ship Timeline + pedigree + map + stats over existing data; wake up
  the `researchTasks` lifecycle. Visible payoff while Phase 0 lands.
- **Phase 2 — Agent identity + first-success reads.** `apiKeys`/`agentActivity` tables, scope
  vocabulary, `getVaultAccessContext` api_key branch, `withAgentAuth`, `/api/v1/me|capabilities|usage`,
  versioned read alias. Read scopes are safe to ship pre-enforce because key→owner is server-derived.
- **Phase 3 — Universal store writes + binary + promotion.** Requires Phase 0 enforce.
- **Phase 4 — Job runtime + the human watch-feed.** Activity feed + Review Queue + bidirectional handoff.
- **Phase 5 — Native connectivity + onboarding + skills.** MCP server, `/developers`, per-key quotas,
  the tokened intake bridge, and the per-site skills library.

## Known risks / critique caveats

- **Agent-key→Convex-trusted identity needs the app's own OIDC issuer** (signing keypair, published
  JWKS, rotation) — only Clerk's issuer is trusted today and no signing lib is installed. A real bet,
  tracked separately; until it lands, agent writes fall back to web-tier-only protection.
- **GET-with-write-side-effects routes** (`/api/people/[id]/raw`) must be split before any read-only
  scope maps onto them.
- **Public discovery/upload endpoints have no rate limiter** (the limiter is per-owner; anonymous
  callers have none) — add an abuse guard.
- **Binary `_storage` is greenfield** — upload-url endpoint, blob lifecycle, size/type validation,
  and gate-predicate treatment of blob URLs are net-new, not an "additive field."
- **`contextItems` link arrays already exist in the schema** — the defect is only the write path
  hardcoding empty arrays (`vaultMutations.ts`), not a schema migration.

## Decisions (locked 2026-05-29)

1. No more guest/anonymous vaults — sign-in required.
2. Acquisition is the agent's job; we provide storage + API + docs + the per-site skills library.
3. Build everything, in parallel where possible, on `scott/agent-platform`, `pnpm verify` green throughout.
