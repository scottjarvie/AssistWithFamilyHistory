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
const LEGACY_PRODUCTION_ISSUER = "https://clerk.discovertheirstories.com";
const CANONICAL_PRODUCTION_ISSUER = "https://clerk.assistwithfamilyhistory.com";

// Clerk rotates the production issuer when its primary domain changes. Keep a
// narrow bridge for the already-stored legacy value so the protected deploy
// that performs the rebrand can establish trust in the new issuer atomically.
// Development and preview issuers remain entirely environment-driven.
const configuredDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/$/, "");
const domain = configuredDomain === LEGACY_PRODUCTION_ISSUER
  ? CANONICAL_PRODUCTION_ISSUER
  : configuredDomain;

const authConfig = {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
};

export default authConfig;
