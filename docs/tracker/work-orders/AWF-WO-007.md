---
id: AWF-WO-007
title: Rebrand and release the canonical Assist With Family History experience
execution: complete
audit: not-audited
cards: AWF-0035
created: 2026-08-13
updated: 2026-08-13
proposed-by: Codex
---

## Goal

Make Assist With Family History the coherent public, signed-in, AI-connected,
and provider-backed product at `assistwithfamilyhistory.com`, preserving the
earlier sign-in regression repair while removing the retired identity from the
normal user journey.

## Authority and scope

Scott directly authorized the soft-launch rebrand, protected release, and the
ordinary Vercel, Clerk, and domain configuration required for the designated
normal address to work end to end. Scope includes current product/service names,
public and app shells, navigation, Queue, extension presentation, metadata and
social cards, AI/MCP resources and guides, release notes, current documentation,
tracker truth, responsive/browser validation, and provider canonicalization.

Historical evidence and required repository, Convex deployment, storage, or
provider identifiers remain when changing them would break compatibility or
falsify prior proof. This order does not authorize real family data, Scott's
identity, weaker auth, cross-family access, unrelated provider policy, secrets,
billing, or external marketing publication.

## Sequence

1. Read the complete shared Core and Family History Project Philosophy; inventory
   routes, current names, domain/auth configuration, and dirty work.
2. Implement one coherent source rebrand and reverse legacy canonicalization to
   the normal Family History address.
3. Validate tests, build, public and authenticated representative routes,
   responsive layouts, Queue, AI guides, and anonymous MCP boundaries locally.
4. Open a normal protected PR, keep checks green, and merge only the reviewed
   release package.
5. Apply the narrow production Vercel/Clerk/domain configuration, deploy, and
   verify signed-out and isolated signed-in paths plus MCP/OAuth discovery.
6. Clean synthetic data, clients, sessions, and connections; update version
   2.0.0 and this Work Order with exact evidence and remaining proof gaps.

## Dependencies

- Canonical Family Core v1.6.3 and Family History Project Philosophy v1.7.0.
- Existing owner-scoped Convex vault, Queue, stateless MCP, Clerk production
  identity, Vercel project, and both attached production domains.
- Retained empty non-privileged Family History test identity for isolated proof.

## Exclusions

- Real family records, Scott's account, new elevated roles, cross-family access,
  broad product-data scopes, or any weakening of identity/token validation.
- Unrelated provider policy, new billing or costs, storage/Convex project renames,
  GitHub repository renames, and rewriting historical evidence as current proof.
- Big/public-launch marketing, external announcements, or native-app publication.

## Stop rules

Stop if the canonical-domain change requires a broader verification-policy or
security change than ordinary Clerk/Vercel domain configuration, exposes a
secret, needs production family data, crosses another family's tenancy, incurs
cost, or requires an irreversible external action outside the approved rebrand.

## Human gates

Scott's delegation explicitly approves this rebrand, ordinary protected release,
and the necessary Vercel/Clerk/domain configuration. No further routine approval
is needed inside that boundary. Scott's account, real family data, secrets,
billing, unrelated provider/security policy, and external publication remain
outside the grant.

## Verification

- targeted canonical-domain, metadata, MCP proxy, Queue, and documentation contracts
- `pnpm verify`
- responsive browser sweep at 360, 390, 768, 1366, and 1440 CSS pixels
- protected GitHub PR, exact-main CI, and production deployment status
- public home/navigation/metadata and old-domain compatibility redirects
- signed-out `/app` → branded sign-in and isolated signed-in empty workspace/Queue
- `/ai`, `/ai.txt`, `/llms.txt`, protected-resource metadata, and fail-closed
  anonymous `/mcp` challenge on `assistwithfamilyhistory.com`

## Current truth

The source orientation, route/brand inventory, implementation, full local and
responsive verification, protected release, Clerk/Vercel/Convex configuration,
public proof, isolated signed-in web proof, disposable PKCE MCP proof, and exact
cleanup are complete. The code and current docs use Assist With Family History
as the durable identity and `assistwithfamilyhistory.com` as the normal product,
sign-in, and MCP resource address. Version 2.0.0 is Public & live. The earlier
PR #42 repair remains the emergency first phase; independent audit is still
separate and `not-audited`.

