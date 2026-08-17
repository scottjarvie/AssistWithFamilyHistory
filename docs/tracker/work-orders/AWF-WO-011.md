---
id: AWF-WO-011
title: Let a person bring a chosen AI into bounded, reviewable Family History work
execution: ready
audit: not-audited
cards: AWF-0034, AWF-0038, AWF-0040, AWF-0041, AWF-0042, AWF-0043
created: 2026-08-16
updated: 2026-08-16
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
   one-call review-first save, namespaced tools, and correction.
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

**Partial:** live provider discovery advertises neither Client ID Metadata
Documents nor DCR; OAuth carries provider identity scopes rather than enforced
Family History scopes; no durable product grant or active-grant check exists;
issued JWT access is not immediately revocable; protected evidence retrieval,
connection management, joined Queue-to-reviewed-result proof, refresh/reconnect,
mobile setup, and any named-client compatibility remain unproved.

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

Planning evidence is complete and execution has not begun. The 2026-08-16
audit read the adopted family standard and paired Core sections, canonical
Project Philosophy, tracker, Queue, identity/auth, MCP transport/tools, setup
surfaces, FamilySearch evidence contracts, and dated acceptance reports. It
also ran public read-only probes of the branded protected-resource metadata,
anonymous MCP challenge, Clerk authorization-server/OpenID metadata, and
`/ai.txt`.

The durable result is the supporting alignment document, revised capability
truth, updated AWF-0034/AWF-0038, new grouped Cards AWF-0040 through AWF-0043,
and this Proposed Work Order. No application/schema implementation, provider
setting, client registration, token, account, secret, deployment, or production
data changed. Implementation and all later proof remain pending scope approval
and the stated security/provider gate.

Project Philosophy render/check, tracker build/parity, and all 48 `pnpm verify`
steps passed. Manual generated-reader checks at desktop and phone widths found
the proposed Work Order and Cards with no page overflow or console warnings.
The optional tracker-reader Playwright suite passed four of six scenarios;
AWF-0044 records its stale Work Order count assertion and desktop pointer-drag
gap as separate tracker software work.

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
