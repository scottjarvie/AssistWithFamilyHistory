# GEN-87 — Closing the Convex Trust Boundary

Status: design proposal (no code yet). Owner: engineering. Decision-oriented.

## 1. Threat model (plain terms)

`NEXT_PUBLIC_CONVEX_URL` is, by design, public — it ships to every browser. Anyone
can open a JS console (or `curl`) and call our Convex functions directly against
that URL. Today every owner-scoped function in `convex/vault.ts` (18 public
queries) and `convex/vaultMutations.ts` (24 public mutations) takes
`vaultOwnerId: v.string()` as a **client-supplied argument** and trusts it.
`convex/vaultCore.ts` (`normalizeVaultOwnerId` / `matchesVaultOwner`) only
*normalizes and compares* that string — it never verifies the caller is allowed
to use it. There is no `convex/auth.config.ts`, so Convex has no notion of who
the caller is.

Consequence: a logged-in user knows their own id is `user_<clerkId>` and a guest
is `guest_<uuid>`. Either can pass **any** `vaultOwnerId` to **any** function and:

- **Read** another tenant's entire vault (people, sources, media, stories) — a
  cross-tenant data breach, including private/unpublished material that the
  public-story allowlist was built to keep out of public bundles.
- **Write/delete** into another tenant's vault, or migrate someone else's guest
  vault into their own account via `migrateGuestVault`.

The Next.js server (`lib/vault/server.ts` → `getVaultAccessContext`) derives the
*correct* owner from Clerk or the signed-ish cookie, but that's advisory only:
the security check lives in the trusted Next layer, while the data lives behind
an untrusted-but-public Convex endpoint. The boundary is in the wrong place.

## 2. Option A — Clerk as a Convex auth provider (RECOMMENDED)

Make Convex itself verify identity, so the owner is derived **inside** each
function from a cryptographically-verified token rather than from an argument.

- Add `convex/auth.config.ts` declaring Clerk as an OIDC provider (issuer =
  Clerk Frontend API domain / `CLERK_JWT_ISSUER_DOMAIN`, applicationID = the
  JWT template audience, e.g. `"convex"`). Configure a "convex" JWT template in
  the Clerk dashboard.
- In `lib/convex/server.ts`, after building `ConvexHttpClient`, call
  `client.setAuth(token)` where `token` is the Clerk JWT minted server-side
  (`auth().getToken({ template: "convex" })`). The token rides every request.
- Inside each owner-scoped Convex fn, derive the owner from
  `ctx.auth.getUserIdentity()`: `identity.subject` is the verified Clerk user id.
  The function uses **that** for the `by_owner` index and rejects any request
  where the (now optional) `vaultOwnerId` arg doesn't match. Mismatch / no
  identity → throw.

Why recommended: the trust boundary moves into Convex where the data is. The
public URL stops being a liability — unauthenticated callers get nothing. It's
the Convex-blessed pattern, minimal new surface area, and leaves the
server-component-first frontend untouched (the token is attached server-side).

Cost: every signed-in caller needs a real token; guest vaults need an identity
story (see §4).

## 3. Option B — internalize functions + trusted server boundary

Convert the 42 owner-scoped `query`/`mutation` exports to `internalQuery` /
`internalMutation` (the existing alias pattern is a LEAVE-ALONE zone, so we keep
its shape). Internal functions are **not** reachable from the public client at
all. The Next.js server becomes the only caller, using the Convex **deploy key**
(server-only `CONVEX_DEPLOY_KEY` / admin client) and passing the
server-derived `vaultOwnerId` from `getVaultAccessContext`.

Pros: no Clerk-JWT plumbing; the existing arg-passing call pattern survives
almost verbatim (just behind an admin client). Trust collapses to "do we trust
our own Next server" — which we already must.

Cons: the Next server now holds god-mode credentials; any SSRF/route bug there
is total compromise. It also blocks any future direct browser→Convex realtime
reads. It's a bigger blast radius than A and a worse long-term posture.

