# Agent Workflow

Linear is the source of active work. Repo docs are the source of stable architecture, verification commands, and privacy rules.

## Route Model

A route is a connected sequence of issues that belong together by product surface, dependency, workflow, refactor path, verification need, or release goal. For serious autonomous work, choose a route, execute a substantial block, verify it, update Linear, and continue until a real stopping point.

Good route examples:

- FamilySearch capture readiness: extension drift, capture validation, import regression, storage contract, pilot queue.
- Research operations handoff: operations queue, context packs, research checks, provisional relatives, agent exports.
- Public publishing safety: story review gates, living-person checks, privacy sweep, API scopes.

## Linear Hygiene

- Start by inspecting Linear issues, projects, labels, blockers, and recent comments.
- Move issues to `In Progress` when actively changing code or docs for them.
- Add acceptance criteria if an issue is actionable but underspecified.
- Add environment-routing labels when missing:
  - `env:local-required`
  - `env:desktop-required`
  - `needs:browser`
  - `verification-required`
- Use risk and area labels to make routing obvious:
  - `risk:privacy`, `risk:data-integrity`, `risk:abuse`
  - `area:intake`, `area:vault`, `area:research-ops`, `area:story-studio`, `area:ai`, `area:security`
  - `work:feature`, `work:hardening`, `work:docs`, `work:qa`, `work:planning`
- If a `dts:*` label appears in the shared operating standard, treat it as a high-level Discover Their Stories route namespace and keep the existing `area:*`, `risk:*`, and `env:*` labels for execution details.
- Leave verification notes before moving issues to `Done`.

## Repo Docs Versus Linear

Do not duplicate long Linear issue text in the repo. Use repo docs for stable contracts:

- architecture and data boundaries;
- runbooks and checklists;
- API and browser routing;
- privacy and safety rules;
- verification commands.

Use Linear for:

- active priorities;
- route plans;
- issue status;
- acceptance criteria;
- follow-up work;
- verification notes tied to specific issues.

## Escalation

Agents should answer implementation questions from code, docs, tests, and Linear. Ask the PM only for product direction, UX taste, production access, risk tolerance, or ownership decisions. When asking, explain what the decision controls and what will happen if each option is chosen.
