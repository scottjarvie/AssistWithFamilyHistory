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
