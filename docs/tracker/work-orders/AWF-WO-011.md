---
id: AWF-WO-011
title: Let a person bring a chosen AI into bounded, reviewable Family History work
execution: active
audit: not-audited
cards: AWF-0034, AWF-0038, AWF-0040, AWF-0041, AWF-0042, AWF-0043, AWF-0045
created: 2026-08-16
updated: 2026-08-17
proposed-by: Codex from Scott's Bring Your AI delegation
approved-by: Scott
approved-on: 2026-08-16
approval-evidence: "Bring Your AI Implementation Program — August 2026 (assistwithlife planning/mcp-program-2026-08.md), Wave 2 Family History"
---

## Goal

Turn the existing production stateless MCP foundation into the complete Family
History connection promised by the adopted Bring Your AI standard: a person
can connect a conforming chosen AI through metadata-first OAuth, approve a
narrow and revocable product grant, hand it provenance-aware Queue/evidence
context, receive one reviewable sourced result, correct it, revoke access
immediately, reconnect safely, and see the same durable work in the product.

## Why this bundle exists

The current source has useful workflow tools and strong owner isolation, but
OAuth login still behaves like blanket product authority. Token scopes are
parsed rather than enforced, Queue scopes are hard-coded, there is no durable
owner-visible grant, protected evidence batch, connection center, or immediate
issued-token revocation, and no joined real-client lifecycle proves the whole
promise.

Building only a registration endpoint or one more record tool would leave that
system gap intact. These six Cards form one user outcome rather than unrelated
protocol tasks.

## App / AI split

Assist With Family History owns private identity, grants, durable records,
provenance, Queue continuity, review state, activity, and final human authority.
The person's chosen AI owns conversation, research, comparison, synthesis, and
drafting inside the exact permission the person granted.

## Included Cards and grouped outcome

1. **Connection security** — AWF-0034 immediate revocation and AWF-0038
   Client ID Metadata Documents first, bounded DCR fallback, and standards-
   compatible discovery.
2. **Authorization** — AWF-0040 product-owned grants, record boundaries, narrow
   scopes, enforcement, activity, expiry, and revoke.
3. **Family History workflow** — AWF-0041 provenance-aware brief/evidence,
   one-call review-first save, namespaced tools, and correction; AWF-0045 real
   media evidence bytes, so an AI can read the scanned record itself.
4. **Human experience** — AWF-0042 public setup, authenticated connection
   center, generated AI guide, and manual Queue fallback.
5. **Proof and truth** — AWF-0043 full client lifecycle, UI reflection,
   revoke/reconnect, cleanup, named-client promotion, and independent audit.

AWF-0037/AWF-WO-009 remain the prior joined Queue source/release and browser-
host evidence. This Work Order builds on them; it does not erase or duplicate
their history.

## Current truth

**Current:** branded stateless Streamable HTTP `/mcp`; protected-resource
discovery and anonymous challenge; server-derived owner; twelve bounded,
workflow-native tools; idempotent saves; optimistic corrections; canonical UI
reflection; Queue continuation; `/ai` and `/ai.txt`; one disposable PKCE
official-client lifecycle and exact cleanup.

**Provider truth, CONFIRMED 2026-08-17:** Clerk production Dynamic Client
Registration is **live** — `clerk.assistwithfamilyhistory.com` advertises
`registration_endpoint: https://clerk.assistwithfamilyhistory.com/oauth/register`,
independently re-probed read-only on 2026-08-17. DCR is the **approved
soft-launch path**; **CIMD is deferred** pending provider support, with its
strict validation already written and unused. This supersedes the 2026-08-16
"neither is advertised" finding recorded below, and resolves Human gate 2's
onboarding half.

**Partial:** OAuth still carries provider identity scopes rather than enforced
Family History scopes in production; the durable product grant, active-grant
check, immediate revocation, protected evidence retrieval, connection
management, media byte delivery, joined Queue-to-reviewed-result proof,
refresh/reconnect, and mobile setup are built in source but unproved against the
deployed site; no client is named as compatible.

**Later / excluded:** publishing, permanent deletion, identity merge, sharing
grants, complete export, autonomous FamilySearch/provider actions, cross-family
access, and claims that Claude, ChatGPT, Codex, Grok, Hermes, or another client
works before its exact lifecycle proof.

The supporting audit and technical product contract are in
`docs/planning/family-history-bring-your-ai-alignment.md`.

## Sequence

1. Complete a read-only authorization architecture/threat-model spike. Compare
   provider-native CIMD support, a mature reviewed authorization adapter, and
   the DCR fallback. Do not change provider state during the spike.
2. Present the smallest Scott decision for production authorization and
   immediate revocation. Record the selected option before schema, token, or
   provider mutation.
3. Implement client metadata validation/discovery, product grants, narrow
   scopes, active-grant checks, expiry/revocation, and safe activity with focused
   adversarial tests.
