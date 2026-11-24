# Convex Backend

The deployed Convex schema and functions for the research vault.

Deploys happen only by merging to `main`; never run `convex deploy`, `convex dev`
or `convex codegen` by hand against production. See
[How production deploys](../docs/operations/how-production-deploys.md).

## How reads and writes are layered

- Pages read through public actions in `vaultReads.ts`. Each checks the owner,
  then calls an internal query in `vault.ts` or a page module
  (`peopleExplorer.ts`, `placePages.ts`, `researchPages.ts`, `personScores.ts`,
  `auditPages.ts`).
- Pages write through `vaultMutations.ts`. Source mutations use the builders in
  `searchServer.ts`, which keep search projections and owner counters in step.
- The AI connector is `httpRoutes/mcp.ts` (transport and tool list) over
  `mcpFamilyHistory.ts` (tool behaviour) and `mcpGrants.ts` (who may do what).
  Hosted Queue writes go through `queue.writeFromConnection`, which rechecks
  the live grant in the same transaction.
- The schema is `schema.ts`; the only scheduled job is in `crons.ts`.

The old setup guides that used to be linked here are in
[docs/archive/2026-convex-guides](../docs/archive/2026-convex-guides/).

## Name map

| What you are looking for | Backend | AI connector | Website |
| --- | --- | --- | --- |
| An AI's access | `mcpGrants`, `mcpGrantHistory`, `mcpCarriedRestrictions` | `family_history_connection`, `family_history_limit_connection` | AI Connections, `AiConnectionCenter`, `/api/ai-connections` |
| A link between records | `connections`, `placeMediaConnectionEdges` | `connection` record kind | Shown on the linked records |
| Hand-offs to and from AI | `queueItems`, `queue.ts` | `family_history_add_queue`, `family_history_get_queue`, `family_history_update_queue` | Your Queue, `/app/queue` |
| Research to-dos | `researchTasks`, `researchChecks`, `provisionalRelatives`, `getOperationsQueue` | `family_history_save_research_work` task | Research Queue, `/app/operations` |
| Research history | `researchLog` | `research_finding` | Research Log, `/app/research` |
| Retry receipts | `mcpOperations`, `queueCommandReceipts` | `operationId` | |
| Evidence | `sources`, `citations`, `citationLinks`, `sourceFacts`, `sourceContents`, `recordPersonas`, `documents` | `family_history_save_source_evidence`, `family_history_add_source_content` | Imports, Library, Archive, `source-docs` |
| Background material | `contextItems`, `historicalContext`, `topics` | `topic` | Context and Research tabs |
| Stories | `stories`, `storyReviewEvents` | `family_history_save_story_work` | Story Studio, Story Writer |
| AI usage and API access | `agentActivity`, `apiKeys`, `usageLimits.ts` | Connection activity and storage counters | API Center, `/app/api` |

`buildPersonOperations` assembles a person's research rows. `getOperationsQueue`
loads the Research Queue. `mcpOperations` stores retry receipts.

The [backend contract tests](backendContract.test.ts) pin registered Convex
functions and HTTP routes, stored validators and indexes, and connector names.
Review the snapshot diff when one of those contracts changes on purpose.
