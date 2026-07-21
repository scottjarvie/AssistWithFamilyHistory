# Data-First Story Workflow Tester Checklist

Use this checklist after `pnpm lint`, `pnpm build`, and `pnpm exec convex dev --once` pass.

## Vault Data

- Open `/app/audit` and confirm Convex counts load.
- Confirm the audit separates genealogy gaps from context research gaps.
- Run `VAULT_OWNER_ID=<matching-clerk-subject> CONVEX_AUTH_TOKEN=<short-lived-convex-template-jwt> pnpm tsx scripts/audit-vault.ts` and compare the terminal summary to `/app/audit`.
- Add or confirm at least one historical/context report for a real place.

## Context Reports

- Open `/app/places/[placeId]`.
- Add a context report with title, topic, year range, report text, and sources.
- Confirm the report appears in the place workspace.
- Confirm the same report appears in linked person context coverage when the person overlaps the place and years.

## Story Flow

- Open Story Writer from a person marked ready to draft or ready to review.
- Save a story draft.
- Open `/app/stories/[storyId]`.
- Edit title/content/tags and save.
- Confirm publish warnings remain visible.
- Mark the story ready for review.
- Publish intentionally.
- Open `/stories/[id]` and confirm the story, evidence, relationships, places, memories, and context sections render.
- Unpublish back to review.

## Route QA

- `/app`
- `/app/audit`
- `/app/operations`
- `/app/people`
- `/app/people/[personId]`
- `/app/places/[placeId]`
- `/app/stories`
- `/app/stories/[storyId]`
- `/stories/[id]`
- unpublished or invalid public stories return not found.

## Mobile QA

- Homepage
- App dashboard
- Person overview
- Story Studio index
- Story review page
- Public story page
