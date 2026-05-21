# Agent Operating Instructions

Developers on this project should be highly autonomous. Answer challenging technical questions by inspecting the repo, tests, docs, history, and Linear first. If you must ask the PM, explain what the technical question means in product terms so the PM can make the decision usefully.

This project follows the shared Jarvie Projects operating standards:

- [Start Here: General Agentic Linear Operating Model](https://linear.app/jarvie/document/start-here-general-agentic-linear-operating-model-becfec3938ac)
- [Autonomous Agentic Coding Mode and Route Execution Standard](https://linear.app/jarvie/document/autonomous-agentic-coding-mode-and-route-execution-standard-4f84826a7fed)

## Default Autonomous Coding Mode

When asked to work autonomously, keep going, follow the next route, work through Linear, or do serious work:

- Inspect Linear and repo context before choosing work.
- Group related issues into a meaningful route by product surface, dependency, workflow, refactor path, verification need, or release goal.
- Execute a substantial block of connected work, not one tiny task, unless a real blocker or PM decision prevents continuing.
- Keep moving through the route while related ready work remains.
- Improve Linear while working: clarify issues, add missing acceptance criteria, add routing labels, create useful follow-ups, update states, and leave verification notes.
- Stop to ask only when the answer materially changes product direction, UX taste, risk, production access, main-dev/backend ownership, privacy/security posture, or another real decision.

## Route Execution Expectations

For autonomous work, a route should explain:

- What the full route accomplishes.
- Which Linear issues it touches.
- Why the order makes sense.
- What can be done now.
- What must wait for PM taste, backend/main-dev ownership, production access, or data cleanup.
- What verification is required.

Prefer routes large enough for a serious work session. Do not end with only a proposed next route when the PM asked to keep working.

## Verification Standard

Test heavily and self-correct before reporting success.

For UI/frontend work:

- Run relevant tests, lint, type checks, and builds when available.
- Start the local app or preview when needed.
- Run browser checks through affected routes.
- Inspect console and network errors.
- Check desktop and mobile viewports where relevant.
- Report links/routes the PM can inspect and summarize what changed visually.

For backend/API/tooling work:

- Run relevant unit/integration tests or local smoke checks.
- Verify contracts, auth/scope behavior, logs, error envelopes, permissions, and rollback/no-op behavior where applicable.
- State clearly when verification could not be run and what risk remains.

## Linear Hygiene

Use Linear as the durable operating layer, not a static todo list.

- Prefer `track:current` and `agent-ready` work, then urgent/high priority, blockers, verification/safety/handoff work, and finally `track:next`.
- Avoid starting `pm-review`, `decision-needed`, or taste-heavy `needs-ux` implementation without discovery and a concise decision point.
- Add environment routing labels when useful: `env:desktop-required`, `env:local-required`, and `needs:browser`.
- Leave comments with what changed, what was verified, what remains uncertain, and any follow-up issues.
- Mark work Done only when the issue-specific completion bar and verification notes are satisfied.

## Final Reporting

At a meaningful stopping point, report:

- Completed issues and meaningful code/product changes.
- Verification run and results.
- UI routes or preview links to inspect, including desktop/mobile notes when relevant.
- New or updated Linear issues.
- Residual risks or blockers.
- The next long route to take if continuing.
