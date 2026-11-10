# AWL-0016 Family History verification

MacBook Pro; Codex gpt-6.1-sol, high reasoning effort; Node 22.23.4. Worktree branch `awl-0016/queue-suggestions`, based on `00c893aff4a7d94301d998de0bc53518e55d66eb`. The main checkout's branch and files were preserved.

## Final application checks

`pnpm verify`: **56 passed, 0 failed**, including the optimized build. Final run: 147 seconds.

- Node behavioral suite: **166 passed**, 0 failed.
- Process-route suite: **7 passed**, 0 failed.
- Convex/feature suite: **475 passed across 45 files**, 0 failed.
- Fresh Convex binding, typecheck, lint, MCP/API contracts, source/evidence review and publication gates, ownership/security, navigation and build checks all passed.

These are local source and synthetic runtime checks. Named checks concerning publication or providers are not proof of a live provider call or a production release.

## Backend behavior

`convex/queueSuggestions.test.ts` covers explicit intent, open-work refusal, private counts past a page, all three states with an input flag, From ownership and title privacy, exact dismissal text, archive/restore, permanent person-action markers, own-credential withdrawal and audit, replay refusal after reopen, indexed rule checks past 500, resumable counters, caller-owned claims, brief reach and filtering, and website identity refusal. Connection display names never participate in authority.

The real MCP transport suites retain the existing AWL-0015 denials and add canonical/alias, selected-person and named-item checks through open, dismissed, withdrawn and accepted suggestion rows. Person HTTP routes use real in-memory Convex handlers with synthetic identities. No old security denial was inverted or deleted.

Lesson 17 adds the exact native website fixture and signed local-bridge fixture. Missing azp succeeds; each OAuth marker and a foreign present azp fails. See TOKEN-INSPECTION.md for the separate, still-pending actual issued-token inspection.

## Migration dry run

No state, content or attribution migration. Legacy rows project at read time.

Counter backfill only: in-memory synthetic Convex runtime, **601 historic rows**, **601 markers needed**, **301 open suggestions**, **300 flagged Answered items**. A complete cursor pass produces exact totals; another dry run reports **0 markers needed**, with the same suggestion/flag counts. Replay and reads before readiness are tested. No first-N correctness cutoff. Production was not queried or changed. This is test-suite proof, not a deployed persistent Local Sandbox receipt.

Existing owners' counters are unavailable until their ship-time backfill completes. New owners initialize exact counters immediately. The internal mutation processes 100 rows per cursor, with dry-run mode and recorded continuation; run on production only at ship time after lead approval.

## Browser and images

Development-only invented-record harness, no backend configured, at 1440 and 390 CSS pixels. The final report in browser-after.json records the pages and interaction assertions. It checks matching global flag counts, questions with Answer and Archive including Answered, hidden suggestions by default, options/evidence/From on the suggestion row, no work-state heading/summary in the suggestion view, and Edit first via real pointer interaction. Every page asserts no document-width overflow. No application API requests or page errors were observed in this harness.

Numbered comparison images and raw captures are indexed in IMAGES.md. Original before captures precede visible edits except the explicitly labelled reconstruction of the old Me card; the new review/origin/suggestion views use the old Queue as their baseline. Disabled preview write buttons are not evidence of authenticated saves. Real review writes are proved in the synthetic backend/HTTP suites.

## Remaining proof and custody

Draft PR only. No merge, deployment, production data change, production sign-in, live provider execution or independent other-model review. The actual development website token inspection remains blocked on completing Clerk sign-in/CAPTCHA; only fixture claim names were verified. Frontends and owned runtime slots are stopped/released at closeout.

Auditor focus: website-person identity versus OAuth identity; narrowed suggestion reach before paging in every status; AI clear/archive refusal; exact credential lease ownership; permanent person action after reopen and receipt replay; counter backfill under concurrent edits. Answered follow-up questions intentionally remain allowed under Core section 4 and lesson 2; canceled, archived and expired-handoff work cannot be newly flagged.
