# Story Public Beta Readiness

Last updated: 2026-07-12

## Route Purpose

Public stories are one of the first beta surfaces where private vault material can become public. Treat the story route as a gated workflow, not a simple status toggle.

The current route is:

1. Writer creates or edits a draft.
2. Reviewer moves the story to review after evidence, context, and graph checks are visible.
3. Trusted publisher previews publish gates.
4. Trusted publisher confirms human review and changes status to published.
5. Public page renders only when status is `published`, using the canonical readable slug when available.

The Convex mutation independently recomputes the publish gates and records the
confirmation. The anonymous Convex read independently checks published status
and returns a server-redacted allowlist. API-route checks remain for useful UX,
but are not the publication security boundary.

## Publish-Blocking Gates

Publishing is blocked when any of these are true:

- no source person is linked;
- no grouped evidence or citations support the draft;
- required research checks are missing, in progress, or need review;
- no historical/local context is attached;
- the person is marked living or is probably living from missing/young date evidence;
- related people, recent events, private notes/tags, or modern/private sources create living-family risk;
- unresolved provisional relatives remain attached to the person;
- the draft is too short to carry grounded public context;
- the story is still in draft rather than review;
- second approval is required and has not been marked complete.

Partial place context is a warning, not a blocker, so reviewers can still publish when the public story has at least one context report and the remaining gap is understood.

## API And Scope Notes

- `story_writer`: can create and edit drafts, and can move work toward review.
- `trusted_operator`: required for public publishing.
- `GET /api/stories/[id]/status` returns publish preview.
- `GET /api/stories/[id]/status?format=handoff` includes a story handoff packet for writer/reviewer/publisher agents.
- `GET /api/stories/[id]/status?record=true` stores a publish-preview audit snapshot.
- `PATCH /api/stories/[id]/review` assigns a reviewer, can require second approval, and records an assignment event.
- `PATCH /api/stories/[id]/status` blocks public publishing unless gates pass and explicit human review confirmation is present.
- `GET /api/capabilities` tells agents what story actions the current role can perform.
- Explicit `story_writer` actors can draft, edit, request review, and preview publish gates, but cannot publish public stories.
- No API key, tier, or issued scope model exists yet; role checks are internal request-level authority checks.
- `docs/api/story-agent-openapi-skeleton.yaml` is the current OpenAPI planning skeleton for story agents. Treat it as a capability contract draft, not as an external public API.

## Public Sharing Decision For Beta

Public beta stays status-only for now:

- `draft` and `review` stories must 404 publicly.
- `published` stories render publicly.
- Public story URLs use readable slugs, while legacy ID URLs redirect to the canonical slug.
- Story metadata is generated only through the published-story query.
- Public story metadata is `noindex` by default during beta. Set `publicIndexing` to `index` only after a documented privacy sweep.

Do not add unlisted, family-only, comments, or takedown settings before the first beta review pass. If users need more nuance, add a dedicated sharing-settings model after GEN-45 is reviewed.

## Versioning Decision For Beta

Use lightweight review history now, not full draft versioning:

- record publish previews, reviewer assignments, status changes, and publish confirmations;
- include readiness score, blocker/warning counts, actor role, assignment, and human review note;
- defer content diff/restore/version comparison until GEN-19 is explicitly chosen.

## Verification

Run:

```bash
pnpm check:story-fixtures
pnpm check:story-publish
pnpm check:story-slugs
pnpm check:public-story-policy
pnpm check:public-story-e2e
pnpm check:story-capabilities
pnpm check:api-inventory
pnpm check:protected-routes
pnpm check:public-beta-launch
pnpm check:trust-boundary
```

For browser QA, inspect `/app/stories/[storyId]` and verify:

- the draft/review/publish workflow is visible;
- blockers and warnings are understandable without reading logs;
- publish preview shows why work is blocked or ready;
- public `/stories/[id]` renders only after status is published;
- legacy ID URLs redirect to slug URLs for published stories.

## Remaining Beta Blockers

- Run the GEN-23 production-data privacy/security sweep before broad beta.
- Keep role-aware issued credentials out of the first beta unless external agents need direct API access.
- Capture fresh mobile screenshot baselines when the Story Studio review UI changes materially.
- Decide richer sharing controls only after status-only beta sharing is accepted.
