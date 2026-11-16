# Exact vault counts and paged workspace reads

This covers batch A's exact counts and paged workspaces plus the partial batch B
scoped reads below. Batch B remains pending release. Vercel deploys Convex and
Next on merge; confirm deployment and the relevant migration before claiming a
new read is live. Already-complete v4 counters keep batch A readers on their
bounded paths during the v5 membership upgrade. New person memberships use v5;
until then, media/loose-context retain their original fallback.

## Counters and contention

`convex/vaultCounts.ts` lists the 20 original snapshot types plus source
contents, record personas, topics and connections. Queue retains its own counter
system. Credentials, receipts and derived records are excluded. An active count
means an exact stored owner match and `archivedAt === undefined`; timestamp zero
is archived. Rows without stored owners retain their old snapshot exclusion.

Source writers use `convex/searchServer.ts`. The adapter maintains search/order
metadata, a last-counted membership ledger and counter deltas in the source
transaction. It handles insert, patch (both signatures), replace, delete,
archive, restore and old/new ownership. Guest retagging counts every source type
even while deferring People Explorer work. Per-mutation writes are serialized;
the builder drains the queue and cannot swallow a counter-maintenance failure
and commit the source separately.

Counts **and revisions** use 32 deterministic shards per owner/type, selected
by the record ID. Writers touch only the applicable old/new shard; they never
read a shared revision document or all shards. Reads sum the shards exactly.
Revisions are monotonic change tokens, not numbers of source records. Content-only
edits advance a shard revision too, supporting stable read-only recounts.

Local three-round tests of 20 concurrent source upserts found OCC failures with
the unsharded design. The sharded design passed all 60 creations and a repeat
60-update test. Conflict/retry counts and documents/bytes are in the campaign
report. Local elapsed times are not cloud latency evidence. Shards reduce
incidental owner contention; simultaneous writes to the same actual record or
the same logical media/place membership can still conflict.

Old `vaultCounts` rows and their index remain for idempotent migration. A legacy
member without a shard is subtracted from its old row and added to its shard
atomically. Do not delete/reset old counters or member data. After migration,
ordinary source writes do not update the legacy owner/type counter. The old
index is retained; no production index is deleted.

## Research

The website uses `vaultReads:getResearchTasksPage` and `getResearchLogPage`, with
the first 50 candidates/rows and cursor-based Load more. The unbounded complete
Research DTO action was removed: no non-website caller needed it. Its old
internal snapshot query remains solely as a migration/parity fallback.

Tasks use owner/active/time or owner/active/status/time indexes. Search scans at
most 50 ordered candidates and requests a 250 KB source split threshold per
transaction; it preserves arbitrary case-insensitive substrings in task title,
description (or type fallback) and linked person name. An empty search page is
progress, not exhaustion. The browser continues until it has another 50 matches
or reaches the end. Only referenced owned active people are hydrated, and only
small name/route fields are returned. Sortable IEEE timestamp/creation keys retain full numeric precision and
creation-ascending ties, and a separate hydration byte budget resumes at the last
processed candidate rather than skipping the rest of a page. Log pages use owner/active/time.

Unfiltered totals and status facets are exact counters. Search facets explicitly
say **matching rows loaded so far, within the selected status**. The log's total,
author and activity-lane totals are exact for the vault; its chart, month counts,
date range and local filters explicitly cover loaded entries. Source records and
client DTOs are separate: raw source/large person documents never cross into
collection components. The 10,000-entry heavy log uses pages, so it does not hit
the former complete action's 8,192-element array-return limit.

Cursors describe a live traversal, not a frozen multi-query snapshot. Concurrent
edits can move rows ahead of a cursor; reload for a fresh traversal. Active-tree
changes are rejected by server actions. Switching query/status remounts the
cursor consumer. Legacy/native cursor prefixes restart safely across migration.

## Dashboard

All prior vault-wide totals come from exact counters, including open task states
and provisional merge state. Recent people/imports use owner/active/ordered
indexes. Open task previews use three owner/active/status/time ranges; taking
five from each sorted state and then the newest five preserves the union's top
five. Streamed document/byte budgets bound source reads without collecting owner
history or using multiple paginators in one query. Only displayed task/import
people are hydrated. Recent import DTOs retain counts, warning strings and the
FamilySearch person ID because the Imports page consumes the same
`/api/convex/stats` response; its type is derived from that DTO.

