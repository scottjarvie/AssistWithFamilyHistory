# Pinned deploy source — AWF-WO-011 production release

One job: name the exact commit Codex deploys, and the exact worktree that holds
it. Read with `docs/operations/bring-your-ai-provider-actions.md` item 0.

```
PINNED_SHA=78dd1a50663d271bc00f8658bb6548ac1e5ef6e4
DEPLOY=/Users/scottjarvie/IDE/AssistWithFamilyHistory/.claude/worktrees/deploy-78dd1a5
```

That worktree already exists on disk with `pnpm install --frozen-lockfile`
completed, so Codex can `cd` into it and start at item 0b.

## THE PIN IS STALE AS OF 2026-08-17 — read this before deploying

**`origin/main` has grown application, Convex, and schema changes since
`78dd1a5`.** The tolerance described below no longer holds, and the confirm
step will correctly refuse.

PR #61 (`1b7d9e9`, "Let a chosen AI read the scanned record, not only its
title") landed AWF-0045: real media evidence bytes. Deploying `78dd1a5` would
ship the chosen-AI connection with `family_history_get_evidence` still returning
`BYTES_NOT_AVAILABLE` for every image and recording — that is, without the thing
family history research actually runs on.

What #61 changed, for the deploy decision:

- **Schema: additive only.** `media.storageId` (optional `Id<"_storage">`) and
  `media.sizeBytes` (optional number). Nothing removed, renamed, or newly
  required; existing rows stay valid with no migration.
- **Convex:** `vaultMutations.startMediaUpload`, `vaultMutations.attachMediaFile`,
  `vault.getOwnedMediaFile`, `vaultReads.getOwnedMediaFile`, and stored-byte
  delivery in `mcpEvidence` / `httpRoutes/mcp`.
- **Next:** `POST /api/media/upload`, `GET /api/media/[mediaId]/file`.
- **No new environment variable or secret.** Bytes go to Convex file storage,
  which is private by construction and needs no configuration. The Convex/Vercel
  environment split in the runbook is unchanged.
- `pnpm verify` passes all 56 steps on `1b7d9e9`; head CI on #61 was green.

**Codex owns this decision.** The recommendation is to re-pin to `1b7d9e9` (or
whatever `origin/main` is when you start) and create a fresh deploy worktree,
because the media-bytes work is part of the same AWF-WO-011 outcome and adds no
deploy-time configuration. If you re-pin, rewrite the `PINNED_SHA` and `DEPLOY`
block above, re-run the confirm step, and delete the now-stale
`deploy-78dd1a5` worktree so nobody deploys it by muscle memory.

## Why the original pin was not simply `origin/main`

`78dd1a5` is the commit that made this release deployable. At the time this file
was written, the only commit after it added *this file* and a `.gitignore` line —
no application code, no Convex function, no schema — so `origin/main` was one
docs commit ahead of the pin by design, and that was the one difference the check
below tolerated. That is no longer the situation; see the section above.

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
