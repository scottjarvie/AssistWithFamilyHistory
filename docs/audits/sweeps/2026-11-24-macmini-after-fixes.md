# Assist With Family History — after-fixes comparison, 2026-11-24

Mac mini; T3 preview; coordinator-reported production handoff `40a93cfcc753b808fde82247c5385ccb0329d5e1`. Rendered pages exposed no matching build metadata, so the serving commit was not independently verified. Baseline commit `a38f25897a6b4779c0c257b697b5d100bcd71d73`.

Default profile signed in; incognito used for public and gate checks. Preview reported hidden despite visibility requested. No submissions or writes. Original baseline files unchanged; SHA-256:
- `2026-11-24-macmini.md`: `50ad6baac60bcc55123d70a4d657da6567e102ba8aa22362d0a9df2400f34c0c`
- `2026-11-24-macmini.json`: `8f6e1d12330f84a6946a8eb380818ba0811e4a30b6edd2295aa6aef81fbe2c7a`

## Findings

No verified new product defect. The signed-in admin page continues to refuse operator access; sampled incognito gates redirect to sign-in. Queue rendered its empty state and its first phone viewport showed no visible clipping. A Place and published story could not be opened because no detail links were available in their settled lists. Their tabs and associated-person case remain unverified.

The `/app` empty-state action marker was observed with the same early MutationObserver on three warm-cache full navigations at 1280 px, twice. Baseline: 534.2, 854.2, 459.0 ms (median 534). After round 1: 1028.9, 1395.3, 870.3 ms (median 1029; range 870–1395). After round 2: 787.9, 578.6, 885.0 ms (median 788; range 579–885). Both after medians are higher, by 495 and 254 ms respectively; sample ranges overlap and browser visibility was false, so these uncontrolled samples do not establish a regression or cause. FCP entries were absent. Other routes have no comparable readiness timing.

Phone preset reported 390 px and `window.innerWidth` confirmed 390. Queue was visually inspected at its first viewport; other checked phone pages received document-width checks only. Console and failed request counts were unavailable per navigation because diagnostics are cumulative/capped.

## Route comparison

Unverified means no matching fixture or prior comparison, not a failure. No personal details or IDs are recorded.

| Route | Level | Baseline | After | Status |
| --- | --- | --- | --- | --- |
| / | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /features | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /features/source-docs | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /extension | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /ai | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /about | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /roadmap | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /updates | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /privacy | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /contact | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /ideas-and-usage | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /support | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /delete-account | out | Content rendered on one full navigation at each viewport. | Main content rendered; no apparent change in this limited load check. | checked |
| /sign-in | out | Initially empty after navigation; sign-up form later appeared. Default-profile sign-in form subsequently appeared; no credentials entered. | Initially empty after load as before; sign-in form appeared after settling. Sign-up form not rechecked after settling. | checked |
| /sign-up | out | Initially empty after navigation; sign-up form later appeared. Default-profile sign-in form subsequently appeared; no credentials entered. | Initially empty after load as before; sign-in form appeared after settling. Sign-up form not rechecked after settling. | checked |
| /suggestions | out | Redirected to sign-in; no form submitted. | Redirected to sign-in, matching baseline. | checked |
| /queue/suggestions | out | Redirected to sign-in; no form submitted. | Redirected to sign-in, matching baseline. | checked |
| /app | out | Redirected to sign-in; no form submitted. | Redirected to sign-in, matching baseline. | checked |
| /app/people | out | Redirected to sign-in; no form submitted. | Redirected to sign-in, matching baseline. | checked |
| /app/api/admin | out | Redirected to sign-in; no form submitted. | Redirected to sign-in, matching baseline. | checked |
| /settings/ai | out | Redirected to sign-in; no form submitted. | Redirected to sign-in, matching baseline. | checked |
| /stories/[id] | out | Synthetic example returned 404; no real ID was used. | 404 as in baseline; intended availability unverified. | checked |
| /design-council-preview | out | Returned 404 on production; likely non-production route, intent not verified. | 404 as in baseline; intended availability unverified. | checked |
| /local-session | out | Returned 404 on production; likely non-production route, intent not verified. | 404 as in baseline; intended availability unverified. | checked |
| /app/timeline | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/source-docs | in | Redirected to /app/imports. | Redirects to /app/imports, as before. | checked |
| /app/archive | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/tools | in | Redirected to /app/imports. | Redirects to /app/imports, as before. | checked |
| /app/story-writer | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/settings | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/settings/data | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/settings/ai | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/research | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/me | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/imports | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/places | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/audit | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/places/[placeId] | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/library | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/queue | in | Rendered content after navigation; no write action taken. | Queue rendered with a usable empty state; no write action. Phone first viewport visually inspected and fits. | checked |
| /app/experiments | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/operations | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/stories | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/suggestions | in | Redirected to /app/queue?suggestions=true. | Redirects to Queue suggestions, as before. | checked |
| /app/queue/origin/[id] | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/stories/[storyId] | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/api | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/source-docs/[personId]/raw | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/source-docs/[personId] | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/source-docs/[personId]/ai | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/source-docs/[personId]/contextualized | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/queue/suggestions | in | Redirected to /app/queue?suggestions=true. | Redirects to Queue suggestions, as before. | checked |
| /app/people/[personId]/raw | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/people/[personId] | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/people/new | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/people/[personId]/ai | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/people/[personId]/contextualized | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/people/[personId]/story-writer | in | Unvisited: no real examples reached from the observed empty lists; no IDs guessed and no records created. | Not rechecked: no available list fixture; no IDs guessed. | unverified |
| /app/api/admin | admin | Signed-in page says operator access required; admin functions unavailable. Incognito redirected to sign-in. | Operator access required, as before; admin functions unverified. | checked |
| /app | in | Usable empty-state action /app/people/new observed by early document MutationObserver; three samples 534.2, 854.2, 459.0 ms. Median 534 ms. At marker plus 1.2 s resource counts 44, 49, 64 and transferred bytes 4464, 6647, 30035; medians 49 and 6.49 KiB. Resource entries exclude the document; cache and cross-origin visibility limit bytes. FCP entries absent; preview reports invisible. Three navigation:none full loads, normal cache, 1280 viewport. An initial phone width of 516 settled to 390, so overflow not confirmed. | Matched empty-state action timing: round 1 median 1029 ms, round 2 median 788 ms versus baseline 534 ms; hidden preview and normal cache. No cause established. | checked |
| /app/people | in | Rendered content after navigation; no write action taken. | Main content rendered; no apparent change in this limited load check. | checked |
| /app/stories?status=published | in | Not separately checked. | List rendered; no published story detail link found. No associated-person fixture inspected. | checked |