**Intentional priority change, authorized by Scott's lead:** the five highlight
people are now selected by their existing assigned `researchPriority` index,
not an all-history inferred evidence-gap score. The screen says this list covers
assigned priorities only, not every evidence gap. Recent people no longer claim
full-history critical-gap counts. No invented or zero-filled operation scores
are returned. The full Operations page is batch B and unchanged. `/api/convex/stats`
uses the same bounded dashboard data.

## Places and explicit media

The place list uses owner/active pages, preserving arbitrary name/fullName
substring search through bounded candidate pages and continuation. Each displayed
place has exact event, citation-link and media counts from maintained per-place
shards. Workspace headers also have exact context/research counts and the min/max
years of all linked active events. Event year buckets track old/new date, owner,
archive and place deltas, so archive/restore/removal can change either endpoint.

Events, citation links, historical context and place research logs contribute
transactionally through their source membership. Accepted explicit media/place
**Connections** contribute once per distinct owned active media record, even if
multiple accepted Connections refer to the same pair. Proposed/rejected links
never become accepted count members. Owner/archive/delete changes, removed
connections, duplicate links and restoration update counts in the same source
transaction. Reverse media memberships avoid scanning the owner's media history.
Unvisited legacy media writes also refresh those memberships, so an archive/delete
before the media backfill cannot leave an earlier accepted connection counted.
A media availability edit visits its linked places, not all owner records; an
extreme single-media fan-out remains subject to ordinary mutation limits.

**Intentional matching change, authorized by the lead:** media is no longer
associated by a case-sensitive arbitrary substring of the place name anywhere
in its title/description. The media total/list now means accepted explicit
Connections. A separate **Possible mentions** lookup uses two source-table text
indexes, on title and description, with owner/active filters: word matching with
final-word prefix semantics, up to six hits per field / twelve distinct candidates.
These are labelled suggestions, never a complete mention count or confirmed
links. A signed-in website person can explicitly accept a candidate using
“Link to this place”; the mutation enforces the matched owner and creates an
accepted `taken_at` Connection. “Unlink from this place” rejects accepted
Connections while keeping the media. Each mutation rejects one connection via
an indexed pair lookup; the website continues for up to 50 transactions, and
exceptionally duplicated links can be continued with another click. Acceptance
and rejection record the acting person and time. It never publishes or changes
media privacy.
Optional descriptions are initialized to an empty string for safe indexing.
No duplicated long media text or content-bearing search mirror is created.

**Loaded badges, expressly approved by the lead:** People and Sources show
“N loaded”, with Load more, not whole-place totals. Sources are cards for loaded
citation links, preserving duplicate source cards where several links support
the place and omitting missing/archived/foreign citations or sources. Other
workspace badges remain exact whole-place totals. People enumerate direct birth
and death matches then event participants, deduplicated in the browser. They do
not claim a global score/sort. All scoped source reads are owner-indexed and
bounded; evidence hydration uses a separate byte budget and resumes at the last
processed key so a byte split never skips remaining candidates.

The initial legacy workspace fallback loads one snapshot, not one per section.
Before migration its media remains explicitly labelled legacy text mentions;
after the gate it switches to explicit links and the separate possible-mentions
lookup. No old substring association is silently converted into an accepted
Connection.

## Release/backfill — lead after Vercel confirms deployment

Only a production **dry-run** is allowed from an implementation session:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex deploy --dry-run --codegen disable
```

After the coordinated Vercel release, from the Family History checkout run:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfill '{}'
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStatus '{}'
```

Repeat backfill after `{complete:false}` or interruption until status says
`complete:true`. Each step reads <=100 source records with a 500 KB source split
threshold, plus bounded member/counter work. Cursor advancement, source metadata
and count reconciliation commit together. Each action yields after roughly 90
seconds of completed steps. Failed steps leave the preceding cursor intact;
investigate and rerun rather than editing flags or source data. For one step:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStep '{}'
```

The current traversal flag is `vaultCounts:v5`: all source tables, shard memberships,
place contributions, browse/section keys and media index fields must be visited.
v5 also builds media/person and loose-context/person reverse memberships.
The original v4 flag remains valid for exact counters and batch A readers;
only the scoped media/context reads require v5. Upgrading does not send those
already-migrated pages back to their old snapshots.

New normal writes reconcile immediately, including inserts after a cursor has
passed. The membership ledger prevents double counting during concurrent edits.
Changing table order, contribution rules, metadata requirements or shard layout
requires a new build version and a considered migration. Never reuse positional
cursors/completion flags for different work. The People Explorer migration stays
separate; completing either flag does not complete the other.

No production backfill was executed during implementation. Never target
`gallant-mallard-74`, and never deploy production code manually.

## Drift diagnosis and deferred pages

`vaultCounts:recountPage` is a read-only, owner/type paged recount. Sum its source
subtotals across cursors and compare with the returned counter, treating missing
keys as zero; require the same summed shard revision throughout or restart.

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:recountPage '{"vaultOwnerId":"<owner>","table":"sources","cursor":null}'
```

