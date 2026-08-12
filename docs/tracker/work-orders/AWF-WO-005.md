---
id: AWF-WO-005
title: Ship the product-native Queue experience
execution: active
audit: not-audited
cards: AWF-0029, AWF-0030
created: 2026-08-12
updated: 2026-08-12
proposed-by: Codex
approved-by: Scott
approved-on: 2026-08-12
executed-by: Codex
---

## Goal

Make the repaired four-state Queue usable and visible inside Discover Their
Stories, with an isolated authenticated development proof first and a final
experience that preserves the product's archival research-to-story identity,
person/chosen-AI authority boundary, privacy defaults, and honest connection
status.

## Current truth

PR #32 repaired Queue-local tenancy and expiry on main and AWF-WO-004 records
that protected release. This phase began from clean remote main
`81ce70cf6cc7109c374256fca0f05eac6fe73c84`. The configured local environment
uses Clerk test keys and a development Convex deployment. A disposable
`queue-proof+clerk_test_*@example.com` identity authenticated locally, and the
current Queue functions were deployed only to that development Convex target.
No real family data, production user, secret, provider policy, or production
database was used.

## Sequence

1. Prove the configured non-production identity boundary with a clearly marked,
   removable Clerk test identity and current development Convex deployment.
2. Implement `/app/queue` with directive creation, bounded list/detail reads,
   activity, person-side lifecycle commands, filters/pagination, and complete
   loading/empty/permission/error/conflict/connection treatments.
3. Add a distinct signed-in navigation entry without relabeling the existing
   research-operations queue as the product Queue.
4. Exercise desktop and narrow-phone flows with synthetic Queue records, prove
   cleanup, and retain chosen-AI connection as unavailable until a real
   credential boundary exists.
5. Run full local verification, protected PR/CI/review, configured deployment,
   safe public/authenticated proof, and dated tracker evidence.

## Dependencies

- AWF-WO-004 Queue-local tenant authority and expiry repair.
- AWF-0029 Queue behavior/design handoff.
- AWF-0030 provider and authenticated proof boundary.
- Scott's explicit 2026-08-12 approval for this Queue product lane.

## Exclusions

- No sibling-product UI copy, external MCP endpoint, `/ai` setup path, invented
  AI connection, domain-object migration, or autonomous research runner.
- No secrets, billing, DNS, auth/provider policy, production genealogy data,
  real-user inspection, or irreversible migration.
- No change to the existing `researchTasks` lifecycle or derived research
  operations queue.

## Stop rules

- Stop at MFA or a need for real-user data, provider/auth-policy change,
  non-test durable access, destructive production action, or ambiguous target.
- Synthetic proof must remain in the configured development boundary and be
  deleted before completion; account cleanup must be proven or recorded as an
  exact access limitation.

## Verification

- Contract/unit coverage for exactly four states, truthful handoff/condition
  copy, state actions, and navigation separation.
- Full `pnpm verify` plus focused Queue and protected-route checks.
- Authenticated desktop and phone browser proof for create, read, person claim,
  progress/result, activity, filters, errors, and deletion cleanup.
- Protected PR, exact-head CI, preview/deployment, public signed-out behavior,
  authenticated synthetic behavior where safe access exists, and separate
  independent audit truth.

## Human gates

The source/test/tracker/normal PR path, configured development Convex deploy,
disposable Clerk test identity, and removable synthetic Queue data are approved.
Real family data, production identity/provider policy, billing, DNS, secrets,
or irreversible data changes remain separate owner decisions.

## Execution evidence

Authenticated setup proof: the disposable Clerk development identity reached
the signed-in `/app` shell. `pnpm exec convex dev --once` published the current
Queue functions and indexes only to the configured development deployment.

Authenticated lifecycle proof: a clearly marked synthetic directive moved
`Waiting for your AI → Working → Done`, with a person claim, checkpoint, result,
and four attributable activity versions. A separate Clerk development identity
in an independent browser session saw zero Queue items while the owner fixture
still existed. Returning to the owner restored the item and history. Deleting
it removed both, and the Clerk Backend API reported all three temporary test
identities deleted with zero remaining. No real family data was created or
read.

UI proof: the exact four states, navigation separation, disconnected-AI truth,
directive/result/activity anatomy, empty/loading/error/permission source paths,
desktop design, and authenticated 390×844 layout passed locally. Signed-out
`/app/queue` redirected to Clerk sign-in. Queue API calls in the exercised
lifecycle returned successful 2xx responses. PR #34 merged as protected main
commit `e4d1e35`; exact-main CI run `31634382959` passed verify and route smoke,
and Vercel production deployment `EwU4tNWp2P6aMoGHgq4M2iKwZr79` completed.
Both the preview and exact production deployment redirected to Vercel login
before the app. Public/product-authenticated production proof therefore remains
blocked on AWF-0030's owner access decision, and independent audit remains a
separate unfinished layer.

## History

- 2026-08-12 · Scott — approved Queue as an independent product lane: establish
  isolated authenticated proof, then ship the product-native Queue screen and
  navigation through normal protected release and safe cleanup.
- 2026-08-12 · Codex — authenticated a removable Clerk test identity and updated
  only the configured development Convex functions; began implementation.
- 2026-08-12 · Codex — completed the local multi-client lifecycle, isolation,
  responsive UI, signed-out boundary, and complete synthetic data/identity
  cleanup proof; began protected release preparation.
- 2026-08-12 · Codex — merged PR #34, passed exact-main CI, and completed the
  configured Vercel production deployment. Stopped at the genuine Vercel
  Deployment Protection decision without changing access policy; execution
  remains active and audit remains not-audited.
