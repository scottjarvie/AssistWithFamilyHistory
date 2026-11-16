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
anchors and places are discovered. Provisional anchor discovery runs only for anchor identity/availability or story membership changes. Extra dependency jobs are batched in groups of 25 through the same recorded-failure system; historical-context owner jobs do not refresh provisional rows. Provisional rows use paged anchor discovery
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
all pages with one fixed cutoff. Totals and the first stale page share one query,
so up to 250 stale reviews need no revision recheck or retry. Larger traversals
check summed shard revisions before/after. Concurrent refreshes restart the count,
with 50 ms then 100 ms backoff. After three unstable attempts, reads return the
last attempt with `exact:false`; Operations shows an Approximate summary notice,
and the JSON API and private handoff packet preserve the flag. Refresh activity
never makes these reads throw a revision-refusal error. This is proportional to stale
checks across multiple bounded transactions, rather than a constant-time count.
No wall-clock scheduler is needed; stale status changes without any source edit.

Operations reads 50 score candidates / 250 KB per query, and scans up to 2,000 candidates across bounded child queries to fill a 50-match user page; Load more retains progress
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
sorts, reversed for ascending sorts, so no unbounded tied bucket is hydrated. Tied people/provisional rows can interleave by creation time.
Handoff `/api/operations/queue?format=handoff` returns one page and `next`,
`continueCursor`, `isDone`, and `summaryScope` (also inside the packet). Follow `next` until exhausted; an empty filtered page
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

## Scheduled refresh resilience and guest adoption

A failed `refreshScheduled` records its failure and transactionally schedules one
retry after 250 ms. The failure row records `retryAttempt` (0 or 1) and
`retryPending`. Success removes the failure; failure on attempt 1 remains available
for `refreshPeople` repair. No unbounded retry loop. Existing failure rows need no
migration. Dependency keys include the provisional-discovery flag; old keys are
recognized only when the stored job has matching provisional semantics.

Guest adoption retains the existing single source-retag mutation and immediately
removes old Explorer display rows. It defers score removals to the existing
25-person owner dependency pages, before scheduling rebuilds. During this short
window guest Operations/readiness candidate reads recheck stored source ownership;
they cannot return adopted people to the former guest vault. Other person archive,
delete and ownership changes retain synchronous score removal. Totals describe
last-computed projections until scheduled work settles. The legacy source-retag
loop itself still has mutation limits; this is not an unlimited-vault migration.

No BUILD bump: the held v6 backfill covers this batch after Vercel deploys. Audit
still uses its full snapshot and needs its own exact maintained gaps and paged
record drilldowns. This fix batch must not be described as the Audit migration.
