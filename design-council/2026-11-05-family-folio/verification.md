# Local verification evidence

2026-11-05 · implementation author Codex gpt-6.1-sol.

- Baseline and foundation: 10/10 synthetic screenshots each, desktop 1440 and phone 390; light plus explicitly dark Home/People. No console/page errors, no horizontal overflow, visible capability probes passed. Capture reports live with the local screenshot artifacts.
- Cross-model review: requested from Claude Opus 5.5 against exact head `903c7040da1058bd24215d538e5aa7e028eaef97`. Verdict: safe foundation approved, structural/taste changes requested before Home acceptance; see reviews/opus-foundation-903c704.md.
- Fresh blinded Sol design judge: 6.8 vs baseline 5.4, below target; 20 probes passed. No site-wide acceptance claimed.
- Initial `pnpm verify`: 56 passed, build failed because temporary node_modules symlink pointed outside Turbopack workspace. Removed that symlink and installed locked dependencies locally with `pnpm install --offline --frozen-lockfile` (passed). No repository dependency changes.
- Full verification rerun with local dependencies: **57/57 passed**, including production build (50 seconds); log `/tmp/awf-council-verify-local-deps.log`.
- Process runs under nice 10 and shared `/tmp/assist-design-council-heavy.lock` plus site `/tmp/assist-family-history-design.lock`, advisory OS locks via /tmp/awf-council-heavy.py. No concurrent heavy capture/test in this site; preview server stopped before verification.
- Browser fallback: T3 preview snapshots twice timed out after 15000ms. Council's Playwright capture runner used instead; preview tab closed.

Limits: synthetic component harness is not real backend route acceptance, and the 390px capture does not yet prove 320px. Auth, provider, public-story and import semantics unchanged. Node runtime is v24.22.1 (repo requests 22.x); preserve this fact when interpreting the build result.

## Structural Home / collection tranche

- `pnpm verify`: **57/57 passed**, including build, in 43 seconds. Log `/tmp/awf-council-trays-final-verify.log`. The initial run found a navigation assertion tied to the retired amber class; it now checks one active destination with `aria-current=page`, without relaxing route coverage.
- Sixteen meaningful synthetic collection interaction checks passed (`check-collection.mjs`, receipt `collection-acceptance.json`): actual sort/reverse order, grouping, all views, every count, explicit column hiding/restoration, selection/clear, named view save/edit/discard/reload/remove, two isolated fixture preference keys, no record/selection persistence, next-page href, 320px labels/options/choice sheets, long names, and operation with browser storage disabled.
- Production entry-JavaScript manifest upper bounds: Home 293 KB raw / 90 KB gzip, People 422 KB raw / 128 KB gzip. See `production-bundles.json` and reproducible `measure-bundles.mjs`. These are not network traces, first-load timing or baseline comparisons; do not score the development payload as production transfer.
- Snapshot capture retries exposed intermittent Next development stream/manifest errors in both cached Chromium and installed Chrome. A separate eighteen-visit diagnostic at the actual device viewport found no errors. The shared capture runner grows the viewport to the document height; this run now uses a recorded natural-viewport/full-page runner without that resize. The cause is not proven; no failed capture packet is accepted. Runtime is also aligned to the repo’s Node 22 requirement.
- Full route/auth/backend acceptance remains separate from these component fixtures. Product-level light/dark appearance choice, all other page families, full gallery/council acceptance and specialist exploration are still unfinished.

- Node 22.23.4 full verification: 56 checks passed, including build; tracker parity failed because AWF-0021 had just received the local-tranche note. Ran `tracker:build` and `tracker:verify` under Node 22 afterward; both passed. No application source changed between those checks.

Final capture evidence: **12/12 passed**, with no console/page errors, HTTP failures, capability failures or horizontal overflow, using Node 22.23.4, Turbopack dev, installed Chrome and `capture-natural-viewport.mjs`. The accepted report records actual device dimensions and full-page capture without growing the viewport. Earlier webpack runs were not accepted: CDP showed a failed 320 KB generated app/layout.js response while the complete file on disk was 2 MB. Node version, browser and viewport changes alone did not eliminate it; switching the local dev bundler yielded clean capture passes. No production/runtime configuration was changed. The root cause beyond that observed truncation is not claimed.

Final interaction receipt: **17 checks passed**. In addition to the initial 16, the client People table was checked under French locale / Pacific/Auckland time zone with explicit UTC import dates and no hydration errors. The long-name probe now explicitly switches back to Table before checking 320px overflow. Options has an always-visible close control and keyboard Escape returns focus to its summary.

## Exact reviewed head and privacy follow-up

`2bf2eec6998b2f2d16f96c5aa2de21dcc7baef07`: final `pnpm verify` passed **57/57**, Node 22.23.4, 47s; log `/tmp/awf-council-tranche2-final57.log`. Claude Opus 5.5 reviewed that exact Sol-authored head, approved structural Home and found a blocking client-payload issue. Receipt: `reviews/opus-trays-collections-2bf2eec.md`. This is a code/taste review, not formal scoring.

The follow-up adds `projectPeopleCollectionRow` on the server and a minimal client type. `node --import tsx --test scripts/test-people-collection-dto.ts` under Node 22 + nice passed 2/2 in 246ms. The synthetic canary contract excludes private notes, alternate names, unused dates/places, artifact paths/URLs/warnings/metadata, research internals, owner IDs and future unknown fields while keeping every displayed value. It is included in normal test/coverage scripts.

Other small review fixes: natural newest/oldest labels, canonical visible-column order, focus return, aria-sort, partial selection, 44px checkbox targets, local UUID fallback and explicit saved-search persistence copy. Filter form keys prevent a cleared canonical query from retaining an old uncontrolled input value after soft navigation.

Full follow-up verify/captures have **not run yet**: the shared host lease returned exit 75 before starting. The 57/57 and visual receipts above prove the reviewed head, not this newer patch. Do not convert that into current-head acceptance. Compact phone/List row and the wider all-page scope remain work.
