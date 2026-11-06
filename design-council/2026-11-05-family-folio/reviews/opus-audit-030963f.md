# Opus review: Audit instruments, plus the follow-up to the Operations/Queue fixes, at `030963f`

**Verdict: conditionally approved.** Privacy, preservation and the new data path are approved. Every required fix from my last review is resolved. Audit should not become the reusable stats template until three small fixes land (A-R1 to A-R3 below).

**Receipt**
- **Reviewed head:** `030963f4d1b9bc098846a0ae5553fe1f05fda426` on `design/assistwithfamilyhistory-council-2026-11-05`. The tree was clean.
- **Scope:** `27bee8e..030963f`, which is `803363f` (notes), `b42c5cc` (fixes from my last review) and `030963f` (Audit).
- **Author:** Sol (Codex gpt-6.1-sol, high), commits by Scott Jarvie. **Reviewer:** Claude Opus 5.5, read-only.
- **What I did and didn't do:** I edited, ran, started and delegated nothing. Test results are Sol's reports, which I did not rerun: 57/57 full checks on Node 22, 6 Audit unit tests, plus the intercepted browser checks. They cover invented data only and are not backend acceptance.
- **What this is not:** not a formal round 2, not an independent audit, and not all-page acceptance. AWF-0071 stays "doing".

## 1. Prior required findings

| # | Status | What the code and screenshots show |
|---|---|---|
| **QN1** extra history entry per open/close | **Resolved** | A sheet opened from the list records that in the history entry and closes with `history.back()`. A direct `?item=` link closes by replacing the URL (`lib/queue/navigation.ts`). The filter sheet can't open while the item sheet is open, so a filter change can't be lost on Back. |
| **QN2** Previous/Next order | **Resolved** | The buttons now follow the rows in the order shown, via `onOrderChange`. Close focuses the row you were last viewing, not the first one you opened. |
| **QN3** loading flash after a command | **Resolved** | The detail reloads quietly. Activity is merged by ID and sorted when drawn (`QueueWorkspace.tsx:459`), so order is correct. |
| **QN4** stale focus target | **Resolved** | It is cleared on close and set to the new row when a directive is created. |
| **QN5** leftovers after a conflict reload | **Resolved** | An action form whose command is no longer allowed now closes, and the draft is kept. Reloading a row fetches only that item, so later loaded pages stay. |
| **O-R1** 1440/1280 fit | **Resolved** | In `operations-coverage-1280`, Next action sits beside Entry, all nine columns fit and Evidence is stacked. The acceptance check covers 1440 and 1280 for Operations, People and Research. |
| **O-R2** sort treated as a filter | **Resolved** | `hasActiveFilters` no longer counts sort (`OperationsCollection.tsx:26`). The defaults read "Default: missing critical" / "Default: descending". |
| **O-R3** one facet at a time | **Resolved** | The shared sheet now has one Apply for several staged choices (`CollectionFilters.tsx:52-67`). The acceptance check confirms one GET, and that Cancel keeps typed search. |
| **O-R4** Table-mode details | **Resolved by receipt** | Sol reports the details are actually hidden in Table mode. I have no contrary evidence. |
| **K1** People/Research fit | **Resolved** | `people-kit-fit-1280` fits without a sideways scroll. |
| **K2** one body per group | **Resolved** | Each group has its own `<tbody>` under the single table head. |
| **K3** numbers kept with their nouns | **Resolved in Operations** ("1 source", "1 story", "2 stale checks"). **It regressed in Audit; see A-R1.** |
| **Handoff export `storyWorkflow`** | **Resolved** | The page and the export now share one parser (`lib/operations/query.ts`), which takes the first of any repeated key. Export still covers all matching rows. |

## 2. Preservation and privacy by surface

