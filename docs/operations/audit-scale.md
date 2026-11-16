# Audit at vault scale

Pending release: the lead must confirm Vercel's coordinated Convex/Next deployment
and `vaultCounts:v7` completion before describing this path as live.

## Inventory and maintenance

The legacy `vault.getVaultAudit` returns the following. Its snapshot implementation
remains for migration fallback and parity tests; steady-state `vaultReads` uses
`auditPages` after v7 completion. Both `/app/audit` and `/api/audit/records` use it.

| Output | Record/contribution | Maintenance |
|---|---|---|
| People, relationships, events, places, sources, citations, media, documents, historical context, research checks, research tasks, research log, stories | Active source records, one each | Existing exact source counter shards |
| Published stories | Active story with status published | Story `status:published` counter, central writer |
| People without sources | Person's scorer has zero related sources | `personScoreRows.auditWithoutSources`, `withoutSources` counter |
| People without context | Person's context coverage count is zero (including year overlap and place-less context) | `auditWithoutContext`, `withoutContext` counter |
| People without stories | Person's related story count is zero | `auditWithoutStories`, `withoutStories` counter |
| Five workflow counts | Person's original `getStoryWorkflowStatus` | Existing score workflow field and `workflow:*` counters |
| Open research tasks | Active task, status other than done | `researchTasks.auditOpen`, `open` counter |
| Places without context | Active place with no active same-owner context referencing it | `places.auditWithoutContext`, `withoutContext` counter |
| Priority people (8) | Nonpublished person, original story readiness score | Existing workflow/readiness indexes, take 8 per nonpublished workflow, bounded merge |
| Recent context (8) | Active context, updatedAt descending, creation order ties | Owner/active/browseOrderTime index |
| Sixteen record drilldowns | Headline, gap or workflow matching records | Indexed cursor pages of at most 50, Load more |

All numbers can be maintained per record. None depends directly on the clock;
there is no persisted stale/time flag. The three person flags use the same scorer
inputs and existing `refreshPerson` discovery, deferred refresh, recorded failure,
automatic retry and repair pipeline as Operations. All inputs were already covered;
no separate refresh system was introduced. Scores and old/new weighted contributions
commit together on the existing 32 shards. Deferred person refresh means the same
short projection-staleness window as Operations. Counters count last-computed rows.

Places use the existing context membership shards. After each central writer
updates old/new context memberships, it reconciles both referenced places, patches
the stored place flag, and changes its source ledger/counter contribution in that
same source transaction. Place owner moves, archive/restore, insert/delete and
context owner/place moves, archive/restore and deletion are covered. Task flags
and story status totals likewise use central `searchServer` maintenance. Media
and sources have no separate Audit gap. No approximate totals or first-N windows.

## Pages and privacy

Record membership, totals, minimal DTOs and destination precedence match the old
Audit. Natural traversal changes from whole-vault locale title sorting to indexed
vault order: readiness for person/workflow lists, creation for gap/source/citation/task/place lists, latest update for stories, and most-recent first for context. Presentation sorting
and searching apply to loaded rows, as labelled. Following `continueCursor` until
`isDone:true` visits the whole set. Legacy offset replies retain `nextOffset`;
post-migration requests with a legacy offset restart at page one and the client
deduplicates. Concurrent edits can move cursors; reload for a fresh traversal.

The record API returns only the six-field private record DTO, never recent raw
context, evidence text, source URLs or narratives. The summary browser projection
remains unchanged. New drilldowns always enforce a matched authenticated owner,
even under the old summary shadow policy. Destination references repeat ownership
and active checks. Guest person candidates recheck source ownership during adoption.

Source/citation destinations traverse their specific reference indexes in pages
of 50 / 250 KB, preserving the first valid link and source-fact fallback. This
avoids unbounded reference collection in one transaction. Very large orphan
reference graphs can still require many action child calls and reach an action
time limit; this is not a universal bound on total work per displayed record.
No snapshot of other vault records is taken to find destinations.

## Release and backfill

Vercel deploys Convex then Next on merge; no manual production deployment. Dry-run:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex deploy --dry-run --codegen disable
```

After confirming the deployment, the lead runs:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfill '{}'
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStatus '{}'
```

Repeat until `build:"vaultCounts:v7", complete:true`. Optional single step:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-dodo-308 npx convex run vaultCounts:backfillStep '{}'
```

With completed v6, the idempotent upgrade visits only places, research tasks
and stories, then fills indexed flags from existing score rows in pages of 25.
It uses the same old/new counter transaction, without recollecting person graphs.
Fresh/incomplete-v6 migrations retain the full source/person/provisional traversal.
Cursor and maintenance commit together in both modes. No resets, skipped errors or manually completed production gates.
Existing completed v6/v5/v4 readers remain migrated throughout v7. Only Audit
uses its legacy snapshot until v7 completes. Legacy fallback keeps its old large
vault limits. Existing failure inspection and repair commands are documented in
[person scores](person-scores-scale.md) and [Explorer](people-explorer-scale.md).

Synthetic parity and randomized source-write tests cover every summary number,
every drilldown, resume/concurrent migration, owner denials and incomplete-v7
reader independence. Scale evidence and native contention measurements are in the
campaign report `family-history-pages-e.md` outside the repository.
