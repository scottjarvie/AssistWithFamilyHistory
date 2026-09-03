---
id: AWF-WO-013
title: Make Windows release verification trustworthy before publishing media changes
execution: active
audit: not-audited
cards: AWF-0049
created: 2026-09-02
updated: 2026-09-02
proposed-by: Codex
approved-by: Scott
approval-evidence: 2026-09-02 soft-launch instruction to update, upgrade, commit, publish, configure providers, and move without routine permission pauses
---

## Goal

Make the repository's documented full verification command run strictly and
repeatably on this Windows checkout so media changes reach GitHub with real
local evidence instead of platform-noise exceptions.

## Current truth

The branch normalizes only platform representation where content is the
contract, invokes the local TypeScript compiler directly for the extension,
and selects Git Bash explicitly on Windows. `pnpm verify` passes all 58 steps
locally in 211 seconds. GitHub CI has not yet supplied cross-platform proof.

## Sequence

1. Repair newline, path, process-spawn, and Bash selection portability.
2. Run the complete local release gate without skipped checks.
3. Publish through a protected branch and retain GitHub CI evidence.
4. Close the portability outcome only after CI is green.

## Dependencies

- The repository's existing 58-step release gate and generated-artifact
  equality contracts.
- GitHub branch protection and CI on the Family History repository.

## Exclusions

- No weakening, skipping, or platform-specific suppression of product checks.
- No unrelated mass line-ending rewrite.
- No claim that local verification proves provider or production behavior.

## Stop rules

Stop before merging if GitHub CI fails, generated artifacts diverge, or a fix
would require weakening a content, privacy, authorization, or deployment gate.

## Verification

- `pnpm verify` passes every listed step on Windows.
- GitHub CI passes the protected pull request on its configured runners.
- `git diff --check` finds no whitespace errors or broad mechanical rewrite.

## Human gates

Scott's 2026-09-02 soft-launch instruction authorizes this bounded release-
tooling repair and normal protected PR mechanics. A failed privacy/security
gate or a proposal to weaken verification would require a new decision.

## Execution evidence

On 2026-09-02, `pnpm verify` completed 58 of 58 steps successfully in 211
seconds on Windows with Node 24.16.0, including the production build. The
branch is awaiting GitHub CI proof.

## History

- 2026-09-02 · Scott — approved moving the soft-launch site forward without
  routine permission pauses, including updates, upgrades, commit, provider
  setup, and online release.
- 2026-09-02 · Codex — repaired the platform-specific verification failures
  and opened this bounded delivery record pending CI.
