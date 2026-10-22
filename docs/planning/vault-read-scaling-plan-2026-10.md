# Vault read scaling plan (2026-10-21)

Status: **plan only.** Step 1 is shipped in the PR that adds this file. Steps 2–5 are not started.

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

Limits applied after the load (`slice(0, limit)`) do not reduce what Convex reads. On a family archive of a few thousand people with sources and stories, every one of these reads the whole vault. That costs money on each page view (Scott's spend priority), and it will eventually hit Convex's per-query read limits (about 16 MiB / 32k documents). Whole-tree import (#86) makes large vaults normal.

## Steps

1. **Done: first-start eligibility without the snapshot.** `isFirstStartEligible` runs one indexed `.first()` per owner table (21 tiny reads). `/app/people` and `/app/people/new` call `vaultReads.getFirstStartEligibility` instead of the full dashboard summary, so each People page view now loads the vault once instead of twice. The same helper backs `startPrivateWorkspace` and `getDashboardSummary`, so all three agree. `pnpm check:private-first-start` pins this.
2. **People Explorer pagination.** Page persons through an index (`by_owner_updated`, which needs a new `persons` index on `["vaultOwnerId", "updatedAt"]`), then build badges only for the page's people with the per-person loader (`loadPersonScopedSnapshot`, GEN-92) or a lighter badge loader. Search over names and FamilySearch ids can use a search index on `persons`. Search over "key places" moves to the person row or is dropped from the list search. *Schema change (new index): deploy only, no backfill.*
3. **Maintained counts.** A small `vaultCounters` row per owner (people, places, stories, documents, imports, open tasks, provisional relatives), updated in the same mutations that insert or delete. The dashboard and operations pages read the counters. *Schema change plus a one-time backfill mutation, run once per owner; run only with Scott's go-ahead.*
4. **Bodies on open only.** List and summary readers stop selecting document `content`, story `content` and historical-context bodies. Convex reads whole documents, so this needs either split body tables (`documentBodies`, `storyBodies`) or summary fields (title, length, excerpt) on the parent row. *Schema change plus a migration; plan it separately.*
5. **Retire `getVaultSnapshot` from page reads.** Keep it only for export and audit-style jobs, ideally as a paginated action.

## How to verify each step

- The parity tests (`scripts/test-person-snapshot-parity.ts`, `scripts/test-context-coverage-parity.ts`) already compare scoped loaders with the full snapshot. Extend them for each new loader.
- Run the opt-in 5,000-person fixture from #86 (`pnpm test:tree-import-5k`) against People Explorer and the dashboard once steps 2–3 land.
