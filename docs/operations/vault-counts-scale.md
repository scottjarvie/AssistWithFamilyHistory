# Exact vault counters and bounded Research reads

This is an incomplete first batch of the remaining-page scale work. No release
or production backfill is claimed here. Dashboard, Places, Operations, Audit,
Stories, story readiness, provisional-relative pages and the compatibility People
array still have their original loaders. In particular, the home page still
loads the whole vault and can fail at realistic evidence-heavy growth.

## Counter contract

`convex/vaultCounts.ts` lists 24 source record types: all 20 snapshot tables,
plus source contents, record personas, topics and connections. It deliberately
excludes credentials, operational receipts, derived tables and Queue (which has
its own counter system). A count means an exact `by_owner` match with
`archivedAt === undefined`. An archive timestamp of zero is archived. Rows
without a stored owner retain the original snapshot's exclusion; this migration
does not retag legacy data or broaden access.

Every source writer must use `convex/searchServer.ts`, including guest retagging
and Relationships. Its database adapter updates `vaultCounts` and
`vaultCountMembers` in the same transaction as the source write. The member
stores its last counted owner and contribution keys, never source contents.
Owner moves, archives, restores, replacements and deletions remove the old
contribution and add the new one. Status facets exist for tasks and research
logs; logs also have activity and author facets; provisional relatives have
merge-state facets. Future page migrations can reuse these exact counters.

Backfill calls the same reconciler on bounded pages (100 source documents /
500 KB per transaction, plus ledger/counter operations). A normal edit to an
unvisited legacy row counts its new state once. A later backfill sees that
membership and does nothing. A deletion cannot be resurrected by a stale page:
source traversal, reconciliation and cursor advancement are one mutation.
Convex conflict retries serialize concurrent edits. Completed steps are durable;
interrupted actions resume the next committed page. New inserts after a cursor
passes are already counted by the normal writer. No manual reset is supported.

The global `vaultCounts:v1` flag becomes complete only after all source tables
have been traversed. Consumers **must check it** before trusting totals. Research
keeps the original snapshot path until completion. No count is estimated from a
page, a newest-N sample, or a table-size cap. The write cost includes a membership
lookup and up to two owner counters per source change. Large existing bulk
mutations need separate write-cost assessment before claiming unlimited scale.

## Research transport

`researchPages:tasks` uses owner/active/time or owner/active/status/time indexes;
`researchPages:log` uses owner/active/time. Each transaction returns at most 50
records and requests at most 250 KB of source rows, then hydrates distinct owned,
active people referenced by those records. Unrelated sources/citations/media are
never read. A byte-split or empty page is not end-of-results; follow its cursor
until `isDone`. Global facet totals come from the counters, independently of the
current task status. A negative numeric `updatedAt` index key preserves timestamp
precision, newest-first ordering and creation-ascending ties, without taking a
window before sorting. Backfill populates that key without changing timestamps.

The existing website action `vaultReads:getResearchOverview` traverses these
pages and retains its complete DTO. This preserves arbitrary substring search
(including person names), all task facet numbers and the complete activity
ledger's author/kind/date/month counts. **The browser is not yet a cursor
consumer.** End-to-end cost, action reply size and client rendering still grow
with task/log history, and independently committed query pages do not provide
one frozen snapshot during concurrent edits. This is transport groundwork,
not completion of the requested Research UI migration or an unlimited action
size/latency guarantee. The old internal `vault:getResearchOverview` remains the
legacy snapshot implementation, used before the completion gate and for parity.

To finish Research, provide a paged browser consumer with exact query-specific
facet and activity summaries; do not silently change its all-history numbers
to page-local numbers. To finish Dashboard, maintain rich person priority rows
with all check dependencies before taking five highlights. To finish Places,
preserve the existing **case-sensitive arbitrary substring** media rule and
case-insensitive open-task description rule through maintained memberships,
or document an intentional, evidenced product change. This batch does neither
and leaves the Places behavior untouched.

## Release and backfill (lead only, after Vercel deploy)

Manual production code deployments are prohibited. The only production command
run during implementation is the dry-run. After the lead confirms the coordinated
Vercel deployment, from the Family History checkout run:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfill '{}'
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStatus '{}'
```

Repeat `backfill` after `{complete:false}` or an interruption until status says
`complete:true`. Each action yields after about 90 seconds of successful steps;
a failed step propagates its error and leaves the preceding cursor intact.
Investigate failures and rerun; do not set flags, clear the ledger, reset the
cursor or edit source data to force completion. The backfill itself writes
production derived data, so these are explicit post-deploy migration commands,
not read-only diagnostics. Do not run them on another deployment. For focused
operations, one transaction is:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStep '{}'
```

The separate People Explorer backfill remains separate. Completing it does not
complete these counters, and completing counters does not migrate Dashboard or
Places. This draft needs the remaining implementation before a release decision.
