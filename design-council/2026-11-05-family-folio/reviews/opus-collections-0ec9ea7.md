# Opus review: the Places, Stories, writing-candidates and Research collections, and the People follow-up, at `0ec9ea7`

- **Reviewed head:** `0ec9ea7ff7184aaec484e06a7e99918743dd03f0`, compared with the last reviewed head `2bf2eec6998b2f2d16f96c5aa2de21dcc7baef07`. This covers commits `89496a6`, `6fbb6d6` and `0ec9ea7`.
- **Code author:** Codex gpt-6.1-sol.
- **Reviewer and final AI tastemaker:** Claude Opus 5.5. Read-only, different model from the author.
- **Scope:** a code and taste review of one meaningful tranche. This is not blinded formal scoring. Formal round 2 is still pending, no site-wide clearance is claimed, and Scott overrides every call here.
- **How I reviewed it:**
  - Read the playbook, the launch file, the overnight addendum, `AGENTS.md`, the run's brief, capabilities, rounds and verification files, `family-folio-system.md` and the previous review.
  - Read the full diff. That covers all five route pages, the two projection modules, `CollectionWorkspace`, `CollectionRecords`, the preferences and filter helpers, the four new views, the People view, the harness and the projection tests.
  - Traced every row shape back to `convex/vault.ts` and `convex/schema.ts`.
  - Confirmed that the four original routes are identical at `99980b5` and `2bf2eec`.
  - Confirmed there are no changes to `convex/`, auth, `lib/mcp`, `lib/convex` or `app/api` between `99980b5` and HEAD.
  - Viewed these round-3 captures: Research desktop and phone, Stories desktop and phone, Places desktop, People desktop, phone and dark phone, and writing desktop.
  - Viewed the reconstructed Stories desktop capture and compared it with `activity--lanes-list--desktop.jpg` and the collection references.
  - Ran no tests, browser, build or verify, and changed no files.

## Verdict

**Conditionally approved.** The tranche has no blocking privacy or capability problem. The kit is **safe to reuse on more collections once R1 and R2 are fixed.** R2 is a kit-level wording issue that every new collection would copy.

**The previous blocking finding (F1) is resolved, and the fix holds across the whole tranche.**
- All five client collections now get explicit server projections with no spread documents: `lib/vault/peopleCollection.ts:599`, and `lib/vault/collectionRows.ts:545`, `:550`, `:560`, `:568` and `:572`.
- `personLabel` (`collectionRows.ts:565`) copies only the name and the route id, so the full person documents attached by `getResearchOverview` (`convex/vault.ts:2274` and `:2280`) never reach the client.
- Story `content` and task descriptions were already rendered in full by the server before this change; `line-clamp` only hides text with CSS. So this tranche adds no new exposure.
- The model hint is new on screen, and it is correctly labelled as unverified, which matches the schema's own warning about `model`.

**The original routes are preserved.**
- Same `vaultOwnerId` from `getVaultAccessContext`.
- Same actions and arguments: the Places search argument and the writing limit of 24.
- Same unavailable and runtime-error cards.
- Same destinations: `/app/places/:id`, `/app/stories/:id`, `publicStoryPath(publicSlug ?? _id)` and `/app/people/:routeId/story-writer`.
- Same text and empty states.

**The earlier review's other findings are addressed:** F2 to F7 and F9 to F11 are fixed, and F8 is now disclosed in the dialog.

**Added capability:** saved filters on all the declared URL keys; free-text search on Stories and Research; Stories status and workflow combined; person links in Research; and the activity lanes with date filters.

## Findings: correctness and capability first

