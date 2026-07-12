// Clerk is the trusted OIDC provider for the Convex tenant boundary. Protected
// public actions/mutations resolve this verified identity before any vault work.
//
// `domain` is the Clerk "convex" JWT template issuer (CLERK_JWT_ISSUER_DOMAIN),
// resolved ON THE CONVEX BACKEND from the Convex deployment's env (set via
// `npx convex env set ...`), not from Next's .env. `applicationID` must equal
// the JWT template name / `aud` claim ("convex").
//
// Defensive: an unset issuer registers no provider. Shadow mode then records
// missing_identity while preserving the call; enforce mode denies it.
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

const authConfig = {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
};

export default authConfig;
