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

### Follow-up full check completed

Code head `89496a6`: **57/57 passed** on Node 22.23.4, 53 seconds. Log `/tmp/awf-council-dto-verify.log`. The test-step log explicitly includes both “People discovery…” privacy contracts (`/tmp/awf-verify-test.log`, tests 46 and 47). Build, typecheck, lint and every contract passed. The earlier lease refusal is historical, no longer a verification blocker. Visual captures and cross-model receipt remain tied to `2bf2eec`; full check is not a substitute for the next updated visual/interaction packet.

## Expanded collection tranche · 5 November

- Node 22 focused row/facet/migration regression: **3/3 passed**, including private canary exclusions for every new projection, all declared saved facets and older People column-choice migration.
- **18/18 People interaction checks** passed; **12/12 cross-page interactions** passed. Covers actual sorting/grouping/view/column/selection behavior, saved q/status/workflow through full navigation, narrative expansion, real public/person destinations, global tasks without fake links, author/kind/date/drag activity filters, 320px overflow and record visibility. Both JSON receipts have zero errors.
- **20/20 current candidate captures** and **8/8 reconstructed archive captures** passed with no page/console errors, failed probes or overflow. Installed Chrome, actual 1440×900 / 390×844 viewports, Node 22 Turbopack dev, no backend/private records. Initial source look-check fixed a stretched phone image-slot background; final images were recaptured. Explicit column version metadata was accidentally also added to a group definition; the full check caught it and it was removed. This unused metadata had no rendered behavior; the captures represent the resulting UI.
- Reconstructed comparisons use original collection JSX from 99980b5 under current shared runtime/shell and invented DTOs. They are labelled separately and are not claimed as frozen original-stack captures.
- A saved-view test initially expected the unedited label after changing search; corrected to expect the real edited state. The test then found a real SVG title hydration mismatch, fixed by rendering one complete text value. No erroneous capture accepted.
- Full frozen-source verification rerun is pending after the TypeScript correction. Shared host and site leases and nice 10 apply; own dev server stopped before full verification. No push/PR/merge/deploy, no site-wide acceptance.

Final frozen-source rerun: **57/57 passed**, Node 22.23.4, 47 seconds, log `/tmp/awf-collections3-final-verify.log`. Includes typecheck, lint, all tests/contracts, generated tracker parity and production build. The corrected option was the only source change after the accepted captures; it is unused by rendering. Full backend/authenticated route and formal council acceptance remain separate.

## Opus small-finding follow-up

Exact reviewed parent: `0ec9ea7`, Sol author / Opus5.5 reviewer; conditional receipt in `reviews/opus-collections-0ec9ea7.md`. Lead fixed required R1/R2 and small R3/R4/R6/R7 issues; status colors restored. **13/13 updated cross-page interactions** and **20/20 follow-up captures** pass with zero errors or overflow. Follow-up images are in `collection-fixes`, leaving the exact reviewed round-3 images intact. This newest gallery section is a capture update, not a formal scoring round. Full `pnpm verify`: **57/57 passed**, Node22, log `/tmp/awf-opus-collections-fixes-verify.log`. Own dev server was stopped first; host/site OS leases and nice10 used for the full run.

The small lead fixes have no new cross-model receipt yet: they will be included in the next meaningful tranche review per the delegate policy. Remaining taste and date-range work is recorded in rounds.md and AWF-0071, not claimed complete. No authenticated backend acceptance or all-page clearance is implied. Gallery and screenshot assets are ignored, local evidence; the generated gallery embeds its assets and can be opened without a server.

## Activity, shared facets and Home refinement tranche

- **57/57 full verification steps passed**, Node22.23.4,49s. Log `/tmp/awf-activity-verify.log`; host/site locks held, nice10, own dev server stopped before run.
- **4/4 focused regressions** passed (privacy projections, saved declared facets, old column migration, custom-window precedence/open bounds/inversion), included in the normal test command.
- **18/18 People interactions** and **15/15 expanded cross-page interactions** pass. Updated tests use the real one-level facet picker, restore q/status/workflow through navigation and saved views, verify every phone research state and removable-chip restoration, actual lane/author/date/drag filtering, independent date clearing and explicit invalid-range feedback. Local receipt JSONs have zero errors.
- **20/20 final captures pass**, actual desktop/phone viewports and no console/page errors or overflow. New folder `activity-facets`; initial look retained beneath it and excluded from the gallery. Default visuals did not change after the final capture. Screens are synthetic, local-only evidence, not authenticated backend proof.
- Builder inspected Home desktop, monthly Research ledger/chart desktop, People phone and Stories default List. Added original handwritten entry glyphs after the initial look; final screenshots recaptured afterward. Search is labelled Search, distinct from + Filter. No UI config/runtime/provider/access change.
- Exact-head Opus code/taste review is next. Formal score/target and all-page acceptance remain pending. The previous lead fixes from `ee116a6` are included in this review batch rather than commissioning a recheck for each small finding.

