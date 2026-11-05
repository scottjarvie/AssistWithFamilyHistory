# Opus review · Home trays and collection kit · `2bf2eec`

- **Reviewed head:** `2bf2eec6998b2f2d16f96c5aa2de21dcc7baef07` (diff against `fb80218`)
- **Code author:** Codex gpt-6.1-sol
- **Reviewer / AI tastemaker:** Claude Opus 5.5 (cross-model, read-only)
- **Date:** 2026-11-05
- **Scope:** a code and taste review of a meaningful tranche. This is not formal blinded scoring and not site-wide acceptance. Most page families are still pending.
- **Method:** read the brief, capabilities, rounds, `docs/design/family-folio-system.md` and the Assist design playbook. Read the full diff, all of `components/collections/*`, `FolioTray`, `DashboardView`, `PeopleExplorerView`, `app/app/people/page.tsx`, the shell changes, the harness and `check-collection.mjs`. Traced the People row shape to `convex/vault.ts`. Viewed round-2/ours Home desktop/phone, People desktop/phone/dark, Grid and phone Options, and compared them with `home--desk-trays--*`, `collection--saved-views-table--desktop` and `--phone`. I did not run tests, a browser, a build or verify, as instructed. Scott overrides every call here.

## Verdict

**Approved with one blocking fix (F1).** Home is approved structurally. The collection kit is **conditionally safe to reuse**: fix F1 and F2 first, and adopt the compact record mode in F3 before it reaches the remaining collections.

- I found no removed capability, auth, grant, schema or API change, and no cross-account exposure.
- Home now follows the decided pattern: a desk of labelled folio trays, evidence first (recently touched people, then research gaps), each tray with one count and a named footer destination.
- The kit's saved views, edited state, Discard, reload persistence, Remove, storage-denied fallback, explicit column hiding and selection are implemented honestly. Copy always scopes them to *loaded* records.

## Findings, prioritised

### Blocking

**F1 · P1 · privacy and payload. Moving People to a client component now serialises the full raw People rows into the browser payload.**
`components/vault/PeopleExplorerView.tsx:1` adds `"use client"`, and `app/app/people/page.tsx:91-98` passes `visiblePeople` straight through. Each row comes from `buildPeopleRows` (`convex/vault.ts:971-1009`), which spreads `...person` and adds the full `latestImport` document and more. So the browser now receives, for up to `50 × page` people:

- the whole `persons` document: `notes`, `alternateNames`, `sex`, full birth and death `original` dates and places, `tags`, `qualityScore`, `vaultOwnerId`;
- `latestImport` with `artifactPaths` (server file paths: `capturePackagePath`, `rawDocumentPath`, …), `sourceUrls`, `warnings`, `captureId` and `metadata`;
- `researchChecks`, `operations.nextActions`/`criticalMissing`, `contextCoverage`, `storyWorkflow` and `keyPlaces`.

Before this commit the component was a server component, so only the rendered fields reached HTML.

All of this is the authenticated owner's own data, so it is not a cross-tenant leak. Even so:

- it ships living-person private notes and server-internal paths to the client in a broad discovery list, against the spirit of `NEVER_EXPOSED` in `lib/mcp/catalog.ts:126` ("Living-person private notes in broad discovery", "Internal record tables…");
- it grows the RSC payload linearly with "Load more". `production-bundles.json` does not measure this cost, because it counts JS entry files only.

**Fix (small):** in `page.tsx`, map rows to an explicit `PeopleCollectionRow` DTO on the server: `_id`, `routeId`, `displayName`, `living`, `researchStatus`, birth/death `year` only, `creationProvenance.evidenceStatus`, the five `stats`, and `latestImport?.importedAt`. Type `PeopleExplorerView` against that DTO, not `FunctionReturnType<…getPeopleExplorer>`.

**Kit rule:** add a docblock to `CollectionWorkspace` and to `family-folio-system.md`: "rows must be minimal server-projected DTOs; never pass Convex documents to the client kit". This is the condition for reusing the kit on Sources, Documents, Stories and Imports, where raw text and storage references are richer.

### Correctness (fix before reuse)

**F2 · P2 · the sort direction label is inverted for the default sort.**
The server returns people `updatedAt` descending (`convex/vault.ts`, `getPeopleExplorer`). With "Recently touched" selected and `descending` unset, the UI says **"Ascending ↑"** (`CollectionWorkspace.tsx:78`, phone `:80`) while showing newest first. Pressing it reverses to oldest first and the label says "Descending ↓" (`:59`). This is visible in every People capture.

Fix: give the kit a `defaultOrderLabel` (or a `naturalDirection: "desc"`) and render "Newest first / Oldest first" for the natural order.

