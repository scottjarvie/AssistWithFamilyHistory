# GEN-87 Runbook — Clerk as a Convex Auth Provider (Option A)

Status: operational runbook. Companion to the design doc
[`gen-87-convex-auth-design.md`](./gen-87-convex-auth-design.md) — read §2 (Option A)
there first. This file is the **copy-pasteable** version: the exact dashboard
clicks, env vars, and code snippets to wire Clerk identity into Convex so each
Convex function can derive the owner from a cryptographically-verified token
(`ctx.auth.getUserIdentity()`) instead of trusting a client-supplied
`vaultOwnerId` argument.

This runbook covers **only the plumbing that makes `getUserIdentity()` return
the signed-in user inside a Convex function** (design doc Phase 0 / "shadow").
It does **not** change any Convex function's owner logic, does not touch guest
vaults (§4 of the design doc), and does not flip enforcement. Those are separate
follow-up steps. The point of this round is: get a real verified identity to
arrive at Convex, end to end, with zero behavior change.

## Who does what

| # | Step | Owner |
|---|------|-------|
| 1 | Create the `convex` JWT template in the Clerk dashboard | **Scott-only** (dashboard) |
| 2 | Read off the issuer domain from Clerk | **Scott-only** (dashboard) |
| 3 | Add `CLERK_JWT_ISSUER_DOMAIN` to `.env.local`, Vercel, **and** Convex dashboard | **Scott-only** (secrets/dashboards) |
| 4 | Create `convex/auth.config.ts` | Agent-doable (code) |
| 5 | Make `lib/convex/server.ts` mint + attach the token | Agent-doable (code) |
| 6 | Run the verification checklist | Shared (Scott runs the app; agent can read logs) |

Plain-language note for Scott: steps 1–3 are the only ones that need you. They
all happen in dashboards you own (Clerk, Vercel, Convex) or in secret files an
agent should not edit. Steps 4–5 are ordinary code an agent can write and ship
behind `pnpm verify`. Nothing in 4–5 does anything until 1–3 exist, so the code
is safe to land first or last.

---

## Step 1 — Create the `convex` JWT template (Scott-only, Clerk dashboard)

A "JWT template" tells Clerk how to mint a signed token for a specific audience.
Convex expects one named exactly `convex`.

1. Go to **dashboard.clerk.com** → select the Discover Their Stories app.
2. Left nav → **Configure** → **JWT Templates** → **New template**.
3. Clerk offers a **Convex** preset — choose it. (If the preset is missing,
   choose "Blank" and follow the claims below.)
4. **Name** must be exactly `convex` (lowercase). This is the string we pass to
   `getToken({ template: "convex" })` and the `applicationID` in
   `auth.config.ts`. They must match character-for-character.
