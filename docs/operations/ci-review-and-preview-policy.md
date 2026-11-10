# CI, review, and preview policy

Last updated: 2026-10-14 (Vercel builds only `main` and `preview/*`, per
[Core Philosophy §16.6](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md#166-delivering-changes-localhost-first-then-merge)). Applies while the site is in soft launch (one
owner testing, no outside users). Revisit when real users arrive.

## Why

GitHub Actions minutes cost money, and most of what CI did here was repeated
somewhere else: Vercel already builds every pull request, and every merge ran
the whole suite a second time on `main` for code that had just passed. The
cheapest feedback is a local preview, so the loop now leans on that and keeps
paid checks for the moment a change is about to ship.

## Who covers what

| Layer | Covers | When it runs | Cost |
| --- | --- | --- | --- |
| Local preview (`pnpm preview:local`) | How it looks and feels; owner feedback | Every save | Free |
| Local `pnpm verify` | Typecheck, lint, tests, every contract check, build (the build check for PR branches) | Before an agent pushes | Free |
| Code review | Logic, privacy and trust boundaries, product intent, whether the right test exists | Every PR before merge | Free |
| Vercel preview build | `next build` succeeds (and the Convex preview deploy, when a preview key is set) | Pushes to `preview/*` branches only, except docs-only | Vercel build minutes |
| GitHub CI (`.github/workflows/ci.yml`) | `pnpm verify` without the build | Ready (non-draft) PR pushes, or by hand | GitHub minutes, about 1 minute a run |
| Vercel production build | Convex deploy then build, on merge | Every merge to `main`, except docs-only | Vercel build minutes |

## The rules

1. **GitHub CI runs only on ready pull requests.** Drafts skip it. Marking a
   PR ready, pushing to a ready PR, or running the workflow by hand triggers it.
   A newer push cancels the older run.
   Docs-only PRs (`docs/`, `.claude/`, top-level Markdown) pass the required
   `build-and-smoke` check after a path check, without installing or verifying;
   `eslint` ignores `docs/**` so archived scripts there cannot break `main`.
2. **No CI on `main`.** The merged commit already passed on its PR.
3. **CI does not build or start the app.** Local `pnpm verify` is the build
   check for ordinary PR branches; Vercel builds only `main` and `preview/*`
   (push to `preview/<name>` when someone wants a hosted link). The route
   smoke test moved to the local preview.
4. **Other branches and docs-only changes do not build on Vercel.**
   `scripts/vercel-ignore-build.mjs` skips any non-production ref not named
   `preview/*`. For `main` and `preview/*`, if every changed path since the
   last successful deployment is under `docs/`, `.claude/`, or a top-level
   Markdown file, it also skips the build after the tracker and philosophy
   validators pass. Anything else builds.
5. **Agents iterate locally and push in batches.** Run `pnpm verify` before
   pushing, keep the PR a draft while iterating, and mark it ready once.

### Where CI runs

The `build-and-smoke` job runs on Scott's Mac mini (self-hosted runner
`minijarv-familyhistory`, label `mini`) while the repo variable `CI_RUNNER` is
`mini`, so it uses no GitHub minutes. To fall back to GitHub's machines, run
`gh variable delete CI_RUNNER -R scottjarvie/AssistWithFamilyHistory` and
re-run the check.

Before this change (2026-10-06): every PR push and every merge ran install,
the full suite, a production build, and a route smoke test, about 2 to 2.5
minutes each, so a typical one-push PR cost about 4.5 minutes and a docs-only
PR cost the same. After: about 1 minute for a code PR, nothing for drafts or
for the duplicate run on `main`.

## Reusable version for sibling sites

Copy this to any Assist With site in soft launch, adapting names and commands:

- **Local first.** Give the repo a one-command local preview (`pnpm
  preview:local` or equal) that runs against a throwaway local backend with
  sign-in off, and a short plain-language how-to. Feedback rounds happen there,
  not on deploys.
- **One GitHub job, ready PRs only.** `on: pull_request` with types
  `[opened, reopened, synchronize, ready_for_review]`, `if: draft == false`,
  plus `workflow_dispatch`. No `push: main` trigger. `cancel-in-progress: true`.
  Keep the existing job id if a branch rule names it.
- **Let Vercel own the build.** CI runs typecheck, lint, unit tests, and fast
  contract checks; it does not run `next build`, start a server, or run
  Playwright by default. Browser tests run locally or by hand.
- **Skip docs-only builds on Vercel** with an `ignoreCommand` that diffs
  `VERCEL_GIT_PREVIOUS_SHA..VERCEL_GIT_COMMIT_SHA` and skips only when every
  path is documentation. Fail toward building when unsure.
- **Agents verify locally before pushing**, push in batches, and mark the PR
  ready once.
- **Add checks back only for a named risk**: a real incident, a launch gate, or
  real users arriving. Mature products with real users (PeakD, PeakMonsters,
  HiveHub) keep their stricter pipelines.
