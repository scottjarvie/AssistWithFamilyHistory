# Prior lead pass after Opus27bee8e (resolved030963f)

2026-11-05. All required findings below are resolved in Opus030963f. Current next route: audit-review-next.md, then settings-next-route.md. The complete read-only review is reviews/opus-operations-27bee8e.md. Sol leads/codes, Opus5.5 final AI tastemaker. No new delegate for small findings: implement these, verify/capture/full check, and include them in the next meaningful Audit review. Local only; AWF-0071 doing, whole-Card audit not audited. No formal round2/site-wide acceptance.

## Required before kit reuse

1. QN1: a sheet pushed from the list must close via history.back, rather than leaving duplicate list entries. Direct ?item links close with replace. Track session-push provenance, handle browser Back/Forward and preserve unrelated URL/Next history state; no extra network reload/draft loss.
2. QN2: Previous/Next must follow current visible grouped/sorted/selected-only order, and close must return focus/scroll to the currently viewed row. Prefer a stable optional order callback from CollectionWorkspace, containing already-loaded rows/IDs, with equality guarding against effect loops. `data-queue-item` can locate the visible origin button across Table/List/Grid. Clear origin after close and set it on new-directive result.
3. QN3 recommended: successful mutation quietly refreshes detail, retaining earlier loaded activity and scroll; de-duplicate any reloaded activity IDs. QN5: close only an action form no longer valid after a conflict refresh, retaining its private draft; a row reload must fetch that row, not silently drop loaded pages2+ by reloading page1. Existing six command/delete/409 payloads unchanged. Late callback guards at27bee8e already pass11 intercepted checks, including detail/delete after Next.
4. O-R1/K1: one aligned head is accepted, but hard minimum-width arithmetic pushes Next action off screen and may regress People/Research. Fit columns to the actual desktop container, reduce identity width and stack evidence facts; bring Next action immediately beside Entry. Header/cell wrapping must preserve all data. Add edge cues if a manually chosen wide view can still scroll. Verify actual table scrollWidth against clientWidth, not just document overflow, at1440 AND1280; include People and Research fresh captures. Consider percentage-based column weights, narrower identity, normal wrapping header labels and default List where a table cannot fit. Preserve manual Table/columns and phone labelled records. One tbody per real group under the common thead fixes rowgroup scope.
5. O-R2: sort/direction are presentation/server ordering, not filters. Exclude them from empty/filter/view truth; an empty sorted vault keeps import guidance. Facet defaults say Default: missing critical/descending, never All server sort/direction.
6. O-R3: shared filter sheet stages several values, then Apply GET once; chip removal stays direct. Update existing collection tests that currently expect navigation on each picker tap. Restore dialog focus, keep one-level choices/current values/count scope, preserve URL facets and unrelated query keys where required. Queue already has multi-select Done; make Done sticky and shorten copy. Options outside the server state load say Not loaded, not0 loaded; priorities sentence case.

## Other accepted taste/presentation fixes

- Operations phone first read: workflow, number missing, first next action. Put places/five evidence counts/full checks/actions in the existing one-level disclosure, keeping every field discoverable.
- Name the exact first missing check changed by Mark Done/Not Applicable. Payload remains first missing check, just clearer button text.
- Average coverage is canonical people only. Pagination is cap-based, so say more may be available rather than claiming more definitely exist.
- Drop unused lastTouched/latestImportAt from Operations client projection.
- Keep numbers with their nouns, allow wraps between separate facts; don't restore run-together separators.
- Phone Queue header should be one row: Back plus labelled ↑/↓ icon buttons. Keep desktop header/ask-first and true phone answer-first DOM.
- O-R4: reviewer reports a Checks disclosure inside Table despite CSS hiding it. Root's earlier image inspection showed only Actions. Verify computed display against exact frozen27bee8e/current source; new screenshots go in a NEW folder (never overwrite reviewed27bee8e captures). This may be cached image evidence; do not assert a cause without proof.
- Naming Research Queue vs Operations is recorded as an overnight owner question; preserve existing route/nav aliases meanwhile.

## Work already started after27bee8e (uncommitted)

- Existing handoff API ignored storyWorkflow. New lib/operations/query.ts shares all eight typed facets between server page and export, takes first repeated key and preserves defaults. Export remains all matching rows (beyond loaded page); UI copy explains scope.8 focused projection/query tests pass (225ms). Needs integration/UI/full check with this lead pass. No provider/grant/auth changes.
- lib/audit/contract.ts + convex/auditRecords.ts are an UNWIRED pure Audit projection foundation.3 tests pass (314ms): all16 actual metric predicates/owner isolation/minimal fields, owned/unlinked destinations, bounded50-row stable pagination/invalid input. No backend action/API/UI changed for Audit yet. scripts/test-audit-records.ts is not yet in package test command; add it when wiring the tranche.
- audit-next-route.md contains the read/UI plan. Optional drilldown on existing getVaultAudit must preserve legacy ordinary callers and existing authorization; do not widen a frozen grant baseline. Its existing tenant helper can run in shadow mode: any newly exposed detail projection must require an actually matched authenticated owner, rather than relying on shadow acceptance. Legacy counts behavior stays unchanged. Existing record-only source hash requires an explicit read-source review/update if the wrapper changes; no runtime/backend state or snapshot regeneration is authorized/needed.

## Receipts already established

Frozen27bee8e:57/57 full steps49s,13 Queue UI/11 intercepted Queue,9 Operations UI/4 intercepted Operations,18 People/18 cross-page/19 Place-Story.32 Queue-reader +12 Operations captures,2 reconstructed original comparisons,326-image gallery checks/clean inline preview/display. Opus accepts preservation/privacy/contracts and reader reuse, conditionally Queue/Operations/kit as above. No backend acceptance, final score, complete Card/WO or production action.


## Lead receipt after this plan

Required QN1/QN2, O-R1/O-R2/O-R3 and K1 are implemented/tested; recommended quiet reload, stale-command/row-page handling, short phone header, honest state counts, scoped metrics, exact-check labels and minimal projection are also in.109 browser checks,62 captures,57 full steps pass. Back/Forward entry provenance is stored in the existing history state without records; rendered-order IDs come from the collection callback. Col percentages replace ignored calc() widths. O-R4 current computed visibility/captures confirm Table details hidden; no unproved cached-image explanation claimed. Minor Coverage header/noun wrap at1280 can be polished alongside Audit. Next work is the Audit route below, not another delegate for this small fix batch.

Audit pure helper was moved from convex/auditRecords.ts to lib/audit/records.ts so it is not registered as a Convex function module; its3 tests are now part of normal verification. The handoff parity parser is verified with this tranche. No new Audit backend/API/UI yet; legacy ordinary callers and grants remain untouched.
