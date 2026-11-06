# Opus review: Operations upgrade and Queue repairs at `27bee8e`

**Receipt**
- **Head:** `27bee8ecf117364a4e342379327694384c8e223d` on `design/assistwithfamilyhistory-council-2026-11-05`. The worktree was clean when I started.
- **Compared against:** `76b04ba` for Operations and the Queue, and my earlier review `reviews/opus-queue-76b04ba.md`.
- **Author:** Sol (Codex gpt-6.1-sol). **Reviewer:** Claude Opus 5.5, read-only.
- **What I did and didn't do:** I edited nothing, started no servers or browsers, ran no tests and delegated nothing. My only writes were image crops in my scratchpad.
- **Scope:** this is not a formal scored round and not an all-page acceptance. AWF-0071 stays "doing". Audit is not audited. No Card or Work Order is complete.

## Verdict

**Conditionally approved, with required fixes.**
- **Privacy, preservation and command contracts:** approved for the Queue and Operations. Nothing was removed, nothing was invented, and no backend or API changed.
- **Reader family (Story, records, Place):** approved for reuse.
- **Queue as the template for other sites:** approved once QN1 and QN2 below are fixed. Both are small.
- **Operations as the template:** not yet. It needs O-R1 to O-R3 first.
- **Shared collection table:** the alignment is accepted, but kit-wide reuse needs K1 checked first.

---

## 1. Earlier Queue findings

| # | Status | What I found in the code |
|---|---|---|
| **Q-B1** answering in a row broke the open thread | **Resolved** | `QueueWorkspace.tsx:645-651` only touches the open thread when the changed item is the one selected. Late results run through the newest handlers (`:664-668`). Delete passes the ID it actually deleted (`:328`, `:660-663`). A late answer or delete after pressing Next no longer clears or replaces the open thread. |
| **Q-R1** navigation | **Mostly resolved; two gaps (QN1, QN2)** | The item opens from `?item=` in a 48rem right sheet on desktop and full-screen on phones (`:684`). Nothing is auto-selected, and the detail is only fetched when an item is open (`:633-636`). Focus returns to the row you came from, and the page scroll is kept. Previous/Next are present (`:687`). |
| **Q-R2** "Older activity" placement | **Resolved** | The button is above the oldest entry, and the scroll position is held when earlier entries arrive (`:311-313`, `:446`). The history capture confirms it. |
| **Q-R3** false AI hint | **Resolved** | The focus block now uses a neutral icon (`:356`). The Bot icon remains only on setup and handoff copy. |
| **Q-R4** "Not recorded" actor | **Resolved** | Shows "None (unclaimed)" (`QueueCollection.tsx:18`). |
| **Q-R5** no way to recover from a conflict | **Resolved** | The conflict message now has "Reload this item", and the draft stays. The reload keeps the open form mounted, and the retry uses the fresh version (`QueueActionForm.tsx`). Small leftovers are QN5. |
| **Q-R6** filter sheet | **Resolved for the Queue** | "All states" / "Any priority" labels, counts per option, and a Done button so several filters can be chosen at once. Priority stays loaded-only on purpose; I accept the reason (the backend index is unreliable). |
| **Q-R7** repeated URL keys | **Resolved** | The server and the client now both take the first value (`viewFilters.ts`, `navigation.ts:5`). |
| **Q-T1–T6** taste calls | **Done** | One table head with aligned columns; "Needs you" in sentence case from presentation only, with the contract label restored; the phone setup line is one paragraph; the fixture dates make sense; the phone answer comes first in the actual page order (not just visually). |
| **C1** Story source badge | **Resolved** | The badge reads "No recorded citation among the first 3 returned" (`StoryReviewView.tsx:382`). Visible in the capture. |
| **C2** phone spinner | **Resolved** | Only decorative icons are hidden now; the spinner shows (`StoryStatusActions.tsx:109`). |

**Combinations of pending writes, reads, filters and navigation.** I traced each of these and they hold:
- Old detail responses can't overwrite a newer one, and "Older activity" can't either.
- A command or delete finishing after Next only updates the list.
- An item that leaves the current filter keeps its open thread, which then says "Outside this loaded view".
- Changing a filter clears `?item=` only when the state changes.
- The sheet can't be opened while the filter sheet is open.

## 2. New Queue findings

**QN1 · Required (small). Every open-and-close leaves an extra history entry.**
- `selectItem` pushes a new history entry (`QueueWorkspace.tsx:542`).
- Close, Escape and delete replace the current entry instead (`:540`).
- After opening and closing, history holds two identical list entries, so browser Back does nothing visible. After triaging 10 items, it takes about 10 Back presses to leave the page.
- **Fix:** if this session opened the sheet with a push, close it with `history.back()`. Use replace only for direct `?item=` links.

**QN2 · Required (small). Previous/Next don't follow the order on screen.**
- The buttons step through the server order (`:687`, using `visibleItems`), but the table is grouped by state and sorted on the client by default.
- So "Next ↓" can jump to a row several groups away. The label says "loaded order", so it is honest, but the ↑/↓ arrows promise the visible order.
- **Fix:** step through the rendered order, i.e. the `[data-row]` order in `collection`, or have `CollectionWorkspace` pass its grouped and sorted order back up.
- **Same fix:** on close, focus and scroll to the row of the item you're currently viewing, not the first row you opened. Today, after Next ×5, closing puts you back where you started.

