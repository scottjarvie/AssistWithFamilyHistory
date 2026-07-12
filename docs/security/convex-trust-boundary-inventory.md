# Convex Trust-Boundary Inventory

Last verified: 2026-07-12.

The check:trust-boundary contract inventories the public surface and fails when
a tenant-private function omits the shared guard.

## Registration totals

| Classification | Count |
| --- | ---: |
| Anonymous public queries | 2 |
| Always-enforced superadmin query | 1 |
| Tenant-gated public mutations | 39 |
| Tenant-gated public actions | 30 |
| Internal queries | 57 |
| Internal mutations | 34 |
| Total registered functions | 163 |

Protected reads are actions because a Convex query is read-only: the action can
persist a shadow denial through an internal mutation before calling its
internal query.

## Function inventory

| Module | Anonymous or control-plane queries | Tenant-gated public functions | Backend-only functions |
| --- | --- | --- | --- |
| apiKeys | — | mintKey, revokeKey, setKeyStatus, listKeys | listKeysInternal |
| citations | — | create, get, getForSource, getForTarget, list, linkToTarget, unlinkFromTarget | getInternal, getForSourceInternal, getForTargetInternal, listInternal, update, remove |
| documents | — | upsertDocument, getDocumentsByPerson, getDocument, list | getDocumentsByPersonInternal, getDocumentInternal, listInternal |
| events | — | — | create, get, list, getForPerson, linkPerson, unlinkPerson, update, remove |
| helpers | — | — | createPersonWithBirth, createCoupleWithMarriage, createParentChildRelationship, addChildToCouple, removeParentChildRelationship, createHierarchicalPlace, createCitation, linkCitation, initializeFamilySearchSync, recordSyncChange |
| importRuns | — | record, listRecent, getByCaptureId, attachArtifactPaths | listRecentInternal, getByCaptureIdInternal |
| media | — | — | create, get, getByFsUrl, list, listForPerson |
| personEvents | — | — | create, getByPerson, getByEvent, remove |
| persons | — | — | create, get, getByFsId, list, search, update, updateBirth, updateDeath, remove, getParents, getChildren, getSpouses, getFamilySummary |
| places | — | upsert, getByFsId, list | getByFsIdInternal, listInternal |
| rateLimits | — | checkAndIncrementRateLimit | — |
| relationships | — | — | createCouple, createParentChild, get, listCouples, listParentChild, getCouplesForPerson, getChildrenForParent, getParentsForChild, updateFacts, updateRelationType, remove, getFamilyTree |
| researchLog | — | upsert, listForEntity | listForEntityInternal |
| researchTasks | — | claimResearchTask, advanceResearchTask, listResearchTasks | listResearchTasksInternal |
| sources | — | — | create, get, getByFsId, list, update, remove |
| trustBoundary | getShadowLogSummary, exact configured superadmin subject | — | recordShadowDenial |
| vault | getPublishedStory and getPublishedStoryByIdentifier, published and server-redacted DTO only | — | getPeopleExplorer, getPersonWorkspace, getStoriesIndex, getStoryReview, getPersonResearchChecks, getProvisionalRelatives, getOperationsQueue, getOperationsSummary, getVaultAudit, getContextCoverage, getStoryReadinessCandidates, getPlacesExplorer, getPlaceWorkspace, getDashboardSummary, getResearchOverview, getContextPack |
| vaultMigration | — | migrateGuestVault | — |
| vaultMutations | — | upsertPerson, upsertSource, upsertCitation, upsertEvent, upsertPersonEvent, upsertRelationship, upsertMedia, upsertSourceFact, reviewMedia, upsertContextItemForPerson, ensureResearchTask, upsertStoryDraft, updateStoryStatus, updateStoryDraft, backfillStoryPublicSlugs, assignStoryReviewer, recordStoryReviewEvent, upsertHistoricalContext, upsertProvisionalRelative, upsertResearchCheck, bulkRefreshResearchChecks, createResearchTask, promoteProvisionalRelative, mergeProvisionalRelative | — |
| vaultReads | — | getPeopleExplorer, getPersonWorkspace, getStoriesIndex, getStoryReview, getPersonResearchChecks, getProvisionalRelatives, getOperationsQueue, getOperationsSummary, getVaultAudit, getContextCoverage, getStoryReadinessCandidates, getPlacesExplorer, getPlaceWorkspace, getDashboardSummary, getResearchOverview, getContextPack | — |

There is no standalone anonymous person query. The only anonymous person
projection is the allowlisted, redacted person summary embedded in a published
story response.
