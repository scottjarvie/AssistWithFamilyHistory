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
