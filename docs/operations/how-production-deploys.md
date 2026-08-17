# How production deploys

One fact, and it is the whole document.

**Pushing to `main` deploys production.** Vercel is connected to this
repository's `main` branch and builds every commit on it. The build command is
`scripts/vercel-build.mjs` (wired through `vercel.json`), and when it sees a
`prod:` `CONVEX_DEPLOY_KEY` in a `production` Vercel environment it runs

```
npx --no-install convex deploy --cmd 'npx --no-install next build'
```

so **Convex is deployed first, then the Next.js frontend is built against it.**
That ordering is deliberate: new backend functions and tables exist before any
page can call them. When you merge a pull request into `main`, the release is
already on its way out.

There is nothing else to do. No pinned worktree, no manual `vercel deploy`, no
hand-run `convex deploy`.

## Consequences worth knowing

- **A red Vercel build means production is stale, not that nothing happened.**
  Five production builds failed in a row in August 2026 while `main` looked
  healthy locally, and production quietly sat several commits behind. The
  `check:convex-bindings-fresh` step in `pnpm verify` — deliberately the *first*
  step, immediately before `typecheck` — exists so that class of failure fails on
  the pull request instead of in the Vercel build. Check the build state after a
  merge; do not assume it went out.
- **Never run `convex deploy`, `convex dev`, or `convex codegen` by hand in this
  repository.** `convex deploy` takes no `--prod` flag because it already targets
  production by default, and on a developer machine a bare invocation resolves to
  whatever project the local environment points at. In this repository it
  resolves to `gallant-mallard-74`, an unrelated personal project, and still
  offers to push to it. The production Convex deployment for this product is
  **`accomplished-dodo-308`**; see §0·0 of
  `docs/operations/bring-your-ai-provider-actions.md`.
- **Deployed is not proved.** A green production build proves the code is
  running. It does not prove any AI client can complete a connection lifecycle
  against it. Those are two separate claims and this product keeps them separate:
  the honest residue after a deploy is *awaiting real-client proof*.

## History

The elaborate pinned-worktree deploy runbook that used to live at
`docs/operations/deploy-pin-awf-wo-011.md` is archived at
`docs/archive/2026-08-awf-wo-011-deploy/deploy-pin-awf-wo-011.md`. It was written
during the failed-build period, when it looked as though a deploy had to be
performed by hand. It never did.
