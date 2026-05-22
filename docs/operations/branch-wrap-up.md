# Branch Wrap-Up — codex/foundation-route-long-hardening

Last updated: 2026-05-22

This branch picked up after Codex's foundation route landed Phase 3 Story Studio work (Locality Era research packs + Story Review provenance) and ran a deep audit, several targeted fixes, follow-up issues, and verification hardening. This doc is the single entry-point for an external auditor — read this first.

## What was already on the branch when this audit started

Codex landed four primary commits between `4a7b4d4` and `0f9e2d0`:

- `4354084` Add Experimental Tools Lab (GEN-31)
- `1221f00` Add Locality Era Pack Contract (GEN-32)
- `b46a006` Implement Locality Era Pack Gates (GEN-60)
- `0f9e2d0` Show Research Pack Provenance (GEN-61)

Plus FamilySearch intake validation (GEN-59) and Linear cleanup (GEN-16/17/18/43/44/46/47, GEN-34).

## What this audit added (14 commits on top of `0f9e2d0`)

### Audit fixes (HIGH/MEDIUM severity)

| Commit | Fix |
| --- | --- |
| `9246cb2` | **HIGH**: Split context coverage AI gate from human visibility. The AI eligibility filter was applied inside `buildContextCoverage`, polluting all six consumers (person workspace UI, vault audit, story workflow, publish safety, public story page, AI export). Restored `entries`/`count` to unfiltered; derived `aiEligibleEntries`/`publishableEntries` for the AI export and public story surfaces respectively. Extended `assessStoryPublishReadiness` with a `publishableCount` input so the publish gate stays strict. |
| `cb41f10` | **MED**: ContextReportForm defaults defeated the schema. Form preselected `family_review` / `reviewed` / `aiUseAllowed=true` so a stub Save was instantly AI-eligible. Reset to match the mutation's safe defaults (`private` / `unreviewed` / `false`). Also added a per-category sourced-claims UI so the contract's `sourcedClaims: [{text, sourceRefs, confidence}]` shape actually gets populated (v1 submitted `[]`). |
| `8d54359` | **MED**: Wholesale `suppressHydrationWarning` was sprinkled on ~30 anchors across the app shell without naming the offending extension. Consolidated behind `components/layout/SafeLink.tsx` (and `SafeAnchor`) with a documented rationale; migrated 8 layout/marketing components. |
| `b094bfe` | **MED** (cont'd): Migrated the remaining 15 sprinkled props in `app/app/people/[personId]/page.tsx` to SafeLink/SafeAnchor. After this commit no `<Link suppressHydrationWarning>` or `<a suppressHydrationWarning>` remains in app code — the workaround lives in exactly one file. |

### Follow-up loop closures

| Commit | Issue closed | What |
| --- | --- | --- |
| `08adda9` | GEN-67 | Document gate semantics by surface in place-era research packs doc. Adds a Gate Semantics By Surface table that enumerates AI gate vs public gate vs unfiltered, so future implementers don't repeat the over-broad-filter mistake. |
| `943a6b2` | GEN-65 | Story Review provenance fallback now distinguishes "attached at save time" from "currently available" (different visuals, different stat labels, dashed-border chips for available-not-attached entries). |
| `4ae5b26` | GEN-66 | Person workspace context-coverage card now shows per-entry review/privacy/AI-use badges and a card-level "X reviewed for AI · Y publish-ready" stat. |
| `a44e7b7` | GEN-63 (partial) | Rewrote the gate-logic portion of `scripts/check-context-pack-contract.ts` as 13 behavioral assertions instead of string-match. Confirmed with a deliberate regression mutation that the new check fails on a semantic gate change that the old string-match would have passed. |
| `c6341b4` | GEN-63 (sweep) | Audited the remaining `check:*` scripts that read source files. Found they're already mostly behavioral; added header comments to `check-story-slugs.ts` documenting the Behavioral vs Structural-integration pattern for future agents. |
| `89dba57` | GEN-64 | ContextReportForm now supports per-claim source refs: each claim row has its own chip-toggleable sourceRefs subset, confidence, and remove button. Orphan source refs (where the form-level source was edited away) render with strikethrough so they're visible without silent drops. |
| `b1de041` | GEN-48 (re-verify) | Re-ran every public-story and privacy gate against the current branch. Confirmed no leak path: the GEN-65 fallback exposing "currently available" packs runs only on the internal review page, not the public route. Publish safety strictly tighter now via `publishableCount`. |

### Verification hardening

| Commit | What |
| --- | --- |
| `d909d9c` | Added `pnpm verify` umbrella (31 steps in ~24s) and explicit `pnpm typecheck`. Designed as the single command an auditor runs to confirm the repo is healthy. |
| `3b32c14` | Added `scripts/test-context-gates.ts` with behavioral tests for both gate predicates and the `publishableCount` publish-safety path. Wired into `pnpm test`. |
| `e7b0864` | Added `tests/fixtures/stories/blocked-context-not-publishable.json` for the new "context recorded but not yet publish-ready" gate state. Asserted by `check:story-publish`. |

## How to audit this branch

```bash
pnpm verify
```

That command runs typecheck, lint, test, every `check:*` contract (28 of them), and the production build. ~24 seconds. Logs at `/tmp/dts-verify-*.log` per step if anything fails.

For route smoke (needs the dev server):
```bash
pnpm dev
BASE_URL=http://127.0.0.1:3443 PERSON_ROUTE_ID=KWCJ-4XD pnpm smoke:routes
```

Browser checks: see `docs/operations/product-health-gates.md`.

## Gate semantics reference

After the gate split (commit `9246cb2`), three different filters apply to `historicalContext` depending on the consumer:

| Surface | Filter | Source |
| --- | --- | --- |
| AI context-pack export (markdown + structured) | `aiUseAllowed=true ∧ reviewStatus ∈ {reviewed, redacted} ∧ privacyLevel ≠ private` | `isContextPackEligibleHistoricalContext` → `contextCoverage.aiEligibleEntries` |
| Public story page bundle | `privacyLevel ∈ {publish_candidate, public_source} ∧ reviewStatus ∈ {reviewed, redacted}` | `isPublishablePublicHistoricalContext` → `contextCoverage.publishableEntries` |
| Person workspace UI, vault audit, story publish-readiness signal, story workflow status | unfiltered | `contextCoverage.entries` / `count` |

Full doc: `docs/context/place-era-research-packs.md` ("Gate Semantics By Surface").

## Linear status

| Issue | State | Notes |
| --- | --- | --- |
| GEN-31, GEN-32, GEN-59, GEN-60, GEN-61 | Done | Codex original work + Claude audit follow-up comments |
| GEN-62, GEN-65, GEN-66, GEN-67 | Done | Closed in this branch |
| GEN-63 | Done | Behavioral chunk done; UI/DOM harness piece a future option |
| GEN-64 | Done | Per-claim source refs UI in place |
| GEN-48 | In Review | Production-data privacy sweep needs human operator |
| GEN-68 | Backlog (decision-needed) | Manual `dts:*` label deletion in Linear UI |

GEN-62 through GEN-68 were filed during this audit pass as follow-up issues for things found mid-audit; six are closed, two have explicit reasons for staying open.

## What this branch deliberately did NOT do

- **Not pushed to origin.** Repository policy is to commit but not push without explicit instruction.
- **No production-data privacy sweep.** GEN-48's remaining work needs a human operator with real owner-vault access. Local dev only has synthetic fixtures.
- **No GEN-23 broader privacy/security review.** That's a real feature/audit pass that should be its own route.
- **No deletion of `dts:*` Linear labels.** The Linear MCP doesn't expose label deletion; documented in GEN-68 for a human admin.
- **No new feature work.** This branch closed loops on the existing four Codex commits and the six follow-up issues; it did not start anything new from the Backlog.

## File-level audit map

Key files for an auditor to inspect:

- **Gate logic**: `convex/vault.ts` (`isContextPackEligibleHistoricalContext`, `isPublishablePublicHistoricalContext`, `buildContextCoverage`, `buildStoryBundle`)
- **Publish safety**: `lib/stories/publishSafety.ts` (`assessStoryPublishReadiness` with `publishableCount`)
- **Form/UI**: `components/vault/ContextReportForm.tsx`, `app/app/people/[personId]/page.tsx`, `app/app/stories/[storyId]/page.tsx`
- **Wrapper**: `components/layout/SafeLink.tsx`
- **Tests**: `scripts/test-context-gates.ts`, `scripts/test-vault-core.ts`, `scripts/check-context-pack-contract.ts`
- **Fixtures**: `tests/fixtures/stories/blocked-context-not-publishable.json` (+ manifest)
- **Docs**: `docs/context/place-era-research-packs.md`, `docs/operations/public-beta-launch-qa-report.md` (2026-05-22 section)
