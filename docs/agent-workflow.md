# Agent Workflow

The repository-owned tracker is the source of active project work. Stable docs
remain the source of architecture, verification commands, privacy rules, and
product truth. Provider records prove CI, deployment, and live operation.

Linear is not a current dependency. Historical Linear ids in old reports or
fixtures remain provenance only; agents do not query, update, or wait on Linear
to start, route, verify, or finish work.

## Start Here

1. Read [`docs/tracker/GUIDE.md`](tracker/GUIDE.md).
2. Open the generated [tracker board](tracker/board.html) and inspect Needs
   You, Doing, Next, and Ready/Active Work Orders.
3. Read the full relevant Cards and Work Order Markdown sources.
4. Read the Project Philosophy and stable technical/privacy docs named by the
   task.
5. Inspect current code, tests, Git state, pull requests, deployments, and live
   behavior before changing truth.

## Work Order Model

A Work Order is a connected, bounded sequence of Cards grouped by product
surface, dependency, workflow, refactor path, verification need, or release
goal. Serious autonomous work executes a Ready or Active Work Order, verifies
a substantial outcome, updates durable evidence, and continues until a real
stopping point.

Good route examples:

- FamilySearch capture readiness: extension drift, capture validation, import
  regression, storage contract, pilot queue.
- Research operations handoff: operations queue, context packs, research
  checks, provisional relatives, agent exports.
- Public publishing safety: story review gates, living-person checks, privacy
  sweep, API scopes.

If no Ready/Active Work Order covers a new request, record only verified intake
as Cards and propose the smallest sensible tranche. Scott's Proposed-to-Ready
approval grants bounded scope. There is no automatic dispatch.

## Tracker Hygiene

- Move a Card to `doing` only during active approved execution.
- Keep why it exists, current truth, next safe action, constraints, blockers,
  and completion evidence understandable to a cold-start reader.
- Append dated, attributed history; do not erase earlier truth or invent agent
  identity.
- Create follow-up Cards or Proposed Work Orders for remaining work instead of
  burying TODOs in prose.
- Mark a Card `done` only after outcome evidence exists.
- Keep Work Order execution and independent audit separate.
- Never place living-person data, private notes, memory/media details, raw
  capture artifacts, tokens, or unresolved sensitive claims in this public
  repository tracker.

## Stable Docs Versus Tracker

Use stable repo docs for:

- architecture and data boundaries;
- runbooks and checklists;
- API and browser routing;
- privacy and safety rules;
- product philosophy and capability truth;
- verification commands.

Use Cards and Work Orders for:

- current priorities and approved scope;
- execution status and blockers;
- acceptance and completion evidence;
- follow-up work;
- provider and live-operation receipts;
- cold-start handoff.

## State Versus Software Publication

State is narrowly limited to canonical Cards, Work Orders, Guide, factual
tracker metadata, generated tracker readers, and the canonical Project
Philosophy Markdown/HTML pair. After local validation, Scott's trusted owner
identity may publish only those paths directly to `main` with the final
`skip-checks: true` trailer. GitHub still records a lightweight required check;
Vercel separately ignores the build only when its complete range and validators
agree. See the tracker Guide for the exact command.

Application code, schemas, generators, validators, scripts, workflows,
dependencies, instructions, repository/build/deployment configuration, mixed
changes, renames, malformed input, or uncertain changes use a normal branch,
pull request, full CI, and deployment proof.

## Escalation

Answer implementation questions from code, tracker, docs, tests, provider
records, and live behavior first. Ask Scott only for product direction, UX
taste, production access, risk tolerance, ownership, money, identity, private
data, irreversible changes, or another consequential decision that cannot be
safely inferred. Explain what the decision controls and what each real option
changes.
