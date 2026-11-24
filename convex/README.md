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