There is no blind reset/repair operation. A discrepancy needs investigation and
a bounded versioned repair that does not race normal writes. Raw ordering fields,
like existing search metadata, may appear in raw exports; client DTOs omit them.

Operations, Audit and readiness remain deferred. The partial batch B additions
and their graph-fan-out limits are described below. The
original campaign's 13-caller map remains the baseline: Dashboard, Research and
the two Places website consumers now select the bounded paths after this gate;
the original implementations are retained only where migration/parity requires.

## Batch B scoped reads and compatibility changes (release pending)

Stories uses a 10-candidate owner/updated-time page (250 KB split threshold),
then hydrates each rich row in a separate story/person-scoped query. The browser
has Load more. Search, facets, counts, grouping and sorting explicitly cover
loaded stories. Equal updated timestamps now use creation-descending index ties,
rather than the former full-snapshot creation-ascending ties. No persisted score
or inferred full-vault ranking is introduced. Archived candidates can produce an
empty page with a continuation; it is not end-of-results.

Both public story lookups use the same scoped graph and existing public DTO,
with publication, archive, living-person, stored ownership, media rights/privacy,
historical-context publication and text redaction gates preserved. They skip
review history, other stories, loose context, documents, imports, tasks, logs,
research checks, source facts and provisional-relative history: those private
inputs never affected the public DTO. No public caching or publication policy changed.

After v5, person/scoped story loaders read media and contextItems through reverse
person memberships, re-check the actual source's owner/person membership, and
restore original creation order. Document/import-FS/log/FS-ID lookups also use
existing owner-prefixed indexes. Relationship/import unions deduplicate by record
ID, including self-relationships and a run found through both import indexes.
Historical context uses the existing exact
owner/active/place ranges for the person's referenced places plus place-less
entries. Place-less context still applies to every person under the existing year
and privacy gates. Before v5, only media/loose context retain their old owner-wide
fallback. These are graph-scoped reads: a single extraordinarily large person
or place-less-context graph can still exceed Convex transaction limits. This is
not a bounded rich readiness projection or a universal per-person fan-out proof.

The central searchServer adapter maintains contextItemPeople and mediaPeople in
the source transaction, including delete, replace, ownership and membership edits.
The restartable v5 traversal refreshes links for legacy rows. Duplicate personIds
make only one link. Membership links carry IDs only; source owner/archive/privacy
checks remain authoritative. v5 adds no counter kinds or shared score rows and
retains all 32 existing counter shards.

`vaultReads.getProvisionalRelatives` now returns `{page, continueCursor, isDone}`:
50 candidates / 250 KB split, owner or owner+anchor indexed. All previous merge
states remain visible. Missing anchors produce an exhausted empty page. There
are no current website/MCP callers of this wrapper. Tied timestamps use the same
creation-descending convention as Stories.

Repository-wide caller tracing found one use of `/api/convex/people`: the
Operations merge-target dialog. No external API dependency is declared in the
route/capability inventory. Removed the public rich-array action
`vaultReads.getPeopleExplorer`; the internal legacy builder stays solely for
People Explorer migration/parity. The route now calls the existing paged compact
People Explorer and accepts `q` and opaque `cursor`. Its response retains
`people` and per-page `count`, adding `continueCursor` and `isDone`; `people` rows
are the website's compact People DTO. The dialog supports server search and Load
more, cancels obsolete searches, and does not call an early empty page complete.
The underlying People Explorer migration gate remains separate from v5.

Operations, Operations summary, Audit and Story Writer readiness remain on their
old snapshots in this partial batch. Do not mark batch B complete or ship this
partial PR as completion of the campaign.
