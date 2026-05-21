# Story Public Beta Readiness

Last updated: 2026-05-21

## Route Purpose

Public stories are one of the first beta surfaces where private vault material can become public. Treat the story route as a gated workflow, not a simple status toggle.

The current route is:

1. Writer creates or edits a draft.
2. Reviewer moves the story to review after evidence, context, and graph checks are visible.
3. Trusted publisher previews publish gates.
4. Trusted publisher confirms human review and changes status to published.
5. Public page renders only when status is `published`.

## Publish-Blocking Gates

Publishing is blocked when any of these are true:

- no source person is linked;
- no grouped evidence or citations support the draft;
- required research checks are missing, in progress, or need review;
- no historical/local context is attached;
- the person is marked living or is probably living from missing/young date evidence;
- unresolved provisional relatives remain attached to the person;
- the draft is too short to carry grounded public context;
- the story is still in draft rather than review.

Partial place context is a warning, not a blocker, so reviewers can still publish when the public story has at least one context report and the remaining gap is understood.

## API And Scope Notes

- `story_writer`: can create and edit drafts, and can move work toward review.
- `trusted_operator`: required for public publishing.
- `GET /api/stories/[id]/status` returns a side-effect-free publish preview.
- `GET /api/stories/[id]/status?format=handoff` includes a story handoff packet for writer/reviewer/publisher agents.
- `PATCH /api/stories/[id]/status` blocks public publishing unless gates pass and explicit human review confirmation is present.
- No API key, tier, or issued scope model exists yet; these are capability planning terms.

## Verification

Run:

```bash
pnpm check:story-publish
pnpm check:public-story-policy
pnpm check:api-inventory
pnpm check:protected-routes
```

For browser QA, inspect `/app/stories/[storyId]` and verify:

- the draft/review/publish workflow is visible;
- blockers and warnings are understandable without reading logs;
- publish preview shows why work is blocked or ready;
- public `/stories/[id]` renders only after status is published.

## Remaining Beta Blockers

- Decide whether public story pages need owner-controlled sharing settings beyond status.
- Add role-aware credentials before exposing story writer or trusted publisher as API scopes.
- Add audit history for publish preview and publish confirmation.
- Add stronger living-person detection from relationship graph and source data.
- Add reviewer assignment and second-review workflows once multiple operators are active.
