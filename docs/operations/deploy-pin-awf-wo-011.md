# Pinned deploy source — AWF-WO-011 production release

One job: name the exact commit Codex deploys, and the exact worktree that holds
it. Read with `docs/operations/bring-your-ai-provider-actions.md` item 0.

```
PINNED_SHA=3e3484eb5ff8485af2e1894b3c6a5a4e2d599880
DEPLOY=/Users/scottjarvie/IDE/AssistWithFamilyHistory/.claude/worktrees/deploy-3e3484e
```

That worktree already exists on disk with `pnpm install --frozen-lockfile`
completed, is clean, carries no `.env.local`, and passes **all 57 `pnpm verify`
steps** — so Codex can `cd` into it and go straight to item 0e.

## This pin is current as of 2026-08-17

`3e3484e` is the merge of PR #64, which cleared the release blocker. Before it,
`origin/main` was **not deployable at all**: every production build since PR #58
failed inside the Vercel build's own `convex deploy` step on three TypeScript
errors in `convex/mcpGrants.ts`, and production stayed on `862a224` (PR #57).

What PR #64 changed, for the deploy decision:

- **Schema: nothing.** No table, field, or index changed. The additive delta
  production receives is still exactly the one described in the runbook's 0d.
- **Convex:** `convex/mcpGrants.ts` gained explicit return types on its two
  actions and moved two read bodies into plain helpers. Pure code motion — the
  grant model, per-request re-resolution, consent snapshot, record boundaries and
  scope enforcement are byte-identical. `convex/_generated/*` was regenerated
  against the **dev** deployment and committed.
- **Gate:** a new `check:convex-bindings-fresh` step proves the checked-in Convex
  bindings match the modules on disk, which makes `pnpm verify` reproduce the
  `convex deploy` typecheck it previously could not see. Step count 56 → 57.
- **No new environment variable or secret.** The Convex/Vercel environment split
  in the runbook is unchanged.

## Previous pins, and why they are gone

- `78dd1a5` — the original pin. Superseded by the media-bytes work in PR #61 and
  then by the build blocker; never deployable.
- `2d25eb6` — a later pin whose worktree has been **removed**, both because it
  predates the build fix and because it did not contain media bytes. If you find
  a `deploy-2d25eb6` directory, it is stale; do not deploy it.

Only `deploy-3e3484e` should exist. Confirm with
`git -C /Users/scottjarvie/IDE/AssistWithFamilyHistory worktree list`.

## Confirm before deploying anything

```bash
MAIN=/Users/scottjarvie/IDE/AssistWithFamilyHistory
PINNED_SHA=3e3484eb5ff8485af2e1894b3c6a5a4e2d599880
DEPLOY="$MAIN/.claude/worktrees/deploy-${PINNED_SHA:0:7}"

git -C "$MAIN" fetch origin
git -C "$DEPLOY" rev-parse HEAD                      # must equal $PINNED_SHA
git -C "$DEPLOY" status --porcelain                  # must be empty

# Must print nothing. Any path means main has moved on and this pin is stale —
# stop and re-pin deliberately.
git -C "$MAIN" diff --name-only "$PINNED_SHA" origin/main
```

If `origin/main` has grown application, Convex, or schema changes since the pin,
do not silently deploy either commit. Read what landed, decide, and rewrite this
file with the new SHA and a fresh worktree.

## Rules that do not bend

- Never deploy from `/Users/scottjarvie/IDE/AssistWithFamilyHistory` itself. It
  is a working checkout and can drift.
- Keep the deploy worktree free of `.env.local`. See the `CONVEX_DEPLOY_KEY`
  warning in the runbook's item 0a.
- One deploy act: publish the pinned worktree to Vercel Production. The build
  wrapper deploys Convex first. Do not also run `convex deploy` by hand.
- Any `convex` command you do run must name its deployment explicitly. A bare
  `convex deploy --dry-run` resolves to `gallant-mallard-74`, an unrelated
  personal project, and still offers to push to it. See the runbook's §0·0.
