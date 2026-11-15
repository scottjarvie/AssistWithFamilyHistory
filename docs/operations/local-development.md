# Local Live and Sandbox

Family History can run from a normal checkout of `main` in two local modes.

| Mode | Command | Address | Backend and identity |
| --- | --- | --- | --- |
| Sandbox | `pnpm dev:sandbox` | `http://family-history.localhost:3443` | The cloud development deployment `dev:clear-capybara-929` (`jarvie:tell-their-stories:dev/sandbox`, no provider keys) and the development Clerk instance `improved-ram-86`. Synthetic records only. |
| Live | `pnpm dev:live` | `https://local.assistwithfamilyhistory.com` (port 3444) | The production backend and the production Clerk instance. **Currently withheld**: the launcher refuses Live until its backend binding and production owner enforcement are independently verified. The binding in `scripts/local-development.json` must be re-checked against the production deployment recorded in [Bring Your AI provider actions](bring-your-ai-provider-actions.md) before Live is enabled. |

`pnpm dev:status` reports whether each mode's local environment file is present and valid.

## How the modes are guarded

- The launcher (`scripts/local-development.mjs`) refuses to run when `NODE_ENV=production`, `VERCEL` or `CI` is set, refuses an occupied port, and validates the mode's `.env.local-live` or `.env.local-sandbox` against `scripts/local-development.json` (exact backend, exact Clerk host, no server secrets or provider keys). Inherited and dotenv credentials are blanked before Next starts.
- In the app, `lib/localLiveAuth.ts` enables the local session bridge only when `NODE_ENV=development`, `LOCAL_DEVELOPMENT_MODE` is `live` or `sandbox`, `VERCEL`, `CI` and `CLERK_SECRET_KEY` are unset, and the backend matches the exact binding. Hosted builds never meet those conditions, so hosted behavior is unchanged.
- Local mode verifies the ordinary Clerk session and a separate audience `convex` token against the mode's own issuer and exact local origin. There is no anonymous or guest owner fallback.
- Provider, media, import, MCP and administration routes return 503 locally. A banner states which mode is running.

## Sandbox backend

Since 2026-11-15 the Sandbox is the cloud development deployment `dev:clear-capybara-929`, so it works from any machine. It was created empty: its only environment variable is the public `CLERK_JWT_ISSUER_DOMAIN` (`https://improved-ram-86.clerk.accounts.dev`), so provider, storage and AI calls have no keys. Push backend source to it with `pnpm dev:backend` (it reads only `.env.local-sandbox`). Never point it at production data.

### Sign-in and screenshots

`node ../assist-local-dev/screenshots/sandbox-profile.mjs .` writes the ignored `.env.local-sandbox` from public values; then `pnpm dev:sandbox` and `shoot.mjs --base http://family-history.localhost:3443 --site family-history --routes /app`. It signs in as the Clerk development `+clerk_test` user (code 424242), never Scott's account. See the [screenshots README](https://github.com/scottjarvie/assist-local-dev/blob/main/screenshots/README.md).

### Native record-only backend (Mac mini history)

The earlier native backend binding is kept as `nativeSandbox` in `scripts/local-development.json`. It was a source-only, record-only snapshot prepared by `scripts/prepare-record-only-sandbox.mjs` into the ignored `sandbox-backend/` folder. It always enforces the existing owner checks, has no crons, and refuses every Convex action except a hash-locked list of vetted record reads (`scripts/record-only-actions.json`, `scripts/record-only-action-hashes.json`). Its native database, configuration and storage are persistent state, not a cache; the family launcher owns starting it.

## Checks

```bash
node --test scripts/local-development.test.mjs
node --import tsx --test scripts/test-local-auth.ts
```

`scripts/test-record-only-snapshot.ts` additionally checks a prepared `sandbox-backend/` snapshot when one exists.
