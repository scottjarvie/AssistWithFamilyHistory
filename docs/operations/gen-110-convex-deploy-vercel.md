# GEN-110 — Deploy Convex atomically with the Vercel build

**Status:** code shipped; requires a one-time Vercel secret to activate (see below).
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
GEN-110 fixes the *cause*: Convex functions now deploy **atomically with each
Next.js build**, so there is no desync window.

## How it works

Vercel's build command is set (in `vercel.json`) to a small wrapper:

```
node scripts/vercel-build.mjs
```

The wrapper (`scripts/vercel-build.mjs`) decides what to run — the decision logic
is pure and unit-tested in `scripts/test-vercel-build.ts`:

| Environment / key                         | What runs                              | Effect |
| ----------------------------------------- | -------------------------------------- | ------ |
| No `CONVEX_DEPLOY_KEY`                     | `next build`                           | Safe no-op — local, CI, and any env without the secret stay green. **This is the current default until the key is set.** |
| Production build, production key           | `npx convex deploy --cmd 'next build'` | Deploys prod Convex, then builds — atomic, no desync. |
| Preview build, **production** key          | `next build`                           | **Guardrail** — a prod key is refused on preview so a preview build can never overwrite production Convex. |
| Preview build, **preview** key (`preview:…`)| `npx convex deploy --cmd 'next build'` | Deploys the isolated preview deployment. |

Because a missing key falls back to a plain `next build`, this change is a **safe
no-op until the secret is added** — it will not break local builds, CI, or preview
deploys, and it is fully reversible by deleting `vercel.json` / the secret.

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
   `[vercel-build] production deploy key — deploying Convex prod, then building`.

### Optional: preview parity

To also keep preview deployments' Convex in sync, generate a **Preview** deploy key
(`preview:…`) in the Convex dashboard and add it as `CONVEX_DEPLOY_KEY` scoped to the
**Preview** environment. The wrapper detects the `preview:` prefix and deploys the
isolated preview deployment rather than prod.

## Verifying

- Locally: `npm run build` is unchanged (`next build`) — the wrapper is only the
  Vercel build command.
- Contract: `npm test` runs `scripts/test-vercel-build.ts`, which pins the four
  decision cases above.
- After activation: a Convex-function-changing PR should show the frontend and the
  function deploying together, with no `"Could not find function"` window in prod.
