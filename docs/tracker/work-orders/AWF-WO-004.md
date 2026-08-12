---
id: AWF-WO-004
title: Repair Queue tenant authority and expiry recovery
execution: active
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
is locally implemented on a branch from current remote `main` `1a5e731`; the
older philosophy branch and a separate dirty `main` worktree were left
untouched. Focused Convex, pure contract, repository unit, TypeScript, and diff
checks pass. No merge, deployment, provider change, production data, or
authenticated production proof has occurred.

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

Local implementation currently passes 16/16 adversarial Queue Convex tests,
100/100 repository unit tests, TypeScript, and diff checks. Protected PR, CI,
deployment, authenticated/provider proof, cleanup, and independent audit are
not yet complete and are not claimed.

## History

- 2026-08-12 · Codex Queue audit — proposed the smallest P0 backend tranche from
  verified config-dependent tenant denial and unwired expiry/recovery findings.
- 2026-08-12 · Scott — approved immediate implementation through the normal
  protected software path with the listed exclusions and stop rules.
- 2026-08-12 · Codex — implemented the local repair and adversarial fixtures;
  execution remains Active through protected PR/CI review.
