# Operations and writing scores at vault scale

This change is pending release. Confirm Vercel's coordinated Convex/Next deployment
and the v6 backfill before calling it live. Audit remains on its legacy snapshot;
this is the first, explicitly split Operations + Story Writer batch.

`personScoreRows` is a sibling of `peopleExplorerRows`. The existing
`peopleExplorer.refreshPerson`, central `searchServer` source writers, paged
dependency discovery and failure/repair jobs refresh it. It calls the original
`buildPeopleRows` scorer on the person's indexed graph. It stores compact
Operations inputs, readiness DTOs, timestamp inputs, gap flags and workflow totals;
no raw research notes or evidence bodies are copied. Scores are not approximated.

Dependencies now include source title/type/notes; document type; story type/status;
relationships; research checks and tasks; provisional anchors and historical
context. Historical context with a place uses existing place/person/event hops;
place-less context visits the owner's people. Both old/new owners, person keys,
anchors and places are discovered. Provisional rows use paged anchor discovery
in the same job system and record failed dependency jobs for retry. Person
ownership/archive/delete immediately removes the old score and its totals.

Per-person rows and their weighted totals update in one transaction, with the
existing deterministic 32-shard counter pattern (`table: personScores`). Readers
sum all shards exactly. Normal edits may defer projection work; totals are exact
for the last-computed rows, with the same brief stale window and recorded failures
as Explorer. These are not a transactionally frozen multi-query export. Reload
following concurrent edits; cursors can move, and the client deduplicates IDs.

Stale status is never persisted. Each applicable resolved check with a positive
review timestamp has a small `personScoreReviews` entry. Reads use the
owner/timestamp range `0 < reviewedAt < now - 45 days`, in pages of 250. They sum
all pages with one fixed cutoff for an exact count. This is proportional to stale
checks across multiple bounded transactions, rather than a constant-time count.
No wall-clock scheduler is needed; stale status changes without any source edit.

Operations reads 50 score candidates / 250 KB per query; Load more retains progress
through empty filtered pages. Default-priority facets (required-check flag, type,
workflow, story presence) use indexed prefixes. Other sorts use their ordered
indexes and apply residual combined facets/substring search within bounded pages.
Complete sparse substring search remains linear in score rows. Summaries describe
the **entire vault before filters**, not loaded or matching rows. Exact filtered
search totals are not claimed. The displayed badge says Vault rows.

Readiness uses an owner/person/score index (or workflow prefix), 24 candidates per
page. Its exact old score-descending, person-creation-ascending ordering is
preserved, including ties. Operations preserves primary numeric sort values;
its former locale-name tie-break changes to creation-ascending/ID for descending
sorts, reversed for ascending sorts, so no unbounded tied bucket is hydrated.
Handoff `/api/operations/queue?format=handoff` returns one page and `next`,
`continueCursor`, `isDone`. Follow `next` until exhausted; an empty filtered page
is progress, never end. Handoff packets remain private operational material.

## Release and migration

Vercel deploys Convex on merge. Never manually deploy production. Dry-run only:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex deploy --dry-run --codegen disable
```

After the lead confirms Vercel has deployed:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfill '{}'
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStatus '{}'
```

Repeat until `complete:true` for `vaultCounts:v6`. No resets. The traversal first
reconciles all previous v5 source memberships/counters, then visits one person or
provisional per transaction. It releases membership prerequisites before scores
so concurrent writes behind the score cursor maintain their contributions.
Person score/counter updates and cursor advance commit together; a failure leaves
the cursor intact. Investigate and retry; never skip or manually mark complete.
v4/v5 consumers keep their existing gates during the upgrade. Operations and
writing retain legacy fallback until v6 completes; that fallback still has the
old heavy-vault limits. A `legacy:` cursor restarts on the migrated path.

For background failure inspection/repair use the existing Explorer runbook,
including paginated `dependencyFailures` / `retryDependency` for provisional or
historical-context jobs. An extreme single-person graph can still exceed refresh
limits and leave a recorded failure/stale row. No source edit is rolled back by
that asynchronous worker. This does not certify unbounded single-person evidence
or an unlimited place-less-context range. Audit migration remains required.
