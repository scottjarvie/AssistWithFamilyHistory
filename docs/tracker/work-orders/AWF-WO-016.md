---
id: AWF-WO-016
title: Build the Family History pages from the Site Guide
execution: proposed
audit: not-audited
cards: AWF-0053, AWF-0054, AWF-0055, AWF-0056, AWF-0057, AWF-0058, AWF-0059, AWF-0051, AWF-0020, AWF-0021
created: 2026-10-06
updated: 2026-10-06
proposed-by: Claude (Opus 5.5) from Scott's site-guide and readiness request
---

## Goal

Give every building block the collection and detail pages the Site Guide
describes, on the family URL map, with the family navigation, dense collection
patterns and phone layouts.

## Why this bundle exists

Scott will work in the site directly. The pages are where he will see, correct
and connect what he and his AI save.

## Current truth

People, Person, Places, Imports, Stories and Queue pages exist under `/app`.
Sources, Questions, Topics, Tree, Lists, Your work, Library and Preferences do
not. No Table/Grid/List views, phone bottom bar, top/side choice or dark mode.

## Sequence

1. Shared collection kit: Table/Grid/List, search, sort, drill-down filter
   families, remembered view (AWF-0021); light and dark themes.
2. Navigation: phone bottom bar, top/side choice in the profile menu (AWF-0051,
   AWF-0020); profile menu sections.
3. Routes to the family URL map with redirects; retire leftovers (AWF-0059).
4. People collection and Person page restructure (Claims & evidence, Timeline,
   Sources & media, Research & notes, Stories, History).
5. Sources collection and Source page (AWF-0054).
6. Questions and Your work (AWF-0053); Topics and Place context (AWF-0055).
7. Tree (AWF-0056).
8. Lists and Preferences (AWF-0057); Library (AWF-0058).
9. Desktop and phone browser checks on synthetic data; release with an
   `/updates` entry.

## Dependencies

- AWF-WO-015 records for the new blocks.
- Media display sizes from AWF-WO-018 for Grid views and viewers.

## Exclusions

- No new sharing or collaboration (AWF-0014/0015).
- No Claude Design prototype is required; build from the Site Guide and the
  Project Philosophy's design character.

## Stop rules

Stop if a page needs a block the Site Guide does not define; record it as a
Card instead.

## Verification

`pnpm verify`; route smoke tests; desktop and 320 px phone checks for each
page; light and dark; live production checks after release.

## Human gates

Scott's approval of this order; Scott's review of the live pages.

## Execution evidence

None yet. Proposed on 2026-10-06; Scott approves scope before it becomes Ready.

## History

- 2026-10-06: Proposed from the Site Guide draft and the MCP, media and page audits.
