---
id: AWF-WO-003
title: Build and prove the Family History Queue backend foundation
execution: active
audit: not-audited
cards: AWF-0008
created: 2026-08-09
updated: 2026-08-09
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
provisional identities, agent telemetry, and build tracker all carry different
truth and must remain distinct. Work is active on a local change set based on
`e1eee0d`; normal PR/CI/schema/deployment proof remains pending.

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

Implementation and targeted local verification are in progress. Provider and
live evidence must not be added until observed for the exact published commit.

## History

- 2026-08-09 · Scott — approved autonomous delivery of the complete Queue
  foundation and reserved final screen design for later Claude Design work.
- 2026-08-09 · Codex — completed the cross-surface audit and began the distinct
  Queue backend without migrating or relabeling existing product records.
