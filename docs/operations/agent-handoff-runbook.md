# Agent Operations And Handoff Runbook

> **Two distinct handoffs:** `/api/operations/queue` below is the existing
> evidence-readiness export. The product Queue backend is defined in
> [`queue-foundation-design-handoff.md`](../product/queue-foundation-design-handoff.md)
> and uses `queueItems` plus exactly Needs You / Working / Waiting for your AI /
> Done. Neither surface is a live MCP connection. Incoming chosen-AI identity
> remains blocked until the credential-resolution boundary is implemented and
> proven.

This project can use agents for meaningful work, but the operations surface should decide what agents are allowed to do instead of letting each agent infer it from the UI.

## Current Safe Order

1. Read queue, row handoff exports, and context packs.
2. Validate capture packages and import warnings.
3. Draft research tasks and check recommendations.
4. Mark research checks only when evidence and notes are explicit.
5. Prepare story drafts for review.
6. Leave provisional relative promotion, merges, and publish actions for human review until stronger gates exist.

## Agent-Ready Surfaces

- Product Queue internal tool contract: bounded list/read plus assigned-actor
  claim, checkpoint, exact user question, and completion. These tools are
  source-complete but intentionally not exposed to external clients yet.

- `/api/operations/queue`: read-only queue and filters.
- `/api/operations/queue?format=handoff`: compact JSON handoff packet with recommended agent type, review level, prompt, routes, and reason per row.
- `/app/operations`: each row exposes a copyable handoff with routes, evidence counts, missing checks, next actions, and review rule.
- `/api/people/[id]/context-pack`: read-only person context package with evidence trace, story-claim readiness, open checks, context gaps, sources, and unresolved import warnings.
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

When a human operator does promote or merge a provisional relative through the app, the API requires an explicit review note and writes a research-log entry against the resolved canonical person.

## Handoff Packet

When an agent finishes a queue row, it should leave:

- Person or provisional row identifier.
- Exact checks touched.
- Evidence reviewed.
- Any sources or memories that failed extraction.
- Open questions.
- Verification command or browser flow used.
- Whether the next action is human review, another agent, or product/PM decision.

Context packs should be used as the supporting evidence bundle, not as a final source of truth. They separate source-backed claims, inferred readiness checks, generated/stored story text, and open questions so the next agent can see which claims are supported and which are still weak.

## API Impact

- API parity: current endpoints are internal app APIs, not a stable public API.
- OpenAPI/capability docs: needed before exposing operations writes to external agents.
- Scopes/tiers: likely scopes are read-only assistant, import agent, research operator, story writer, and trusted operator.
- Agent handoff: operations queue plus context pack are the strongest first handoff pair.
- Security/abuse risk: unsafe merges, fabricated check completion, private data leakage, provider scraping, and publish-by-agent are the main risks.

## Verification

For changes to operations handoff or context-pack surface, run the targeted contracts:

```bash
pnpm check:agent-quality-gates
pnpm check:operations-handoff
pnpm check:context-pack-contract
pnpm check:api-inventory
pnpm check:protected-routes
pnpm lint
pnpm typecheck
pnpm build
```

Or run the full repo verification in one command:

```bash
pnpm verify
```
