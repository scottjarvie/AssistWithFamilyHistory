// GEN-87 Option A: declare Clerk as a trusted OIDC provider so Convex functions
// can read a verified identity via `ctx.auth.getUserIdentity()` instead of
// trusting a client-supplied `vaultOwnerId` argument.
//
// `domain` is the Clerk "convex" JWT template issuer (CLERK_JWT_ISSUER_DOMAIN),
// resolved ON THE CONVEX BACKEND from the Convex deployment's env (set via
// `npx convex env set ...`), not from Next's .env. `applicationID` must equal
// the JWT template name / `aud` claim ("convex").
//
// Defensive: when the env var is unset on a given deployment, we register NO
// provider. Then `getUserIdentity()` simply returns null there — exactly today's
// behavior — and the deploy can never fail on an undefined domain. This file is
// PHASE 0 / shadow: no Convex function reads the identity yet, so it changes
// nothing on its own. See docs/operations/gen-87-clerk-convex-auth-setup.md.
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
};
