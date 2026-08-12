---
id: AWF-WO-004
title: Repair Queue tenant authority and expiry recovery
execution: complete
audit: not-audited
cards: AWF-0032
created: 2026-08-12
updated: 2026-08-12
proposed-by: Codex Queue audit
approved-by: Scott
approved-on: 2026-08-12
executed-by: Codex
---

## Goal

Deliver the smallest backend repair that makes Family History Queue tenancy
strictly fail closed and makes lease/handoff expiry deterministic, attributable,
and recoverable without changing the product's four states, domain records,
final experience, or external AI connection truth.

## Current truth

Scott approved this exact tranche after the independent Queue audit. The repair
merged through protected PR #32 as main commit
`1a82a03ed207c8cd3c9e99f0dd4b6d4720c282cd`; the older philosophy branch and a
separate dirty `main` worktree remained untouched. Focused Convex, pure
contract, repository unit, full verification, exact-main CI, and the matching
Vercel production deployment passed. No provider/auth policy changed and no
production genealogy data was inspected or mutated. Authenticated synthetic,
provider build-plan, cleanup/revocation, and independent audit proof remain
separate.

## Sequence

1. Reconfirm current remote main, branch/worktree state, repo guidance, source,
   tests, tracker, and PR #31 evidence before writes.
2. Add a Queue-local strict tenant wrapper around every public Queue action and
   mutation without changing the global trust-boundary mode.
3. Wire idempotent scheduled expiry plus bounded read reconciliation; cap AI
   leases and continuation by the handoff deadline.
4. Clear or renew stale deadlines during explicit person-led recovery.
5. Add adversarial Convex and pure lifecycle fixtures, then run full local verification.
6. Publish only through a normal protected branch/PR/CI path and preserve
   external proof as pending until independently observed.

## Dependencies

- Completed AWF-WO-003 foundation and its 2026-08-12 `follow-up-needed` audit.
- Scott's explicit 2026-08-12 authorization for this bounded P0 tranche.
- Existing Clerk-derived owner identity and internal verified-principal boundary.

## Exclusions

- No Queue page, visual design, navigation, or final interaction work.
- No external MCP endpoint, chosen-AI credential resolver, provider/auth policy,
  production data, secrets, billing, DNS, or irreversible migration.
- No domain-record mutation, backfill, tracker fast lane, direct push, or branch
  protection change.

## Stop rules

- Stop at any need to change real identity/provider policy, inspect or mutate
  production data, create durable access, reveal secrets, weaken protection, or
  run an irreversible migration.
- Keep scheduled functions limited to Queue lifecycle truth; they may never do
  research or outside-world work.

## Verification

- Convex runtime: anonymous and cross-owner shadow-mode read/write denial;
  no-item mutation after denial; scheduled and read-time expiry; attributable
  activity; recovery; capped AI lease; late continuation denial; existing
  owner/context/idempotency/concurrency/deletion scenarios.
- Pure contract: exact four states, expiry transition, actor lease cap, active
  authority, retries, and narrow tool surface.
- Repository: Queue contract checker, lint, typecheck, all Convex tests, full
  `pnpm verify`, focused diff review, protected PR, and required CI.
- External: deployment, public, authenticated multi-client, provider,
  revocation, cleanup, and independent audit stay pending unless separately run
  with safe access and exact receipts.

## Human gates

The source/test/normal PR path is approved. Any production data, provider/auth
policy, real credential, secret, billing, DNS, identity, durable access, or
irreversible migration remains a separate stop and owner decision.

## Execution evidence

Local implementation passed 16/16 adversarial Queue Convex tests, 100/100
repository unit tests, TypeScript, diff checks, and all 47 `pnpm verify` checks.
Protected PR #32 merged normally as
`1a82a03ed207c8cd3c9e99f0dd4b6d4720c282cd`. Exact-main Actions run
`31615964828` passed `build-and-smoke`. Vercel production deployment
`HDzMFmbrsany1z95y6y63r3vSHgb` reported Ready and Current for the same commit;
the public homepage returned HTTP 200. Authenticated/provider build-plan,
revocation/cleanup, and independent audit proof remain unclaimed.

## History

- 2026-08-12 · Codex Queue audit — proposed the smallest P0 backend tranche from
  verified config-dependent tenant denial and unwired expiry/recovery findings.
- 2026-08-12 · Scott — approved immediate implementation through the normal
  protected software path with the listed exclusions and stop rules.
- 2026-08-12 · Codex — implemented the local repair and adversarial fixtures;
  execution remains Active through protected PR/CI review.
- 2026-08-12 · Codex — completed execution through protected PR #32, exact-main
  CI, and matching Vercel production deployment. Audit remains `not-audited`;
  AWF-0030 retains provider/authenticated proof without expanding this tranche.