**F3 · P2 (taste with a capability cost) · phone records are about 300 px each.**
At 390 px every person is a six-cell labelled grid (`globals.css:283-295`), so 50 loaded people is about 15,000 px of scroll. The baseline was written as "one compact row per person so a phone shows several at once", and the decided phone reference (`collection--saved-views-table--phone.jpg`) shows rows of about 64 px. No data is removed, but quick lookup on a phone regresses badly.

Fix in the kit: a phone record mode with these rows:
1. image slot · name · lifespan·state;
2. the badge / needs-a-source line;
3. one wrapped mono facts line of the *chosen* columns, worded ("12 sources · 2 imports · 3 memories · 2 documents · 1 story output · last import 4 Nov 2026 UTC").

Keep column hiding working on that line. Then the phone "Table" choice can stay a labelled grid for people who pick it explicitly.

### Lower-priority correctness, accessibility and robustness

- **F4 · P3 · edited state depends on column order.** `CollectionWorkspace.tsx:41` compares `columns` arrays by JSON. Hiding then re-showing a column appends it to the end (`:87`), so a view whose columns match its saved set still reads "· edited". Compare sorted sets, or store columns in canonical `availableColumns` order.
- **F5 · P3 · the Group and Sort phone sheets lose focus on close.** Their Close buttons (`:79`, `:80`) remove `open` without focusing the `summary`. Options does this correctly (`:83`), so copy that handler. The desktop Options popover also has no outside-click dismiss.
- **F6 · P3 · missing sort and selection state for assistive tech.** Sortable `<th>`s have no `aria-sort` (`:103`). The "Select all loaded" checkbox has no indeterminate state for a partial selection (`:92`).
- **F7 · P3 · row checkbox target is narrow.** It is 24 × 44 px (`:64`, `w-6`). Widen it to `w-11`.
- **F8 · P3 · saved views keep search text in localStorage after sign-out.** On a shared computer the saved search text (possibly a living relative's name) stays in `localStorage` after sign-out. The dialog copy already says "this browser", so this is disclosed. Consider clearing `awf.collection.*` on sign-out, or naming "search text" explicitly in the dialog.
- **F9 · P3 · Save can throw on a LAN dev URL.** `crypto.randomUUID()` (`:120`) throws in insecure contexts, including the dev harness when opened over a LAN IP over http. Production HTTPS is unaffected. Wrap it with a fallback.
- **F10 · P3 · Home import dates are not UTC.** Home still renders `toLocaleString()` server-side (`DashboardView.tsx:86`), producing "11/4/2026, 9:00:00 AM" in the server's zone with no label. People now uses explicit UTC with `<time>`. Reuse that formatter on Home for consistency.
- **F11 · P3 · smaller row hit area and taller desktop controls.**
  - Baseline People made the whole row a link. Now only the name is. That is acceptable for a table with checkboxes, but list and grid cards should get a full-card hit area that excludes the checkbox.
  - The desktop controls lost the baseline's `md:pointer-fine:h-10`, so every desktop control is now 44 px tall, which the playbook calls a regression.

### AI-side taste decisions (Opus as tastemaker; Scott may override)

**Home** (`components/vault/DashboardView.tsx`)

1. **Fold Stories, Places and Documents into one "Library" tray (T1).** Today these three are identical count-plus-one-sentence trays (`:92-101`), which reads as a generic bento with no focal point and risks "decorative empty panels" (`family-folio-system.md`). The new tray would be a small ruled ledger of three counted rows. Each row keeps its count, label, description and existing link, plus "Choose a person for Story Writer". This brings Home from 7 trays to 5, all retained.
2. **Give the second wide slot to Recent imports, not With your AI (T2).** The wide slot currently holds the prose-only AI tray (`:77`). Recent imports is the real "what changed" evidence. Use Recently touched (wide) + Research gaps on the first row, then Recent imports (wide) + With your AI. This is evidence first, as the playbook orders it.
3. **Put the tray description beside the count (T3).** Each tray header holds only the right-aligned count, leaving a dead band of about 60 px (see the Home desktop capture). The reference sets the one-line description to the left of the count. Apply this in `FolioTray` with an optional `summary` prop.
4. **Show what the gaps are, not who has them again (T4).** In the captures Research gaps repeats the same names and "N critical gaps" lines as Recently touched, which is the "facts block twice" anti-pattern. Keep the required gap count on recent people, since that is a contract field. In the gaps tray, show the first one or two items of `operations.criticalMissing` per person (real summary data), so the tray adds information. The tray count is labelled "open tasks" while the list shows people: honest, but the labels should make that relationship explicit.

**People and the kit**

5. **Shorten desktop rows (T5).** Rows are about 97 px against about 46 px in the reference.
   - Move lifespan into its own **Born–died** column, sortable by birth year. This is the most genealogical sort and is currently missing, so it adds capability.
   - Move **Research state** into its own column, sortable in canonical order.
   - Keep the Living/Deceased badge and "needs a source" inline with the name.
   - Add the 28 px image slot to table rows, as the playbook requires.
   - Right-align numeric columns in tabular mono.
6. **Change the default grouping (T6).** It is currently `groups[0]`, Living/deceased (`CollectionWorkspace.tsx:36`). In an ancestor vault that mostly produces a single "Deceased" header. Default to none, or to Research state in canonical order, via a route-declared `defaultGroup`. Let groups declare their own order too, instead of order of first appearance.
7. **Make List the clean list (T7).** List and Grid are nearly identical today (`:106-113`). The playbook's List is thumbnail, name, sub-line, then date and one key fact on the right. Reuse the F3 compact record.
8. **Tighten the toolbar and move the import action (T8).** Collapse the two 44 px rows into one compact desktop toolbar: search · state · Filter | Group · Sort · direction | Table/List/Grid | Options. Move "Import FamilySearch Capture" / "Start with two people" back to the page header as its primary action. The baseline had it filled and in the header; it is a page action, not a filter.
9. **Group summary chips (T9, optional).** Use real loaded data, for example "2 need a source".
10. **Keep as is (T10):** "All loaded people N" (honest, never invents a total), "· edited" spelled out in text rather than as a dot, the scoping copy saying loaded records only, and the restored rust/annotation meaning.

## Is the kit safe to reuse on the remaining collections?

**Yes, after F1 (the DTO rule) and F2.** I strongly recommend shipping F3/T7 (the compact phone and list record) inside the kit first, so it is not copied five times.

API additions that make reuse safe:
- `defaultGroup`, `defaultSort` and `naturalDirection`;
- per-group ordering;
- an `imageSlot` render prop for table and list rows;
- canonical column-order storage;
- a documented "rows are DTOs" contract.

The storage layer (`useCollectionPreferences`) is sound:
- zod-validated parse;
- an account-scoped key built from `vaultOwnerId`, which equals the Clerk `userId` in user mode;
- an in-memory fallback when storage is denied;
- the cross-tab `storage` event handled;
- `useSyncExternalStore` with an empty server snapshot, so there is no hydration mismatch, only a one-frame flash before a saved non-default view applies.

## No-removal audit (fb80218 → 2bf2eec)

| Surface | Prior item | Now | Verdict |
|---|---|---|---|
| Home header | Title, subtitle, Open Story Studio, Work Research Queue | All kept; Find a person added | kept |
| Home recent people | Name, lifespan, state, critical gaps, link, All people | All kept; name truncation removed | kept |
| Home counts (6) | People, Places, Stories, Imports, Documents, Open tasks, each a link | Each is now a tray count with a named footer link. Open tasks footer goes to `/app/operations`, and the `/app/research` link is kept inline. Documents is honestly labelled as going to per-person counts | kept (destinations kept) |
| Home recent imports | Person, page types, date, merge badge (partial = destructive), link, empty text | All kept; empty-state inline link replaced by the tray footer "Imports workspace" | kept |
| Home map | 4 stations, descriptions, links | Kept as a ruled `dl`; decorative icons dropped | kept |
| Home AI context pack | Paragraph | Moved up into the With your AI tray, plus a settings link | kept |
| Empty Home | Badge, h1, body, first connection, Connect AI, reviewed capture, privacy note, map | All kept; hard-coded colours now semantic | kept |
| People | h1, description, first-start or import CTA | Kept; CTA demoted to an outline button in the form row (T8) | kept, demoted |
| People search | q input and placeholder, all 5 states + All, Filter | Kept; removable filter chips + Clear all added | kept |
| People rows | Link, name, lifespan, state, unsourced note, 5 counts, last import, Living/Deceased | All visible by default. Counts and last import are hideable only by explicit user choice (Show all columns). Date is now explicit UTC instead of local | kept |
| People pagination | Load more people with q/status/page | Unchanged server logic; same label | kept |
| Shell | All destinations, collapse, account region | Kept; `aria-current`, semantic top bar, scrollable nav so the account region stays visible on short screens | kept |

I found nothing that became icon-only, hover-only or clamped, or that moved deeper behind an unlabelled step.

## Blocking findings

1. **F1:** project People rows to a minimal server-side DTO before the client kit, and record the "rows are DTOs" rule for the kit.

These must be fixed before the kit is reused on another collection, but they do not block this tranche's commit: **F2** (the inverted direction label) and **F3** (the compact phone record).
