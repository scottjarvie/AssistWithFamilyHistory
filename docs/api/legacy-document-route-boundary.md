# Legacy Document Route Boundary

Last updated: 2026-05-21

## Purpose

This note closes the current planning decision for the legacy raw/contextualized document routes.

The current app behavior is preserved, but these routes must stay classified as internal legacy browser workflows until read and write semantics are split.

## Current Route Behavior

| Route | Current methods | Side effects today | API classification |
| --- | --- | --- | --- |
| `/api/people/[id]/raw` | GET | May generate `raw-document.md`, upsert a Convex `documents` row, attach artifact paths to an import run, and refresh research checks | Internal legacy browser workflow |
| `/api/people/[id]/contextualized` | GET | Reads an existing dossier only | Internal legacy browser workflow |
| `/api/people/[id]/contextualized` | POST | Saves `contextualized.md`, upserts a Convex `documents` row, attaches artifact paths, and refreshes research checks | Internal legacy browser workflow |

## Decision

Do not treat these routes as supported read-only agent APIs yet.

The preferred future split is:

- `GET /api/people/[id]/raw`: read existing generated raw document only.
- `POST /api/people/[id]/raw`: generate and sync raw document explicitly.
- `GET /api/people/[id]/contextualized`: read existing generated dossier only.
- `POST /api/people/[id]/contextualized`: save or regenerate dossier explicitly.

The current GET side effect on raw document generation is acceptable only because it is an internal app/legacy browser flow and is already owner-scoped.

## Agent Guidance

Agents may:

- Use these routes for local/manual verification when working on legacy source-docs flows.
- Update route inventory and capability manifest notes when semantics change.
- Add tests around current behavior before splitting methods.

Agents must not:

- Put these routes into a read-only assistant scope.
- Use raw GET generation as a hidden write action in an autonomous data route.
- Add provider/API ingestion that depends on these routes writing artifacts.

## Verification

Run after changing these routes or their inventory classification:

```bash
pnpm check:api-inventory
pnpm check:protected-routes
pnpm lint
pnpm build
```