4. Add the provenance-aware brief/evidence/reviewed-result/correction workflow
   and namespaced catalog while preserving canonical vault, Queue, idempotency,
   owner isolation, and human publication/identity gates.
5. Build the authenticated connection center, generate agent guidance from the
   executable contract, and keep the manual Queue handoff usable.
6. Run full local and responsive proof; release through the normal protected
   software path and verify exact deployed behavior separately.
7. Run one complete marked real-client lifecycle through immediate revoke,
   reconnect, and exact zero-residue cleanup. Promote only the exact client and
   capability truth proved.
8. Synchronize philosophy, tracker, `/ai`, `/ai.txt`, `/updates`, and release
   evidence; obtain a separate Work Order audit.

## Dependencies

- Adopted Bring Your AI MCP/OAuth standard and paired Core sections 5 and 16.
- AWF-WO-006 production stateless MCP foundation.
- AWF-WO-005 Queue experience and AWF-WO-009 joined Queue/result-link release.
- Current Clerk identity, Convex owner isolation, canonical vault records,
  FamilySearch user-mediated capture boundary, and protected release path.

## Safe parallel lanes

After the scope/grant contract is stable:

- metadata/grant enforcement and evidence/result design may proceed in parallel
  against one shared scope matrix;
- connection UI may begin from approved grant fields but cannot claim behavior
  until the edge enforces it; and
- fixture/cleanup and client acceptance harness work may proceed without live
  registration or production family data.

## Exclusions

- No generic CRUD catalog, raw-table MCP, portfolio-wide grant, or client-
  supplied owner/workspace/vault identifier.
- No publication, permanent deletion, identity merge, sharing/access change,
  export, billing, messaging, or outside-world/provider action.
- No unattended FamilySearch crawling, credential/session storage, direct
  provider API assumption, or private raw artifact disclosure.
- No Scott account, real family/living-person data, broad production client,
  secret output, DNS, billing, or irreversible migration.
- No named-client or broad compatibility claim from source tests, a tool list,
  or one different client's acceptance.

## Human gates

1. ~~Scott approves this Work Order before execution becomes Ready.~~ **Met
   2026-08-16** by the Bring Your AI Implementation Program — August 2026
   (`planning/mcp-program-2026-08.md` in Assist With Life), which places Family
   History in Wave 2 and authorizes the full connection loop rather than an MVP.
2. After the architecture spike, Scott selects the production authorization
   and immediate-revocation posture because it affects provider/security and
   compatibility. The current recommendation is a metadata-first adapter spike
   with a mature standards implementation and DCR only as fallback; keep manual
   disposable clients while that is evaluated.
3. Any Clerk/DCR/token-format setting, new authorization service, production
   client registration, secret, account, or real-data use remains a separate
   explicit action gate.

Routine architecture, implementation, tests, synthetic fixtures, cleanup code,
protected PR/CI, and documentation inside the approved choice do not need
repeated technical approval.

## Stop rules

Stop before any provider/security mutation not selected by Scott, secret
exposure, real-family access, cross-owner visibility, grant bypass, cleanup that
cannot prove an exact marked boundary, or irreversible public action. If a
client requires weaker issuer, PKCE, redirect, scope, tenant, or revocation
checks, keep that client unverified instead of weakening the product.

## Verification

- CIMD/DCR metadata, redirect, SSRF, caching, size, rate, malformed, and replay
  tests against current MCP/OAuth primary sources.
- Scope-to-tool matrix, active/expired/revoked grant, Queue assignment, two-
  owner, record-boundary, existence-leak, and audit-activity tests.
- Protected evidence batch, living/private/review gates, one-call result,
  idempotency, stale correction, Queue result-link, and canonical UI tests.
- Generated `/ai.txt`/tool/scope parity, protected-resource metadata, anonymous
  challenge, and stale-tool recovery tests.
- `pnpm verify` plus desktop/phone connection-center browser checks.
- Protected PR/head CI, exact-main CI, Convex, Vercel, and public route proof.
- Real client: discover -> consent -> grant -> tools -> Queue/brief -> evidence ->
  reviewed save -> correction -> UI -> revoke denial -> reconnect -> cleanup.
- Exact re-query proving zero marked records, grants, registrations, clients,
  sessions, token artifacts, receipts, and activity; separate independent audit.

## Handoff and tracker updates

- Move only the active Card to `doing`; keep later groups `backlog` until their
  dependency and approved scope are ready.
- Append dated current truth, evidence, residual risk, and next safe action to
  each Card; preserve prior proof rather than rewriting it.
- Keep execution and independent audit separate.
- Create follow-up Cards only for verified gaps outside this coherent outcome.
- Publish software, schemas, provider adapters, generators, workflows, and
  mixed docs through a normal branch/PR/full-CI path. Use the state lane only
  for a later exact allowlisted state-only update accepted by the repository
  helper.

