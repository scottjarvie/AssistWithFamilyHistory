# Agent Operating Rules

A private FamilySearch-first research vault, Queue and story workspace.

## Read first

- [Site Guide](docs/planning/site-guide.md): product, privacy and AI-tool truth.
- [Tracker Guide](docs/tracker/GUIDE.md) and parked Cards (`docs/tracker/cards/`).
- [How production deploys](docs/operations/how-production-deploys.md) before any release.

## Privacy defaults

- Keep raw FamilySearch artifacts and memory/media details private until reviewed.
- Never publish living-person details, private notes, sensitive relationship claims or unresolved provisional relatives.
- Treat AI handoff packets as private operational material.
- Browser capture stays user-mediated unless approved FamilySearch API access exists.

## Trust boundary

A public Convex function that takes an owner id must match it to the signed-in
caller before any private read, write or file signing, in **every**
`TRUST_BOUNDARY_MODE`, using the `authorizeTenant*` and
`authorizeOwnedReferenceMutation` helpers in `convex/access.ts`. The switch to
`enforce` follows [the rollout runbook](docs/operations/gen-87-clerk-convex-auth-setup.md).

## AI connection defaults

New grants are full scope with no end date. Read scopes and expiry only through
`lib/mcp/grantDefaults.ts`; never extend its frozen legacy baseline. Old
explicit or ambiguous end dates stay enforced.

## Where things live

- Pages `app/app/*`, API `app/api/*`. Reads: `convex/vaultReads.ts` (checks the
  owner) over `convex/vault.ts` and page modules. Writes: `convex/vaultMutations.ts`.
- AI connector: `convex/httpRoutes/mcp.ts` over `convex/mcpFamilyHistory.ts`,
  `convex/mcpGrants.ts`, `lib/mcp/`. Queue: `convex/queue.ts`, `components/queue/`.
- Media `lib/media/`; capture `extension/`, `lib/familysearch/`; checks `scripts/`.
  [Backend name map and contracts](convex/README.md#name-map).
- `components/design/Baseline*`, `*Fixture*`, `fixtures/` are frozen dev-only
  preview copies; never edit them for a site change.

## Delivering changes

- Source mutations must use `convex/searchServer.ts` builders ([projections](docs/operations/people-explorer-scale.md),
  [counters](docs/operations/vault-counts-scale.md)).
- `pnpm verify` is the full check (typecheck, lint, tests, wired `check:*`, build); run it before pushing code.
- Merging to `main` triggers Vercel production deployment. The configured
  Convex CLI runs the Next build, then pushes Convex before Vercel can release
  the frontend.
  Never run `convex deploy`, `dev` or `codegen` by hand against production.
- Vercel builds only `main` and `preview/*`; CI runs `pnpm verify` on ready PRs.
  Read the [CI policy](docs/operations/ci-review-and-preview-policy.md)
  before touching `.github/workflows/` or `vercel.json`.
- The AI merges and deploys routine work. Stop and ask before money, deleting
  real data, DNS, secrets, or changing who can access production data.
- Preview private pages with `pnpm dev:sandbox`. `pnpm preview:local` has no
  sign-in, so private pages refuse there; `pnpm dev:live` stays withheld.

## Sign-in and screenshots

Once per checkout run `node <assist-local-dev>/screenshots/sandbox-profile.mjs .`
(a `scottjarvie/assist-local-dev` clone), then `pnpm dev:sandbox` and
`shoot.mjs` as the Clerk dev `+clerk_test` user. Scott's real account is
read-mostly (`--live`). See the [standard](https://github.com/scottjarvie/assist-local-dev/blob/main/docs/sign-in-and-screenshots.md).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
