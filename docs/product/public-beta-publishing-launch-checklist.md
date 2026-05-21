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