## Execution evidence

### Planning — 2026-08-16 (Codex)

Planning evidence is complete. The 2026-08-16 audit read the adopted family
standard and paired Core sections, canonical Project Philosophy, tracker, Queue,
identity/auth, MCP transport/tools, setup surfaces, FamilySearch evidence
contracts, and dated acceptance reports. It also ran public read-only probes of
the branded protected-resource metadata, anonymous MCP challenge, Clerk
authorization-server/OpenID metadata, and `/ai.txt`.

The durable result is the supporting alignment document, revised capability
truth, updated AWF-0034/AWF-0038, new grouped Cards AWF-0040 through AWF-0043,
and this Work Order. No application/schema implementation, provider setting,
client registration, token, account, secret, deployment, or production data
changed at that point.

Project Philosophy render/check, tracker build/parity, and all 49 `pnpm verify`
steps passed. Manual generated-reader checks at desktop and phone widths found
the proposed Work Order and Cards with no page overflow or console warnings.
The optional tracker-reader Playwright suite passed four of six scenarios;
AWF-0044 records its stale Work Order count assertion and desktop pointer-drag
gap as separate tracker software work.

### Backend spine — 2026-08-16 (Claude)

AWF-0040 and AWF-0041 were implemented: the six-scope ceiling, the single pure
authorizer, per-request grant resolution, record boundaries, immediate
revocation, namespaced tools with compatibility aliases, the batch save with
per-item results, and the protected evidence batch. `pnpm verify` passed all 50
steps. Working notes are in
`docs/planning/bring-your-ai-implementation-brief.md`.

### Connection experience, harness, and public truth — 2026-08-16 (Claude)

AWF-0042 delivered `/app/settings/ai`, and AWF-0043's harness now exists as
runnable code rather than a written procedure.

- The connection centre renders its consent screen from `lib/mcp/catalog.ts`,
  the same module the edge enforces with, and
  `scripts/check-connection-center.ts` fails the build if any scope, either
  never-list, any boundary choice, the immediate-revocation promise, or the
  no-pre-ticked-permission rule stops reaching the markup.
- `/ai` and `/ai.txt` are generated from that catalog, and
  `scripts/check-public-ai-truth.ts` proves the parity and enforces the
  no-named-client rule across 18 public files.
- `scripts/mcp-lifecycle.ts` (`pnpm mcp:lifecycle`, deliberately NOT in
  `pnpm verify`) walks all eleven acceptance points as a real MCP client. Eight
  of them are additionally proved locally in `convex/mcpLifecycleLadder.test.ts`.
- `convex/mcpAcceptanceFixture.ts` now covers `mcpGrants`,
  `mcpClientRegistrations`, and grant-linked `agentActivity`, with its bounded-
  scan, visible-marker, and unmarked-reference-refusal posture unchanged.

**Three defects this stage found and fixed.** The empty tool catalog and the
preflight refusal were written straight onto the wire without protocol revision
2026-07-28's required `resultType`, so a conforming client rejected both as
malformed — the actionable "ask the person to approve this" refusal never
reached a real AI. `observedClientName` was reading the `Mcp-Name` header, which
carries the tool being called, so a person's connection would have been labelled
something like `save_person`. All three are guarded by
`scripts/check-mcp-contract.ts` now. Source review had not caught any of them;
connecting a real client did.

**A navigation orphan, fixed.** `/app/api` and `/app/api/admin` were real pages
with no navigation entry at all and were therefore unreachable, even though
`scripts/check-app-navigation-contract.tsx` already asserted the active-state
behaviour of the entry that was never added. Three existing check scripts —
`check-app-navigation-contract`, `check-navigation-accessibility`, and
`check-settings-responsive` — had no package script and never ran anywhere,
which is how the orphan survived. All three are now wired into `pnpm verify`
alongside the two new ones.

**Not claimed.** Nothing here has run against the deployed site, `/app/settings/ai`
has not been opened in a real browser, and no client is named. No provider
setting, secret, environment variable, deployment, or real family record was
touched.

### Deploy readiness — 2026-08-17 (Claude)

**Ready for production deploy — awaiting Codex.** Verified on a clean worktree
of `origin/main` (`fbed586`) rather than any local checkout: `pnpm verify`
passes all 55 steps and `pnpm exec tsc --noEmit -p convex/tsconfig.json` is
clean. No repo-side defect was found, so nothing needed fixing.

The schema delta production receives is entirely additive — two new tables
(`mcpGrants`, `mcpClientRegistrations`), two optional `agentActivity` fields,
one new index — with nothing removed, renamed, or newly required. Existing rows
stay valid without a migration.

Read-only production probes confirm the pre-#58 baseline: `/app/settings/ai`
404s, `/mcp` already returns the branded 401 challenge, and Clerk advertises
neither CIMD nor DCR.

