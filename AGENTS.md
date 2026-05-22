# Agent Operating Rules

This repo builds Discover Their Stories, a FamilySearch-first family history vault, research operations queue, and story-writing workflow. Treat genealogy data as private by default, especially living people, memories, notes, and raw imported artifacts.

This project follows the shared Jarvie Projects operating standards:

- [Start Here: General Agentic Linear Operating Model](https://linear.app/jarvie/document/start-here-general-agentic-linear-operating-model-becfec3938ac)
- [Autonomous Agentic Coding Mode and Route Execution Standard](https://linear.app/jarvie/document/autonomous-agentic-coding-mode-and-route-execution-standard-4f84826a7fed)

## Start Here

1. Read Linear before inventing work. Active routes, priorities, labels, blockers, and acceptance criteria live in Linear.
2. Read the stable repo docs for architecture and verification:
   - `docs/README.md`
   - `docs/operations/agent-handoff-runbook.md`
   - `docs/operations/product-health-gates.md`
   - `docs/importing/familysearch-capture-storage-map.md`
   - `docs/importing/familysearch-source-capture-runbook.md`
3. Inspect the code and existing tests before asking implementation questions.

## Autonomous Mode

When asked to work autonomously, follow a route: group related Linear issues by product surface, dependency, workflow, refactor path, verification need, or release goal. Do not stop after one tiny task unless there is a real blocker or a real stopping point.

As you work:

- Move relevant Linear issues into progress.
- Clarify issue descriptions or acceptance criteria when the repo reveals missing detail.
- Create follow-up issues for real remaining work instead of burying TODOs in prose.
- Leave verification notes before marking issues done.
- Prefer repo patterns over new abstractions.

## Escalation Rules

Answer technical questions from the repo, docs, tests, and Linear first. Ask the PM only when the answer materially changes product direction, UX taste, risk tolerance, production access, main-dev/backend ownership, or another decision that cannot be safely inferred.

When you do ask, explain the technical question in plain language and state the tradeoff.

## Privacy Defaults

- Keep imported raw FamilySearch artifacts and memory/media details private until reviewed.
- Do not publish living-person details, private notes, sensitive relationship claims, or unresolved provisional relatives.
- Treat AI handoff packets as private operational material.
- Keep browser capture user-mediated unless approved FamilySearch API access and scopes exist.

## Verification Baseline

Use the smallest meaningful verification for the route, but default to:

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- targeted checks such as `pnpm check:familysearch-capture`, `pnpm check:capture-validation`, `pnpm check:operations-handoff`, or `pnpm check:agent-quality-gates`
- `BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes` after starting the local app

For UI work, run browser checks on desktop and mobile breakpoints where relevant, inspect console errors, and note what changed visually.

## Final Reporting

At a meaningful stopping point, report:

- Completed issues and meaningful code/product changes.
- Verification run and results.
- UI routes or preview links to inspect, including desktop/mobile notes when relevant.
- New or updated Linear issues.
- Residual risks or blockers.
- The next long route to take if continuing.
