# GEN-110 — Coordinate Convex deploys with the Vercel build

**Status:** deploy wrapper; inactive until a separately authorized Vercel secret is configured.
**Related:** GEN-79 (the 500→404 symptom fix), GEN-48 (production privacy sweep),
`docs/operations/production-privacy-sweep-2026-05-25.md`.

## Why this exists

Production Convex could drift out of sync with production Next.js. There was **no
`convex deploy` step in the Vercel build**, so a PR that changed a Convex function
would ship the new frontend while prod Convex stayed on the old function set. When
the frontend then called a function prod Convex didn't have yet, Convex threw
`"Could not find function ..."` — which surfaced as the production **500** on
`/stories/<slug>` in the 2026-05-25 privacy sweep (GEN-79).

GEN-79 fixed the *symptom* (the public route now degrades any error to 404).
GEN-110 addresses the *cause*: once separately activated, Convex functions deploy
as part of the same build command as Next.js. This prevents persistent function
drift during normal successful releases, but it is not a transaction across
Convex and Vercel: a later Vercel publication failure can still leave the backend
ahead of the public frontend.

## How it works

Vercel's build command is set (in `vercel.json`) to a small wrapper:

```
node scripts/vercel-build.mjs
```

The wrapper (`scripts/vercel-build.mjs`) decides what to run — the decision logic
is pure and unit-tested in `scripts/test-vercel-build.ts`:

| Environment / key                         | What runs                              | Effect |
| ----------------------------------------- | -------------------------------------- | ------ |
| No `CONVEX_DEPLOY_KEY`                     | `npx --no-install next build`                           | Safe no-op — local, CI, and any env without the secret stay green. **This is the current default until the key is set.** |
| Production build, production key (`prod:…`) | `npx --no-install convex deploy --cmd 'npx --no-install next build'` | Builds, then deploys the production Convex functions before Vercel publishes the frontend. |
| Preview build, preview key (`preview:…`)     | Same coordinated command | Builds against and deploys the isolated preview deployment. |
| Any key/environment mismatch or unsupported key type | `npx --no-install next build` | **Guardrail** — the key is not used and no Convex deployment occurs. |

Because a missing key falls back to a repository-local Next.js build, this change is a **safe
no-op until the secret is added** — it will not invoke Convex from local builds,
CI, or previews without a correctly scoped key. Removing the key deactivates the
automatic deploy path; it does not roll back a Convex revision that already ran.

## One-time activation (owner action — this is the secrets + prod-blast-radius step)

This is why GEN-110 is owner-gated: it needs a Convex **production** deploy key
stored as a Vercel secret.

1. Generate a **Production** deploy key in the Convex dashboard:
   Convex dashboard → the DTS production deployment → **Settings → Deploy Keys → Generate Production Deploy Key**.
2. In the Vercel project (`discover-their-stories`) → **Settings → Environment Variables**,
   add `CONVEX_DEPLOY_KEY` and **scope it to the Production environment only**.
   Do **not** add it to Preview or Development — the wrapper refuses a prod key on
   preview, but scoping it to Production keeps the secret off preview builds entirely.
3. Redeploy production. The build log will show
   `[vercel-build] production deploy key in production — building, then deploying Convex prod`.

## Deactivation and rollback

Removing `CONVEX_DEPLOY_KEY` from Vercel Production immediately returns future
builds to plain `next build`; this is the safe deactivation step and does not
need a replacement manual production procedure. It does **not** reverse a Convex
revision already deployed. If an activated coordinated release deploys Convex
but Vercel later fails to publish the matching frontend, restore a known-good
compatible revision only through a separately authorized release operation.
Do not treat schema or data migration rollback as automatic.

### Optional: preview parity

To also keep preview deployments' Convex in sync, generate a **Preview** deploy key
(`preview:…`) in the Convex dashboard and add it as `CONVEX_DEPLOY_KEY` scoped to the
**Preview** environment. The wrapper detects the `preview:` prefix and deploys the
isolated preview deployment rather than prod.

## Verifying

- Locally: `npm run build` is unchanged (`next build`) — the wrapper is only the
  Vercel build command.
- Contract: `npm test` runs `scripts/test-vercel-build.ts`, which pins the
  allowed key/environment pairs, no-key behavior, mismatch refusal, and
  values-safe plan metadata.
- After activation: a Convex-function-changing release should show one coordinated
  build command and matching frontend/backend revisions. Verify publication after
  the build; do not claim cross-service transactional atomicity.
