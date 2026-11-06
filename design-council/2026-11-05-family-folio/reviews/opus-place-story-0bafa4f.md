# Opus review: Person follow-up fixes (`8782bd4`) and Place/Story records (`0bafa4f`)

**Verdict: approved with conditions. Nothing blocks the tranche, and I found no privacy or capability regressions.**
- **Place:** fit for the decided pattern once four shared-kit fixes (R1–R4) land.
- **Story:** conditional. The record structure is right, but the reader only partly meets the field-guide pattern until it gets an honest whole-draft source block in the margin (T1).
- **Person:** all five required findings from my `c187b04` review are resolved, and so are the seven smaller ones (items 6–12).

This was a read-only review: I edited nothing, ran no browser or tests, started no agents, and wrote to no backend. It is not a formal scored round and it clears no other pages.

## 1. Privacy and preservation

**Routes.** Both server routes (`app/app/places/[placeId]/page.tsx` and `app/app/stories/[storyId]/page.tsx`) are unchanged apart from presentation, compared with `99980b5`:
- the owner lookup, the authorized `vaultReads` action and its arguments;
- the "not configured", runtime-error and not-found paths.

`PlaceWorkspaceView` and `StoryReviewView` have no `"use client"`, so the full bundle stays on the server.

**What reaches the browser is minimal:**
- `StoryStatusActions` now gets only `canPublish` and `summary`. The `blockers` field I removed from its props was never read; the toast reads blockers from the fresh server preview.
- Review history passes an explicit list of 14 displayed fields.
- The editor and the assignment form get only named fields.
- `EvidenceStream` gets display metadata plus server-rendered content.
- `story.promptUsed` and the full person record never reach client code.

**Synthetic preview guards.** Each one is both guarded in code and disabled in the UI:
- `ContextReportForm` and `StoryEditorForm` return early and disable Save.
- The assignment form and status actions sit inside disabled fieldsets.
- The harness returns not-found outside development, on Vercel and in CI.

**Field-by-field check against the original.** Every field and action survives, and several presentation caps are gone:
- **Place:**
  - name, type, back link, all three counts, the three "How to use" lines;
  - people with the route-ID fallback and birth/death years;
  - every context-intake field, with the private / unreviewed / AI-blocked defaults kept;
  - events, sources, media, the full research log;
  - context text, which is no longer cut to 4 lines.
- **Story:**
  - status, title, person and lifespan, type;
  - publish gate (score, blockers, warnings, every gate);
  - provenance counts and all recommended actions (previously capped at 4);
  - attached versus available research packs, with the "background context only" warning;
  - reviewer assignment and second approval, publish warnings;
  - every unresolved readiness check (previously capped at 6), context coverage with missing places;
  - grounding evidence, the life modules, full historical reports (previously cut to 4 lines) with claims, confidence and source refs;
  - the full review history with snapshots and all event kinds, including draft edits;
  - the public link and the human-confirmed publish.
- **Wording correction kept:** the old blanket "Publishing is allowed" line now defers to the actual gate.

## 2. Earlier Person findings (`opus-record-c187b04.md`)

| # | Status |
|---|---|
| 1 Research count inflated by inferred checks | **Resolved.** Counts tasks plus context items; "checks need attention" is a separate detail line. |
| 2 Timeline dots | **Resolved** (`bg-annotation`). |
| 3 Dark form controls | **Resolved** in all six named places. One remaining case: `WorkspaceStateCard` (B2 below). |
| 4 Shared kind names and author labels | **Resolved** (`lib/activity/presentation.ts`): "Your AI" and "Family History AI" are kept apart, the model hint stays marked unverified, and the origin tooltip is restored. |
| 5 Scroll to the section on activation | **Resolved vertically.** The tab strip itself does not scroll sideways yet (R2). |
| 6–12 | **Resolved:** research-log grouping, "Unavailable" instead of 0, real link targets, "Updated" dates, push vs replace history, `min-w-0`, and the Stories "All" count. |
| Taste items | **Resolved:** conflict and source-candidate markers on facts, Connections slot, compact readiness and next-action lists, one glyph per section, "All entries", "Capture" chip, two columns from the `lg` breakpoint. |

I checked these in the code. I did not re-open the Person `record-stream` images.

The earlier constraints from my `7f1ab4f` review still apply. One of them reappears here as R4 (singular and plural labels).

## 3. Required fixes before the record kit is reused

These are not blocking bugs. All of them are in the shared kit or follow the playbook's rule that counts must be truthful.

- **R1 · Tab counts must be counts of real records** (the same problem as Person item 1).
  - **Story "Review 11"** is `publishReadiness.checks.length`, a fixed number of computed gates that includes the 3 that passed. Count blockers plus warnings ("Review 8") with the detail line "5 blockers · 3 warnings · 3 passed".
  - **"Edit 1"** isn't a count; let the type accept no count there.
  - **"Life 6"** adds up four different kinds. Spell them out in the detail line ("1 relationship · 2 events · 2 places · 1 memory").
  - **Server caps:** `buildStoryBundle` returns at most 8 evidence groups, 3 citations per group, 8 events, 8 places and 6 media. When a list reaches its cap, the detail line must say "First 8 returned" so 8 doesn't read as the total.