### R1 · P2 · A task's title links to a person's page, so the link says one thing and goes somewhere else
`components/vault/ResearchOverviewView.tsx:44` sets `rowHref={r=>r.person?.href||null}`, and `CollectionRecords.tsx:30`, `:37` and `:43` wrap the task title in that link.
- **What goes wrong:** "Locate the original passenger list" opens Eleanor Finch's page. Screen readers announce the task title as the link name, which fails WCAG 2.4.4 (the link's purpose must be clear from its text).
- **What it does to the next pages:** it also sets a bad pattern for Queue rows, which come next.
- **Fix:** give task rows no `rowHref` (the title stays static, like global tasks). Render the Person cell as the link, for example "Eleanor Finch →", and in List and Grid add an "Open person" action. Then add this rule to `family-folio-system.md`: *rowHref must open the record named by the identity*.

### R2 · P2 · The kit puts the field name after every value, which reads wrongly for text fields
`components/collections/CollectionRecords.tsx:19` always renders the value followed by the label.
- **What goes wrong:** this works for counts ("12 Sources") but breaks for text fields. The phone captures read "Eleanor Finch Person · biography Kind · draft Status" and "high Priority · todo Status · record search Kind · Nov 4, 2026 Updated (UTC)". People also shows "Nov 4, 2026 Last import (UTC)".
- **Fix:** add a column option such as `fact: "suffix" | "prefix" | "bare"`:
  - default to `suffix` for numeric columns and `bare` for text;
  - use `prefix` only where the value alone is unclear ("Updated Nov 4, 2026").
  - Drop "(UTC)" from fact labels, since `UtcDate` already carries the full ISO title.

  Fix this before the kit reaches Sources, Documents and Imports.

### R3 · P3 · Research does not check the task-state filter value
At `ResearchOverviewView.tsx:41`, an unknown `?status=` value filters the list down to zero tasks. Meanwhile the select at `:45` silently shows "All states", so the control and the result disagree. Stories already checks its values at `StoriesCollectionView.tsx:23`; copy that, using the schema's four states, which the options already match.

### R4 · P3 · Activity is dated by `updatedAt`, so editing an entry moves it in time
Research log entries carry their own status (`convex/schema.ts`, `researchLog.status`), so changing an entry's status moves its mark on the timeline. The schema has `createdAt` and `creationProvenance.recordedAt`, and `projectResearchLog` (`collectionRows.ts:574`) could send `createdAt`.
- **Option 1:** date the activity by when it was recorded.
- **Option 2:** keep `updatedAt`, but label every list row "Updated …" and not just the chart's title text. The chart's title text already says "recorded updates".

### R5 · P3 · Rough edges in the date-range controls
- At `ResearchOverviewView.tsx:32`, clearing one date input clears the whole range.
- A From date after the To date is not flagged; it only shows the generic "No activity matches these filters".
- Period and range both apply. Changing Period clears the range, but drawing a range leaves Period in place, so "3 months" plus a drawn range from last year shows nothing.
- **Fix:** when a range is set, switch Period to "Custom", and swap or warn on an inverted range.

### R6 · P3 · Status tab counts ignore the active search and workflow
At `StoriesCollectionView.tsx:29`, "Draft 1" counts every story even when a workflow or search is active. At `:26` and `:34`, links are built with empty parameters (`?q=&status=draft&workflow=`). Leave out empty values, and either scope the counts to the active filters or label them as totals.

### R7 · P3 · Code tidiness
- `naturalDirection` is accepted but never used (`CollectionWorkspace.tsx:19`, passed in by Places). Remove it, or use it in place of the `naturalOrderLabel === "Recently touched"` string check on `:60`.
- `app/design-council-preview/page.tsx` imports `design-council/2026-11-05-family-folio/BaselineCollections`, so the production build now depends on a run folder. Pruning that folder would break the build. Move it under `components/design/` or a dev-only folder.
- All round-3 and reconstructed captures are gitignored, which follows the earlier run convention. They are local-only evidence, so the gallery or verification notes should say so.

## The no-removal audit (route JSX at `99980b5` against now)