**Audit route: approved.** Nothing from the original page is missing:
- the six totals (the "12/18" and "5 (1 public)" figures are split into separate instruments);
- the five gaps and five workflow numbers, each with its original `/app/operations?storyWorkflow=` link (now "Work stage");
- the Operations ("Work Queue") and Places ("Add context") actions;
- all eight priority people, with name, link, workflow, sources, context and % ready;
- the empty-priority text and the unavailable/runtime error cards.

I compared this against `audit-original-reconstructed`, keeping in mind it is a reconstruction, not a historical capture.

**Data path: approved.** UI → `GET /api/audit/records` → `vaultReads.getVaultAudit` with optional `metric`/`offset` → `buildAuditRecordPage`:
- **Count/list parity:** the counts and the lists come from the same snapshot and the same `peopleRows`, with identical predicates. `peopleRows` has one row per `snapshot.people`, and `placesWithoutContext` uses the same rule. A unit test drives the real query for all 16 metrics.
- **Owner check:** a request with a metric always requires the signed-in identity to match the owner, even in shadow mode (`vaultReads.ts:194-200`). Calls without a metric keep `authorizedOwner` exactly as before, and the test covers both modes. The route also uses `requireAuthentication:true`.
- **What reaches the browser:** six fields per row. The route returns only `result.records`, so `recentContext` never leaves the server. Responses are `private, no-store`, and invalid input gets a 400 before any vault read. Injected `PRIVATE_` fields never appear in tests.
- **Links:** sources and citations link only through owned citation links, events, relationships or facts. Anything unlinked is listed with "No linked record destination". All section anchors exist: People has sources and research; Places has sources and context.
- **Paging:** 50 rows per page, with the total and next offset kept.
- **Registration and receipts:** the route is protected and in the inventory and manifest, and the action hash receipt is updated.
- **Nothing else changed:** no diff to `convex/schema.ts`, `lib/mcp` or `lib/auth`, and no write, provider or binding change.

**Saved views: approved.** They store only the metric, search text and presentation, under the owner's own browser key. The existing disclosure about retained search text is shown.

**Queue and Operations follow-ups: approved.** Command payloads are unchanged.

## 3. Findings

### Required before Audit is the stats template (small)

**A-R1 · Numbers split from their nouns, and wrong plurals (repeats K3).**
- **Where:** `lib/audit/records.ts`, `personRows` (around line 46) builds a single run-on string: `${sources} sources · ${count} context · ${stories} stories`.
- **What you see:** "1 stories" in every people drawer. On phones the text breaks between number and noun: "0 sources · 1 / context · 1 stories" (`audit-people-drawer--mobile-light`, Arthur Bell).
- **Fix:** pluralise properly ("1 story", "1 source"), and keep each fact unbroken, either as structured facts or `nowrap` spans with breaks only at "·". Also tidy raw values such as story `status` and source `type` ("census"). Priority rows already wrap correctly.

**A-R2 · The drawer is too heavy for a "behind the number" panel (taste, my call).**
- **What you see:** `audit-people-drawer` shows about 300 CSS px of collection chrome before the first record (views row, search, Group, Sort, order, Table/List/Grid, Options, Select all). Each row is about 117 px tall, and every row repeats "Person" and "Open {name}".
- **Reference:** the decided drawer has a one-sentence headline ("9 of 14 plants have no photo"), chips, compact rows, then Open as a view / Save view.
- **Fix, drawer only:**
  - Use compact density.
  - Hide the Kind label/column when every row has the same kind.
  - Write the headline as a sentence ("4 of 10 people have no source").
  - Fold Group, Sort and view into the existing Options menu so they stay reachable.
  - When the total is 0, show only the honest empty message plus Open as a view.
- The full view keeps the whole collection kit. Nothing is removed.

