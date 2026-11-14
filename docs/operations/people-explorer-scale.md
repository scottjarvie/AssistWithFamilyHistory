# People Explorer at large tree sizes

The website People list uses maintained `peopleExplorerRows`: only display DTOs,
exact per-person counts, exact search text and an ordering key. Research-state
and owner filters use index prefixes. No global tree totals are displayed:
“All loaded people” counts the visible rows, not an estimated tree size.

After backfill, browsing reads at most 50 compact rows and one readiness flag;
no event/citation/media lookups. Searching preserves case-insensitive arbitrary
substring matching over name, IDs, original birth/death dates and first two
resolved place names. The MCP word index cannot reproduce this contract. It
starts with 50 compact candidates, then scans up to 2,000 per call through sparse
matches. Each call returns at most 50 matches and advances only through processed
candidates. Empty pages are progress, not end-of-results. This remains linear
for absent/rare substrings, but a 100k tree takes at most 52 bounded calls, with
no repeated event/citation joins. It is not constant-cost indexed text search.

Ordering preserves updated-descending, creation-ascending ties. Load more appends
50 rows; grouping, sorting and selection apply to loaded rows. Changing filters
restarts traversal. Editing records during traversal may move them before the
cursor; reload for a current complete ordering. The server refuses further loads
if the active tree changed. Versioned cursors restart safely across migration.

## Exact projection maintenance

`searchServer` wraps central mutations, records old/new source rows through
`searchWrites`, discovers affected people and refreshes each once, atomically at
transaction end. Dependencies cover persons, events/personEvents, places,
sources/citations/citationLinks, media, documents, stories and importRuns.
Media array membership uses `mediaPeople`; source rows are always owner checked.
Document and FamilySearch-import reads now have owner-prefixed indexes.

The projection contains no raw notes, artifacts, URLs or unused workspace data.
Counts are computed exactly from the relevant source rows during a refresh;
none are approximated or dropped. Source mutations and projections commit or
roll back together. Exceptionally large per-person fan-out or a shared-source /
place change affecting thousands of people may exceed write-time transaction
limits and roll back. Paginated asynchronous invalidation/rebuild for such
mass edits remains follow-up; readers never accept a partially refreshed commit.
The former source mutation could succeed where this synchronous refresh fails,
so this is a material write-time limitation, not a claimed fix for all bulk edits.

Only website `/app/people` uses this DTO path. The compatibility array API
`vaultReads.getPeopleExplorer`, Places, Operations, Research, Overview and writing
candidates remain follow-ups: their broader metric/context contracts need their
own exact counters/projections and migrations.

## Release and backfill

Merge deploys Convex through Vercel, then builds the frontend. Never manually
deploy production Convex. Wait for the coordinated Vercel deploy to succeed.
Run the shipped internal migration on the **explicit actual deployment**:

```bash
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfill '{}'
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfillStatus '{}'
```

Rerun `backfill` on `{complete:false}` or interruption until status returns
`{complete:true, mediaComplete:true, peopleComplete:true}`. The action yields
after two minutes. It first reconciles at most 100 media records / 500 KB per
transaction, then refreshes five legacy people / 100 KB of person records per
transaction. Related-row reads add to that budget. All stages are idempotent and
restartable. If a single person's or media record's fan-out exceeds transaction
limits, stop and report it; do not change source records or completion flags.

Central writes maintain media links from deployment onward, and person rows
once membership is complete. Thus concurrent edits cannot be missed by the
person backfill. Neither source timestamps nor source data are modified.
Until both flags are complete, reads use the previous scoped fallback, including
an owner-wide media read until membership is complete. Scale readiness is
**pending backfill**; very large vaults can still fail on that fallback.

Local synthetic measurements are indicative only. The anonymous backend's
index latency can grow with range size, unlike cloud behavior; neither query
latency nor historical migration throughput is a production promise.
