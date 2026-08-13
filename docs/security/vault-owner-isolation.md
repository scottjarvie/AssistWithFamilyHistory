# Vault Owner Isolation

Last updated: 2026-07-12.

Assist With Family History treats every vault as private tenant data. The browser,
URL arguments, Next routes, and client-supplied vault owner are not security
authorities. Convex verifies the caller at the data boundary.

## Access modes

| Mode | Owner | Production posture |
| --- | --- | --- |
| Signed-in user | Verified Clerk subject | Supported tenant-private mode |
| Local development | local-dev | Shadow-only local development |
| Anonymous guest | guest cookie ID | Preview-only; not compatible with enforcement until a signed guest capability exists |

Production beta requires REQUIRE_AUTH=true and both anonymous-vault flags false
or unset.

## Next route gate

Protected routes first call getVaultAccessContext() and use
getAuthedConvexClient(), which attaches the Clerk convex-template JWT. Route
middleware remains useful for UX and request rejection, but it is defense in
depth rather than the tenant boundary.

The protected route source of truth is lib/vault/protectedRoutes.ts:

~~~bash
pnpm check:protected-routes
~~~

## Convex boundary

The shared helpers in convex/access.ts:

1. resolve ctx.auth.getUserIdentity();
2. compare the verified subject with the supplied vaultOwnerId;
3. bind business reads and writes to the verified owner in enforce mode;
4. validate referenced records before they are linked or dereferenced;
5. log would-be denials in shadow or throw in enforce.

Mutations authorize before their first business-data access. Protected reads
are public actions backed by internal queries so the action can persist a
shadow log before the read. Internal functions cannot be called directly by an
external client.

Run both static contracts after changing Convex functions or callers:

~~~bash
pnpm check:trust-boundary
pnpm check:convex-client-auth
~~~

The complete classification is in
[Convex trust-boundary inventory](./convex-trust-boundary-inventory.md).

## Public story exception

Only vault.getPublishedStory and vault.getPublishedStoryByIdentifier are
anonymous:

- draft and review stories return null inside Convex;
- a published story is converted to an explicit public DTO inside Convex;
- person data exists only as a narrow projection nested in that published
  story; there is no anonymous person endpoint;
- server redaction removes common email, phone, SSN-shaped, and street-address
  identifiers;
- address-type places and non-public media/context are excluded.

The API and page keep their checks, but cannot broaden the Convex response.

## Shadow rollout

TRUST_BOUNDARY_MODE defaults to shadow. Shadow preserves legacy behavior and
writes function, caller, reason, and timestamp to trustBoundaryShadowLog.
Enforce throws. The superadmin-only summary and full flip procedure are in the
[guarded rollout runbook](../operations/gen-87-clerk-convex-auth-setup.md).

Guest migration is deliberately denied in enforce because the guest source ID
is not cryptographically verified. Disable guest vaults and resolve legitimate
pending migrations before the production flip.