**QN3 · Should fix. After a successful command, the sheet flashes a loading placeholder.**
- `replaceItem` reloads the detail without the quiet flag (`:649`).
- That swaps in the loading placeholder, resets the sheet's scroll, and drops any "Older activity" pages already loaded.
- **Fix:** pass `quiet=true`; the PATCH response has already updated the item.

**QN4 · Low. The `origin` focus target is never cleared.**
- Opening a new directive (`:657`) followed by Close sends focus to a row from an earlier session.
- **Fix:** clear `origin` on close, and set it to the new row when a directive is created.

**QN5 · Low. Leftovers after a conflict reload.**
- An action form stays open after a reload even if the new state no longer allows that command (`:310` now resets only when the item changes). The backend still refuses the command; hide the form when its command is no longer available.
- Reloading from a row reloads only page 1 (`:681`). A row on page 2 then disappears, and its draft is kept but invisible.

## 3. Operations: preservation and privacy

**Server action:** the `getOperationsQueue` arguments are identical to `76b04ba`:
- the eight URL keys;
- the six sort keys with `missingCritical` as the default;
- `asc`/`desc`;
- the 50 × page limit;
- the `hasMore` estimate (more rows may exist when a page comes back full);
- the not-configured and runtime-error cards.

Repeated keys are now normalised, which is an improvement: before, an array could reach the Convex validator.

**Writes:** `OperationRowActions` payloads are unchanged:
- `/api/operations/checks` still acts on the first missing check;
- promote and merge keep the 20-character note and `reviewNoteReady`;
- clipboard text and the manual-copy fallback are untouched.

The only changes are preview-only guards, labelled review notes, and theme colours.

**Browser boundary:**
- `projectOperationRow` deliberately excludes `researchChecks`, `relationshipHint` as a raw field, `openTaskCount` and `storyReadinessScore`.
- The summary contains counts only.
- This is as private as the original server-rendered table.
- **Small note:** `lastTouched` and `latestImportAt` are sent to the browser but never shown. Remove them to keep the allowlist minimal (`operationsRows.ts:15`).

**Content check against the original JSX:** everything is present.
- Session label and text, guest sign-in (now in the session strip), Import, and the filtered export.
- All six metrics.
- All nine columns' data: name, lifespan, provisional anchor, type plus badge, places or "No known places", coverage plus stale count, all five evidence counts including zeros, story state, and every missing check and next action. The originals were capped at 4 and 2, so this improves on them.
- "Queue is clear for this row." and "None critical".
- The filtered, empty and guest states.
- All four guide cards, the paired-workflow text and the Story Writer link.

**Relocated but still reachable:**
- The coverage bar visual is gone; the percentage stays.
- The Sign in and Import buttons are no longer inside the empty state; they are in the header and session strip.

**Not misleading:** "Summary covers these N loaded rows" is true. Every summary figure is computed over the visible rows (`convex/vault.ts:1890-1915`). "Average coverage" counts canonical people only; say so (low priority).

**Synthetic fixture:** writes, candidate lookup, Context Pack and export are disabled. The live controller fixture returns not-found when Convex is configured (`design-council-preview/page.tsx:56`).

**Verdict:** no capability removed, no invented capability, and no privacy or owner-boundary regression. The issues are about the first read and the filter interaction.

**O-R1 · Required. At 1440 the desktop table hides Next action and cuts off Missing checks.**
- **Evidence:** `operations--desktop-light.png` and `operations-provisional--desktop-light.png` both show the table ending mid "Missing check", with Next action off-screen and no fade at the edge.
- **Cause:** the shared kit now sets `min-width = 344 + Σwidths`, which is 1400px for Operations, while about 1,120px is available (`CollectionRecords.tsx:27`).
- **Comparison:** the reconstructed original showed all nine columns, including Next action and the buttons, at 1440.
- **Why it matters:** the column that answers "what should be done next" is the page's main job, and the playbook rejects content reachable only by a sideways scroll.
- **Fix:**
  - Narrow the identity column (300 → about 220).
  - Show Evidence as a compact stacked list.
  - Move Next action next to Entry, or make the table fluid at `xl`.
  - Add a scroll fade at the edge.
  - Then re-capture at 1440 and 1280.

**O-R2 · Required (small). Server sort is treated as a filter.**
- The shared sheet labels the defaults "All server sort" and "All server direction" (`CollectionFilters.tsx:36`). Rename them to "Default: missing critical" / "Default: descending".
- `emptyState` and the "All research" view count `sortBy`/`sortDirection` as filters (`OperationsCollection.tsx:29`, `:39`). An empty vault opened with `?sortBy=completion` then shows "No rows match this filter" and loses the import guidance. This is a truth regression: the original excluded sort from `hasActiveFilters`.
- **Fix:** exclude sort and direction from both checks.