| Surface | Original | Now | Verdict |
|---|---|---|---|
| Places | Badge, h1, description, `q` search, each card's link, kind, events, citations and media | All kept. Badge became the eyebrow; Search button added; table, list and grid views | kept |
| Stories | Hero with Draft, Review and Published counts; All and three status links; five workflow links; status badge, title, person and kind; 4-line excerpt; 4 stats; warnings; Review story; icon-only public link; empty state with Story Writer button | All kept. Counts moved into the view tabs; public link now has a text label (better); excerpt can expand; status and workflow can now combine; Story Writer moved to the header action | kept. The status badge's colour coding was lost (see T4) |
| Writing | 24-candidate query, name, sources, context reports, % ready, workflow, Open Story Writer | All kept; adds lifespan. The filled button became an inline "Open Story Writer →" inside the row link | kept, demoted |
| Research | Two cards: tasks (title, person or "Global task", priority, description or type) and log (summary, kind, person) | All kept. Adds state, kind, updated date, the AI-suggested flag, an author chip, the model hint and person links. "Open Tasks" became "Tasks and follow-up", which is more honest because all states are returned | kept |
| People | Every field from the previous review | Lifespan and state became separate sortable columns. Saved views from before the change get them back automatically (`columnPreferences.ts:5`, with a test) | kept |

Nothing became icon-only, hover-only or newly clamped. The reconstructed captures are labelled honestly ("original route JSX reconstructed with current shared runtime").

## Taste calls (Opus as AI tastemaker; Scott can override any of them)

**T1 · Research activity should be pulled toward the decided pattern (`activity--lanes-list--desktop`).** It is the weakest surface in this tranche. The data and the honesty are right; the presentation is not there yet.
- **Lane labels are too large.** They are drawn at `fontSize="15"` inside an 800-unit viewBox, which renders at about 21px on desktop, bigger than the "Research Log" heading. There is also about 50 units of empty band under the last lane (`:35`).
  - Set the label size so it renders at about 13px.
  - Fit the height to the lanes.
  - Add a dated axis with ticks (first, middle, latest) instead of only a caption below.
  - Add a per-lane count, as the reference shows ("Observations 7").
- **Controls are split across two places.** Author and Period sit at the top right as selects, while Kind and From/To sit below the chart.
  - Make one control row like the reference: an All / You / AI segmented control, a 3 mo · Year · All segmented control, then Kind, then a "Pick dates" disclosure that holds the two date inputs.
  - Put the totals in the header, e.g. "3 entries · 3 lanes · you 1 · AI 1".
- **Kind names are raw backend values.** "tier2 notes" and "tier1 bulk import" carry over from the original, but a lane chart makes them prominent. Add a display-name map (e.g. "Notes", "Bulk import"). This changes wording only, not data.
- **List rows are about 140px tall** because the person link sits on its own 44px line.
  - Use the reference's dated ledger: a date column, a kind icon, the summary, the person as an inline link on the sub-line, and the You/AI chip at the right.
  - Group rows by month.
  - The chip currently reveals only the *method* on hover. The playbook asks for hover to name *which* AI, but the projection has no display name for it, and refusing to invent one is correct. Keep "AI" and record "name the connection" as owed work that needs a server-side display name.
- **Phone and tablet get no lanes at all**, because the chart is hidden below `lg`. The playbook's phone pattern is a lane switcher plus the list. Show a compact, horizontally fitted strip on phones with tappable lane pills that drive the Kind filter, in place of a bare select.

**T2 · Stories has three duplicate facet controls. Keep one per facet.**
- **Status** appears as view tabs, as a select, and in the original buttons. **Workflow** appears as a select and as chips. That stacks three bands of controls above the table.
  - Keep status as the view tabs (Draft, Review, Published with counts), which matches the playbook's "real built-in states".
  - Keep workflow as removable chips.
  - Drop both selects from the desktop form, leaving search plus Filter. On phones, move them into a filter sheet with counts, which was the playbook's owed phone-filter improvement.

  Every capability stays reachable.
