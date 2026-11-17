# Signed-out home · drawn family campaign

Scott approved the campaign on 17 November 2026. This implements the binding
`family-home-drawn-2026-11-16/standard.md`; shipping waits for the campaign lead.
No backend, authentication, grant, schema or signed-in route changes.

The home keeps Family History's Instrument Sans / Cormorant Garamond / IBM Plex
Mono, folio surfaces, teal actions, evidence green, compass and family footer.
Its motto now leads the hero and appears in metadata and the social image.

## Copy sources and decisions

| Surface | Source and judgement |
| --- | --- |
| Six parts | `lib/site/ideas.ts`: census → Name the household; brick-wall → Follow the question; queue → Keep work moving; context → Place and era; photo → Capture what you have; story → Tell the story. Each live idea occurs once. The research memo proposed eight parts, but six match the actual six live ideas without repeating ideas or promoting planned capabilities. |
| Your AI / Kept here | Shortened from those same ideas; at most eight / nine words. The AI does the reading, research and drafting; the site keeps the result. |
| Seven chips | Site Guide Building blocks: People, Sources, Claims, Questions, Research, Places, Stories. Seven is a selection, not a complete inventory; Queue remains a part, and Events / Topics remain available in the product. |
| Account diagram and change AI | Site Guide introduction and person / AI / site division; compatible clients only. Seven tabs match the chips in order. The compass is the existing site mark. |
| Export | `app/app/settings/data/page.tsx` and `/api/vault/export`: person-controlled JSON records export, original media files excluded. The home explicitly states that limit. |
| FAQ | All ten existing questions and answers, word for word, exported from `FamilyHistoryFaq.tsx`; first three on phones, remainder behind Show more. Existing contradictory publishing answers are preserved per the campaign's word-for-word rule; resolving their product copy is outside this campaign. |
| Soft-launch status | Existing `FeatureShowcase` retained verbatim behind Honest soft-launch status, including its destinations and Current / Coming soon / Later separation. |
| Example | A labelled, unnamed census workflow derived from the census / story ideas; no real or invented named family. |
| Connect | Existing `/ai` route, `/ai.txt` (served by this site). Get started retains `/app`, the old start destination. Header/footer links retained; the support route still leads to the support desk. |

## Drawing and theme decisions

Eleven drawings: hero, six part pictures, three AI figures, connect. Shared
2.2-stroke ink, offset fills, turbulence and blue spark are ported from Buying;
the new objects are a household ledger, search sheet/lens, work cards, folded
map, photo/scan and open story. No people, headstones, graves, verdicts or medical
imagery. Part pictures all use the quiet spark, appropriate to research and
family material; the hero, diagram and connect use the default filing/connecting
spark. The connect picture plugs into the existing compass mark.

The old public shell was light-only. Home-scoped theme styles now make the new
page and navigation follow existing light/dark tokens, with next-themes and a
colour-theme control. Other routes and the signed-in layout are untouched.
The site has no existing home contrast/design ratchet or literal hero-copy test
to update. New coverage checks exact motto alignment, idea coverage, short-copy
limits, responsive interaction and dialog focus; no previous test is removed.

## Validation

- Node 22.23.4, frozen-lockfile installation in the isolated worktree.
- `pnpm verify`: **All 57 verification steps passed.** Summary: passed 57,
  failed 0, total 201s. Includes 64 Convex test files / 680 tests, all passing.
- Added `scripts/test-home-drawn.ts` to the normal test command; no deleted tests.
- Added `tests/e2e/home-drawn.spec.ts`: desktop keyboard selection, chip note,
  selected idea ordering/open state, Escape and focus return, phone accordion,
  phone dialog focus and overflow. Chromium executable `/usr/bin/chromium`.
- No old copy/voice/e2e pin or contrast/design ratchet applies to this old home;
  no thresholds or existing assertions were weakened.
- Production first-load script bytes (unique initial `<script src>` entries in
  `.next/server/app/index.html`, each gzipped using Node zlib): before 843,736 raw /
  260,459 gzip; after 858,213 raw / 265,363 gzip. Increase 4,904 gzip bytes (1.88%).
  Ideas code and dialog dependencies load on first open.
- Before and after captures: 1440×900 and 390×844, light/dark, full page.
  Four additional after states: stepper, chip, accordion, ideas dialog.
  Both themes checked via computed body colours: light background rgb(247,243,232),
  text rgb(29,33,42); dark background rgb(18,22,29), text rgb(245,240,230).
  No horizontal overflow or page errors in either viewport/theme. State capture
  checks found no failed responses. No console warnings/errors on the home.
- Preview browser reported unavailable; used the brief's Playwright fallback.
  Preview targets the dev backend clear-capybara-929 with Clerk disabled, signed
  out; no Convex process or deploy command was run. The page has no live reads.
- Campaign captures live outside Git in
  `/home/jarvie/code/_campaigns/family-home-drawn-2026-11-16/shots/family-history/`.

## Review follow-up · home-only theme

The home theme now applies its light/dark class to `.fh-home` and, separately,
to the portalled ideas dialog. It never changes `<html>` or `<body>`. The saved
home preference uses `family-history-home-theme` (with the previous preference
read for continuity). System preference is followed until the visitor chooses.
Other public routes retain their direct-load appearance after client navigation.
The About and legacy FAQ introduction now use the approved motto too.

The first-review lessons also require the selected part in the ideas title:
`Follow the question · 1 of 6 ideas`, for example. The all-ideas title matches
its button. All six current parts have one idea, so no zero-idea control exists.
The chip note is checked at 1000, 1050 and 1440px; FAQ hidden items share the same
details selector; `/ai.txt` is an inline sentence link; stand-alone home controls
and header, footer and retained-status links have at least 44px targets. Record definitions continue
to come from the guide and the existing ideas list.

Targeted follow-up validation: the two home contracts pass; thirteen browser
checks cover existing controls, warning-free light/dark loads and colours,
portalled dialog themes, direct-load versus client-navigation styles for all six
public destinations, chip pointer alignment at three widths and phone link
sizes. The touched component lint check has no errors. The full verification
suite was not repeated for these review fixes, per the lead's instruction.
