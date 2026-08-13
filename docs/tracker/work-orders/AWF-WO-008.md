---
id: AWF-WO-008
title: Repair and prove the ordinary empty-workspace first journey
execution: complete
audit: not-audited
cards: AWF-0036
created: 2026-08-13
updated: 2026-08-13
proposed-by: Codex from Scott's direct delegation
---

## Goal

Make the first signed-in Family History journey explain one truthful start and
route ordinary chosen-AI setup to the current OAuth MCP guide instead of a
partial legacy key console.

## Authority and scope

Scott directly authorized this focused production audit, a small reproduced
user-facing repair, and normal protected release. Scope includes the empty
dashboard, app navigation, Queue setup link, legacy API-page clarification,
focused tests, responsive proof, release notes, tracker truth, protected PR,
deployment, and live recheck.

## Sequence

1. Exercise signed-out sign-in and isolated signed-in empty workspace, Queue,
   current AI guide, and existing signed-in AI route.
2. Group reproduced defects by first-journey root cause and implement the
   smallest truthful repair.
3. Run focused and full repository verification plus local mobile/desktop
   browser proof.
4. Record a patch release, open a normal protected PR, merge only after checks,
   and verify the exact production journey.
5. Revoke the exact test session, remove credential artifacts, and retain no
   fixture data, connection, or client.

## Dependencies

- Assist With Family History Project Philosophy 1.7.0 and the shared Core.
- Canonical production sign-in, retained empty non-privileged identity, owner-
  scoped vault, four-state Queue, and released stateless OAuth MCP foundation.
- AWF-WO-007 version 2.0.0 rebrand and canonical-domain release.

## Exclusions

- No Scott/real-family data, synthetic family record creation, Queue fixture,
  key creation, OAuth client creation, provider/security setting, or role change.
- No removal of the legacy API-key route without a separate compatibility
  decision.

## Stop rules

- Stop for any cross-family access, real-account requirement, provider-policy
  mutation, or broader manual-entry product decision.

## Human gates

Scott's direct delegation approves this audit, small repair, protected release,
and isolated empty-test-identity proof. No further routine approval is needed
inside the exclusions above.

## Verification

- focused navigation contract, typecheck, lint, and `pnpm verify`
- signed-out and isolated empty-dashboard, Queue and AI routes at 390 and 1366
- protected PR and exact-main CI/deployment evidence
- live signed-out and retained-identity first journey with console and cleanup
  checks

## Current truth

Version 2.0.1 is Public & live. The source repair, full local verification,
protected review, exact-main CI, normal production deployment, signed-out and
isolated signed-in mobile/desktop acceptance, canonical AI/MCP checks, and exact
session/artifact cleanup are complete. Independent audit remains separate.

## Execution evidence

Production reproduction used only the retained empty non-privileged identity.
Signed-out sign-in, empty dashboard, empty Queue, public `/ai`, and the legacy
signed-in AI route were inspected at 390 pixels with console evidence. The exact
test session was revoked, a zero-active-session recheck passed, and all generated
credential files were removed. No family or Queue fixture was created.

All 47 `pnpm verify` steps passed, including 81 Convex tests and the production
build. The release completeness gate passed. PR #45 passed Actions
`31751755082` and Vercel preview, merged as
`c5dd45227703a0dd57e90dd6f2373ef1bbe0005b`, then passed exact-main Actions
`31751911467`. Production deployment `dpl_CJeSNYn3WeKdpExANVCn1kYagQne`
reached Ready and served the normal alias from
`2026-08-13T15:55:48-07:00`.

Live 390×844 and 1366×900 acceptance proved the two empty-workspace starts,
privacy cue, Queue setup link, signed-in Connect your AI navigation, current
`/ai` guide, and repaired direct legacy `/app/api` page with no console errors or
horizontal overflow. Home, `/ai`, `/ai.txt`, and `/updates` returned 200;
anonymous `/mcp` returned the canonical 401 OAuth resource challenge.

Release-record PR #46 passed Actions `31752470821`, merged as
`9ecdcc567abed12feb54a4a64a366436cec97a0b`, and passed exact-main Actions
`31752621780`. Final production deployment
`dpl_3JGRAM5X3DHN8yEFR8fkv6PsPsoq` reached Ready from
`2026-08-13T16:06:56-07:00`; live `/updates` showed v2.0.1 as **Public & live**
at 390×844 with zero console errors.

One initial pre-fix runner echoed a short-lived one-use URL scoped only to the
empty test identity. The resulting exact session was revoked. The final
non-echoing acceptance created one exact session, revoked it after the run, and
confirmed zero active sessions. No family record, Queue directive, key, OAuth
client, provider setting, or production configuration was created or changed;
all credential artifacts were removed.

## History

- 2026-08-13 · Scott via coordinator delegation — approved the bounded audit,
  small repair, protected release, and isolated empty-identity proof.
- 2026-08-13 · Codex — activated this order after reproducing the dashboard and
  chosen-AI navigation mismatch; work continues.
- 2026-08-13 · Codex — shipped version 2.0.1 through PR #45, completed exact-main
  and production proof, revoked the isolated session, and closed execution with
  independent audit still `not-audited`.
- 2026-08-13 · Codex — merged protected release-record PR #46 and verified its
  exact-main CI, final normal production deployment, and live Updates status.
