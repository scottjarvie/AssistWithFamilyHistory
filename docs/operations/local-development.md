# Local Live and Sandbox

Family History can run from a normal checkout of `main` in two local modes.

| Mode | Command | Address | Backend and identity |
| --- | --- | --- | --- |
| Sandbox | `pnpm dev:sandbox` | `http://family-history.localhost:3443` | A separate local record-only backend on `127.0.0.1:4323` and a development Clerk instance. Synthetic records only. |
| Live | `pnpm dev:live` | `https://local.assistwithfamilyhistory.com` (port 3444) | The production backend and the production Clerk instance. **Currently withheld**: the launcher refuses Live until its backend binding and production owner enforcement are independently verified. The binding in `scripts/local-development.json` must be re-checked against the production deployment recorded in [Bring Your AI provider actions](bring-your-ai-provider-actions.md) before Live is enabled. |

`pnpm dev:status` reports whether each mode's local environment file is present and valid.

## How the modes are guarded

- The launcher (`scripts/local-development.mjs`) refuses to run when `NODE_ENV=production`, `VERCEL` or `CI` is set, refuses an occupied port, and validates the mode's `.env.local-live` or `.env.local-sandbox` against `scripts/local-development.json` (exact backend, exact Clerk host, no server secrets or provider keys). Inherited and dotenv credentials are blanked before Next starts.
- In the app, `lib/localLiveAuth.ts` enables the local session bridge only when `NODE_ENV=development`, `LOCAL_DEVELOPMENT_MODE` is `live` or `sandbox`, `VERCEL`, `CI` and `CLERK_SECRET_KEY` are unset, and the backend matches the exact binding. Hosted builds never meet those conditions, so hosted behavior is unchanged.
- Local mode verifies the ordinary Clerk session and a separate audience `convex` token against the mode's own issuer and exact local origin. There is no anonymous or guest owner fallback.
- Provider, media, import, MCP and administration routes return 503 locally. A banner states which mode is running.

## Sandbox backend

The Sandbox backend is a source-only, record-only snapshot prepared by `scripts/prepare-record-only-sandbox.mjs` into the ignored `sandbox-backend/` folder. It always enforces the existing owner checks, has no crons, and refuses every Convex action except a hash-locked list of vetted record reads (`scripts/record-only-actions.json`, `scripts/record-only-action-hashes.json`). Its native database, configuration and storage are persistent state, not a cache; the family launcher owns starting it.

## Checks

```bash
node --test scripts/local-development.test.mjs
node --import tsx --test scripts/test-local-auth.ts
```

`scripts/test-record-only-snapshot.ts` additionally checks a prepared `sandbox-backend/` snapshot when one exists.
