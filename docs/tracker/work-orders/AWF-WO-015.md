---
id: AWF-WO-015
title: Settle the building blocks before real family data goes in
execution: proposed
audit: not-audited
cards: AWF-0052, AWF-0053, AWF-0054, AWF-0055, AWF-0057
created: 2026-10-06
updated: 2026-10-06
proposed-by: Claude (Opus 5.5) from Scott's site-guide and readiness request
---

## Goal

Turn Scott's answers to the Site Guide's nine decisions into the durable record
model, so the data he enters next lands in the shape the site will keep.

## Why this bundle exists

Every later page, AI tool and media surface depends on what the blocks are.
Doing the model first, before real data, avoids migrating a family's research
later.

## Current truth

Scott answered the nine decisions on 6 October 2026 (AWF-0052, Site Guide
Decisions). The model this order builds: several trees per account (a tree id
on every tree-scoped record, plus a tree switcher; existing rows migrate into
the account's first, default tree), Projects that hold Questions, Claims (not
Facts) with Proposed/Accepted/Disputed/Rejected states, Files stored once inside
Sources and linked by Connections (face tags, portrait crops), family-memory
Sources, and Topics (account level unless Scott decides otherwise).

The schema is person-centred and FamilySearch-shaped. Questions, Notes, Research,
Topics, Lists, Preferences and generic Connections do not exist; Facts exist as
`sourceFacts` with partial states; media and sources are separate.

## Sequence

1. Record Scott's decisions (AWF-0052) in the Site Guide (done 6 October 2026)
   and note them in the Project Philosophy where it states the old model.
2. Design the schema for Tree (workspace), Project, Question (with Plan items and log), Note, Research,
   Claim states, Source ↔ File ↔ Citation, Topic, Connection, List, Library flag
   and Preferences, reusing existing tables where they fit.
3. Write migrations from research tasks/checks/log, context items/packs, and
   media rows, moving everything into the account's default tree; dry-run on a
   synthetic vault.
4. Implement the records and minimal read/write functions with owner scoping,
   attribution and activity, behind tests.
5. Update the MCP catalogue only where existing tools write records whose shape
   changed (new tools belong to AWF-WO-017).
6. Release, migrate production, and record the receipts.

## Dependencies

- AWF-0052 answered by Scott (done 6 October 2026).
- AWF-0027 (fact adjudication) informs Claim states.

## Exclusions

- No new pages beyond what is needed to verify the records (pages are
  AWF-WO-016).
- No sharing, collaboration or publication changes.
- No change to MCP permissions (AWF-WO-017).

## Stop rules

Stop and ask if a decision's answer implies a different block list than the Site
Guide, or a migration cannot preserve existing history.

## Verification

Schema and migration tests; owner-isolation tests; `pnpm verify`; migration
dry-run report; production migration receipt with zero lost rows.

## Human gates

Scott's approval of this order (AWF-0052 is answered).

## Execution evidence

None yet. Proposed on 2026-10-06; Scott approves scope before it becomes Ready.

## History

- 2026-10-06: Proposed from the Site Guide draft and the MCP, media and page audits.
- 2026-10-06: Scope updated for Scott's answers: trees, Projects, Claims, connected files.
