# FamilySearch Capture Extension

This extension captures user-initiated FamilySearch person sources and memories pages into capture packages for the Research Vault.

## Source of truth

The TypeScript files are authoritative:

- `content/extractor.ts`
- `popup/popup.ts`
- `service-worker.ts`

Chrome loads the generated JavaScript files referenced by `manifest.json`:

- `content/extractor.js`
- `popup/popup.js`
- `service-worker.js`

After editing extension TypeScript, run:

```bash
pnpm build:extension
pnpm check:extension
pnpm check:familysearch-capture
```

`pnpm check:extension` fails when the shipped runtime JavaScript has drifted from the TypeScript source.
`pnpm check:familysearch-capture` checks the manifest, FamilySearch page matches, standard pacing, diagnostics mode handoff, safe-use runbook, and a valid source capture fixture.

## Safety posture

The extension is for manual, user-visible capture from a page the user has already opened. Standard mode is the default. Admin mode is for local/internal verification only and should not be used for broad unattended crawling.
