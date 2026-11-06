# Operations preservation and Audit intake

2026-11-05. Sol leads/codes; Opus5.5 is the second judge/final AI tastemaker. Local only. This is a capture tranche, not a formal scoring round. AWF-0071 doing; separate audit not audited.

Operations originally uses one server owner-scoped `getOperationsQueue` action, eight query facets, six server sort keys/two directions, expanding 50-row limit and a filtered handoff export. That action and API contract remain unchanged. Its summary covers returned rows only; the existing cap-based `hasMore` heuristic is preserved (not a verified next-page count).

| Existing capability/content | Current destination |
|---|---|
| Heading/purpose, private/local/guest session explanation, guest sign-in | Modest header and compact session strip |
| Import capture and filtered agent handoff export (all original query keys) | Header; synthetic preview export disabled |
| Visible/provisional rows, missing required/recommended, stale checks, average canonical-person coverage | Labelled six-column ruled summary, explicitly loaded scope |
| q, canonical/provisional, saved-story state, workflow, missing check, freshness | Direct search and one-level Filter picker, removable chips |
| All six server sort keys and asc/desc | Filter picker, explicitly server sort/direction; distinct loaded presentation sort |
| All nine original entry/type/places/coverage/evidence/workflow/missing/next/action columns | Shared grouped collection Table/List/Grid; all missing checks and next actions exposed instead of old presentation caps; List/Grid keep a compact first read and a full one-level disclosure |
| Lifespan, provisional anchor, relationship/research badge, all five evidence counts | Identity and declared columns, retaining zero values |
| Handoff clipboard and manual-copy fallback, canonical Open Person/Context Pack | Row Actions disclosure; original dialogs/text and contracts |
| First missing check Mark Done/Not Applicable | Same existing POST fields and first-check behavior |
| Provisional Open Anchor/Promote/Merge, candidate search/anchor exclusion | Same existing dialogs; minimum20-character review note, explicit human review confirmed and logged; API guards unchanged |
| Filtered/no-people/guest states and setup/import routes | Collection state and header session/import controls |
| All queue-model/AI handoff/progress/how-to-use/best-paired-workflow explanations; Story Writer link | Below data, four one-level guide disclosures plus full paired-workflow paragraph |
| Backend unavailable/runtime failure/owner authorization | Original server route conditions preserved |

New client rows are an explicit allowlist (`lib/vault/operationsRows.ts`), excluding raw research-check documents/notes/actor internals. Saved views contain filters and presentation only, owner-keyed, with the established browser search-text disclosure. Selection/group/sort/density/columns cover loaded rows only. No archive/restore or bulk mutation is invented. Synthetic row actions retain dialog access but block every write/candidate API/export; intercepted real-controller tests can exercise payloads without backend requests.

## Audit next

The existing Audit page has four headline metrics (people, sources/citations, context, stories/public), five gap counts, five story-workflow counts with Operations destinations, eight priority people and no trend history. `getVaultAudit` returns counts plus priorities and recent raw context; it does not return all matching records. The decided instrument panel requires a behind-the-number record list for every number. Do not fabricate those records from the top-eight candidates, derive a trend from updatedAt, or imply counts are presentation-loaded. A minimal owner-scoped read/projection with record-backed drilldowns is the next bounded route, preserving every metric/gap/workflow/candidate and the original Operations/Places links. No billing/access/schema decision is needed for this read-only presentation, but permission defaults and the frozen legacy action scope remain untouched.


Lead refinements after27bee8e fit all nine table roles within the1440/1280 container, with Next action beside Entry; one head and one tbody/group. List/Grid first read is workflow/missing/next, full selected fields in a one-level disclosure (column hide/restore verified). Staged facets apply once, sorting is not a filter, named default order and exact first-check actions retain original contracts. Client timestamps not displayed were removed. The pre-existing export storyWorkflow omission is corrected by the shared typed argument parser; export remains all matching rows beyond the loaded page. No grant/auth/schema/provider change. Minor Coverage wrap remains polish for the Audit tranche.
