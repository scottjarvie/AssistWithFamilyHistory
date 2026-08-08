---
id: AWF-WO-001
title: Migrate Family History to the repo-owned tracker and proven state fast lane
execution: active
audit: not-audited
cards: AWF-0001 AWF-0002 AWF-0003
created: 2026-08-08
updated: 2026-08-08
proposed-by: Codex
approved-by: Scott
approved-on: 2026-08-08
executed-by: Codex
executed-on: 2026-08-08
---

## Goal

Replace mandatory Linear-based project operation with the canonical
repository-owned Cards / Work Orders / Guide tracker, align the Project
Philosophy to Core v1.6.2, and establish the narrow GitHub/Vercel state lane
without weakening safeguards for software or ordinary contributors.

## Current truth

The repository started clean at main commit `924fc047`; it had no tracker, no
state helper, no ignore classifier, no branch ruleset, and a full CI workflow
for every main push. PR #28 merged the implementation to `main` through full CI
and a normal Vercel production build. Tracker migration and philosophy
alignment are complete; the useful state-only provider proof is the remaining
execution step.

## Sequence

1. Read Core v1.6.2 and reconcile the Music provider proof against this repo.
2. Add Family History's own tracker sources, readers, validators, and links.
3. Remove the mandatory Linear gate from current agent instructions.
4. Add the exact shared state contract, local helper, strict GitHub classifier,
   and Vercel full-range ignore classifier.
5. Align and regenerate the Project Philosophy.
6. Prove fixtures and full repository verification.
7. Publish software/config through PR, full CI, and a normal Vercel deployment.
8. Protect main with the least-permissive available owner bypass.
9. Publish useful state directly to main and prove GitHub, Vercel, and live
   production separately; then record immutable receipts as state.

## Dependencies

- Assist With Sites Core Philosophy v1.6.2 at `561481843793a1d0fb97eee3984bccfd004c21a2`.
- Existing Family History Project Philosophy and zero-dependency renderer.
- GitHub and Vercel authenticated provider access already present locally.

## Exclusions

- No product Queue, MCP, auth, schema, customer data, or unrelated app work.
- No import of the historical Linear backlog.
- No automatic dispatch or new tracker concepts.
- No claims that provider proof exists until the exact external records agree.

## Stop rules

- Stop if any private family or living-person detail would enter the tracker.
- Stop a direct-main publication when the local helper rejects any path.
- Stop at sign-in, MFA, billing, or irreversible provider confirmation gates.
- Never broaden the bypass beyond the least-permissive owner role available.
- Any missing or uncertain Vercel range builds normally.

## Verification

- Run tracker and Project Philosophy parity checks.
- Exercise accepted state and rejected mixed, software, configuration,
  deletion/rename, malformed, missing-history, and invalid-state fixtures.
- Run `pnpm verify` for the full software/config branch.
- Inspect exact PR checks, main Actions run, Vercel deployment metadata/logs,
  branch ruleset, live alias assignment, and live-site health.

## Human gates

Scott explicitly authorized the portfolio rollout, the repo-owned tracker, the
trusted-owner direct-main state path, and removal of mandatory Linear operation
on 2026-08-08. New billing, identity, private-data, domain/DNS, or materially
broader access changes still require a separate gate.

## Execution evidence

Local implementation passed `pnpm verify`: 46 steps including typecheck, lint,
tests, every established contract, tracker/philosophy parity, both state
classifiers, and the production build. An isolated temporary index accepted 11
canonical state paths and rejected the same index after `README.md` was added.
The in-app browser blocked local `file://` inspection by security policy; the
zero-dependency verifier still proved byte parity, standalone assets, emitted
JavaScript syntax, skip-link/focus markers, responsive containment, two views,
and required controls. PR #28 ran full CI in Actions run `31272713270`; merge
commit `26b5d21b73917353660c7be750825339711f72c2` ran full main CI in run
`31272820711`. Vercel deployment `dpl_vngjLJMJRMBgo7dM6gpBvT2p7C6J` is
`READY`, contains one build, and owns the retained public aliases. Ruleset
`20590341` requires the PR/check lane and names only Scott user id `53326860`
as bypass actor. State-SHA receipts will be appended only after observed.
Completion remains separate from AWF-0004's future independent audit.

## History

- 2026-08-08 · Scott — approved the portfolio state-publication rollout.
- 2026-08-08 · Scott — explicitly retired the Linear reauthorization and
  dependency for this project.
- 2026-08-08 · Codex — began execution on the isolated implementation branch.
- 2026-08-08 · Codex — completed local implementation and all 46 full
  verification steps; normal PR/CI/deployment publication is next.
- 2026-08-08 · Codex — merged PR #28 after full PR CI; full main CI, one-build
  production deployment, and least-permissive owner ruleset are verified. The
  useful direct-main state proof is next.
