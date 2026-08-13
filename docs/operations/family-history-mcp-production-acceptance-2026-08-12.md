# Family History MCP production acceptance — 2026-08-12

> Outcome: production MCP, OAuth consent, canonical saves, UI reflection, and
> fixture cleanup proven with one retained non-privileged synthetic identity.
>
> Boundary: no real family data, Scott account, elevated role, billing, DNS,
> or cross-family access was used.

## Live release boundary

- The production Vercel app now targets Convex production deployment
  `accomplished-dodo-308`; the personal development deployment is not in the
  production environment scope.
- `/ai`, `/ai.txt`, and `/updates` returned HTTP 200.
- `/.well-known/oauth-protected-resource/mcp` returned the canonical resource,
  Clerk authorization-server origin, and `/ai` documentation URL.
- Anonymous `POST /mcp` returned HTTP 401 with a Bearer resource challenge.
- The official `@modelcontextprotocol/client` v2 client negotiated the live
  branded endpoint and listed all twelve Family History tools.

## Authenticated synthetic acceptance

Clerk retains one labeled, non-privileged identity for repeatable acceptance:

- display name: `Family History MCP Test`;
- user id: `user_3HqFpM96Ck1hTJZajDX893sWnPm`;
- empty private vault after cleanup;
- no organization, elevated role, trusted device, family record, or public
  story retained.

Normal password sign-in reached Clerk's fresh-device email verification gate.
That mailbox path was not available, so fresh-device email delivery and code
entry remain unproved. A Clerk user-scoped sign-in token was then issued only
for this identity and consumed once. It changed no global verification policy
and opened only the identity's empty private vault.

A disposable public PKCE OAuth client requested only `openid` and Clerk's
required `offline_access` scope. The signed-in identity saw explicit consent,
the localhost redirect returned the expected state and code, and token exchange
returned a Clerk OAuth access token bound to the exact test subject and client.
Dynamic client registration remains unavailable on the current Clerk instance;
no global provider policy was enabled.

The official MCP client then performed the product loop against
`https://discovertheirstories.com/mcp`:

1. read an empty private Family History brief;
2. created one marked synthetic person;
3. used `save_complete_result` to atomically preserve a residence event,
   source, citation, candidate fact, completed research task, finding, and
   private draft story;
4. searched and hydrated the same canonical records;
5. used `save_story_work` with the exact prior `updatedAt` to correct the story
   and move it to review;
6. read the empty Family History Queue.

The signed-in web UI immediately showed the same person, event, source,
citation, research state, and corrected review story. The public publish action
remained disabled behind evidence, privacy, context, and human-review gates.

## Cleanup and retained boundary

All marked synthetic vault rows, links, review events, stable record keys,
operation receipts, and MCP activity rows were deleted from the empty test
workspace. A final official-client brief and search returned zero people,
stories, tasks, findings, Queue items, or matching synthetic results.

The product session was signed out and the disposable OAuth application was
deleted. Clerk documents that JWT access tokens cannot be revoked at its
revocation endpoint; the issued JWT therefore remained cryptographically valid
until `2026-08-14T02:32:30Z` even after client deletion. Its only retained copy
under worker control was securely removed, along with callback and result
artifacts. The deleted client can mint no new tokens, but enforceable immediate
access-token revocation remains a separate security/provider decision in
AWF-0034.

Only the labeled Clerk identity and its securely stored future password path
remain. Repeating authenticated acceptance needs a new narrow PKCE client or a
future sanctioned dynamic-registration path.

## Credential incident and rotation

During test-user creation, the then-current Convex production deploy key was
entered into Clerk's password field and submitted once in a failed create-user
request. It was not retained as the successful user's password, but it may have
reached Clerk request processing, so it was treated as exposed.

The old key was revoked and deleted. A replacement key named for the 2026-08-12
rotation grants only `deployment:deploy`; its key record remains in Convex and
its value is stored only in the expected protected Vercel production
configuration. No key value is present in this report, repository, browser, or
acceptance artifact. The production deployment created from the final
protected truth PR is the capability check for that replacement key.

## Remaining proof gaps

- Fresh-device email verification and code delivery for the retained test
  identity are unproved.
- Refresh/reconnect was not exercised; the disposable client was deleted after
  acceptance.
- Clerk JWT access tokens are not immediately revocable under the current
  provider posture; AWF-0034 records the smallest next security decision.
- Independent Work Order audit remains separate and `not-audited`.
