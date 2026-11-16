# People Explorer at large tree sizes

The website People list uses `peopleExplorerRows`: validated display DTOs, exact
per-person counts, substring search text and an ordering key. Owner/research-state
filters use index prefixes. “All loaded people” counts the visible rows, not an
estimated tree total. After backfill, browsing reads 50 compact rows and one flag;
sparse substring search scans at most 2,000 candidates / 2 MB per call, returning
at most 50 matches. Empty pages mean progress, not completion. Arbitrary substring
search remains linear overall; MCP word search cannot reproduce its semantics.

Ordering is updated-descending / creation-ascending. Load more appends; sorting,
grouping and selection apply to loaded rows. Filters restart traversal. Concurrent
edits can move rows ahead of a cursor; reload for a current traversal. Server
loads refuse an active-tree change. Versioned cursors restart across migration.

## Projection maintenance without blocking source edits

Source mutations use `searchServer`, which captures writes through `searchWrites`.
Discovery runs only when projection-relevant fields change:

- Places: name, fullName, archivedAt, vaultOwnerId.
- Sources: archivedAt, vaultOwnerId.
- Citations: sourceId, archivedAt, vaultOwnerId.
- Events: place.placeId, archivedAt, vaultOwnerId.
- Media: personIds, archivedAt, vaultOwnerId.
- Documents/stories: personId, archivedAt, vaultOwnerId.
- Imports: personId, personFsId, importedAt, archivedAt, vaultOwnerId.
- Persons, personEvents and citationLinks: always.

Timestamp-only FamilySearch upserts do not discover or refresh dependants. Inline
work has one shared operation/byte budget, serializes reads to enforce that byte
budget, and attempts at most 25 people. Small reads use short bounded probes;
large ranges, evidence-heavy people or exhausted budgets defer the remaining work.
The source edit commits with scheduled work instead of rolling back because of
the projection. Dependency jobs page 25 rows / 100 KB at each indexed graph hop;
individual person refreshes run in isolated mutations via scheduled actions.

Rows can be briefly stale after deferred edits. They contain exact last-computed
counts, not approximations. A failed isolated refresh records only the person ID,
time and a fixed diagnostic in `peopleExplorerFailures`; it never rolls back the
source edit. Inspect/repair failures using the commands below. A single person's
extreme evidence fan-out can still exceed a refresh transaction's limits; such a
row remains stale and needs an incremental refresh implementation or investigation,
not alteration/deletion of source data. Owner changes/archive/delete immediately
remove a person's old display row before scheduling, so stale rows cannot stay in
a former owner's tree. Media membership links remain maintained atomically.

The guest migration route `/api/vault/migrate-guest` is wired to the application.
It is permitted in shadow mode and refused in enforce mode pending a signed guest
capability; we do not assume production's mode. Its dedicated central builder
captures only person retags, removes old-owner projections, and schedules a paged
owner repair. It does not refresh every guest person inline. The pre-existing
owner-table retag/storage-accounting mutation itself remains unpaged; this change
removes the added projection fan-out rather than redesigning that legacy flow.

A type-aware test checks Convex files with raw `_generated/server` mutation
builders: inserts and both patch/delete signatures are checked using table/ID
brands, including aliases and unknown dynamic IDs. Projection-source writes must
use `searchServer`. Derived-search and media-size repairs also use that adapter.

## Release, backfill and repair

Merge deploys Convex through Vercel, then builds the frontend. Never manually
deploy production. After the coordinated Vercel deployment succeeds:

```bash
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfill '{}'
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfillStatus '{}'
```

Actions yield after two minutes. Membership batches process <=100 media / 500 KB.
Person backfill reads one legacy ID at a time, refreshes it in an isolated
mutation, then advances a restartable cursor in a separate transaction. Neither
source fields nor source timestamps change. Concurrent normal writes maintain
links and schedule/refresh projections once membership is ready.

On an error, the default stops without advancing that person's cursor. To finish
traversing other people while recording failed IDs:

```bash
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfill '{"skipErrors":true}'
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:failures '{"cursor":null}'
```