- **Two tabs mean "all".** "This result 3" sits beside "All stories 3" (`CollectionWorkspace.tsx:70`). When built-in views exist, hide the "This result" button and let "All stories" clear both the presentation and the filters. Otherwise label it "Unsaved arrangement" and show it only while edited.
- **On phones the tab row cuts off at "Revi".** That is the "reachable only by a sideways scroll" anti-pattern. Status is also reachable through the select, but under T2 it moves into the sheet, so either wrap the tabs into two lines or use the pill row with an "All N" menu, as the sticky-tabs pattern does.

**T3 · The Stories table is a reading surface squeezed into a table.**
- **Rows are about 280px tall** because the 4-line excerpt, "Read full preview", the warnings and the Review story button all sit inside the identity cell. List (or Grid) should be Stories' default on desktop, so narratives read as cards.
- **In Table, show a two-line excerpt** with "Read full preview". The full text stays one labelled step away, so nothing is cheated.
- **Drop the "Review story" button** in Table: the title already opens the same page. Keep it in List and Grid.

**T4 · Restore the status colour coding with semantic tokens.** The original separated draft, review and published by colour. Now every status is `secondary` (`StoriesCollectionView.tsx:15`). Use muted for Draft, `annotation` for Review and `primary` for Published, so each state is recognisable at a glance in both themes.

**T5 · The People phone row is better but still about three times the reference height.** It is about 180px against about 64px; the previous review's F3 is only partly met.
- Together with R2, put "Deceased" inline with the lifespan on the first fact line ("1842–1913 · Deceased · in progress").
- Shorten the count labels in the facts line ("2 imports · 3 memories · 2 docs · 1 story"; the full labels stay in the table header and in hover titles).
- Drop "(UTC)" from the facts line.

  That brings a row to about 3 lines, and every field stays.

**T6 · Small consistency fixes.**
- Writing shows lifespan as "1842 to 1913" (the backend string) while People shows "1842–1913". Format it once in the projection.
- On Places the direction button reads "Original order" next to the "Stored order" sort. Use the same words, or hide the direction button when the natural order has no meaningful direction.
- The Places search placeholder is cut off on desktop (the `.collection-toolbar` minimum width is `20rem`). Shorten it to "Town, county, state, parish or country", or widen the field.
- Research and Places show no active-filter chips and no "Clear all", unlike People and Stories. Add the same removable chips across the kit.

**T7 · Keep as is.**
- Places is the cleanest page in the tranche and closest to the reference table.
- People desktop now matches the reference: the lifespan and state columns, the image slot, numbers right-aligned in a fixed-width font, and the 36px desktop controls.
- The honest scoping copy ("Loaded records only", "first N candidates").
- The label distinguishing the "Self-reported model hint" from recorded provenance.
- Global tasks with no fake links.
- Dark People reads well, and the Filter button has good contrast.

## Is the kit safe to reuse?

**Yes, with conditions.**
1. **Fix R1** and write the "rowHref opens the record named by the identity" rule into the design doc.
2. **Fix R2** (how text fields are labelled in the List facts) inside the kit before it is copied again.
3. **Recommended:** fold T2's "one control per facet" and the shared active-filter chips into the kit API as declared facets (`facets: {key, label, options, counts}`). Then Sources, Documents, Imports and the Queue get chips and a phone filter sheet automatically, instead of each page hand-building forms, chips and selects.

The data-boundary rule, the canonical column migration and the facet save/restore (only declared URL keys change and `page` is cleared, with tests) are sound and ready to reuse.

## Model and head record
- **Exact head reviewed:** `0ec9ea7ff7184aaec484e06a7e99918743dd03f0`
- **Code author:** Codex gpt-6.1-sol
- **Reviewer:** Claude Opus 5.5
- **Verdict:** conditionally approved. Nothing blocks this tranche's commit. R1 and R2 must be fixed before the kit is reused on another collection or the tranche goes to formal round-2 scoring.
