---
id: AWF-WO-006
title: Ship the first stateless chosen-AI workspace connection
execution: complete
audit: not-audited
cards: AWF-0033
created: 2026-08-12
updated: 2026-08-12
proposed-by: Codex
approved-by: Scott via coordinator delegation
approved-on: 2026-08-12
executed-by: Codex
---

## Goal

Ship a complete first stateless remote MCP foundation that lets a signed-in
person's chosen AI do useful Family History work against the same private,
durable records the product UI reads, while preserving evidence provenance,
tenant isolation, bounded authority, replay safety, and human publication gates.

## Current truth

The owner-scoped vault and Queue supply the canonical durable records. Source,
focused synthetic proof, protected PR/CI, public setup routes, production
Convex deployment, OAuth resource challenge, disposable named-client consent,
official-client research-to-story workflow, canonical UI reflection, and exact
fixture cleanup are complete. The retained identity is empty and
non-privileged. Fresh-device email verification and immediate issued-JWT
revocation remain separate gaps; AWF-0034 owns the latter. Independent audit
remains `not-audited`.

## Sequence

1. Orient to product philosophy, tracker, domain schema, tenant/auth boundary,
   Queue, public routes, deployment configuration, and current proof gaps.
2. Define a product-native first tool catalog around a real research-to-story
   loop rather than raw database CRUD.
3. Implement stateless MCP transport, OAuth verification/challenge, bounded
   reads, replay-safe canonical writes, complete-result saves, corrections,
   Queue operations, and public/agent setup guidance.
4. Prove isolation and workflow behavior with removable synthetic identities
   and records, including a real signed protocol request where safe.
5. Run full local and responsive browser verification, then use a normal
   protected PR, CI, deployment, and separate live proof gates.
6. Close durable source/tracker/release truth only to the proof actually
   observed; leave named-client/provider gaps Partial when unproved.

## Dependencies

- Canonical Project Philosophy and repository-owned tracker.
- Existing owner-scoped Convex vault and Queue foundations.
- Existing Clerk issuer configuration for deployed OAuth token verification;
  no provider-policy mutation is implied or authorized.

## Exclusions

- Deletion, public publishing, identity merge, sharing/collaboration grants,
  cross-family access, private media delivery, and external FamilySearch actions.
- Production genealogy data, real-user inspection, secrets, billing, DNS,
  provider/security policy changes, and irreversible migrations.
- A claim that a named client, mobile setup, reconnect, revocation, or consent
  path works before that exact deployed path is exercised.

## Stop rules

Stop at MFA, provider configuration/policy, real-account consent unavailable to
the worker, production-data mutation, another person's account, secret or
billing access, DNS, destructive migration, or an irreversible external action.
Continue normal repository, synthetic local/dev, PR, CI, preview, and safe
signed-out/live-route proof without routine approval.

## Verification

- Focused Convex runtime tests for owner derivation/isolation, stable create
  keys, operation replay/conflict, stale corrections, cross-vault references,
  evidence links/facts, complete-result atomicity, canonical UI visibility,
  and no MCP publishing.
- Stateless transport tests for metadata, anonymous OAuth challenge, JWT
  issuer/access-token enforcement, complete catalog, no tenant selector, a real
  canonical write, and Queue claim visible through the normal product read.
- Branded proxy size/challenge/header tests; full `pnpm verify`; public route
  smoke; desktop and narrow-phone `/ai` checks with console/overflow review.
- Protected PR, exact-head CI, deployment record, signed-out live probes, and
  authenticated/named-client proof only where a sanctioned safe path exists.

## Human gates

Scott's delegation approves this Work Order's source, isolated synthetic proof,
normal protected release, and removable test records. Provider registration or
policy, production data, real-user access, private secrets, billing, DNS, and
any broader public/security posture remain explicit owner gates.

