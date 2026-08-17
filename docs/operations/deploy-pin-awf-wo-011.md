# Pinned deploy source — AWF-WO-011 production release

One job: name the exact commit Codex deploys, and the exact worktree that holds
it. Read with `docs/operations/bring-your-ai-provider-actions.md` item 0.

**Pinned SHA:** _recorded immediately after the readiness PR merged — see the
line below._

**Deploy worktree:** `/Users/scottjarvie/IDE/AssistWithFamilyHistory/.claude/worktrees/deploy-<sha7>`

```
PINNED_SHA=<recorded after merge>
```

Confirm before deploying anything:

```bash
MAIN=/Users/scottjarvie/IDE/AssistWithFamilyHistory
DEPLOY="$MAIN/.claude/worktrees/deploy-${PINNED_SHA:0:7}"
git -C "$MAIN" fetch origin
git -C "$MAIN" rev-parse origin/main     # must equal $PINNED_SHA
git -C "$DEPLOY" rev-parse HEAD          # must equal $PINNED_SHA
git -C "$DEPLOY" status --porcelain      # must be empty
```

If `origin/main` has moved past the pinned SHA, do not silently deploy the newer
commit. Re-read what landed, decide deliberately, and re-pin here.

Never deploy from `/Users/scottjarvie/IDE/AssistWithFamilyHistory` itself. It is
a working checkout and can drift.
