# Agent Operating Rules

This repo builds Assist With Family History, a FamilySearch-first family history vault, research operations queue, and story-writing workflow. Treat genealogy data as private by default, especially living people, memories, notes, and raw imported artifacts.

This project follows the repository-owned Assist tracker operating standard in
[`docs/tracker/GUIDE.md`](docs/tracker/GUIDE.md). Historical Linear references
may remain as provenance, but Linear is not a current routing or authorization
dependency and must not block work.

## Start Here

1. Read the [tracker Guide](docs/tracker/GUIDE.md), generated
   [tracker board](docs/tracker/board.html), relevant Cards, and Ready/Active
   Work Orders before inventing work. Cards and Work Orders carry current
   priorities, blockers, approved scope, evidence, and handoff truth.
2. Read the stable repo docs for architecture and verification:
   - [`Assist With Family History Project Philosophy`](docs/planning/assist-with-family-history-project-philosophy.md) — canonical product purpose, domain language, responsibility split, design character, truth boundaries, and family-Core alignment
   - `docs/README.md`
   - `docs/operations/agent-handoff-runbook.md`
   - `docs/operations/product-health-gates.md`
   - `docs/importing/familysearch-capture-storage-map.md`
   - `docs/importing/familysearch-source-capture-runbook.md`
3. Inspect the code and existing tests before asking implementation questions.

## Autonomous Mode

When asked to work autonomously, follow a Ready or Active Work Order. If no
approved order covers the request, record verified intake as Cards and propose a
bounded Work Order for Scott's scope approval. Group work by product surface,
dependency, workflow, refactor path, verification need, or release goal. Do not
stop after one tiny task unless there is a real blocker or stopping point.

As you work:

- Move relevant Cards to `doing` only while actively executing approved scope.
- Clarify Card truth, constraints, next safe action, and completion evidence when
  the repository reveals missing detail.
- Create follow-up Cards or Proposed Work Orders for real remaining work instead
  of burying TODOs in prose.
- Leave dated verification evidence before marking Cards `done`.
- Prefer repo patterns over new abstractions.

## Escalation Rules

Answer technical questions from the repo, tracker, docs, tests, and provider
evidence first. Ask the PM only when the answer materially changes product
direction, UX taste, risk tolerance, production access, main-dev/backend
ownership, or another decision that cannot be safely inferred.

When you do ask, explain the technical question in plain language and state the tradeoff.

## Privacy Defaults

- Keep imported raw FamilySearch artifacts and memory/media details private until reviewed.
- Do not publish living-person details, private notes, sensitive relationship claims, or unresolved provisional relatives.
- Treat AI handoff packets as private operational material.
- Keep browser capture user-mediated unless approved FamilySearch API access and scopes exist.

## Verification Baseline

Use the smallest meaningful verification for the route. For a full check the single command is:

- `pnpm verify` — runs typecheck, lint, test, every `check:*` contract, and the production build in one pass. ~24s. Logs at `/tmp/awf-verify-*.log` per step if anything fails.

For targeted work pick from:

- `pnpm typecheck` — TypeScript only (`tsc --noEmit`), faster than `pnpm build`
- `pnpm lint`
- `pnpm test` — vault core + context-gate tests + import regression
- `pnpm build` — full Next.js build (also runs typecheck)
- targeted contracts such as `pnpm check:familysearch-capture`, `pnpm check:capture-validation`, `pnpm check:operations-handoff`, `pnpm check:agent-quality-gates`, `pnpm check:context-pack-contract`, or `pnpm check:place-era-packs`
- `BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes` after starting the local app

For UI work, run browser checks on desktop and mobile breakpoints where relevant, inspect console errors, and note what changed visually.

`pnpm verify` deliberately excludes the one browser check this repo owns, because
it must stay runnable on a fresh clone with no browser binary installed. Run it
yourself after touching the tracker board, its generator, or its Cards and Work
Orders:

- `pnpm tracker:verify-browser` — 6 Playwright checks of the generated board's
  reordering behavior. Needs Chromium: `pnpm exec playwright install chromium`.

CI runs it on every full-scope pull request, so it can no longer fail silently.

## State Publication Boundary

Tracker and Project Philosophy content may use the narrow state path only after
`pnpm tracker:commit-state --check` accepts the staged index. The exact state
paths, local validators, required `skip-checks: true` trailer, trusted-owner
direct-main rule, GitHub lightweight path, and Vercel ignored-build behavior are
documented in [`docs/tracker/GUIDE.md`](docs/tracker/GUIDE.md).

Application code, schemas, generators, validators, workflows, dependencies,
instructions, repository/build/deployment configuration, mixed changes,
renames, malformed changes, and any uncertain change always use a normal branch,
pull request, full CI, and deployment proof.

## Final Reporting

At a meaningful stopping point, report:

- Completed Cards/Work Orders and meaningful code/product changes.
- Verification run and results.
- UI routes or preview links to inspect, including desktop/mobile notes when relevant.
- New or updated Cards and Work Orders, including separate audit state.
- Residual risks or blockers.
- The next long route to take if continuing.