5. **Claims** — the Convex preset already fills these. The only claim Convex
   strictly needs is the default subject (`sub` = Clerk user id), which is
   always present. Leave the preset claims as-is:
   ```json
   {
     "aud": "convex"
   }
   ```
   (`aud` = audience = the `applicationID` Convex matches against. Do not add
   custom claims for this round — we only consume `identity.subject`, which is
   the Clerk user id and maps 1:1 to today's `user_<clerkId>` owner string.)
6. **Token lifetime**: leave the default (60s). Tokens are minted per-request
   server-side, so a short life is correct and safe.
7. **Save**.

> Heads-up on the owner string. Today `getVaultAccessContext()` sets
> `vaultOwnerId = authState.userId` (the raw Clerk user id, e.g. `user_2abc…`).
> `identity.subject` from this token is the **same** Clerk user id. So when we
> later derive the owner inside Convex from `identity.subject`, it lines up with
> the existing `by_owner` index values with no data migration. Confirm this in
> the verification checklist before any enforcement step.

## Step 2 — Read the issuer domain (Scott-only, Clerk dashboard)

The "issuer" is the URL that signed the token; Convex fetches that domain's
public keys to verify signatures.

1. Still in **JWT Templates** → open the `convex` template you just made.
2. Find the **Issuer** field. It looks like:
   `https://your-app-name.clerk.accounts.dev` (development) or
   `https://clerk.your-domain.com` (production with a custom Clerk domain).
3. Copy that full `https://…` value. That is `CLERK_JWT_ISSUER_DOMAIN`.

Alternatively the same value is shown under **Configure → API Keys → Show JWT
public key / Frontend API URL**. Use the JWT template's Issuer if they differ —
that's the authoritative one for this template.

## Step 3 — Add `CLERK_JWT_ISSUER_DOMAIN` in all three places (Scott-only)

This single value has to exist in **three** environments because three
different processes need it:

| Where | Variable(s) | Why it lives here |
|-------|-------------|-------------------|
| `.env.local` (local dev, not committed) | `CLERK_JWT_ISSUER_DOMAIN=https://…` | Local Convex (`npx convex dev`) reads it via the Convex CLI; local Next reads it to mint tokens. |
| **Vercel** project → Settings → Environment Variables | `CLERK_JWT_ISSUER_DOMAIN=https://…` | The deployed Next server mints the token at request time. Add to Production + Preview. |
| **Convex dashboard** → your deployment → Settings → Environment Variables | `CLERK_JWT_ISSUER_DOMAIN=https://…` | The Convex backend verifies the token at request time. `auth.config.ts` reads this at deploy. |

Important separation of concerns:

- `CLERK_JWT_ISSUER_DOMAIN` is **not** `NEXT_PUBLIC_*` — it is a server/backend
  value. Do not prefix it. It is not a secret per se (it's a public issuer URL),
  but keep it un-prefixed so it never ships in the browser bundle by habit.
- The existing `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  (public, browser-safe) and `CLERK_SECRET_KEY` (server secret) stay exactly
  where they are — `.env.local` + Vercel. No change to those.
- `CLERK_SECRET_KEY` is what lets the Next **server** call
  `auth().getToken(...)`. It is already present (Clerk is already wired). Do not
  add it to the Convex dashboard — Convex never mints, it only verifies, so it
  only needs the issuer domain.

After adding the Convex dashboard variable, redeploy Convex functions
(`npx convex dev` locally, or the normal deploy in CI/Vercel) so `auth.config.ts`
picks it up.

A line to add to `.env.example` (documentation only, no secret) so the next
person knows it exists:

```bash
# Clerk → Convex auth (GEN-87, Option A). Issuer URL of the "convex" JWT template.
# Server/backend only — NOT NEXT_PUBLIC. Must also be set in the Convex dashboard.
# CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.dev
```

---

## Step 4 — `convex/auth.config.ts` (agent-doable, code)

Create the file at the repo path `convex/auth.config.ts`. This is the Convex
backend's declaration of which token issuers it trusts. `applicationID` must
equal the JWT template name from Step 1 (`convex`).

```ts
// convex/auth.config.ts
// GEN-87 Option A: declare Clerk as a trusted OIDC provider so Convex functions
// can read a verified identity via ctx.auth.getUserIdentity().
// domain = Clerk JWT template Issuer (CLERK_JWT_ISSUER_DOMAIN, set in the Convex
//          dashboard env — see gen-87-clerk-convex-auth-setup.md Step 3).
// applicationID = the JWT template name / aud claim ("convex").
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Notes:
- `process.env.CLERK_JWT_ISSUER_DOMAIN` here is resolved **on the Convex
  backend** (the Convex dashboard env from Step 3), not from Next's env. That is
  why Step 3 sets it in the Convex dashboard specifically.
- After creating this file, run `npx convex codegen` (offline-safe) so generated
  types stay in sync, then `pnpm verify`. The file is plain config — it adds no
  public function, so `check:convex-visibility` is unaffected.
- If `CLERK_JWT_ISSUER_DOMAIN` is unset in a given Convex deployment, Convex
  simply has no configured provider and `getUserIdentity()` returns `null`
  there — which is exactly today's behavior. So shipping this file before Step 3
  changes nothing until the env var lands. Safe to land first.

## Step 5 — `lib/convex/server.ts`: mint + attach the token (agent-doable, code)

`getConvexClient()` is the single factory every server route and server
component uses to talk to Convex (verified: ~25 call sites all import it from
`@/lib/convex/server`). It is currently **synchronous** and creates an
**unauthenticated** client. To attach a token we mint it server-side with Clerk
and call `client.setAuth(token)`.

Minting is async (`auth().getToken(...)`), so add an **async** authenticated
variant rather than making the existing sync `getConvexClient()` async (which
would force touching every call site in one change). New callers and migrated
call sites use `getAuthedConvexClient()`; the sync `getConvexClient()` stays for
unauthenticated/public paths (e.g. published-story rendering) and during
rollout.

Add to `lib/convex/server.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { isClerkEnabled } from "@/lib/clerk/config";

// GEN-87 Option A: return a ConvexHttpClient carrying the caller's verified
// Clerk JWT (template "convex"), so Convex functions can read the owner from
// ctx.auth.getUserIdentity() instead of a trusted argument. Falls back to an
// unauthenticated client when Clerk is off or no user is signed in (guests),
// preserving today's behavior during rollout.
export async function getAuthedConvexClient(): Promise<ConvexHttpClient> {
  const client = getConvexClient();

  if (!isClerkEnabled()) {
    return client;
  }

  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token) {
      client.setAuth(token);
    }
  } catch (error) {
    // Don't break reads if token minting fails (e.g. dynamic-usage during
    // static render, or no active session): fall through unauthenticated.
    logServerFailure(
      "convex.auth_token_mint_failed",
      { route: "convex", configured: isConvexConfigured() },
      error,
    );
  }

  return client;
}
```

How a call site migrates (one line, no logic change):

```ts
// before
const client = getConvexClient();
// after
const client = await getAuthedConvexClient();
```

Notes:
- `setAuth(token)` makes the client send the token as a bearer on every
  subsequent `query`/`mutation` for the life of that client instance. Mint a
  fresh client per request (these factories already do — they `new` a client
  each call) so tokens never leak across requests.
- This change is **inert** on its own: until a Convex function actually reads
  `getUserIdentity()`, attaching a token has no effect on results. That is the
  whole point of Phase 0 — get the token flowing, change no behavior. Migrating
  call sites to `getAuthedConvexClient()` can happen incrementally.
- `logServerFailure` and `isConvexConfigured` are already in this file's
  imports/exports — reuse them, don't re-import duplicates.
- Run `pnpm verify`. `auth()` is already used in `lib/vault/server.ts`, so the
  import resolves; no new dependency.

---

## Step 6 — Verification checklist (confirm `getUserIdentity()` works)

Goal: prove a Convex function can see the signed-in user. Do this with a
**throwaway** internal query so we don't add a public function or trip
`check:convex-visibility`. Remove it after.

1. **Env present.** Confirm all three from Step 3:
   - Local: `grep CLERK_JWT_ISSUER_DOMAIN .env.local` returns the `https://…`.
   - Vercel: visible under Settings → Environment Variables (Production+Preview).
   - Convex: visible under the Convex dashboard → Settings → Environment Variables.
2. **Convex picked up the provider.** Run `npx convex dev` (or check the deploy
   log). On a clean start it logs the configured auth provider; no error about a
   missing issuer means `auth.config.ts` resolved the domain.
3. **Add a temporary probe** (delete after) — an internal query is fine and
   stays off the public surface:
   ```ts
   // convex/_authProbe.ts  (TEMPORARY — delete after verifying)
   import { internalQuery } from "./_generated/server";
   export const whoAmI = internalQuery({
     args: {},
     handler: async (ctx) => {
       const identity = await ctx.auth.getUserIdentity();
       return identity
         ? { subject: identity.subject, issuer: identity.issuer }
         : null;
     },
   });
   ```
4. **Exercise it through the authed client.** Temporarily call it from any
   signed-in server route/page using `await getAuthedConvexClient()` then
   `client.query(internal._authProbe.whoAmI, {})`, and log the result. Sign in,
   load that route.
   - **Expected (signed in):** `{ subject: "user_2abc…", issuer: "https://…clerk…" }`.
   - **`subject` must equal** the value `getVaultAccessContext()` puts in
     `vaultOwnerId` for that same user (the raw Clerk user id). This is the
     critical alignment check before any future enforcement step — if these
     differ, do **not** proceed to derive owner from `identity.subject`.
   - **Expected (guest / Clerk off):** `null`. Confirms unauthenticated callers
     get no identity — and that the fallback in Step 5 keeps the app working.
5. **Negative check.** Hit the same probe without signing in (or with Clerk
   disabled locally): `getUserIdentity()` returns `null`, the page still renders
   via the unauthenticated fallback. No throw, no behavior change.
6. **Clean up.** Delete `convex/_authProbe.ts` and the temporary call site. Run
   `npx convex codegen` then `pnpm -s verify` to confirm green.

### Quick pass/fail summary

| Check | Pass looks like |
|-------|-----------------|
| Issuer env in 3 places | all three return the same `https://…` |
| Convex provider loaded | `npx convex dev` starts with no auth-config error |
| Signed-in identity | probe returns `{ subject, issuer }`, subject == today's `vaultOwnerId` |
| Guest / Clerk-off | probe returns `null`, app still renders |
| Verify green | `pnpm -s verify` passes after probe removed |

---

## What this runbook deliberately does NOT do

- It does **not** change any owner-derivation logic in `convex/vault.ts` /
  `convex/vaultMutations.ts`. Those still trust `vaultOwnerId` args. That is the
  `resolveOwner` centralization + Phase 1 enforcement work in the design doc.
- It does **not** secure guest vaults (`guest_<uuid>`). See design doc §4 — guests
  have no Clerk identity, so `getUserIdentity()` is `null` for them by design,
  and the Step 5 fallback preserves their current (arg-based) path until §4 ships.
- It does **not** bind `migrateGuestVault` to the caller (design doc §4) — that
  comes with guest identity, Phase 2.

Land these five steps and you have a verified identity arriving at Convex with
zero behavior change — the foundation every later GEN-87 phase builds on.
