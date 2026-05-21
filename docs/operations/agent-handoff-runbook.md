# Agent Operations And Handoff Runbook

This project can use agents for meaningful work, but the operations surface should decide what agents are allowed to do instead of letting each agent infer it from the UI.

## Current Safe Order

1. Read queue and context packs.
2. Validate capture packages and import warnings.
3. Draft research tasks and check recommendations.
4. Mark research checks only when evidence and notes are explicit.
5. Prepare story drafts for review.
6. Leave provisional relative promotion, merges, and publish actions for human review until stronger gates exist.

## Agent-Ready Surfaces

- `/api/operations/queue`: read-only queue and filters.
- `/api/operations/queue?format=handoff`: compact JSON handoff packet with recommended agent type, review level, and reason per row.
- `/api/people/[id]/context-pack`: read-only person context package.
- `/api/import`: future import-agent candidate for user-provided capture packages only.
- `/api/operations/checks`: limited research-check write surface with quality gates for `completionSource: "ai_agent"`.

## Restricted Surfaces

- `/api/operations/provisional`: human/trusted-operator only for now.
- `/api/stories/[id]/status`: publish/review status changes need story safety and provenance gates first.
- FamilySearch browser capture: user-mediated only; no unattended crawling while provider API access is pending.
- AI processing routes: internal until cost, provenance, and abuse controls are clearer.

## Research Check Quality Gate

Agent-sourced check writes must include:

- Summary of at least 20 characters.
- Notes of at least 20 characters describing reviewed evidence.
- Confidence of at least `0.7` for `complete`.
- Longer notes for `not_applicable` decisions.

This keeps the operations queue useful as a handoff surface: a human can see what the agent concluded, why it concluded it, and which checks still require review.

## Human Review Gates

These actions require explicit human review confirmation at the API layer:

- provisional relative promote;
- provisional relative merge;
- public story publish.

Agents may prepare recommendations, evidence summaries, and handoff packets for these actions, but they should not execute the final state change without a human operator.

## Handoff Packet

When an agent finishes a queue row, it should leave:

- Person or provisional row identifier.
- Exact checks touched.
- Evidence reviewed.
- Any sources or memories that failed extraction.
- Open questions.
- Verification command or browser flow used.
- Whether the next action is human review, another agent, or product/PM decision.

## API Impact

- API parity: current endpoints are internal app APIs, not a stable public API.
- OpenAPI/capability docs: needed before exposing operations writes to external agents.
- Scopes/tiers: likely scopes are read-only assistant, import agent, research operator, story writer, and trusted operator.
- Agent handoff: operations queue plus context pack are the strongest first handoff pair.
- Security/abuse risk: unsafe merges, fabricated check completion, private data leakage, provider scraping, and publish-by-agent are the main risks.

## Verification

Run:

```bash
pnpm check:agent-quality-gates
pnpm check:api-inventory
pnpm check:protected-routes
pnpm lint
pnpm build
```
