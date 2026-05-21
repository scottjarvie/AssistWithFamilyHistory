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
