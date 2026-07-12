# Public Beta Publishing Launch Checklist

This checklist tracks the last blockers before public story publishing can move from internal beta to wider beta use.

## URL And Share Readiness

- Readable public story slugs are stored on story records.
- Existing ID routes remain backward-compatible and redirect to canonical slugs.
- Public metadata and Open Graph images use only published story data.
- `publicIndexing` defaults to `noindex`; `index` is an explicit per-story decision.

## Trust And Review Readiness

- Publish preview snapshots are written to review history.
- Publisher confirmation notes are stored in audit history.
- Review history is filterable and exposes snapshot details.
- High-risk stories can require second approval before publishing.
- Rollback from published back to review is tested.

## Privacy Readiness

- Convex itself permits anonymous reads only for published stories and applies
  the server-side redacted public DTO.
- Convex itself recomputes publish readiness before a published status write;
  the API route is defense in depth.
- Living/private-risk detection covers missing death dates, modern relatives, private notes, and young-family edge cases.
- Production-data privacy sweep checklist is complete for pilot stories.
- Takedown/support routing is confirmed before broader sharing.

## Agent And API Readiness

- `story_writer` can draft, edit, request review, and preview gates, but cannot publish.
- `trusted_publisher` can publish only after gates and human confirmation pass.
- OpenAPI/capability docs explain story actions and authority boundaries.
- Issued API keys/scopes are not required for first-party beta publishing.
- Issued API keys/scopes should be created before external agents or partner automations can act outside the browser session.

## Beta Decision

Recommended current policy: launch beta with status-only sharing and `noindex` by default. Add search indexing story-by-story after a documented privacy sweep and reviewer approval.

## Latest QA Pass

See `docs/operations/public-beta-launch-qa-report.md` for the 2026-05-21 local-dev real-story QA pass covering slug redirects, public metadata, Open Graph image generation, review history, second approval, trusted publisher publish, and rollback to review.

## Repeatable Agent Harness

The repo-backed harness now tracks this launch route across:

- GEN-3: fixture data for publishable, weak, living-risk, private-note, unresolved-relative, and missing-context story paths.
- GEN-48: this checklist and final privacy sweep.
- GEN-18: slug, redirect, metadata, Open Graph, and `noindex` checks.
- GEN-44: review assignment, publish-preview snapshot, publisher note, second approval, and rollback history checks.
- GEN-47: living/private-risk blockers from source person, graph, source, note, and event evidence.
- GEN-46: story writer, reviewer, and trusted publisher capability/OpenAPI skeleton.
- GEN-23: endpoint-and-data-surface privacy/security sweep.
- GEN-45: status-only sharing plus `noindex` default.
- GEN-19: lightweight review history unless fixture rollback tests prove full versioning is needed.

Run the repeatable local checks before any broader beta publish pass:

```bash
pnpm check:story-fixtures
pnpm check:story-publish
pnpm check:story-slugs
pnpm check:public-story-e2e
pnpm check:story-capabilities
pnpm check:api-inventory
pnpm check:protected-routes
pnpm check:public-beta-launch
pnpm check:trust-boundary
pnpm check:convex-client-auth
```

Use `tests/fixtures/stories/manifest.json` as the source of truth for the fixture scenarios agents should exercise. Do not rely on a manually prepared dev vault when a fixture-backed check can cover the same risk.
