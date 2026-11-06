---
id: AWF-WO-019
title: Complete the shared Assist pages for Family History
execution: proposed
audit: not-audited
cards: AWF-0060, AWF-0061, AWF-0016, AWF-0017, AWF-0010, AWF-0018, AWF-0019
created: 2026-10-06
updated: 2026-10-06
proposed-by: Claude (Opus 5.5) from Scott's site-guide and readiness request
---

## Goal

Bring Family History's shared family pages up to the Core: the Queue lifecycle
and AI Suggestions, Home and Ideas and Usage, Your stats, Admin, export and
delete, the Support Desk link and the family strip.

## Why this bundle exists

These are family Tier A pages Scott expects on every Assist site; most are
already carded but none are scheduled.

## Current truth

Queue on retired vocabulary; no AI Suggestions, Ideas and Usage, `/me`, `/admin`,
`/settings/data`, `/delete-account`, support source key or family strip; Coming
soon labels remain.

## Sequence

1. Queue lifecycle retrofit and AI Suggestions (AWF-0060) — can start before
   AWF-0052 is answered.
2. Home and Ideas and Usage; remove Coming soon (AWF-0061).
3. Support Desk source key and family strip (AWF-0018, AWF-0019).
4. `/me` with storage and AI activity (AWF-0016).
5. `/admin` Overview, Accounts, AI activity, Storage, Public content (AWF-0017).
6. Export and delete, including media purge (AWF-0010, with AWF-0066).

## Dependencies

- Storage counters from AWF-0065 for `/me` and `/admin` storage.
- Media deletion from AWF-0066 for account deletion.

## Exclusions

- No billing or paid Pro. Admin may grant Pro only if a Pro-gated feature exists.

## Stop rules

Stop if export or deletion cannot be proved complete across Convex and B2.

## Verification

`pnpm verify`; live checks of each page desktop and phone; deletion proved by
re-query on a marked account.

## Human gates

Scott's approval of this order.

## Execution evidence

None yet. Proposed on 2026-10-06; Scott approves scope before it becomes Ready.

## History

- 2026-10-06: Proposed from the Site Guide draft and the MCP, media and page audits.
