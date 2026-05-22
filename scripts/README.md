# Scripts

This directory contains maintenance, import, audit, and document-generation scripts.

Active script docs live in:

- [FamilySearch console extractor](../docs/importing/familysearch-console-extractor.md)
- [FamilySearch console extractor quickstart](../docs/importing/familysearch-console-extractor-quickstart.md)
- [FamilySearch capture to vault storage map](../docs/importing/familysearch-capture-storage-map.md)
- [FamilySearch live capture pilot checklist](../docs/importing/familysearch-live-capture-pilot.md)
- [Product health gates and person route QA](../docs/operations/product-health-gates.md)

## Core Vault And Intake Checks

Use these checks when changing the vault, FamilySearch capture/import, or route health gates:

```bash
pnpm test
pnpm check:import-regression
pnpm check:familysearch-readiness-contract
pnpm check:familysearch-live-pilot
pnpm check:capture-validation
pnpm check:familysearch-capture
pnpm check:operations-handoff
pnpm check:context-pack-contract
pnpm check:privacy-ai-safety
BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes
```

`pnpm test` is intentionally lightweight. It runs script-based assertions for pure vault behavior and capture import regression semantics without introducing a broad test framework migration.

Use `pnpm check:operations-handoff` and `pnpm check:context-pack-contract` when changing the research operations queue, row handoff export, context packs, provisional-relative workflows, or research-check lifecycle UI.

## Public Story Beta Harness

Use these checks when working the GEN-3 / GEN-48 public beta publishing route:

```bash
pnpm check:story-fixtures
pnpm check:story-publish
pnpm check:story-slugs
pnpm check:public-story-e2e
pnpm check:story-capabilities
pnpm check:api-inventory
pnpm check:public-beta-launch
```

`tests/fixtures/stories/manifest.json` maps fixture scenarios to the Linear route. Keep it updated when adding publish gates, story API roles, privacy checks, or public sharing policy.