Scott additionally approved retaining one clearly labeled production test
identity, ordinary production deployment correction, standard PKCE client
setup, and an exact-user Clerk sign-in token when fresh-device verification
blocked the otherwise normal test path. No global verification policy changed,
and no real family records, elevated role, or retained fixtures, clients,
sessions, or connections were authorized.

## Execution evidence

Source, focused runtime proof, and the protected code release are complete.
PR #35 merged as `8efa93e`; PR CI `31650777583` and exact merged-main CI
`31650932302` passed. The current synthetic suite uses the official v2 MCP
client, generated signing keys, isolated in-memory Convex tenants, and
explicitly marked records; it reads or writes no provider or production data.

Vercel preview `BJktQcJzBpSoJUzEg6A1bN6xKDKt` is Ready for source `de425bc`
and remains SSO-protected. Scott approved production-only promotion; PR #36
merged as `4b43075`. A date-dependent generated-tracker failure in its exact
main run was fixed by protected PR #37, merged as `8573e49`. Exact merged-main
CI `31659124591` passed, and Vercel deployment
`2fkWTCPfArALkLdRWYR9krDmUFyz` succeeded for that exact SHA.

The provider gate was resolved by pointing Vercel production at Convex
`accomplished-dodo-308`, installing the reviewed Convex code, and keeping the
personal development deployment out of production scope. Public `/ai`,
`/ai.txt`, and `/updates` return 200; metadata returns the canonical resource;
anonymous MCP returns a real 401 resource challenge.

One retained empty test identity used explicit PKCE consent and the official v2
client to list twelve tools, save a complete synthetic research result, search
and hydrate it, correct its story, read Queue, and observe the same canonical
records in the signed-in person/story UI. Human publish gates remained closed.
Every fixture, activity row, receipt, record key, disposable client, session,
and local token artifact was then removed; final brief/search returned zero.

The original Convex deploy key was submitted once to a Clerk password form and
treated as exposed. It was revoked and replaced by a deploy-only production
key. The final protected truth deployment verifies replacement capability. The
detailed non-sensitive record is
`docs/operations/family-history-mcp-production-acceptance-2026-08-12.md`.

Fresh-device email delivery/code entry and refresh/reconnect remain unproved.
Clerk cannot revoke issued JWT access tokens; AWF-0034 records that separate
security/provider choice. Execution is complete and audit stays
`not-audited`.

## History

- 2026-08-12 · Scott via coordinator delegation — approved the bounded outcome,
  autonomous normal release path, and isolated synthetic authenticated proof.
- 2026-08-12 · Codex — completed orientation and began implementation from
  clean `origin/main` commit `6e346cb` on a dedicated branch.
- 2026-08-12 · Codex — passed the first backend and signed transport proof,
  including canonical record writes and Queue activity visible to product reads.
- 2026-08-12 · Codex — merged protected PR #35 as `8efa93e`; PR-head and
  merged-main CI passed, and the Vercel preview is Ready. Stopped before manual
  production promotion or Clerk client/consent work; public production remains
  on `e4d1e35`, so the Work Order remains active and unaudited.
- 2026-08-12 · Scott via coordinator delegation — approved the recommended
  production-only promotion and later retention of one isolated production test
  identity; kept provider policy, named-client setup, Scott's account, and real
  family data outside scope.
- 2026-08-12 · Codex — completed the exact-SHA frontend promotion and main CI,
  then observed the stale production Convex 404 boundary. Stopped before
  provider configuration or account creation and left the release In review.
- 2026-08-12 · Scott via coordinator delegation — expanded the safe boundary to
  ordinary production Convex correction, one retained empty test identity,
  standard PKCE provider setup, synthetic live acceptance, and exact-user
  sign-in-token use without global verification changes.
- 2026-08-12 · Codex — completed production OAuth/MCP/UI acceptance and cleanup,
  rotated the exposed deploy key to deploy-only scope, retained only the empty
  labeled identity, moved execution to complete, and left independent audit
  separate.
