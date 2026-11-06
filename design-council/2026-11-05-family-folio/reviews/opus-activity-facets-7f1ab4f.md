# Opus review: activity ledger, shared facets and Home trays at `7f1ab4f`

- **Exact head reviewed:** `7f1ab4fab8d8612d896276d5866ca8fb12ca7e99`. Compared with the last reviewed head `0ec9ea7`, so it covers the lead's small fixes in `ee116a6` and the tranche in `7f1ab4f`.
- **Code author:** Codex gpt-6.1-sol. **Reviewer and final AI tastemaker:** Claude Opus 5.5. Read-only, and a different model from the author.
- **Scope:** a code and taste review of one meaningful tranche. It is not blinded formal scoring, formal round 2 is still pending, and it clears no pages beyond this tranche. Scott overrides every call here.
- **What I did:**
  - Read the full code diff, the `rounds.md`, `verification.md` and `capabilities.md` additions, `family-folio-system.md` and both earlier reviews.
  - Checked against `99980b5` where useful. `git diff 99980b5..HEAD` shows no changes to `convex/`, `lib/mcp`, `lib/convex` or `app/api`.
  - Viewed these `activity-facets/` captures: Research desktop and phone, Home desktop and phone, Stories desktop and phone, People desktop, phone and dark phone. I compared them with `activity--lanes-list--desktop` and `--phone`.
  - I ran no tests, browser, build or verify, edited no files and used no subagents.

## Verdict

**Approved with conditions.** Nothing blocks a commit.
- **No privacy or capability problem.** Every field and destination is still visible or reachable.
- **The kit is safe to reuse** on Sources, Documents, Imports and the Queue, provided C1 is fixed first. Three small kit fixes (C2, C3, C9) should land in the same pass, because each new collection would copy them.

## Correctness, privacy and capability findings (most severe first)

**No privacy or capability regressions.**
- `DashboardView` is a server component. Its new import from `@/convex/vaultCore` brings in only type imports and a constant list.
- `operations.criticalMissing` is the same list of keys that `requiredMissingCount` counts (`convex/vaultCore.ts:107,110`). It was already in the summary, so no new data reaches the browser.
- The People route still checks the `status` value on the server (`app/app/people/page.tsx:61`), and the view now checks it too.
- Model hints are still labelled unverified. The author chip only says "connection display name not recorded" and never guesses which AI.

**C1 · P2 · Stories shows two different counts for the same status.**
- The view tabs count only stories that match the active workflow and search (`StoriesCollectionView.tsx:29`).
- The + Filter sheet's "Story status" counts every story (`:34`).
- So with `?workflow=ready_to_review`, the tabs say "Draft 0" while the sheet says "draft 1". "All stories 3" also counts everything, so no tab is highlighted and the numbers don't add up.
- Status also now has two controls, the tabs and the sheet, which is the duplication T2 asked to remove.
- **Fix:** drop status from the Stories sheet, since the tabs own it. Keep workflow in the sheet. Then work out every facet count with the other active filters applied, in the kit itself, so later collections inherit it. Do the same for Research's status counts when a search is active.

**C2 · P3 · People with no import read "Imported No imports yet".** The `lastImport` column uses `fact:"prefix"` with the label "Imported" (`PeopleExplorerView.tsx:20`), but its value can be the sentence "No imports yet". **Fix:** let a column skip its label for empty values (for example a `factEmpty` option), or render "Never imported".

**C3 · P3 · Count labels ignore singular and plural.** The captures show "1 stories" (People), "1 Places" (Stories) and "+1 more checks" (`DashboardView.tsx:71`). The kit's fact labels are fixed strings (`CollectionRecords.tsx:19–22`). **Fix:** let `compactLabel` take the value, e.g. `(n) => n === 1 ? "story" : "stories"`. Wrong numbers or wording in a count is exactly the misleading-count class to avoid.

**C4 · P3 · Home copy promises an action that does not exist.** The Research gaps summary says "the count opens all tasks" (`DashboardView.tsx:69`), but `FolioTray` draws the count as plain text. **Suggested copy:** "6 open tasks across the vault. These people have the most missing required checks."

**C5 · P3 · Activity header totals don't add up.** The header reads "3 entries · 3 lanes · You 1 · AI 1" (`ActivityLedger.tsx:62`), and the System entry is missing from the sum. **Fix:** add "System N" (and "Not attributed N" when non-zero) so the parts equal the total.

**C6 · P3 · A plain click on the chart filters the log to one day.** `onPointerDown` immediately calls `dragDates(date, date)`. So clicking or tapping a dot to read its tooltip silently narrows the log to one day. It does show "Custom" and a Clear button, but it surprises people. **Fix:** set the range only after a drag of about 6px or more.

**C7 · P3 · Phones lose the explanation of the period buttons.**
- "Periods end at the latest recorded update" and "dates are stored updates, in UTC" sit inside the chart card, which is hidden below `md` (`:74`).
- On a phone, "3 mo" in a vault that hasn't changed for a year quietly means three months of last year.
- **Fix:** move that sentence out of the hidden block, or label the presets "Last 3 mo of activity".

**C9 · P3 · Fact text wraps between a number and its label.** The captures show "2 / docs", "· 2 / Context" and lines that start with "·". **Fix:** in `CollectionRecords` facts, add `whitespace-nowrap` to each fact span (and put the separator inside the span that follows), so one fact never splits across lines.

## Earlier findings: resolved or not