## 4. THE HARD PART — anonymous/guest vaults (`guest_<uuid>`)

Guests have no Clerk identity, so neither option secures them out of the box.
Today `proxy.ts` mints `guest_<uuid>` and stores it in the `vault-preview-id`
cookie (`httpOnly`, but **unsigned** — the value is the secret). Anyone who
guesses/steals a guest UUID owns that vault.

Two ways to give guests an unforgeable identity:

- **A-aligned: Convex-issued anonymous session.** Use Convex's anonymous/custom
  auth so a guest gets a real signed token whose `subject` is the guest id.
  `getUserIdentity()` then works uniformly for guests and users; functions don't
  branch. Cleanest end state.
- **B-aligned (or A-interim): signed cookie token.** Replace the raw UUID cookie
  with a server-signed token (HMAC of `guest_<uuid>` using a server secret, or a
  short JWT). `getVaultAccessContext` verifies the signature before trusting the
  owner. Forgery now requires the server secret. Pairs naturally with Option B
  (server is already the trusted boundary) and can also bridge Option A until
  Convex anonymous auth is wired.

**Binding the GEN-83 migration to the caller.** `migrateGuestVault` currently
trusts both `fromVaultOwnerId` (must be `guest_*`) and `toVaultOwnerId` (must be
`user_*`) as args — so any user can claim any guest vault. Under either option
the fix is the same: `toVaultOwnerId` must equal the **authenticated caller**
(`identity.subject` in A, or the server-derived `userId` in B) — never an arg —
and `fromVaultOwnerId` must match the **verified** guest token presented by the
same request (signed cookie / guest session), not a bare string. So migration
only ever moves *this guest's* rows into *this user's* account.

## 5. Rollout plan (keep the app working)

1. **Centralize first.** Add a `resolveOwner(ctx, arg?)` helper in
   `convex/vaultCore.ts` (the LEAVE-ALONE note covers public-story allowlist and
   gate predicates, not a new helper). All 42 call sites already import from
   `vaultCore`, so switching them to call `resolveOwner` is a one-touch-per-file
   change and the only behavioral edit lands in one place.
2. **Phase 0 — shadow.** `resolveOwner` derives owner from `getUserIdentity()`
   when present, falls back to the arg, and **logs** mismatches without throwing.
   Add `auth.config.ts` + `setAuth` for signed-in users. Watch logs for
   legitimate mismatches.
3. **Phase 1 — enforce for signed-in users.** Flip `resolveOwner` to throw on
   mismatch / missing identity for `user_*`. Guests still use the arg path.
4. **Phase 2 — secure guests.** Ship signed guest token (or Convex anonymous
   session) + the migration binding from §4. Then enforce for guests too.
5. **Phase 3 — cleanup.** Make `vaultOwnerId` args optional/removed; under
   Option B, internalize the functions. `migrateGuestVault` no longer accepts a
   client-chosen `toVaultOwnerId`.

Each phase is independently shippable and reversible behind the single helper.

## 6. Decisions Scott must make

1. **Option A vs B** (recommend A: Clerk-as-Convex-auth — better long-term
   posture, public URL stops mattering). B is faster but concentrates risk in
   the Next server.
2. **Guest identity mechanism** — Convex anonymous sessions (cleaner, more work)
   vs signed cookie token (faster, pairs with B). Recommend signed cookie as the
   interim, Convex sessions as the target if we stay on A.
3. **Do we keep anonymous/guest vaults at all?** If `ALLOW_ANONYMOUS_VAULT` is
   only for demos, we could drop §4 entirely and require sign-in — much simpler.
4. **Dashboards needed:** Clerk JWT template + `CLERK_JWT_ISSUER_DOMAIN`
   (Option A), or `CONVEX_DEPLOY_KEY` as a server secret (Option B). These are
   external/secret changes Scott controls.
