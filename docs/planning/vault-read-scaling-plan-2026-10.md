# Vault read scaling plan (2026-10-21)

Status: **step 1 implemented in a local candidate, not published or deployed.** Steps 2–5 remain plans and require separate scope. Updated 2026-10-27.

## The problem

`getVaultSnapshot` (`convex/vault.ts`) reads **every row of 20 owner tables**, including document bodies, story text and historical context. Several ordinary pages use it even when they show 50 rows or a handful of counts:

| Function | Used by | Needs |
| --- | --- | --- |
| `getPeopleExplorer` | `/app/people` | one page of people plus per-person badges |
| `getDashboardSummary` | `/app` (and, before step 1, `/app/people` and `/app/people/new`) | counts plus a few lists |
| `getOperationsSummary`, `getVaultAudit`, `getResearchOverview` | operations / research pages | counts and readiness |
| `getStoriesIndex`, `getStoryReadinessCandidates` | stories | story list plus readiness |
| `getPlacesExplorer`, `getPlaceWorkspace` | places | places plus their people |
| `getProvisionalRelatives` | review | provisional rows |

Limits applied after the load (`slice(0, limit)`) do not reduce what Convex reads. On a family archive of a few thousand people with sources and stories, every one of these reads the whole vault. These reads scale with vault size instead of the visible page. They increase read volume and can exceed provider transaction budgets; no production-scale latency or cost benchmark was run for this local candidate. Whole-tree import (#86) remains separately held.

## Steps

1. **Implemented locally: first-start eligibility without a second snapshot.** `isFirstStartEligible` uses one indexed person read for an occupied person graph, or at most one `.first()` across each of 21 owner tables for an empty graph. `.first()` bounds row count, not document bytes. `/app/people` and `/app/people/new` call `vaultReads.getFirstStartEligibility` instead of the full dashboard summary, so each People page view now loads the vault once instead of twice. The same helper backs `startPrivateWorkspace` and `getDashboardSummary`; the dashboard reuses its already-owned transaction snapshot and only checks Queue if that graph is empty. `pnpm check:private-first-start` pins this.
2. **People Explorer pagination.** Page persons through an index (`by_owner_updated`, which needs a new `persons` index on `["vaultOwnerId", "updatedAt"]`), then build badges only for the page's people with the per-person loader (`loadPersonScopedSnapshot`, GEN-92) or a lighter badge loader. Search over names and FamilySearch ids can use a search index on `persons`. Search over "key places" moves to the person row or is dropped from the list search. *Schema change (new index): deploy only, no backfill.*
3. **Maintained counts.** A small `vaultCounters` row per owner (people, places, stories, documents, imports, open tasks, provisional relatives), updated in the same mutations that insert or delete. The dashboard and operations pages read the counters. *Schema change plus a one-time backfill mutation, run once per owner; run only with Scott's go-ahead.*
4. **Bodies on open only.** List and summary readers stop selecting document `content`, story `content` and historical-context bodies. Convex reads whole documents, so this needs either split body tables (`documentBodies`, `storyBodies`) or summary fields (title, length, excerpt) on the parent row. *Schema change plus a migration; plan it separately.*
5. **Retire `getVaultSnapshot` from page reads.** Keep it only for export and audit-style jobs, ideally as a paginated action.

## How to verify each step

- The parity tests (`scripts/test-person-snapshot-parity.ts`, `scripts/test-context-coverage-parity.ts`) already compare scoped loaders with the full snapshot. Extend them for each new loader. The first-start read-budget suite pins owner-index filters, the one-read populated path, all 21 emptiness tables, and dashboard snapshot reuse.
- After separately approving and integrating any #86 dependency, consider its opt-in 5,000-person fixture against People Explorer and the dashboard once steps 2–3 land. The local step-1 proof uses synthetic row-budget stubs; it does not establish full-vault pagination or a production load benchmark.