The failures query is paginated; pass its continueCursor to inspect later pages.
`traversalComplete:true` means all IDs were visited. Skipped errors keep
`peopleComplete`/`complete` false until repaired, so incomplete projections cannot
replace the legacy read. Repair up to 100 IDs per invocation:

```bash
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:refreshPeople '{"personIds":["<failed person ID>"]}'
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfillStatus '{}'
```

Repair schedules isolated refreshes; wait for them to finish before interpreting
status. Successful repair removes its failure. After traversal, the last repaired
failure releases the completion gate. Confirm `complete:true`, `mediaComplete:true`,
`peopleComplete:true`, `traversalComplete:true`, `hasFailures:false`. Background
failures after initial readiness can leave `complete:true` with `hasFailures:true`;
the completion flag describes migration, not continuous freshness. Inspect and
repair those failures too. Never manually set flags or change source data to force
progress. No new review, merge or production action is implied by these commands.

Until the projection flag is complete, the website calls the **original**
`vault.getPeopleExplorer` implementation with limit/offset slicing, preserving its
full snapshot/filter/count behavior and creation-ascending ties. It retains the
old large-tree limitations until migration completes. It no longer uses the
intermediate per-person fallback, which added excessive index ranges.

Other snapshot pages (Places, Operations, Research, Overview, writing candidates)
and the compatibility People array API remain follow-ups. Their broader exact
metrics/context need separate projections and backfills. Anonymous local timings
are indicative only; neither latency nor migration throughput is a cloud promise.

## Worker diagnostics and legacy People links

Dependency discovery is scheduled through an action boundary. Scheduling commits
an internal pending diagnostic with the job in the same transaction. If the action
is interrupted, that pending job remains visible and replayable. The diagnostics
query includes pending and failed jobs; inspect scheduled-function state before
retrying a pending job that may still be running. A failed discovery
page is recorded separately from person failures, with its exact kind, ID,
owner, stage and cursor. No full source documents or exception text are saved. IDs can include a FamilySearch
person key, and opaque cursors can encode indexed values; treat these internal
operational records as private.
The original page mutation rolls back both child scheduling and diagnostic
removal on failure. Retrying a successful page removes its diagnostic atomically
with child scheduling. Person work remains isolated and reports its own failures.

For a deployment containing these functions, inspect
and retry dependency failures using the exact job object returned by the query:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run peopleExplorer:dependencyFailures '{"cursor":null}'
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run peopleExplorer:retryDependency '{"kind":"owner","id":"<owner from diagnostic>"}'
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run peopleExplorer:backfillStatus '{}'
```

Include `owner`, `stage` and `cursor` if present in the returned job; the example
only shows an owner repair. Pass continueCursor to inspect subsequent diagnostic
pages. Wait for scheduled work to finish; both diagnostic tables must be empty.
A failed dependency page now contributes to `hasFailures` and holds initial
migration completion. Existing completed migrations remain complete and surface
later failures through `hasFailures`. Successful retry/repair can release a held
completion flag once traversal and all recorded failures are resolved. The completion flag records migration, not continuous freshness: a
successful dependency retry can release it while isolated child refreshes remain
queued. A later child failure keeps `complete:true` and sets `hasFailures:true`,
including when the retry released an initial migration hold. Inspect pending jobs
and child person failures before claiming current projections.

Direct refresh fan-out is dispatched in batches of at most 100 IDs, each atomically
scheduling at most 100 isolated person actions in a separate mutation. This avoids one scheduled function per person in
the source transaction, which previously hit Convex's 1,000-job cap. Indexed
dependency discovery still pages 25 rows per hop.

Legacy People `?page=N` links meant “show the first N batches of 50.” They now
progress through the current cursor read until that cumulative target is reached
(or results end), preserving search and research-state filters. They cannot be
mapped to a stored opaque cursor: old URLs never stored one, and concurrent edits
can move rows. All intermediate reads retain the existing page budgets.

No backfill is required. The retry command schedules production repair writes;
run it only when investigating the returned job. No repair command was run during
implementation. The remaining
snapshot-page migrations are not implemented by this worker reliability change.

Operations/readiness extend this same refresh pipeline; see [score maintenance](person-scores-scale.md) for added dependencies, totals, v6 migration and the remaining Audit scope.