## Execution evidence

The complete Core and Project Philosophy were read before implementation. A
79-route inventory and 192-reference brand/domain scan established the source
surface. The version 2.0.0 package now updates product/service naming, public and
signed-in shells, Queue/AI terminology, extension presentation, canonical and
MCP resource addresses, metadata/social images, Project Philosophy 1.7.0,
release notes, tracker metadata, and current docs. Generated Philosophy and
tracker readers have been refreshed. All 47 `pnpm verify` gates passed, as did
focused canonical-domain, MCP proxy, and retired-issuer migration tests.
Responsive screenshots cover 360, 390, 768, 1366, and 1440 pixel widths; direct
390 and 1366 pixel browser metrics found no page overflow or public/AI console
errors. The Queue rendered its intended unavailable-backend state locally
because the isolated worktree has no production Convex configuration.

Clerk now presents the enduring product name and primary domain. Its five
required DNS records are verified and the new issuer serves HTTPS discovery.
Vercel's next production deployment has the new public key, canonical site URL,
and server-side issuer. A narrowly coded compatibility bridge maps only the two
retired production Convex resource/issuer hosts during the atomic protected
deployment; synthetic and development issuers remain environment-driven.
PR #43 passed Actions `31745140417` and Vercel preview, then merged as
`989cecbef5ba38196732549e0a5105443756cac8`. Exact-main Actions
`31745343870` passed. Vercel deployment
`dpl_FXKaH6pN8HG2DS1spSEeCRFZjmRv` reached Ready at
`2026-08-13T14:23:32-07:00` and deployed the reviewed Convex functions.

The normal home, AI guides, updates, and sign-in returned 200; retired product
and Vercel hosts preserved their path in 308 redirects to the normal address.
Phone and desktop signed-out `/app` reached “Sign in to Assist With Family
History” with the canonical return target, no overflow, and no console errors.
OAuth metadata names `https://assistwithfamilyhistory.com/mcp` and
`https://clerk.assistwithfamilyhistory.com`; anonymous MCP returns a real 401
resource challenge.

The first signed-in acceptance exposed a missing standard Clerk `convex` JWT
template: identity succeeded but Queue token minting failed closed. A minimal
template now persists with a 60-second lifetime, five-second skew, and only
`aud: convex`. The repeated 390-pixel run showed an empty signed-in workspace,
all four empty Queue states, no overflow, and no browser/backend errors. A
disposable public PKCE client then received explicit consent for only `openid
offline_access`; its new-issuer `at+jwt` matched the retained test subject and
client. The official MCP client listed all twelve tools and completed the
empty-vault brief and no-match search without any writes.

Cleanup deleted the disposable OAuth client, revoked all exact-test-user
sessions, and removed every generated token/config artifact; final provider
inspection found zero OAuth applications and zero active sessions. Only the
labeled empty non-privileged identity and required minimal `convex` template
remain. Fresh-device email verification, refresh/reconnect, immediate issued-JWT
revocation, and independent audit remain unproved.

During an earlier timed-out acceptance attempt, runner error output included a
five-minute one-use sign-in URL scoped only to the empty test identity. It
included no provider secret, deploy key, Scott credential, or family data. The
token and every exact-user session were revoked immediately, generated files
were removed, and a zero-active-session provider check passed before work
resumed.

## History

- 2026-08-13 · Scott via coordinator delegation — authorized the bounded live
  sign-in regression repair; Codex completed PR #42 and isolated acceptance.
- 2026-08-13 · Scott via coordinator delegation — expanded this coherent route
  into the authoritative Family History rebrand and canonical-domain release.
- 2026-08-13 · Codex — activated the order after philosophy and repository
  orientation; implementation continues and audit remains separate.
- 2026-08-13 · Codex — completed source and provider preparation, passed full
  local and responsive verification, and moved version 2.0.0 to In review;
  protected release and live acceptance continue.
- 2026-08-13 · Codex — merged PR #43, passed exact-main CI and production
  Vercel/Convex deployment, completed canonical public/web/OAuth/MCP acceptance
  and cleanup, moved version 2.0.0 to Public & live, and left audit separate.
