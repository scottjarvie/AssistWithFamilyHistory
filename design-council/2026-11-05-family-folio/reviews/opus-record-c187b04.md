# Review: Person dossier and evidence stream at `c187b04`

**Approved with conditions.** I found no privacy or capability regressions, and every original field and action is still on the page. Five things should be fixed before this record kit is reused on another page: a misleading Research count, an invisible-dot typo in Timeline, form controls that are unreadable in dark mode, stream labels and attribution that don't match the Research page, and section switches that leave the phone view in the wrong place.

The full check (`pnpm verify`) has not run on this head yet, so nothing here counts as acceptance. This was a read-only review: I ran no browser, tests or build, edited no files, started no agents, and touched no backend or real data.

## Privacy and capability: no regressions

- **Route** (`app/app/people/[personId]/page.tsx`): the owner lookup, the person and document reads, the "unavailable", runtime-error and not-found paths, and the `personId`-based document routes are all unchanged. The new view has no `"use client"`, so it renders on the server.
- **What crosses to the browser:**
  - `RecordSections` receives already-rendered nodes plus each section's id, label, count and date.
  - `EvidenceStream` receives only id, kind, label, date, author and rendered content.
  - No raw workspace, import artifact paths or unknown document fields reach client code. The kit boundary holds.
- **Synthetic guards:**
  - `readonlyPreview` defaults to `false` everywhere, and only the dev harness passes it. That harness returns not-found outside development, on Vercel and in CI.
  - `ContextItemsPanel` has both a guard inside the save function and a disabled Save button.
  - The media and research-check mutations are wrapped in disabled fieldsets.
  - The fixture is built offline from invented data through the existing pure assembler.
- **Field-by-field comparison** against the original page and header: every item is present.
  - Priority Gaps; Story Readiness (the coverage % moved to the dossier); the Life Sketch facts and counts; Contextual Research (the 4-row cap is gone); Next Actions with the no-import gates and explanations.
  - The figures from Story Inputs and Operations Status; import page types, date, merge state and warning count; the full research log.
  - All source facts (the 12-fact cap is gone), citations and conflicts; provisional relatives; places; every media control; documents with the raw/contextualized/legacy routes; full story text with review and public links.
  - Research checks, tasks and context intake; the unsourced and first-start warnings; Run AI and both context-pack exports.
- **Counts agree with the assembler** (`convex/vault.ts:1083`): Sources = `stats.sources`, Timeline = `stats.events`, and Memories, Places, Stories and Imports all match. Import runs and the research log are not capped, so "Show all" really shows everything.

## Correctness and misleading counts (in priority order)

1. **P2 · The Research count is inflated by inferred checks.** `PersonWorkspaceView.tsx:326` adds `researchChecks.length` to tasks and context items. The assembler always infers 14 checks, so the fixture shows **Research 16** (in the Contents list and the tab strip) for one task and one context item. A person with nothing at all would still show **14**. That is the misleading-count class Scott rejects.
   - **Fix:** count tasks plus context items. In the All menu, add a sub-line such as "1 task · 1 context item · 3 checks need review".
2. **P2 · Dated Timeline dots are invisible.** `LifeTimeline.tsx:81` uses `bg-annotation-surface0`, a find-and-replace leftover from `bg-amber-500`. The class doesn't exist, so dated events get no fill, while undated ones get `bg-muted-foreground`. The emphasis is now upside down.
   - **Fix:** use `bg-annotation`.
3. **P2 · Form controls become white-on-white in dark mode.** The colour migration changed the text to `text-foreground` but left `bg-white` on the background. In dark mode the foreground colour (`#f5f0e6`) is near-white, so the text disappears. The originals used dark stone text on white and were readable in both modes. Affected:
   - `ResearchChecksPanel.tsx:152`, `:188`, `:194`
   - `ContextItemsPanel.tsx:173`
   - `MediaPrivacyReviewPanel.tsx:220`, `:414`

   The dark captures only cover Overview, which is why the 32 clean captures didn't catch this.
   - **Fix:** use `bg-card` or `bg-background` and add Research and Memories to the dark captures.
4. **P2 · Stream attribution is thinner than the Research page shows for the same rows.** `PersonWorkspaceView.tsx:55` differs from `ActivityLedger` (Research page) in four ways:
   - It shows raw codes as kind names ("tier2 sources", "context research"), where `ActivityLedger` uses friendly names and per-kind icons.
   - It drops the self-reported model hint and its "not verified" wording, and the origin-method tooltip.
   - It shows the same "AI" chip for `first_party_ai` and `chosen_ai`. The Queue calls these "Family History AI" and "Your AI" (`lib/queue/presentation.ts:193`), and the playbook says never to blur them.
   - **Fix:** take kind names, icons and author labels from one shared helper used by both pages.
5. **P2 · Changing section doesn't scroll to it on phones.** Tabs are hidden with the `hidden` attribute, and `choose()` (`RecordSections.tsx:23`) never scrolls. Two cases fail:
   - **Dossier links:** "Compare source-backed candidates" and the counted links sit inside a dossier that is about 700px tall at 320px wide. Tapping one swaps the panel below the visible area, so nothing on screen changes.
   - **Deep in the stream:** tapping a sticky tab lands mid-panel or at the bottom of the new one.
   - **Why the checks pass:** `check-record.mjs` waits for the `aria-selected` change but never checks what's in view.
   - **Fix:** when a section is activated from any control or a hash change, scroll the tab strip or panel top into view, allowing for the sticky header, unless it is already in view.
