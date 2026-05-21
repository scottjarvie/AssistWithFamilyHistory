# Scripts

This directory contains maintenance, import, audit, and document-generation scripts.

Active script docs live in:

- [FamilySearch console extractor](../docs/importing/familysearch-console-extractor.md)
- [FamilySearch console extractor quickstart](../docs/importing/familysearch-console-extractor-quickstart.md)

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