| Item | Status |
|---|---|
| **R1** · task title linked to a person | **Resolved.** `rowHref={()=>null}`, the Person cell links explicitly with "Name →", and the rule is written into `family-folio-system.md`. |
| **R2** · labels placed after text values | **Resolved** as a mechanism (`fact` option; numbers get a suffix, text stays bare, dates get a prefix; "(UTC)" dropped). Follow-ups are C2, C3 and C9. |
| **R3** · unchecked task-state value | **Resolved** (`ResearchOverviewView.tsx`). |
| **R4** · dated by `updatedAt` | **Resolved via option 2.** Every row says "Updated …", and the chart, caption and doc say stored updates. |
| **R5** · rough date-range edges | **Resolved.** A custom range replaces the preset, each bound works on its own, an inverted range pauses date filtering with an explanation, and a regression test covers it. |
| **R6** · tab counts and empty URL parameters | Empty parameters are **resolved**. Count scoping in the tabs is resolved but now conflicts with the sheet (**C1**). |
| **R7** · tidiness | **Resolved.** `naturalDirection` is removed, `BaselineCollections` is under `components/design/`, and captures are disclosed as local-only. |
| **T1** · Research activity | **Mostly resolved; detail below.** |
| **T2** · Stories duplicate controls | **Mostly resolved.** The selects are gone, "This result" is gone, and the tabs wrap so "Published" is reachable on a phone. Moving workflow into the sheet (instead of chips) is accepted on its written rationale. Status living in both the tabs and the sheet is still a duplicate (**C1**). |
| **T3** · Stories reading layout | **Resolved by making List the default.** In List, Table and Grid the 4-line excerpt and the actions stay, as the rationale says. |
| **T4** · status colours | **Resolved** with semantic tokens: muted Draft, annotation Review, primary Published. |
| **T5** · People phone row height | **Partly resolved.** Rows dropped from about 180px to about 120px, the first line is lifespan and state, labels are shortened and "(UTC)" is gone. Still owed: C3, C9 and consistent label case ("Imports, Memories" vs "docs, stories"). |
| **T6** · consistency fixes | **Mostly resolved.** Writing uses the en dash, Places has the direction labels and a shorter placeholder, and every collection has filter chips. Home's Recently touched still shows "1842 to 1913" (`DashboardView.tsx:21`). |
| **Home T1 to T4** | **Resolved.** Five trays, Recent imports in the wide slot, summaries beside the counts, real `criticalMissing` labels. All six totals, the descriptions, the actions and the destinations are kept. Naming the tray "Vault index" rather than inventing a Library route is correct. |

**T1 in detail.**
- **Done:**
  - Lane labels are 13px HTML.
  - The chart height fits the lanes.
  - Axis labels mark the first, middle and last dates.
  - Each lane shows its count.
  - Kinds have display names.
  - The controls share one row, with a "Pick dates" disclosure.
  - Totals sit in the header.
  - The ledger is grouped by month, with a kind glyph, an inline person link and the author chip on the right.
  - Phones get every kind as a pill.
- **Left over:**
  - The dots draw as ellipses because of `preserveAspectRatio="none"` on a 600-wide viewBox (visible in the desktop capture). Draw the dots as absolutely positioned HTML over the lane lines, or scale x from the measured width.
  - Desktop has two Kind controls: the select (`:66`) and the lane-label buttons. Keep the lane buttons, add an "All kinds" row, and use `min-h-11` on touch tablets.
  - There is no compact lane strip on phones. The pills are an acceptable lane switcher, so this is not owed.

## Taste calls

1. **Ledger date column.** "Updated Nov 4, 2026, 4:00 PM UTC" wraps onto two lines inside a month group that already names the year. On desktop, show "Nov 4 · 16:00" under a column header that reads "Updated (UTC)", with the full ISO date as the title. Keep the per-row "Updated" on phones, which have no header. That would bring rows close to the reference's single-line ledger.
2. **Vault index: one link per row.** The title link and the "→" link go to the same place. Keep the counted title link and drop the duplicate, so there are three fewer tab stops. Move "Choose a person for Story Writer" into the Stories row. It currently sits under Documents, as if it belonged there.
3. **Filter sheet behaviour.** The sheet stays open after each choice, and the totals don't preview the result. Either close it on selection, or (better, once C1 is fixed) end it with a "Show N stories" button.
4. **"Read full preview"** appears even when the text isn't cut off (Samuel's and Mabel's stories). Show it only when the text actually overflows.
5. **"Unsaved arrangement"** repeats the saved view's own "· edited" marker. Rename it "Detach from view", or drop it.
6. **Keep as is:** the full-width People List; the Places, Research and People chips with Clear all; the filled People call-to-action; the Home layout and the dark People phone screen; the honest disclosures in the caption and the dialog text; and leaving the AI connection name unfilled.

## Reuse decision

**Conditionally approved for reuse.**
- **Before the kit reaches the next collection:** fix C1 (one control per facet, and counts that respect the other active filters).
- **In the same kit pass:** fix C2, C3 and C9 (empty values, singular and plural labels, no splitting inside a fact).
- **Ready to reuse:** `ActivityLedger` and `lib/activity/window.ts` are sound, once C5–C7 and the ellipse fix land. So are `CollectionFilters`, with its declared URL facets, chips and phone sheet, and the `fact` option.
- **Owed by the server:** recording an AI connection's display name. It must never be inferred from `modelHint`.

**Exact head:** `7f1ab4fab8d8612d896276d5866ca8fb12ca7e99` · **Author:** Codex gpt-6.1-sol · **Reviewer:** Claude Opus 5.5 · **Verdict:** approved with conditions; nothing blocks this tranche's commit, and C1 must be fixed before the kit is reused.
