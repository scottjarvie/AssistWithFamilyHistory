# Codebase Organization Audit

Date: 2026-05-13

## Current Shape

The repo is a Next.js App Router application with a Convex backend, a Chrome MV3 extension, feature modules, shared libraries, and maintenance scripts.

The highest-value cleanup was documentation organization. The repository root had active docs mixed with completed setup reports, old import summaries, and historical planning files. Those files now live under `docs/` with active docs separated from archived notes.

## Changes Made

- Moved product direction to `docs/product/vision.md`.
- Moved Convex guides to `docs/convex/`.
- Moved deployment guidance to `docs/deployment/convex-checklist.md`.
- Moved FamilySearch console extractor docs to `docs/importing/`.
- Archived completed setup reports under `docs/archive/2026-02-convex-setup/`.
- Archived the February 2026 import snapshot under `docs/archive/2026-02-imports/`.
- Archived historical Cursor implementation plans under `docs/archive/plans/`.
- Added `docs/README.md`, `docs/archive/README.md`, `convex/README.md`, and `scripts/README.md` as folder-level orientation files.
- Added `.cursor/` and `.archive/` to `.gitignore`.
- Moved ignored QA/import and squirrel audit outputs into `.archive/local-artifacts/2026-05-13/`.

## Keep As-Is

- Keep `extension/*.js`, `extension/content/*.js`, and `extension/popup/*.js` in place. They are runtime files referenced by `extension/manifest.json` and `extension/popup/index.html`.
- Keep `convex/_generated/` tracked. Convex clients import generated API and data model types.
- Keep `public/extension-download/discover-their-stories-extension.zip` only if the site still serves this exact bundled extension for users. If extension releases move to a separate build/publish workflow, replace this with a generated release artifact.

## Recommended Structure

```text
app/             Next.js routes, route handlers, and app layouts
components/      Shared React components and shadcn/ui primitives
convex/          Convex schema, queries, mutations, actions, and generated API
docs/            Active docs plus archived historical notes
extension/       Chrome MV3 extension source and runtime bundle files
features/        Feature-owned UI and business logic modules
lib/             Cross-feature utilities and service adapters
public/          Static web assets served by Next.js
scripts/         Maintenance, import, audit, and generation scripts
data/            Local runtime artifacts, gitignored
output/          Local generated reports, gitignored
```

## Follow-Up Cleanup Candidates

- Decide whether the app should use `features/source-docs/` long term or consolidate newer vault/source-doc behavior under a `features/vault/` module.
- Add a dedicated extension build command if TypeScript should become the source of truth for the extension `.js` runtime files.
- Add `LICENSE` or remove the license reference from `README.md`.
- Pay down lint debt in production code, then decide whether maintenance scripts should follow strict app lint rules or use a separate script-focused ESLint override.
- Consider moving generic marketing/layout components under route-owned folders if they are not reused outside the marketing site.
