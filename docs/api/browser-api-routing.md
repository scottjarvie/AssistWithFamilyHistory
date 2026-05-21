# Browser Tool And API Routing

Last updated: 2026-05-21

## Purpose

This document tells agents which environment to use for core Discover Their Stories workflows.

The project intentionally uses both browser-led workflows and internal APIs. Do not force every workflow into an API route, and do not use browser automation as a workaround for missing provider approval or missing safety gates.

## Routing Table

| Workflow | Route / surface | Best environment now | Future API parity | Notes |
| --- | --- | --- | --- | --- |
| FamilySearch source capture | Chrome extension on FamilySearch source pages | Desktop/browser session with user initiation | Browser-only until provider API approval | No broad unattended crawling, no aggressive pacing, no hidden background capture |
| Capture package import | `/app/imports`, `/api/import` | Local app/repo; browser for UI QA | Future import-agent candidate | Import only user-provided capture packages for now |
| Vault people explorer | `/app/people`, `/api/convex/people` | Browser or local API read | Future read-only assistant candidate | Owner-scoped private data |
| Person workspace | `/app/people/[personId]`, related APIs | Browser for full UX; API for selected reads | Future read-only/context-pack candidate | Context pack is likely the best first agent-facing read surface |
| Raw/contextualized documents | `/app/people/[id]/raw`, `/app/people/[id]/contextualized`, legacy APIs | Browser/internal only | Research-needed | Legacy routes blur read/write semantics; see `GEN-40` |
| Context pack export | `/api/people/[id]/context-pack` | Local API read or browser | Strong future agent candidate | Needs provenance and weak-claim clarity before broad support |
| Operations queue read | `/app/operations`, `/api/operations/queue`, `/api/operations/queue?format=handoff` | Browser or local API read | Future read-only/handoff candidate | Handoff export is internal/private and owner-scoped |
| Research checks/tasks | `/api/operations/checks`, `/api/operations/tasks` | Browser/internal API only | Future research-operator candidate | Needs `GEN-38` runbook and quality gates |
| Provisional relative promote/merge | `/api/operations/provisional` | Browser with human review | Trusted-operator only, later | Requires explicit human review confirmation |
| Story draft save | Story Writer UI, `/api/people/[id]/stories` | Browser/internal API | Future story-writer candidate | Draft save is lower risk than publish, but still owner-scoped |
| Story edit/status | `/app/stories/[storyId]`, `/api/stories/*` | Browser/internal API | Future story-writer/trusted-operator candidate | Publish status requires explicit human review confirmation |
| Public story view | `/stories/[id]` | Public browser route | Public read route, not private API | Only published stories should render |
| AI prompt processing | `/api/process` | Internal utility only | Research-needed | High privacy/abuse risk if externalized |

## Agent Environment Rules

Use local repo access for:

- code changes;
- API inventory updates;
- tests, route checks, and build verification;
- docs and runbooks;
- capture-package validation/import logic.

Use browser/desktop access for:

- FamilySearch source capture;
- extension loading and verification;
- visual QA;
- public/private story publish flow checks;
- workflows that depend on signed-in browser state.

Use API/internal route calls for:

- route classification;
- owner-scoped read checks;
- smoke tests;
- future context-pack and operations-queue handoff work after gates are defined.

Use PM review for:

- anonymous guest vault policy;
- public beta auth posture;
- story publishing safety tradeoffs;
- collaboration/sharing model;
- direct provider/API integration strategy.

## Current Policy

FamilySearch capture remains browser/desktop and user-initiated while FamilySearch API access is pending.

The API should become a first-class product surface over time, but the first API work is classification and guardrails, not broad externalization.

Operations queue writes, provisional merges, story publish actions, and AI prompt processing need stronger review gates before any agent-facing API claim.

## Next API Artifacts

Do not build a full API Center yet. The next useful artifacts are:

1. Keep `docs/api/route-inventory.md` complete.
2. Keep `docs/api/capability-manifest.json` synchronized with every API route.
3. Decide `/me`, `/capabilities`, `/openapi`, and `/usage` only after owner/anonymous policy and route classifications are accepted.
