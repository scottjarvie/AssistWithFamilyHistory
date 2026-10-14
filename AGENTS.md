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
   - [`Site Guide`](docs/planning/site-guide.md) — canonical product direction since 2026-10-06 (edition 2): building blocks, trees, pages, routes, navigation, AI tools, and dated Decisions. Open questions are in `docs/planning/site-guide-content.json`.
   - [`Assist With Family History Project Philosophy`](docs/planning/assist-with-family-history-project-philosophy.md) — reference for trust boundaries, domain language, responsibility split, design character, truth boundaries, and capability-evidence history
   - `docs/README.md`
   - `docs/operations/agent-handoff-runbook.md`
   - `docs/operations/product-health-gates.md`
   - `docs/importing/familysearch-capture-storage-map.md`
   - `docs/importing/familysearch-source-capture-runbook.md`
3. Inspect the code and existing tests before asking implementation questions.

## Autonomous Mode

A direct request from Scott in chat authorizes ordinary work; a Work Order is
optional context, not a gate for it. When asked to work autonomously without a
specific request, follow a Ready or Active Work Order, or record verified intake
as Cards and propose a bounded Work Order for Scott's scope approval. Group work by product surface,
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
direction, UX taste, risk tolerance, or another decision that cannot be safely
inferred. Stop and ask before money/billing, deleting real data, domains/DNS,
secrets, or a change to who can access production data. Merging and deploying
routine work is not a stop (see Delivering Changes).

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

## Delivering Changes

Follow the family rule, [Core Philosophy §16.6](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md#166-delivering-changes-localhost-first-then-merge):
preview on localhost, ship in batches, and the AI merges and deploys routine
work. Scott does not need to press merge.

- Preview locally: `pnpm dev:sandbox` (record-only local backend, synthetic
  records) or `pnpm preview:local`; see
  [local development](docs/operations/local-development.md) and
  [local preview](docs/operations/local-preview.md). `pnpm dev:live` is
  withheld by the launcher until its production binding is verified.
- Run `pnpm verify` (it includes the build) before pushing. Work in progress
  stays a draft PR (drafts run no GitHub CI); mark it ready once.
- Vercel builds `main` and `preview/*` branches only. A production build also
  deploys Convex ([how production deploys](docs/operations/how-production-deploys.md)).
- Close out with where the latest change lives: local only, pushed but not
  live, or live.

Read [`docs/operations/ci-review-and-preview-policy.md`](docs/operations/ci-review-and-preview-policy.md)
before touching `.github/workflows/` or `vercel.json`.

For UI work, run browser checks on desktop and mobile breakpoints where relevant, inspect console errors, and note what changed visually.

## State Publication Boundary

Tracker and Project Philosophy content may use the narrow state path only after
`pnpm tracker:commit-state --check` accepts the staged index. The exact state
paths, local validators, required `skip-checks: true` trailer, trusted-owner
direct-main rule, and Vercel ignored-build behavior are
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
- Where the latest change lives: local only, pushed but not live, or live.
- The next long route to take if continuing.
