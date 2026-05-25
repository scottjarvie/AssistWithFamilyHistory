# Legacy / quarantined scripts

These scripts were used during early data-migration work but **must not be run** against any vault that contains real owner data. They depend on the older un-owner-scoped Convex namespaces (`api.persons.*`, `api.events.*`, `api.relationships.*`, `api.sources.*`, `api.media.*`, `api.personEvents.*`, `api.ancestorDetails.*`), which were converted to `internalQuery`/`internalMutation` in the GEN-69 fix.

That means **none of these scripts will run as-is** after the GEN-69 change — `ConvexHttpClient` cannot call internal functions. Treat that as a feature, not a bug.

## Status

| Script | Status | Notes |
| --- | --- | --- |
| `enrich-tier2.ts` | **DO NOT RUN** (GEN-78) | Direct FamilySearch API call (`api.familysearch.org`) — violates the documented "provider API pending" rule. |
| `audit-db.ts` | Frozen | Local audit of synthetic data only. |
| `fix-sources-import.ts` | Frozen | One-shot migration; superseded by the import-run envelope. |
| `import-relationships-only.ts` | Frozen | One-shot migration. |
| `import-memories.ts` | Frozen | One-shot migration. |
| `fs-to-convex.ts` | Frozen | Pre-vaultMutations import path. |
| `fs-extractor.js` | Frozen | Pre-extension console extractor. |
| `fs-sources-extractor.js` | Frozen | Pre-extension console extractor. |
| `generate-ancestor-doc.ts` | Frozen | Pre-vault doc generation. |
| `generate-all-docs.ts` | Frozen | Pre-vault doc generation. |
| `import-ancestors.ts` | Frozen | One-shot migration. |
| `import-ancestry-json.ts` | Frozen | One-shot migration. |
| `import-citations.ts` | Frozen | One-shot migration. |
| `import-ps.ts` | Frozen | One-shot migration. |

## If you need to resurrect one

1. Rewrite to use `api.vault.*` / `api.vaultMutations.*` (the owner-aware namespaces) with an explicit `vaultOwnerId` argument.
2. Add the same capture-validation / import-run envelope as `parseCapturePackage` produces.
3. Add fixtures and a `check:*` script that covers the migration shape.
4. Remove from `legacy/` and document the new entry point.

Until then, the canonical intake path is the Chrome extension → `/app/imports` → `/api/import` flow. See `docs/importing/familysearch-source-capture-runbook.md`.