6. **P2 · The research log is not one step from the Research tab.** The pointer card at `:353` links to the top of Overview. On a phone, the stream is below Contents and Priority Gaps. It also mixes in imports and splits the log across one filter chip per activity type, so there is no single "research log" view.
   - **Fix:** group the filter chips as "Imports" and "Research log" (with the activity type as a sub-label), and have the pointer select the log group and scroll to the stream.
7. **P3 · A failed document load reads as "none yet".** `:260` counts documents as 0 when `documentsError` is set, so the All menu and Contents say there are none. Show "unavailable" instead.
8. **P3 · Two counted links don't open their records.** In `PersonHeader.tsx:17`, both "Imports" and "Context" go to the top of Overview, not to the imports in the stream or to Contextual Research. Also:
   - "Compare source-backed candidates" (`:28`) shows even when there are no candidates.
   - The line "The vault pieces most useful to an AI story workflow" (`:30`) now sits above unrelated counts.
9. **P3 · Section counts and dates don't agree.**
   - Relationships takes its last-update date from provisional relatives (`:175`), but its count excludes them, so "0" can sit next to a date.
   - `latestUpdate` falls back to `_creationTime`, so for places it shows when the place record was created, not when it was linked to this person.
   - **Fix:** prefix those dates with "Updated" in the All menu.
10. **P3 · Back behaves differently depending on how you switched section.** Tabs, Contents and the All menu use `replaceState`, but dossier anchors add a history entry. So Back after tapping a tab leaves the person, while Back after a dossier link returns to Overview.
    - **Recommendation:** clicks add an entry (so phone Back returns to Contents) and arrow keys replace.
    - **Smaller point:** `choose()` dispatches a synthetic `hashchange` that other listeners will also receive; a module-level notifier would be cleaner.
11. **P3 · Fieldsets may cause sideways scroll.** The fieldsets at `:250` and `:362` also render in production, and their default minimum width can cause sideways scroll at 320px with long titles or URLs. Add `min-w-0`.
12. **P3 · A small part of kit fix C1 is still open.** The C1 count engine (`lib/collections/facets.ts`) is correct, and it is tested. But in `StoriesCollectionView.tsx:32`, "All stories" still counts every story while the status tabs count within the active workflow and search, so the tabs don't add up to "All". Also, "+ Filter N" counts status, which is no longer in the sheet.
    - The other kit fixes C2–C7 and C9 check out: the six-pixel drag threshold, per-row singular and plural labels, the sheet closing on selection, and the chips. I didn't recheck C7 (phone period guidance) in this pass.

## Taste and pattern fit (my calls as final tastemaker; Scott overrides)

- **The dossier hides a known conflict.** It shows Birth "14 March 1842" with no marker, while a candidate saying "15 March 1842" is unresolved. Put a small conflict or source marker on each fact that links to its candidates. That is the playbook's "from its entry" link, and it is the most valuable evidence cue on this page. The dossier also lacks its Connections slot: the spouse should appear there.
- **Overview is still a mega page:** about 5,000px on a phone.
  - Story Readiness (7 cards) repeats Priority Gaps and the Research checks.
  - Next Actions (5 cards) repeats the dossier and tab actions. Run AI, the context-pack export and Story Writer each appear two or three times.
  - **Fix:** make both compact one-line lists that keep every gate explanation visible. That removes nothing.
- **Icons carry no information.** Every tab uses the same folder icon (`RecordSections.tsx:24`) and every stream row uses the same document icon. Use a glyph per section and per kind.
- **Small fixes:**
  - The stream's "All 8" chip sits right beside the "All 9" menu and means something different; rename it "All entries".
  - "partial" is shown in error red (`:54`); use the annotation colour.
  - "Not attributed" on every import reads like an accusation. Use a capture-origin chip with a tooltip such as "capture runs record no author".
- **At 1024–1279px wide** the dossier stretches full width above the tabs; a two-column layout from the `lg` breakpoint would fit better.
- **The sticky behaviour is sound.** The dossier sticks only when it fits (`FitSticky`), and keeping hidden panels mounted, so unfinished drafts survive, is a real improvement over the original Radix tabs.

## Is the record kit reusable?

Partly. The architecture is sound: server-rendered content, a narrow metadata contract, native fragments, keyboard tabs, an All N menu and the phone Contents list. Before Places, Sources or Queue copy it:

- move the count rules into the kit and drop inferred rows from counts (item 1);
- scroll on activation (item 5);
- share kind names, icons and author labels with `ActivityLedger` (item 4);
- add per-section icons;
- show error states instead of zero (item 7).

Copying the kit now would spread items 1, 4 and 5 to every record page.

**Exact head:** `c187b04c747e8ebe1e8581a6d5220337d3fc5cb9` (compared with `7f1ab4f` and the original route/header at `99980b5`) · **Author:** Codex gpt-6.1-sol · **Reviewer:** Claude Opus 5.5 · **Verdict:** approved with conditions. Fix items 1–5 before the kit is reused or the tranche is claimed. The full check is still pending, and this is not blinded formal scoring; formal round 2 and the all-page scope remain open.
