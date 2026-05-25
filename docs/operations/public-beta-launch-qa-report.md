# Public Beta Launch QA Report

Date: 2026-05-21

Route: Public Beta Launch Closeout And Real Published Story QA

Linear route:

- GEN-48: Public beta publishing launch checklist and final privacy sweep
- GEN-18: Public story slug/share-preview validation
- GEN-44: Publish audit log and reviewer assignment workflow
- GEN-47: Living/private-risk publish gate validation
- GEN-45: Status-only sharing and noindex beta policy
- GEN-19: Lightweight review history vs full versioning decision
- GEN-23: Broader production privacy/security review handoff

## Active Vault QA Candidate

- Vault owner: `local-dev`
- Story ID: `m174j3nwcsf1wacdkxsrv5kzfd83tn9a`
- Canonical slug tested: `jane-example-jane-example-a-public-beta-qa-story-fd83tn9a`
- Current final status after rollback test: `review`
- Indexing policy: `publicIndexing: "noindex"`

The active vault did not initially have a publishable story. The only story was a short draft with blockers for missing context, weak narrative strength, and incomplete relationship/timeline readiness. A safe fixture-style QA candidate was prepared in the dev vault with:

- fixture spouse relationship;
- dated birth, census, marriage, and death events;
- one context report;
- rewritten fixture story copy with explicit QA labeling;
- reviewer assignment;
- second-review requirement and approval.

## Checks Performed

- Backfilled public slugs in the active dev vault.
- Confirmed publish preview initially blocked the short draft.
- Moved prepared story to review through `/api/stories/[id]/status`.
- Recorded publish preview with `?format=handoff&record=true`.
- Confirmed `story_writer` role was denied `story:publish`.
- Published with `trusted_publisher` role and human review note.
- Verified legacy ID route redirected to canonical slug.
- Verified canonical public slug rendered the published story.
- Verified metadata included canonical slug URL and `noindex, nofollow`.
- Verified story Open Graph image returned `200` with `content-type: image/png`.
- Captured mobile screenshots for public and review pages.
- Rolled the story back from `published` to `review`.
- Verified public slug returned 404 after rollback.

## Browser QA Results

- Public story mobile viewport: 390 x 844
- Review page mobile viewport: 390 x 844
- Public story body width: 390
- Review page body width: 390
- Non-404 console errors: none observed
- Generated local screenshot artifacts:
  - `test-artifacts/story-mobile-baselines/public-story-390.png`
  - `test-artifacts/story-mobile-baselines/story-review-390.png`

## Product Decisions Confirmed

- Status-only sharing is still enough for the first beta slice.
- `noindex` should remain the default.
- Per-story `index` should wait for a documented privacy sweep and explicit approval.
- Lightweight review history is enough for current beta rollback confidence.
- Full story versioning remains deferred until content-diff/restore becomes a real product need.
- Issued API keys/scopes are not needed for first-party beta publishing.
- External agents should not receive direct story publish authority until GEN-46 or a successor implements issued credentials/scopes.

## Remaining Blockers

- This was a local/dev fixture-style QA candidate, not a production-data privacy sweep.
- GEN-23 still needs broader privacy/security review before wider beta.
- GEN-3 should still create reusable fixture data in the repo so future agents do not have to prepare dev-vault QA data manually.

## 2026-05-22 — Re-verification after context-gate split

A follow-up audit pass landed eight commits between Codex's `0f9e2d0` and `89dba57`, including the AI/publish gate split in `buildContextCoverage` (commit `9246cb2`). Re-running the GEN-48 contract gates and route smoke against the resulting branch to confirm the launch surface still holds:

### Code-side gate verification

- The public story bundle continues to use `publishableEntries` (strict gate: `privacyLevel ∈ {publish_candidate, public_source} ∧ reviewStatus ∈ {reviewed, redacted}`). The internal review page sees `entries` (unfiltered) so the reviewer can act on unreviewed/private rows, but the public route bundle is gated separately — confirmed in `convex/vault.ts` `buildStoryBundle` at the `options.publicView` branch.
- `publicStoryPolicy.buildPublicStoryMetadata` still defaults to `noindex` unless `publicIndexing === "index"`. No change to the policy.
- `assessStoryPublishReadiness` was extended to consume `publishableCount` when the bundle supplies it (commit `9246cb2`). New blocker message: "X context report(s) exist for this person but none are reviewed at publish-candidate or public-source privacy yet" — a strict gate that did not exist before.
- The GEN-65 Story Review fallback that exposes "currently available" packs to a draft without `contextPackIds` runs only on the internal review page (`app/app/stories/[storyId]/page.tsx`). The public route (`app/stories/[id]/page.tsx`) does not consult that branch.

### Re-run gates

All public-story and privacy gates pass on the current branch:

- `pnpm check:public-story-policy` ✅
- `pnpm check:public-story-e2e` ✅
- `pnpm check:public-beta-launch` ✅
- `pnpm check:story-publish` ✅
- `pnpm check:story-slugs` ✅
- `pnpm check:story-capabilities` ✅
- `pnpm check:privacy-ai-safety` ✅
- `pnpm check:review-gates` ✅
- `pnpm check:story-fixtures` ✅
- `pnpm check:protected-routes` ✅
- `pnpm lint`, `pnpm test`, `pnpm build` ✅
- `BASE_URL=http://127.0.0.1:3443 PERSON_ROUTE_ID=KWCJ-4XD pnpm smoke:routes` ✅ (17/17 routes)

### Route probes

The Codex QA candidate `m174j3nwcsf1wacdkxsrv5kzfd83tn9a` was rolled back to `review`, so:

- `/stories/<rolled-back-id>` returns 404 (expected — the policy gate fires before render).
- `/stories/nonexistent-slug` returns 404 (404 fallback works).
- All 17 protected route smokes pass against `KWCJ-4XD`.

### Production-data sweep status

Still **not done**. This requires a logged-in session against a real owner vault with reviewed published stories, not the local dev fixture. Per the privacy sweep checklist `docs/operations/public-story-privacy-sweep-checklist.md`, the production-data section ("Sample recent imported FamilySearch Capture records for private notes and living-person indicators") needs a human operator with the right access. Keep GEN-48 In Review until that pass happens.