`docs/operations/bring-your-ai-provider-actions.md` is refreshed into a
copy-paste runbook — pinned exact-SHA deploy worktree, backend-first ordering,
the Convex-vs-Vercel environment split, four post-deploy checks, and every
`pnpm mcp:lifecycle` requirement including its four human pauses.
`docs/operations/deploy-pin-awf-wo-011.md` names the exact commit to deploy.

**Not claimed.** No deploy, no provider change, no secret or environment value
read, no real family record touched. AWF-0043 moves to `needs-you` because the
only remaining acts are credentialed and human.

### Media evidence bytes, and confirmed provider truth — 2026-08-17 (Claude)

**The completeness inspection found one genuine product gap, and it is closed
in source.** `family_history_get_evidence` delivered real text for person
documents and `BYTES_NOT_AVAILABLE` for every image and recording. Family
history research runs on scanned records and photographs, so an AI that cannot
see the census page cannot do the product's core work.

The cause was not the connection. It was that **the vault had nowhere to put a
file**: a `media` row could hold a `filePath` hint or a FamilySearch `url` that
only the person's own signed-in browser can load, so the transport's one remote
fetch was always going to fail and no upload path existed to produce a row that
could succeed. `lib/storage/objectStore.ts` (B2) would not have closed it
either — six deploy-time secrets and a public bucket, and a publicly readable
URL for a private family photograph is the opposite of what protected delivery
is for.

AWF-0045 gives media a private byte store (Convex file storage), a
person-facing upload on the Memories tab, an owner-authenticated file route
that streams bytes and never returns the signed URL it used, and stored-byte
delivery through the **unchanged** gates: owner, grant boundary, reviewed,
AI-use allowed, rights not restricted, and the 2 MiB / 6 MiB budgets. An upload
grants no AI permission by itself — every file arrives private, unreviewed, and
`aiUseAllowed: false`, and replacing bytes resets review. **No new environment
variable or secret is required**, so nothing here waits on Codex or Scott.

**Acceptance ladder rung 6 — real evidence bytes — is now proved locally for the
first time**, end to end through the official MCP client, asserting the
delivered bytes are byte-identical to the stored scan and that a reference-only
row is still refused honestly without leaking its path. Rung 6's other half, a
person's own upload travelling through a real browser, remains for the live run.

**Provider truth, CONFIRMED.** An independent read-only probe on 2026-08-17
found Clerk production DCR live at `/oauth/register`. AWF-0038, this Work
Order's Current truth, and
`docs/operations/bring-your-ai-provider-actions.md` §1 now record DCR as the
approved soft-launch path and CIMD as deferred. No provider setting was changed
by this lane.

`pnpm verify` passes all 56 steps, including the new
`pnpm check:media-bytes` contract guard. Deploy and live proof remain Codex's,
against the pinned commit in `docs/operations/deploy-pin-awf-wo-011.md`.

**Not claimed.** No deploy, no provider change, no secret or environment value
read, no real family record touched, and no client named.

## History

- 2026-08-16 · Scott via coordinator delegation — requested a substantial,
  visible Family History alignment with the adopted Bring Your AI standard,
  preserving capability truth and provider/data boundaries.
- 2026-08-16 · Codex — audited current source, philosophy, tracker, Queue,
  identity/auth, tools, setup docs, live public discovery, and provider metadata;
  proposed this grouped Work Order without changing provider, account, secret,
  deployment, or production data.
- 2026-08-16 · Scott via the Bring Your AI Implementation Program — approved the
  scope and moved this Work Order to Ready. The program record is
  `planning/mcp-program-2026-08.md` in Assist With Life. The provider,
  production-identity, secret, and real-family-data gates in Human gates 2 and 3
  remain in force.
- 2026-08-16 · Claude — executed the backend spine (AWF-0040, AWF-0041), the
  connection experience (AWF-0042), and the scripted lifecycle harness with its
  locally provable rungs (AWF-0043, still `doing` pending a live run). Moved this
  Work Order to `execution: active`. Audit remains independent and `not-audited`.
- 2026-08-17 · Claude — verified repo-side production-deploy readiness on a
  clean worktree, enumerated the additive schema delta, and refreshed the
  provider/deploy runbook so Codex can execute without reverse-engineering it.
  Moved AWF-0043 to `needs-you`. Execution stays `active` and audit stays
  independent and `not-audited`.
- 2026-08-17 · Claude — inspected the shipped Bring Your AI implementation
  against the adopted standard and closed the one genuine product gap it found:
  media evidence bytes (new Card AWF-0045), proving acceptance rung 6 locally.
  Independently re-probed the provider and recorded confirmed live Clerk DCR,
  making it the approved soft-launch path and deferring CIMD. No provider,
  secret, environment, deployment, or real-data change.
