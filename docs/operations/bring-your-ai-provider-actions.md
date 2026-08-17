# Bring Your AI — provider actions

> Status: written from source, 2026-08-16. **Nothing in this document has been
> performed.** No provider dashboard, setting, secret, environment variable,
> deployment, or real family record was touched while building the backend
> spine of AWF-WO-011.
>
> Everything here is a change outside the repository — in Clerk, in Convex
> environment configuration, or in a deployment — and therefore sits behind the
> human gate in AWF-WO-011 (Human gates 2 and 3).

## Why this file exists

The grant, scope, boundary, and revocation machinery is now in the repository
and enforced on every request. Three things it depends on cannot be changed
from inside the repository, because they live in the identity provider or in
deployment configuration. They are listed below in the order they would need to
happen.

Each item states the exact place, the exact setting, why it matters, what
changes in observable behaviour, and how to undo it.

---

# SEND TO CODEX

## 1. Decide the client-discovery path (Client ID Metadata Documents vs DCR)

**Where:** Clerk Dashboard → the **production** instance for
`clerk.assistwithfamilyhistory.com` → Configure → OAuth Applications (the
surface that publishes the authorization-server metadata at
`https://clerk.assistwithfamilyhistory.com/.well-known/oauth-authorization-server`).

**Exact setting:** whichever of these Clerk currently offers:
- `client_id_metadata_document_supported` — the CIMD path, preferred; or
- **Dynamic Client Registration**, which publishes a `registration_endpoint`.

**Current observed truth (read-only probe, 2026-08-16):** the live metadata
advertises **neither**. Only a manually pre-registered client can connect today.

**Why it matters:** the code in `convex/mcpClientTrust.ts` and
`lib/mcp/clientMetadata.ts` validates a Client ID Metadata Document strictly —
HTTPS only, no credentials/query/fragment, no redirects followed, ≤32 KiB, JSON
only, `client_id` must exactly equal the fetched URL, HTTPS-or-loopback redirect
URIs, public clients must declare `token_endpoint_auth_method: "none"` and
PKCE `S256`, and IP literals / `localhost` / `*.local` / `*.internal` / cloud
metadata hosts are refused. That validation only ever runs for a client whose
`client_id` **is** an HTTPS URL, which only happens once the provider supports
CIMD. Until then every connection is recorded honestly as
`clientProvenance: "manual"` and `trusted: false` — we know a token was issued
to that client and nothing more.

**Effect if enabled (CIMD):** a conforming MCP client can identify itself with a
stable, auditable, fetchable document; the connection centre can tell a person
where a client came from instead of showing an opaque string.

**Effect if enabled (DCR):** any client can self-register. That is a public
client-creation surface. The repository deliberately contains **no** public
registration endpoint, and `MAX_DCR_REGISTRATIONS = 50` plus a 30-day expiry in
`convex/mcpClientTrust.ts` exist so that even a bounded fallback stays
inventoried and cleanable.

**Recommendation:** prefer CIMD. If Clerk does not offer it, keep manual
pre-registration for acceptance work and treat DCR as a separate, explicitly
approved decision rather than a shortcut.

**Rollback:** turn the setting off in the same place. Existing grants are
unaffected — a grant is a product record, not a provider record — and
`mcpClientRegistrations` rows can be deleted without touching anyone's access.

**Note on the source of this policy:** CIMD-first is **Scott's direction for
this build**, together with the current MCP authorization specification
(`https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`),
which makes CIMD the preferred discovery path and keeps DCR as compatibility
fallback. The Assist With Life family Bring Your AI standard is permissive about
DCR and does not itself require CIMD-first; do not cite it for this rule.

---

## 2. Emit a resource-specific audience on MCP access tokens

**Where:** Clerk Dashboard → production instance → the OAuth/token
configuration that controls access-token claims (audience / resource
indicators, RFC 8707).

**Exact setting:** make Clerk include `aud` (or `resource`) equal to
`https://assistwithfamilyhistory.com/mcp` on access tokens minted for this
resource.

**Why it matters:** `verifyOAuth` in `convex/httpRoutes/mcp.ts` now checks the
audience — but **tolerantly**, and deliberately so:

- when the token carries `aud`/`resource`, it must match this exact resource,
  so a token minted for another Assist product cannot be replayed here;
- when the provider omits the claim entirely, which the current production
  instance does, the token is accepted and the product grant remains the real
  authorization.

This is a compatibility choice, not an oversight: rejecting audience-less tokens
today would break the one client whose full lifecycle is already proved. The
alignment document flags the missing resource-specific audience as a real gap;
this is the smallest change that closes it.

**Effect:** once Clerk emits the claim, cross-resource token replay stops being
possible at all, and the tolerant branch can later be tightened to "required"
in one line — a code change, gated on this provider change landing first.

**Rollback:** stop emitting the claim. The tolerant branch means nothing breaks.

---

## 3. Confirm `MCP_RESOURCE_URL` and `MCP_AUTH_SERVER_URL` on the Convex deployment

**Where:** Convex dashboard → the production deployment → Settings →
Environment Variables.

**Exact settings:**
- `MCP_RESOURCE_URL` = `https://assistwithfamilyhistory.com/mcp`
- `MCP_AUTH_SERVER_URL` = `https://clerk.assistwithfamilyhistory.com`

**Why it matters:** these two values now do more than name the endpoint. The
audience check in item 2 compares against `MCP_RESOURCE_URL`, and the grant
lookup keys on the verified issuer, so a stale value would either weaken the
audience check or make previously approved grants stop resolving (they are
stored with the issuer they were approved under).

**Current behaviour:** `requiredUrl()` already normalizes the two retired
`discovertheirstories.com` hosts to the canonical ones, so a stale value fails
safe rather than silently splitting the grant table. This item is a
confirmation, not a change — **read the values, do not set them** unless they
are wrong.

**Effect of getting it wrong:** grants approved under one issuer string will not
resolve under another, and every connection would read as unapproved. That is
fail-closed, which is correct, but it looks like an outage to a person.

**Rollback:** restore the previous value.

---

## Explicitly NOT done, and not to be done without a separate decision

- No token server was written. The provider remains the authorization server.
- DCR was **not** enabled, and no public registration endpoint exists in this
  repository.
- No secret, environment variable, or deployment was created, read, or changed.
- No real family record, no Scott account, and no production client was used.
- No client name (Claude, ChatGPT, Codex, Grok, Hermes, or any other) has been
  added to `/ai` or `/ai.txt`. Per AWF-WO-011 that requires that exact client's
  full lifecycle proof, which has not been run.

## What is already true without any provider change

The product-grant layer works today against the provider exactly as it is
configured now:

- an unapproved connection sees zero tools and gets `GRANT_REQUIRED` with a
  recovery that names `https://assistwithfamilyhistory.com/settings/ai`;
- revocation takes effect on the very next request, because the grant is
  re-resolved per request and the transport is stateless — no waiting for a JWT
  to expire;
- scopes, record boundaries, and the Queue principal all derive from the grant.

None of that depends on items 1–3. They make client identity honest and close
the cross-resource replay gap; they are not what makes the permission real.
