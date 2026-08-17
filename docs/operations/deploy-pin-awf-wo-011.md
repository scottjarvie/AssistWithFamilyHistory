# Pinned deploy source — AWF-WO-011 production release

One job: name the exact commit Codex deploys, and the exact worktree that holds
it. Read with `docs/operations/bring-your-ai-provider-actions.md` item 0.

```
PINNED_SHA=78dd1a50663d271bc00f8658bb6548ac1e5ef6e4
DEPLOY=/Users/scottjarvie/IDE/AssistWithFamilyHistory/.claude/worktrees/deploy-78dd1a5
```

That worktree already exists on disk with `pnpm install --frozen-lockfile`
completed, so Codex can `cd` into it and start at item 0b.

## Why the pin is not simply `origin/main`

`78dd1a5` is the commit that made this release deployable. The only commit after
it is the one that added *this file* and a `.gitignore` line — no application
code, no Convex function, no schema. So `origin/main` is one docs commit ahead of
the pin by design, and that is the one difference the check below tolerates.

## Confirm before deploying anything

```bash
MAIN=/Users/scottjarvie/IDE/AssistWithFamilyHistory
PINNED_SHA=78dd1a50663d271bc00f8658bb6548ac1e5ef6e4
DEPLOY="$MAIN/.claude/worktrees/deploy-${PINNED_SHA:0:7}"

git -C "$MAIN" fetch origin
git -C "$DEPLOY" rev-parse HEAD                      # must equal $PINNED_SHA
git -C "$DEPLOY" status --porcelain                  # must be empty

# Must list ONLY docs/ and .gitignore. Any other path means main has moved on
# and this pin is stale — stop and re-pin deliberately.
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
