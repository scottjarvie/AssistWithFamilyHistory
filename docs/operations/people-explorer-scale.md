# People Explorer at large tree sizes

The cursor-based website People list reads 50 candidate people per query, in
updated order. The research-state and archive predicates are indexed. It computes
only the displayed fields and exact source, media, document, story and import
counts for those people, through person/target indexes and owned row lookups.
No whole-tree totals appear on this screen: “All loaded people” counts the rows
loaded in the browser. It is not an estimate of the tree size.

Search deliberately retains arbitrary case-insensitive substring matching across
display name, FamilySearch ID, internal person ID, original birth/death date and
the first two resolved place names. Yesterday's MCP word-search index cannot
reproduce that behavior. Search therefore walks candidate pages, continuing even
through empty pages until 50 matches or the end; progress is shown while it works.
This bounds each transaction and preserves older matches but is still linear in
the number of people for rare/absent searches. It is not constant-cost indexed
search. Sorting/grouping and selection continue to apply to loaded rows; Load
more appends, rather than re-fetching every previously loaded person. Equal
updated timestamps use descending creation order (the previous stable in-memory
sort used ascending creation order). Filters start a new cursor traversal.

Only the website `/app/people` uses this new DTO path. The compatibility
`vaultReads.getPeopleExplorer` array API, Places, Operations, Research, Overview,
writing candidates and other snapshot consumers remain follow-ups. Their full
snapshot contracts include additional metrics and context; replacing them
requires maintained exact counters/projections and migrations, not dropping
fields. Per-person pathological fan-out (many thousands of events or large
artifacts on one ancestor) is also not proved bounded by the 50-person page size.

## Release and backfill

Merge deploys Convex through Vercel, then builds the frontend. Do not run a manual
production deployment. Wait for the coordinated Vercel deployment to succeed.
The new reverse `mediaPeople` membership table is maintained in the same mutation
as normal media inserts, patches, replacements and deletes, including upload
finalization and guest migration. It contains IDs only; reads still validate the
source media owner. The migration never changes media, person or artifact data.
Until its complete flag is true, the page retains the prior owner-wide media
read (once per query), so historical media counts stay exact. Large media
collections may still hit the old limit before this backfill completes.

Run the shipped internal migration against the **explicit actual deployment**:

```bash
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfill '{}'
pnpm exec convex run --deployment accomplished-dodo-308 peopleExplorer:backfillStatus '{}'
```

Rerun `backfill` whenever it yields `{complete:false}` or is interrupted, until
`backfillStatus` returns `{complete:true}`. Each transaction processes at most
100 media rows / 500 KB of source rows, idempotently reconciling their membership
links; each action yields after two minutes. Concurrent source writes use the
same reconciliation. Wide individual `personIds` arrays can still exceed a
transaction's operation limit; stop and report that exceptional fan-out to the release owner; do not change
source associations or mark the migration complete manually. Never reset a completed migration
flag or manually write production data. New media requires no second migration.

Only synthetic records were used for local measurements. Anonymous local
backend timings are indicative, especially because its index-range latency can
grow with the whole range. They are not cloud latency promises.
