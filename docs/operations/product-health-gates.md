# Product Health Gates And Person Route QA

Last updated: 2026-05-21

## Purpose

Agents should run smoke checks by product surface, not as an unexplained list of URLs. This makes failures easier to route to the right issue.

## Route Smoke Gates

`pnpm smoke:routes` groups routes into these gates:

- Public marketing: homepage, features, extension page, updates page.
- App shell: `/app`.
- Intake: `/app/imports`.
- Operations: `/app/operations`.
- People and places: people, places, optional person workspace route.
- Research and story tools: research, story writer, source-docs.
- Settings and auth-adjacent surfaces: settings.
- API health: capability and vault stats probes.

Run locally after starting the app:

```bash
pnpm dev
BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes
```

## Person Route Seed

Some smoke checks are stronger with a real person route:

```bash
PERSON_ROUTE_ID=<safe-person-id-or-familysearch-id> BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes
```

Safe ways to get `PERSON_ROUTE_ID`:

- Import an anonymized capture fixture into a local or preview vault and use the FamilySearch ID shown in the import result.
- Open `/app/people` in a local dev vault and copy a person route from non-private fixture data.
- Query the local Convex dashboard for a fixture or development-only person ID.
- Use a person from a deliberately created QA vault, not a private family record.

Do not hard-code real family IDs into repository scripts, docs, fixtures, or
tracker Cards. If real data is needed for a logged-in FamilySearch session,
keep it in a private, access-controlled session checklist; the public repository
tracker may link only to a safe redacted evidence receipt.

## Verification

For route-health work:

```bash
pnpm build
BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes
```

## Trust-boundary gates

Any Convex function, auth, or server-caller change must also run:

```bash
pnpm check:trust-boundary
pnpm check:convex-client-auth
pnpm test:convex
```

The first check inventories every public Convex registration and requires the
shared guard outside the explicit public-query allowlist. The second prevents a
private app or API call from using an unauthenticated Convex client.