**A-R3 · Not yet an instrument panel.**
- **What you see:** compared with `stats--instrument-panel--desktop`, the gaps are a plain list with no denominators or bars. On desktop there is about 200px of empty space under Coverage gaps. The workflow bars are the only drawn marks.
- **Fix:**
  - Give the people gaps "4 / 10 people" with hairline bars; the denominator is the existing People metric.
  - Add a small records-by-type bar list from the six existing totals.
  - Every drawn number must keep its drawer. Don't add a "places total" unless it is a 17th metric with its own matching list, because "no number without its records" holds.
- On phones, keep each workflow number and its arrow together: in "Needs genealogy evidence" the arrow wraps under the 2.
- No trend and no You/AI split. "Trend: not dated" is correct as it stands.

### Should fix

1. **Saved-view state leaks between metrics.** All drawers share one `preferenceKey` (`AuditWorkspace.tsx:82`).
   - **Trigger:** save a view in the People drawer, then open Sources. The People view shows as "· edited", and Discard sends you to the People full view.
   - **Fix:** keep the active view per metric, or show only the current metric's views in the drawer tabs.
2. **Try again loads the wrong page after a failed Refresh** (`AuditWorkspace.tsx:81`).
   - **Trigger:** 120 matches loaded, Refresh fails, Try again calls `load(nextOffset)`. It appends page 2 and leaves the stale page 1.
   - **Fix:** remember the last attempted offset and replace flag, and retry those.
3. **Copy mismatch:** the empty Manage views text says "Use “+ New view”", but the button now reads "Save view" (`CollectionWorkspace.tsx:115`).
4. **Duplicate labels:** the drawer shows "Title, A–Z" in the select and "Title A–Z" on the toggle.
5. **Repeated heading:** the error state says "Matching records unavailable" twice.
6. **Unclear failure in local no-auth mode:** every drawer will show as unavailable there, because the new read is strictly for the matched owner. That is correct, but the message should say signing in is required.
7. **Linked source never captured:** every source in the fixture is unlinked, so no capture shows a linked source destination. Unit tests do cover it; add one linked source to the fixture.

### Minor
- In the Operations Entry cell, the anchor ID breaks mid-word ("synthetic-ele / anor"). That comes from the fixture.

## 4. Taste: final AI tastemaker (Scott overrides)

**Keep:**
- the calm hairline grid and modest serif heading;
- "Current vault snapshot · Trend: not dated";
- the named "Work stage" links;
- the priority list kept as the top eight, not presented as the records behind other numbers;
- the parity-drift notice;
- the full-height phone sheet;
- dark mode, which reads well.

**Change:** density. Today's page is closer to a tidy ledger than the decided instrument panel. A-R2 and A-R3 close that gap without removing anything.

**Operations and Queue now meet the bar:**
- The 1280 table is readable with Next action up front.
- The phone Queue header is one row, and the answer comes first.

## 5. Screenshots inspected

- **Audit instruments:** `audit-instruments` desktop and phone, `audit-people-drawer` desktop, phone and dark phone, `audit-save-view` desktop, `audit-sources-view` desktop, `audit-zero-drawer` phone, `audit-error-drawer` desktop, and `operations-coverage-1280`.
- **Original:** `audit-original-reconstructed` desktop.
- **`review-refinements`:** `people-kit-fit-1280` and `queue-answer-sheet-viewport` phone.
- **References:** `stats--instrument-panel` desktop and phone.

I did not count older gallery images as the current build.

## 6. Next long route

1. **Now:** fold A-R1 to A-R3 and the should-fixes into the next lead pass.
2. **Then, in order:**
   - **Settings: AI access matrix (§3.8).** It has the highest safety stakes. Keep revoke/narrow/end-date at least as clear as today, and don't invent Pause or Import.
   - **Settings: your data** (§3.9).
   - **Reader** pages (§3.10).
   - **Public** story pages, with a privacy check for living people.
   - **Site-specific pages** (capture/import, Story Writer), which need the current page plus three takes before Scott picks.

The all-page goal is not complete.

**Overall: conditional approval.** Required: A-R1, A-R2, A-R3. Everything else is should-fix or minor.
