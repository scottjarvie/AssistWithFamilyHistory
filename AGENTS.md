# Agent Operating Rules

A private FamilySearch-first research vault, Queue and story workspace.

## Read first

- [Site Guide](docs/planning/site-guide.md): product, privacy and AI-tool truth. Open questions: `docs/planning/site-guide-content.json`.
- [Tracker Guide](docs/tracker/GUIDE.md) and the open parked Cards
  (`docs/tracker/cards/`, status `backlog`): grouped bugs, minor issues, design
  work, pages not yet on the new design, and features worth building later.
- [How production deploys](docs/operations/how-production-deploys.md) before
  any release.

## Privacy defaults

- Keep imported raw FamilySearch artifacts and memory/media details private until reviewed.
- Never publish living-person details, private notes, sensitive relationship claims or unresolved provisional relatives.
- Treat AI handoff packets as private operational material.
- Browser capture stays user-mediated unless approved FamilySearch API access exists.

## AI connection defaults

New MCP grants use `scopeChoice: "full"` and `expiryChoice: "none"`. Use
`lib/mcp/grantDefaults.ts` for effective scopes and expiry in every
authorization, discovery and settings read. Never extend its frozen legacy
scope baseline. Explicit and ambiguous legacy end dates stay enforced; only
matching automatic sign-in consent receipts may have their old 90-day term
ignored at read time.

## Delivering changes

- Source mutations must use `convex/searchServer.ts` builders: they maintain
  exact explorer projections and active owner counters atomically. See
  [projection maintenance](docs/operations/people-explorer-scale.md) and
  [vault counters and Research](docs/operations/vault-counts-scale.md).

- `pnpm verify` is the full check (typecheck, lint, tests, every `check:*`
  contract, build). Run it before pushing code.
- Merging to `main` deploys production: Vercel runs `convex deploy` and then
  the Next build. Never run `convex deploy`, `convex dev` or `convex codegen` by
  hand against production; a `--dry-run` is fine.
- Vercel builds only `main` and `preview/*`. CI runs `pnpm verify` without the
  build on ready (non-draft) PRs; docs-only PRs pass on a path check. See
  [CI policy](docs/operations/ci-review-and-preview-policy.md) before touching
  `.github/workflows/` or `vercel.json`.
- The AI merges and deploys routine work; Scott does not need to press merge.
  Stop and ask before money, deleting real data, DNS, secrets, or changing who
  can access production data.
- Preview locally with `pnpm dev:sandbox` (cloud dev backend
  `clear-capybara-929`, synthetic records) or `pnpm preview:local`. `pnpm dev:live` stays withheld until its
  production binding is verified.

## Sign-in and screenshots

Sandbox is `http://family-history.localhost:3443`. Once per checkout run
`node ../assist-local-dev/screenshots/sandbox-profile.mjs .`, then
`pnpm dev:sandbox` and `shoot.mjs`. It signs in as the Clerk dev `+clerk_test`
user, never Scott's account. See the
[screenshots README](https://github.com/scottjarvie/assist-local-dev/blob/main/screenshots/README.md).

<!-- BEGIN:nextjs-agent-rules -->

**Scott's real account** (testing only, read-mostly; use the test user for anything that writes): `shoot.mjs --live --checkout .` on the local Live address reuses his saved session; see the [standard](https://github.com/scottjarvie/assist-local-dev/blob/main/docs/sign-in-and-screenshots.md#scotts-real-account-approved-15-nov-2026).

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
