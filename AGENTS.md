# Agent Operating Rules

A private FamilySearch-first research vault, Queue and story workspace.

## Read first

- [Site Guide](docs/planning/site-guide.md): product, privacy and AI-tool truth. Open questions: `docs/planning/site-guide-content.json`.
- [Tracker Guide](docs/tracker/GUIDE.md) and the parked Cards (`docs/tracker/cards/`, status `backlog`).
- [How production deploys](docs/operations/how-production-deploys.md) before any release.

## Privacy defaults

- Keep raw FamilySearch artifacts and memory/media details private until reviewed.
- Never publish living-person details, private notes, sensitive relationship claims or unresolved provisional relatives.
- Treat AI handoff packets as private operational material.
- Browser capture stays user-mediated unless approved FamilySearch API access exists.

## AI connection defaults

New grants are full scope with no end date. Read scopes and expiry only through
`lib/mcp/grantDefaults.ts`; never extend its frozen legacy baseline. Old explicit
or ambiguous end dates stay enforced (only matching automatic sign-in receipts
may drop the old 90-day term).

## Where things live

- Pages `app/app/*`, API `app/api/*`. Reads: `convex/vaultReads.ts` (checks the
  owner) over `convex/vault.ts` and page modules. Writes: `convex/vaultMutations.ts`.
- AI connector: `convex/httpRoutes/mcp.ts` over `convex/mcpFamilyHistory.ts`,
  `convex/mcpGrants.ts`, `lib/mcp/`. Queue: `convex/queue.ts`, `components/queue/`.
- Media `lib/media/`; capture `extension/`, `lib/familysearch/`; checks `scripts/`.
  More in [convex/README.md](convex/README.md).

## Delivering changes

- Source mutations must use `convex/searchServer.ts` builders (exact explorer
  projections and owner counters; see [projections](docs/operations/people-explorer-scale.md),
  [counters](docs/operations/vault-counts-scale.md)).
- `pnpm verify` is the full check (typecheck, lint, tests, every wired `check:*`, build). Run it before pushing code.
- Merging to `main` deploys production (Vercel runs `convex deploy`, then the
  Next build). Never run `convex deploy`, `convex dev` or `convex codegen` by
  hand against production; a `--dry-run` is fine.
- Vercel builds only `main` and `preview/*`. CI runs `pnpm verify` on ready
  PRs, building only on the Mac mini runner; docs-only PRs pass on a path
  check. Read the [CI policy](docs/operations/ci-review-and-preview-policy.md)
  before touching `.github/workflows/` or `vercel.json`.
- The AI merges and deploys routine work. Stop and ask before money, deleting
  real data, DNS, secrets, or changing who can access production data.
- Preview with `pnpm dev:sandbox` (synthetic records) or `pnpm preview:local`.
  `pnpm dev:live` stays withheld until its production binding is verified.

## Sign-in and screenshots

Once per checkout run `node <assist-local-dev>/screenshots/sandbox-profile.mjs .`
(a clone of `scottjarvie/assist-local-dev`, usually beside this folder), then
`pnpm dev:sandbox` (`http://family-history.localhost:3443`) and `shoot.mjs`. It
signs in as the Clerk dev `+clerk_test` user, never Scott's account. See the
[screenshots README](https://github.com/scottjarvie/assist-local-dev/blob/main/screenshots/README.md).

**Scott's real account** is for read-mostly testing only (writes use the test user): `shoot.mjs --live --checkout .`; see the [standard](https://github.com/scottjarvie/assist-local-dev/blob/main/docs/sign-in-and-screenshots.md#scotts-real-account-approved-15-nov-2026).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
