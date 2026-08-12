---
id: AWF-WO-003
title: Build and prove the Family History Queue backend foundation
execution: complete
audit: follow-up-needed
cards: AWF-0008
created: 2026-08-09
updated: 2026-08-12
proposed-by: Codex
approved-by: Scott
approved-on: 2026-08-09
executed-by: Codex
---

## Goal

Deliver a production-ready, design-independent Queue model and behavior
contract for real Family History handoffs, ready for later Claude Design work,
without relabeling existing domain statuses or inventing a live AI connection.

## Current truth

Scott explicitly authorized the complete Queue foundation in this task. The
existing Operations console, research tasks/checks, imports, story workflow,
provisional identities, agent telemetry, and build tracker all retain their
different truth. PR #31 shipped the distinct foundation at main commit
`e65b03a` after full CI and successful Vercel preview/production builds. The
signed-out live alias and Queue protection boundary were proved without using
private data. Authenticated persistence and exact Convex provider-log proof are
separate AWF-0030 verification work, not a reason to invent completion here.
The 2026-08-12 independent Queue audit found two source-level follow-ups behind
that release evidence: Queue public functions could continue under the global
shadow-mode tenant decision, and expiry required an unwired internal call while
recovery retained stale deadlines. AWF-0032 and AWF-WO-004 own the approved
repair; this audit result does not rewrite the original execution or claim the
repair is deployed.

## Sequence

1. Read Core v1.6.3, Project Philosophy, tracker, code, tests, and safe live truth.
2. Inventory every task/job/import/request/draft/review/agent/status surface and
   decide what may be attached versus what must not become a Queue item.
3. Implement the canonical owner-scoped Queue, activity, commands, bounded
   queries, context adapters, deletion, concurrency, and idempotency contracts.
4. Implement the narrow internal chosen-AI tool boundary without exposing MCP
   before server-derived incoming identity exists.
5. Add pure and Convex-runtime tests plus a durable Claude Design handoff.
6. Reconcile Project Philosophy, API truth, Cards, and this Work Order.
7. Publish through normal protected PR/full CI/Convex+Vercel deployment, then
   record exact source, provider, live, and unverified evidence separately.
8. Self-check against Core and leave independent audit Not audited.

## Dependencies

- Core v1.6.3 and Project Philosophy 1.3.2 starting contract.
- Existing Convex owner-scoping and authenticated-client boundary.
- Scott's 2026-08-09 approval for this bounded implementation.

## Exclusions

- No final `/queue` page, card composition, navigation, branding, or placeholder UI.
- No broad `agentRuns` runtime, autonomous background worker, provider crawler,
  universal search, or automatic conversion of existing rows.
- No live MCP claim, invented chosen-AI connection, production user data,
  provider/account reconfiguration, or weakening of branch/state safeguards.
- No identity merge, disputed promotion, publication, access change, purchase,
  outside communication, or domain-record mutation through generic Queue tools.

## Stop rules

- Stop at missing branch/PR/provider permissions, MFA, irreversible production
  data migration, production identity changes, billing, or domain action.
- Do not deploy a schema by bypassing the normal software path.
- Do not infer Queue directives from old records or expose private family data.
- If incoming chosen-AI identity cannot be server-derived, keep tools internal.

## Verification

- Pure contracts for exact states, authority, state transitions, failure/retry,
  handoff truth, and narrow agent tools.
- Real Convex-runtime fixtures for identity/tenancy, owner references, create,
  list/pagination, leases, idempotency, optimistic concurrency, Needs You,
  resume, failure/exhaustion, completion/activity, human-only use, and deletion.
- Route/protection/API inventory, owned-table parity, full `pnpm verify`, PR and
  main CI, schema deployment, Vercel deployment, public/signed-out probes, and
  authenticated synthetic proof only where access safely permits.

## Human gates

Scott approved this Queue foundation and normal protected deployment path. A
separate decision remains required for final Queue design. Production data,
provider identity/config changes, real-user inspection, and any irreversible
migration remain outside this approval.

## Execution evidence

Implementation, focused tests, tracker readers, Project Philosophy, and the
Claude Design handoff shipped in PR #31. Actions run `31328562901` used the
full software path and passed verify/build/server/smoke. Vercel reported a
successful preview for head `7569b607` and a successful production deployment
for main `e65b03a`. A fresh signed-out browser probe proved the retained
`https://discovertheirstories.com` alias with no console errors and proved that
`/api/queue` redirects to sign-in while preserving the requested URL. No
authenticated account or private genealogy data was used. AWF-0030 holds the
remaining provider/authenticated verification gap; AWF-0029 holds final design.

## Independent audit

- 2026-08-12 · Codex Queue audit — **follow-up-needed**. Current `main` at
  `1a5e731` was selectively checked against the shared Queue contract, source,
  tests, tracker, PR #31, and deployment/signed-out receipts. The shipped
  four-state and domain-separation foundation was confirmed, but public Queue
  tenancy was config-dependent and expiry/recovery was not deterministic.
  AWF-0032 is the bounded P0 repair; AWF-0030 still owns provider/authenticated
  production proof and AWF-0029 still owns final UI.

## History

- 2026-08-09 · Scott — approved autonomous delivery of the complete Queue
  foundation and reserved final screen design for later Claude Design work.
- 2026-08-09 · Codex — completed the cross-surface audit and began the distinct
  Queue backend without migrating or relabeling existing product records.
- 2026-08-09 · Codex — completed implementation and full PR/CI/Vercel/live
  signed-out proof at `e65b03a`; closed execution while preserving AWF-0030 as
  verification work and AWF-0029 as the separate Claude Design outcome.
- 2026-08-12 · Codex Queue audit — recorded `follow-up-needed` without changing
  the completed executor result; linked the verified P0 source gaps to
  AWF-0032 and the separately approved AWF-WO-004 repair.
