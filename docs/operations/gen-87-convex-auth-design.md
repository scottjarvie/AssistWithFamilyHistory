# GEN-87/88 — Convex Trust Boundary

Status: implemented behind guarded rollout on 2026-07-12.

## Decision

Convex, not the Next.js route layer, is the authority for vault ownership and
public-story safety.

- Tenant-private functions resolve ctx.auth.getUserIdentity() through the
  shared helpers in convex/access.ts.
- A verified Clerk identity.subject must match the requested vaultOwnerId.
- Mutations authorize before their first business-data access and validate
  referenced records before linking or dereferencing them.
- Protected reads enter through authenticated public actions, persist any
  shadow denial through trustBoundary.recordShadowDenial, and then call an
  internal query.
- Only two queries are anonymous by design:
  vault.getPublishedStory and vault.getPublishedStoryByIdentifier.
- Those queries return only stories with status equal to published and
  construct an allowlisted, server-redacted DTO. There is no standalone public
  person query.
- trustBoundary.getShadowLogSummary is public only at the Convex registration
  layer; it always requires an exact Clerk subject from
  TRUST_BOUNDARY_SUPER_ADMIN_IDS.

The complete registration inventory is in
[Convex trust-boundary inventory](../security/convex-trust-boundary-inventory.md).

## Guarded mode

TRUST_BOUNDARY_MODE accepts two values:

| Mode | Tenant or policy denial | Shadow table |
| --- | --- | --- |
| unset or shadow | Log the would-be denial and preserve the legacy call | Insert one record containing function, caller, reason, and timestamp |
| enforce | Throw before protected data is read or changed | No insert |

Only the exact value enforce enables enforcement. Every other value defaults
to shadow, which is the safe rollout default.

The Next server mirrors this value. In enforce mode,
getAuthedConvexClient() fails closed when Clerk, the issuer, the session, or
the convex JWT token is unavailable. The public story page deliberately uses
the unauthenticated client because its Convex queries are the public boundary.

## Publish boundary

The backend now defends both the write and read sides:

1. A direct published upsert is a policy denial.
2. A published status change recomputes publish readiness from Convex data,
   requires human-review confirmation and any required second review, and
   records the publish confirmation atomically.
3. Editing a published story requires a new review cycle in enforce mode.
4. Anonymous reads check published status inside Convex and build the public
   DTO there.
5. Public text is deterministically redacted for email, phone, SSN-shaped
   identifiers, and street addresses; address-type places are excluded.

The API route keeps its checks for fast, useful UX feedback. Those checks are
now defense in depth, not the security boundary.

## Guest migration limit

migrateGuestVault binds the destination to the authenticated Clerk subject.
The source guest cookie identifier is not a signed Convex principal:

- shadow logs guest_source_unverified and preserves the existing migration;
- enforce denies migration until a signed guest capability exists.

Production enforcement therefore requires anonymous vaults to be disabled and
any legitimate pending guest migrations to be resolved first.

## Operations

Use the [guarded rollout runbook](./gen-87-clerk-convex-auth-setup.md) for the
environment matrix, shadow observation query, flip, and rollback.

Verification contracts:

~~~bash
pnpm check:trust-boundary
pnpm check:convex-client-auth
pnpm test:convex
pnpm verify
~~~
