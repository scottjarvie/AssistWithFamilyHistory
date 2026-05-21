# Vault Owner Isolation

Last updated: 2026-05-21

## Purpose

Discover Their Stories supports three vault access modes. Every private app route and internal API route must resolve the active vault owner before reading or writing vault data.

The public story route is the exception: `/stories/[id]` uses the story id and only returns stories whose status is `published`.

## Access Modes

| Mode | When used | Vault owner | Intended use |
| --- | --- | --- | --- |
| Local | Clerk is disabled or unavailable in local development | `local-dev` | Private local development and single-user local vaults |
| User | Clerk is enabled and the visitor is signed in | Clerk `userId` | Authenticated user-owned vault |
| Anonymous | Clerk is enabled, `ALLOW_ANONYMOUS_VAULT=true`, auth is not required, and the visitor is not signed in | `vault-preview-id` guest cookie | Explicit preview deployments only |

## Required Auth Gate

For public beta, set `REQUIRE_AUTH=true` and leave `ALLOW_ANONYMOUS_VAULT` unset or false. When `REQUIRE_AUTH=true`, these route groups are protected by Clerk middleware:

- `/app(.*)`
- `/api/people(.*)`
- `/api/import(.*)`
- `/api/process(.*)`
- `/api/convex(.*)`
- `/api/operations(.*)`
- `/api/stories(.*)`
- `/api/context-reports(.*)`

The shared source of truth is `lib/vault/protectedRoutes.ts`. Run:

```bash
pnpm check:protected-routes
```

## Owner Resolution

Server code should call `getVaultAccessContext()` from `lib/vault/server.ts` and pass its `vaultOwnerId` into storage, Convex queries, and Convex mutations.

Convex query and mutation code should normalize and compare owners with the helpers in `convex/vaultCore.ts`:

- `normalizeVaultOwnerId`
- `matchesVaultOwner`
- `filterByVaultOwner`

Local raw artifacts are separated by owner directory under `data/source-docs/people/<owner>/`.

## Route Behavior

Private app routes under `/app` read only the active owner vault.

Internal API routes under `/api/people`, `/api/import`, `/api/convex`, `/api/operations`, `/api/stories`, and `/api/context-reports` must use the active owner context before any read or write.

Anonymous guest vaults are not the default public-beta posture. They require an explicit `ALLOW_ANONYMOUS_VAULT=true` deployment choice and should be treated as temporary preview vaults, not durable user workspaces.

`/api/process` is protected in required-auth deployments because it can submit user-provided data to an AI model using either a client-provided OpenRouter key or the server key.

`/stories/[id]` is intentionally public, but it must only return published stories. Draft or review stories should resolve to not found.

## API Impact

- API impact: read/write/admin route baseline.
- API parity: current APIs are internal; future agent/API work should start from this owner model.
- Scope/tier impact: future scopes such as read-only assistant, import agent, story writer, research operator, and trusted operator must not bypass owner isolation.
- OpenAPI/capability manifest impact: protected versus public route classification should be reflected in future API inventory docs.
- Security/abuse/privacy risk: cross-owner access, public unpublished story access, and unauthenticated writes in required-auth deployments are the main risks.