## Person dossier/stream and kit follow-up tranche

- Five focused row/facet/column/custom-window/contextual-count regressions pass. Normal suite includes them.
- **18/18 People**, **17/17 cross-page**, **12/12 Record** browser checks pass. The Record sequence passed twice on frozen source after correcting native fragment/history subscription handling and testing actual reload. Includes full candidates/conflicts/citations, provisional distinction, legacy routes, real unfinished intake retention, no-capture CTA/guards, keyboard tabs, All9/Contents and320px overflow. Record receipt has zero errors and zero API writes.
- **32/32 current captures pass** in `record-stream/current`, with no console/page errors, capability failures or overflow. Includes Record Overview, Sources, Research, Documents, empty Memories, dark Record and the existing20 collection/Home views. Root record-stream images are an initial look, excluded from newest gallery. **10/10 reconstructed original captures** pass, now including original Person/header JSX from99980b5 under the current runtime and invented fixture.
- The pure offline fixture builder calls the existing workspace assembler on invented Finch/Ashford data. The live route's original owner/action/document fetches and guards remain on the server. New section/stream controls receive rendered content and displayed metadata, not raw workspace/import documents. Synthetic mutation guards are explicit; these checks do not establish authenticated backend/media acceptance.
- At writing, full `pnpm verify` was **queued on session71621** (historical, subsequently resolved below), not yet running: shared host lease is occupied (`/tmp/awf-record-full-verify.log`). No second heavy child started. Own dev server stopped before queueing. Local code can be reviewed while the lease wait proceeds; no current-head full-check/acceptance claimed until that exact run completes.


## Record reviews and frozen Place / Story tranche

- Person c187b04: Opus conditional preservation/privacy approval. Validator path updated to follow the extracted view; all57 then passed. Lead fixes8782bd4 passed57/57 (Node22,51s),16 Record/18 cross-page checks and38 captures. Opus0bafa4f later confirmed every earlier Person required/smaller finding resolved.
- Place/Story0bafa4f: **57/57** full checks (Node22,52s),16 Place/Story +16 Person +18 cross-page checks,30 candidate and4 reconstructed comparisons,206-image gallery lightbox checks passed. Exact-head Opus5.5 review found no privacy/capability regression and conditionally approved reuse; reader source treatment and shared navigation/count corrections required. Full receipt in reviews/opus-place-story-0bafa4f.md.
- Subsequent lead corrections:19 expanded Place/Story checks pass twice,16 Person regressions pass,42 candidate desktop/phone/light/dark images pass. Coverage includes capped-return labels, recorded-citation source-set badges, attention-only Review count/no fake Edit count, seven desktop tabs fitting, last-tab phone visibility, whole-draft source disclosure, explicit narrow editor preview toggle, zero-count pointer removal, dark empty history, and unchanged disabled synthetic mutators. No errors or API writes in receipts.
-248-image newest-first gallery keyboard/arrows/Escape/lightbox checks pass. HTML preview has no console messages; updated gallery shown inline. Portable gallery retains original PNGs; the inline adapter uses compressed viewing copies for the attachment-size limit.
- Final lead-fix full run **passed57/57**, Node22,54s, authoritative terminal exit0: /tmp/awf-record-reader-review-full-verify.log. No site-wide score/target or audit acceptance is inferred; no push/PR/merge/deploy.


## Personal Queue · frozen local tranche

-57/57 full verification passed, Node22,45s, /tmp/awf-queue-full-verify-fixed.log. Initial55/57 failed typecheck/build solely on the read-only reconstructed baseline's incomplete Response mock; native in-memory Response fixes the type without changing pixels or product behavior.
-11 backend-free UI checks pass: actual actors, no-reload views, preserved private in-memory directives/replies, owner-separated browser preferences, no private draft text in storage, recorded-close-date view, safe/opaque refs, delete/reopen controls, pagination/errors,320/390px dark filters and sticky-header-aware thread reveal/reload.
-8 real-client controller checks pass against fully intercepted synthetic API responses. All six commands plus creation/deletion/conflict handling keep original payloads. Seven PATCHs (including409 retry), one POST and one DELETE are fulfilled in the browser; zero API network calls. No backend/auth acceptance is inferred. Controller fixture returns not-found if a Convex backend is configured.
-19 Place/Story,18 People and18 cross-page regressions pass after the shared saved-view callback and development-theme improvements. Person16 receipt remains historical atcf9ef0e, whose application code is unchanged in this tranche.
-30 final Queue captures pass, including four explicitly viewport-only item views;2 reconstructed original Queue comparisons pass. They use original JSX/current shared runtime and invented data, with all mutations disabled. The recorder now records viewportOnly/focus metadata, retaining normal full-page capture behavior for other shots.
-280-image newest-first gallery arrows/Escape/lightbox check passes. Exact-head Opus review next, including cf9ef0e lead fixes. All work local, no site-wide audit/score/target acceptance.
