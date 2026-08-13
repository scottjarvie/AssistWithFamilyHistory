---
id: AWF-WO-006
title: Ship the first stateless chosen-AI workspace connection
execution: active
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

The existing owner-scoped vault and Queue supply the canonical durable records.
Scott's coordinator delegation approved this independent tranche. The source,
focused synthetic proof, protected PR, PR-head CI, merged-main CI, and Vercel
preview are complete. Production promotion, live public routes, production
Convex behavior, provider registration/consent, a named client, and independent
audit remain separate and are not inferred from those completed layers.

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

## Execution evidence

Source, focused runtime proof, and the protected code release are complete.
PR #35 merged as `8efa93e`; PR CI `31650777583` and exact merged-main CI
`31650932302` passed. The current synthetic suite uses the official v2 MCP
client, generated signing keys, isolated in-memory Convex tenants, and
explicitly marked records; it reads or writes no provider or production data.

Vercel preview `BJktQcJzBpSoJUzEg6A1bN6xKDKt` is Ready for source `de425bc`
and remains SSO-protected. Vercel production still identifies `e4d1e35`, and
the new public routes returned 404 on 2026-08-12. Production promotion,
production Convex behavior, provider registration/consent, a named client,
reconnect, revocation, and independent audit therefore remain separate and
unproved. Execution stays active and audit stays `not-audited` at this owner
gate.

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