**O-R3 · Required before reuse. The shared filter sheet applies one facet at a time and then closes.**
- Each tap navigates to a new server query and closes the sheet (`CollectionFilters.tsx:36`).
- The original was a single GET form with one Apply button.
- The Queue got Done and multi-select in Q-R6; the shared kit, which Operations and every other collection use, did not.
- **Fix:** let the person pick several facets in the sheet, then apply them with one GET.

**O-R4 · Verify. The Table-mode capture contradicts the source.**
- The source hides `.operation-details` inside `.collection-table` (`globals.css:290`).
- Both desktop captures still show "Checks and next actions · 5 / 3" inside the Table.
- Either the captures are older than the rule, or the rule doesn't apply. Confirm which before the "Table shows full cells" claim stands.
- If the rule does work, Next action exists only off-screen until O-R1 is fixed.

**Should fix:**
- "Mark Done" and "Not Applicable" act silently on `missingCritical[0]` (`OperationRowActions.tsx:480`). Now that every check is listed, name the one the button changes ("Mark birth record done"). This is presentation only.
- "· more records available" (`CollectionWorkspace.tsx:103`) states as fact what is only an estimate. Use "Load the next 50 rows" or "more may be available".

## 4. Shared collection table

**Accepted:**
- One table head with a shared `colgroup`.
- Group rows inside the table, including phone Table mode.
- Sentence-case groups, now that `capitalize` is gone.
- The extra width metadata on group rows was removed, and the contract labels are restored.
- This resolves my Q-T1.

**K1 · Required verification before kit-wide reuse.** The new minimum width is page-wide arithmetic:
- People's default columns come to about 1,256px, against about 1,120px available at 1440 with the sidebar, so People will probably gain a sideways scroll it didn't have.
- Queue is about 992px and fits.
- The existing People and Research captures predate this change, and the overflow tests check page width, not the table container, so they wouldn't catch it.
- Re-capture the People and Research tables at 1440 before calling the kit accepted. I'm not claiming any fresh screenshots for page families this tranche didn't touch.

**K2 · Low (accessibility).** `scope="rowgroup"` inside a single `tbody` covers every row (`CollectionRecords.tsx:33`). Render one `tbody` per group under the single `thead`; that is valid HTML and keeps the alignment.

**K3 · Taste.** Removing `whitespace-nowrap` (`:23`) fixed "answer· Priority", but now numbers split from their nouns: "2 / stale checks", "12 sources · 3 / memories". Keep each fact unbroken and allow line breaks only at the "·" separators.

## 5. Taste calls (final AI tastemaker; Scott overrides)

1. **Operations phone rows read like a paragraph.**
   - The compact row is a 6-line chain of facts joined by "·".
   - Lead with workflow, then "N missing", then the first next action.
   - Move the evidence counts and places into the existing disclosure.
   - Rows will stay under 500px and become scannable.
2. **The Queue sheet header on phones takes two rows** (about 108 CSS px, roughly 13% of an 844px screen).
   - Use one row: ← Back, then ↑ ↓ icon buttons with accessible names.
   - Move "Previous/Next follow loaded order" to a tooltip or screen-reader-only text.
3. **Filter sheets.**
   - Shorten the Queue description from 6 lines to 2.
   - Make Done sticky.
   - Sentence-case the priority values ("High · 2 loaded").
   - Fix the "All entry type" / "All missing check" grammar in the shared kit.
   - For state options outside the current server load, show "not loaded" (as the state dictionary does) instead of "0 loaded".
4. **Keep as built:**
   - the desktop sheet over the dimmed table, with ask then answer;
   - answer-first on phones;
   - the ledger;
   - the ruled six-figure Operations summary in place of the cards;
   - the guide as disclosures after the data;
   - the honest "Server research order" wording.
5. **Naming (existed before this change).** The navigation says "Research Queue", the page says "Operations", and the personal Queue says "not the Research Queue". Reconcile these in one pass; it's Scott's call.

## Required before reuse

| Area | Fixes |
|---|---|
| **Queue** | QN1, QN2. QN3 recommended. |
| **Operations** | O-R1, O-R2, O-R3. O-R4 verified. |
| **Collection kit** | K1 captures. |

## Screenshots inspected

All from the local originals; long phone pages were cropped at full resolution.
- **`operations-records`:**
  - `operations--desktop-light`
  - `operations-provisional--desktop-light`
  - `operations-dark--mobile-light` (top and bottom)
  - `operations-filter-dark--mobile-light` (sheet)
- **`baseline-reconstructed`:**
  - `operations-reconstructed--desktop-light`
  - `operations-reconstructed--mobile-light` (top)
- **`queue-review-fixes`:**
  - `queue-answer-sheet-viewport` desktop and mobile
  - `queue-result-sheet-viewport--mobile-light`
  - `queue-sheet-history--mobile-light`
  - `queue-sheet-ledger-dark--mobile-light`
  - `queue-filter-dark--mobile-light` (sheet)
  - `story-source-caps-review-fix--desktop-light`

**Test receipts:** I relied on Sol's reported receipts and did not rerun them: 57/57 full checks on Node 22, plus the intercepted Queue and Operations controller checks. The tests show no API request reached a backend. That covers client wiring only, not backend acceptance.