- **R2 · On phones, the active tab is off-screen** (`RecordSections.tsx:44`). The `story-history` phone capture shows History selected while the strip still shows Overview, Edit and Review. On activation, call `scrollIntoView({inline:"nearest", block:"nearest"})` on the active tab.
- **R3 · Tabs are cut off at 1440px desktop.** Both Place and Story show a partial glyph or "His" before "All 7", which is a §7 anti-pattern. Make seven tabs fit at `xl` and up (tighter padding, glyph hidden between `lg` and `xl`) and add a fade at the scroll edge for narrower widths.
- **R4 · "1 earlier entries".** Fix the plural in `EvidenceStream.tsx:31` and `StoryReviewHistoryPanel.tsx:137`.

## 4. Smaller bugs (non-blocking)

- **B1 · The Place research pointer reads "Open all 0 place research entries"** next to the empty state. Hide the link when the count is 0.
- **B2 · `WorkspaceStateCard` still uses `bg-white/85` and stone colours with the light `text-card-foreground`.** In dark mode the Story history empty state, and the route-level unavailable and error cards, would be unreadable. Dark mode currently only switches on in the preview harness, so fix this before dark mode ships.
- **B3 · `recordSectionFromFragment` hard-codes Person's `record-context` and `record-source-facts` aliases.** Let each page pass its own aliases into the kit.

## 5. Taste calls (final AI tastemaker; Scott overrides)

- **T1 · Story reader and margin sources: the decision.**
  - The no-fabrication call is correct. Each story stores citation IDs for the draft as a whole, not per paragraph, so per-paragraph sidenotes would be invented.
  - The provenance card works: the dossier sits beside the reading column on desktop, and "Recorded model · not verified" plus "no version number recorded" is the right honesty.
  - **What's missing is the margin source treatment.** Today it is only a footer link to the Evidence tab, which lists the person's sources, not necessarily the draft's.
  - **The honest version:**
    - Limit the reading column to about 68 characters per line.
    - At `xl` and up, add a right-hand rail headed **"Recorded for this draft (whole draft, not per paragraph)"**. It shows the number of recorded citations (`citationIds.length`), the number of recorded source facts (`sourceFactIds.length`), and the attached research packs by title (already in the bundle).
    - Below that, a separate quieter line, **"Other sources linked to Eleanor · 8"**, links to the Evidence tab.
    - On phones, the same block becomes one disclosure, "Draft sources · N", under the article.
    - In the Evidence tab, mark which returned source sets contain one of the draft's recorded citations.
  - **Who wrote this:** an AI-written story should read "AI-generated · which AI not recorded", as on Person.
  - **Verdict:** the reader meets the decided pattern once this block exists. Until then, provenance passes and margin sources are partial.
- **T2 · Story phone dossier is about 550px tall before the reading starts.** Put the provenance facts two across and the three status actions in one compact row, so the story starts near the first screen.
- **T3 · Story "Review" panel:**
  - Sort the gates blockers first, then warnings, then passed.
  - Show each publish warning's status on its matching gate row instead of repeating three rows in a separate panel.
  - Keep the warnings panel only for warnings that have no matching gate.
  - Spell out raw codes ("needs_review · required", "IN_PROGRESS").
  - Use tinted left borders instead of fully tinted cards.
- **T4 · Story "Review activity" uses fully tinted cards with all-rust text**, unlike the evidence stream on Place and Person. Give it the stream's row style: kind glyph, date, actor chip, snapshot disclosure.
- **T5 · Place Overview opens with the static "How to use this place" text.** Put evidence first: move it under the dossier or below the stream. When a stream has only one group, hide the redundant "All entries 7 / Research log 7" chips.
- **T6 · Story editor on phones** stacks the full preview under the full text area. Hide the preview by default when the column is narrow; the toggle stays.
- **Keep as is:**
  - Place dossier with the map illustration and connections;
  - the Contents list on phones;
  - Edit kept separate from reading, with drafts surviving tab changes;
  - "available, not attached" research-pack honesty;
  - dark Review, Story and Place Research controls, which are readable in the captures.

## 6. Constraints that need backend work

These are outside this tranche:
- per-paragraph citation positions;
- the story's author identity and AI connection name;
- a story version number;
- resolving `citationIds` to source titles beyond the capped evidence list;
- the existing story-bundle caps.

`publishSafety`'s citation count takes the larger of the story's own citations and the person's evidence citations, which mixes the two. That predates this tranche.

## Reuse decision

**Conditionally approved.**
- **Place:** may be reused as the record template once R1–R4 land in the kit; nothing Place-specific is required.
- **Story:** the record structure (dossier, counted tabs, Edit/Review/History) may be reused after R1–R4. The **reader family is not accepted** until T1's whole-draft source block is built.
- **Before any further record page copies the kit:** fix R1–R4 and B3.

**Screenshots inspected:**
- Place record desktop and phone; Place research dark phone.
- Story record desktop, phone and dark phone; Story review dark desktop and phone; Story edit phone; Story context desktop; Story history phone.

**Receipt:** exact head `0bafa4f8873bddf2663c6ccbc37d84b8efa4bae1`, covering `8782bd4` and `0bafa4f`, compared with the original route JSX at `99980b5`. **Author:** Codex gpt-6.1-sol. **Reviewer:** Claude Opus 5.5 (read-only). **Verdict:** approved with conditions, no blockers. R1–R4 and B3 must land before the kit is reused, and T1 before the Story reader is accepted. No site-wide acceptance and no formal round score.
