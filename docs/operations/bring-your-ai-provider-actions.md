# Bring Your AI — provider actions

> Status: refreshed from source and from read-only production probes,
> 2026-08-17. **Nothing in this document has been performed.** No provider
> dashboard, setting, secret, environment variable, deployment, or real family
> record was touched while building AWF-WO-011 or while verifying this runbook.
>
> Everything here is a change outside the repository — in Clerk, in Convex
> environment configuration, or in a deployment — and therefore sits behind the
> human gate in AWF-WO-011 (Human gates 2 and 3).
>
> **Repo-side readiness, verified 2026-08-17 on a clean worktree of
> `origin/main`:** `pnpm verify` passes all 55 steps, and
> `pnpm exec tsc --noEmit -p convex/tsconfig.json` is clean, so the Convex function
> set compiles before anything is pushed at production.

## Why this file exists

The grant, scope, boundary, and revocation machinery is now in the repository
and enforced on every request. Several things it depends on cannot be changed
from inside the repository, because they live in the identity provider, in
deployment configuration, or in the act of deploying itself. They are listed
below in the order they would need to happen.

Each item states the exact place, the exact setting or command, why it matters,
what changes in observable behaviour, and how to undo it.

---

# SEND TO CODEX

## 0. Deploy the release from a pinned, clean worktree

Production currently predates PR #58 — **proved, not assumed.** Read-only probes
on 2026-08-17:

- `https://assistwithfamilyhistory.com/ai.txt` is generated from
  `lib/mcp/catalog.ts`, so it is a live readout of the deployed tool surface. It
  lists the **twelve legacy names only** — `get_family_history_brief`,
  `save_person`, `save_complete_result` and the rest — with no `family_history_*`
  name anywhere, and states in its own words: *"Current in production: …
  twelve tools"*. Its "Later" line still names *"granular grant UI"* and
  *"private media delivery"*, which are exactly what PR #58 delivers.
- `https://assistwithfamilyhistory.com/app/settings/ai` answers **404**, so the
  connection centre is not deployed.
- `/mcp` already returns the correct branded 401 challenge and
  `/.well-known/oauth-protected-resource/mcp` already returns the canonical
  resource, so the transport and OAuth layers need nothing.

That is why this release is additive rather than corrective. `/ai.txt` is also
the cheapest post-deploy signal: after the deploy it must list fourteen
`family_history_*` names instead of twelve legacy ones.

### 0a. Never deploy from a local checkout

Do **not** run any deploy from `/Users/scottjarvie/IDE/AssistWithFamilyHistory`.
That folder is a working checkout; it can drift from `origin/main` at any moment
and it carries untracked files. A deploy must come from a worktree pinned to one
exact commit.

```bash
MAIN=/Users/scottjarvie/IDE/AssistWithFamilyHistory
git -C "$MAIN" fetch origin

# The exact commit to deploy. Record it, then never re-resolve it mid-release.
SHA=$(git -C "$MAIN" rev-parse origin/main)
echo "deploying $SHA"

git -C "$MAIN" worktree add ".claude/worktrees/deploy-${SHA:0:7}" "$SHA"
DEPLOY="$MAIN/.claude/worktrees/deploy-${SHA:0:7}"
cd "$DEPLOY" && pnpm install --frozen-lockfile
```

**Pinned deploy SHA for this release:**
`78dd1a50663d271bc00f8658bb6548ac1e5ef6e4`, and the worktree already exists at

```
/Users/scottjarvie/IDE/AssistWithFamilyHistory/.claude/worktrees/deploy-78dd1a5
```

with `pnpm install --frozen-lockfile` already completed. See
`docs/operations/deploy-pin-awf-wo-011.md` for the staleness check — `origin/main`
is deliberately one docs-only commit ahead of the pin.

Verify the worktree is exactly what you think it is before going further:

```bash
git -C "$DEPLOY" rev-parse HEAD                    # must equal $SHA
git -C "$MAIN" rev-parse origin/main               # must equal $SHA
git -C "$DEPLOY" status --porcelain                # must be empty
```

If any of those three disagree, stop. Re-fetch and rebuild the worktree rather
than deploying something you have not pinned.

**Leave the worktree free of `.env.local`.** A fresh worktree has none, and it
should stay that way: `.env*` is gitignored, so nothing is carried in, and every
command in this runbook works without it. Stage environment values intentionally
at the one step that needs them (item 4's lifecycle run, which reads them from
the shell) rather than dropping a file into the tree where later commands can
pick it up silently.

> ### ⚠️ `convex deploy` targets **production by default** — there is no `--prod`
>
> Verified against the CLI this repo resolves (`convex` pinned `^1.32.0`,
> installed **1.39.1**): `convex deploy --help` says *"By default, this deploys
> to your prod deployment."* and lists **no `--prod` flag**. This is the opposite
> of what most people assume, and it is worth reading twice:
>
> - `convex env`, `convex dashboard`, and `convex dev` default to your **dev**
>   deployment and need `--prod` to reach production.
> - `convex deploy` defaults to **production** and cannot be told otherwise by
>   `CONVEX_DEPLOYMENT`. A `dev:` value in `CONVEX_DEPLOYMENT` does **not** make
>   `convex deploy` safe — it still deploys that project's default production
>   deployment. A `convex deploy` typed in an ordinary dev checkout *is* a
>   production deploy.
>
> Never type `convex deploy --prod`; it is not a real flag and reads as though a
> plain `convex deploy` were the safe one.
>
> ### ⚠️ `CONVEX_DEPLOY_KEY` in `.env.local` overrides everything
>
> The Convex CLI reads `CONVEX_DEPLOY_KEY` from `.env.local` **itself**, not
> only from the shell. A `prod:` key sitting in that file silently retargets
> *every* Convex command at **production**, even in a shell you believe is
> clean. Verified 2026-08-17: neither
> `/Users/scottjarvie/IDE/AssistWithFamilyHistory/.env.local` nor the deploy
> worktree contains a `CONVEX_DEPLOY_KEY`, so the trap is not armed today — but
> confirm it again before running anything that can write:
>
> ```bash
> grep -c CONVEX_DEPLOY_KEY "$DEPLOY/.env.local" 2>/dev/null || echo "no .env.local — good"
>
> # Print the deployment a Convex command would actually touch. Without --prod
> # this shows the DEV deployment and proves nothing about production.
> cd "$DEPLOY" && pnpm exec convex dashboard --no-open --prod
>
> # Show exactly what a deploy would push, without pushing it.
> cd "$DEPLOY" && pnpm exec convex deploy --dry-run -v
> ```
>
> `--dry-run` prints the generated configuration and the full listing of changes
> — the function modules and the schema it would push — and exits without
> deploying. For this release the listing should name the `mcp*` modules and the
> two new tables from 0d, and nothing outside the repository's `convex/`
> directory. If it names a deployment you do not recognise, stop.
>
> Run both checks before any Convex command in this document. They are the only
> way to know which deployment you are about to touch.

### 0b. Re-run the gate on the pinned worktree

```bash
cd "$DEPLOY"
pnpm verify                                        # expect: All 55 verification steps passed.
pnpm exec tsc --noEmit -p convex/tsconfig.json      # expect: no output, exit 0
```

### 0c. Ordering — the Convex backend goes first, and the build already does it

`vercel.json` sets the build command to `node scripts/vercel-build.mjs`. With a
production `CONVEX_DEPLOY_KEY` present — and it **is** present on Vercel
Production, confirmed 2026-08-17 — that wrapper runs:

```
npx --no-install convex deploy --cmd 'npx --no-install next build'
```

`convex deploy --cmd` pushes the Convex functions and schema **first**, then runs
the Next.js build against the deployed backend, and only then does Vercel publish
the frontend. That is the ordering this release needs: the new `family_history_*`
tools and the new tables must exist before any page can call them.

So the deploy is a single act — publishing `$SHA` to Vercel Production — not two.
**Do not also run `convex deploy` by hand.** It takes no `--prod` flag because it
already targets production by default (see the warning in 0a), so a hand-typed
`convex deploy` is a second, unversioned production backend deploy from whatever
directory you happened to be standing in.

```bash
cd "$DEPLOY"
pnpm dlx vercel@latest deploy --prod --yes
```

Confirm afterwards that the build log contains
`[vercel-build] production deploy key in production — building, then deploying Convex prod`.

### 0d. What production's database receives

The whole delta is **additive**. Verified by diffing `convex/schema.ts` between
the pre-#58 baseline (`862a224`, the first parent of merge `fbed586`) and
`origin/main`: 91 inserted lines, 1 changed line, and that one change is an index
list gaining a member. `/ai.txt`'s twelve-tool readout above is the independent
live confirmation that `862a224` really is what production runs, rather than an
assumption inherited from the PR description.

**Two new tables**

- `mcpGrants` — the durable product grant. Indexes `by_owner`,
  `by_owner_status`, `by_owner_client`. A pending connection request is a row in
  this table with `status: "pending"`, not a separate table.
- `mcpClientRegistrations` — validated Client ID Metadata Documents and the
  bounded DCR fallback. Indexes `by_clientId`, `by_provenance_validated`.

**Two new optional fields on one existing table**

- `agentActivity.grantId` — `v.optional(v.id("mcpGrants"))`
- `agentActivity.clientId` — `v.optional(v.string())`

**One new index on one existing table**

- `agentActivity.by_owner_grant` on `["vaultOwnerId", "grantId"]`

**Nothing else.** No field was removed or renamed, no existing optional field
became required, and no existing table gained a required field — so every row
already in production remains valid under the new schema and Convex will accept
it without a migration. There is no evidence table: `family_history_get_evidence`
reads the existing `media` and `documents` records rather than adding storage.

`convex/vaultMigration.ts` adds `mcpGrants` to `OWNED_TABLES`, so a guest vault
that somehow acquired a grant carries it through claim rather than orphaning it.

**Rollback:** redeploy the previous Vercel production deployment. The two new
tables simply go unread; they hold no data any pre-#58 code path depends on.

---

## 1. Decide the client-discovery path (Client ID Metadata Documents vs DCR)

**Where:** Clerk Dashboard → the **production** instance for
`clerk.assistwithfamilyhistory.com` → Configure → OAuth Applications (the
surface that publishes the authorization-server metadata at
`https://clerk.assistwithfamilyhistory.com/.well-known/oauth-authorization-server`).

**Exact setting:** whichever of these Clerk currently offers:
- `client_id_metadata_document_supported` — the CIMD path, preferred; or
- **Dynamic Client Registration**, which publishes a `registration_endpoint`.

**Current observed truth — CONFIRMED 2026-08-17: Dynamic Client Registration is
NOW LIVE on production.** `clerk.assistwithfamilyhistory.com` advertises
`"registration_endpoint": "https://clerk.assistwithfamilyhistory.com/oauth/register"`.
It still does **not** advertise `client_id_metadata_document_supported`.

**This changes the decision in this section.** DCR is the approved soft-launch
path: a conforming client can now self-register and begin OAuth without anyone
hand-creating a client for it, which is the whole point of the connection. CIMD
is **deferred** — it remains the preferred long-term identifier and the strict
validation in `lib/mcp/clientMetadata.ts` stays ready for the day Clerk offers
it, but it is not a launch blocker and no work is queued against it.

Because DCR is a public client-creation surface, the bounded posture already in
`convex/mcpClientTrust.ts` is what keeps it safe: `MAX_DCR_REGISTRATIONS = 50`,
a 30-day expiry, and an owner-visible inventory. Self-registered clients are
still recorded as `trusted: false` — a token was issued to that client and
nothing more is claimed — and a registration is never authority: the person's
product grant is, and it is refused by default.

Re-check the live truth yourself in one command:

```bash
curl -sS https://clerk.assistwithfamilyhistory.com/.well-known/oauth-authorization-server \
  | python3 -m json.tool | grep -E 'registration_endpoint|client_id_metadata_document_supported' \
  || echo "neither CIMD nor DCR is advertised"
```

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

**Recommendation, as of 2026-08-17:** proceed on DCR, which is live and is the
approved soft-launch path. Keep the bounded registration posture as written.
Prefer CIMD when Clerk offers it, and treat that as a later improvement to
client identity rather than outstanding work.

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

**How to verify it landed** — decode an access token minted for this resource
and look for the claim. Run this in a shell where `$MCP_TOKEN` holds a
**synthetic** acceptance token; never paste a real person's token:

```bash
python3 - <<'PY'
import base64, json, os
tok = os.environ["MCP_TOKEN"].split(".")[1]
tok += "=" * (-len(tok) % 4)
claims = json.loads(base64.urlsafe_b64decode(tok))
print("aud     :", claims.get("aud"))
print("resource:", claims.get("resource"))
print("expected: https://assistwithfamilyhistory.com/mcp")
PY
```

Before the change, both print `None` and the token is still accepted. After the
change, one of them equals the resource exactly.

**Rollback:** stop emitting the claim. The tolerant branch means nothing breaks.

---

## 3. Confirm the production environment variables — Convex side and Vercel side

Two different stores hold them, and confusing the two is the classic way this
release goes wrong. **Convex functions read the Convex deployment's env vars;
they cannot see Vercel's.** `convex/auth.config.ts`, `convex/access.ts`, and
`convex/httpRoutes/mcp.ts` all read `process.env` *on the Convex backend*.

> ### ⚠️ Target the right Convex deployment
>
> `--prod` means *"this **project's** default production deployment"* — and the
> project is resolved from `CONVEX_DEPLOYMENT` / `convex.json` in whatever
> directory you are standing in. On a developer machine that is often a
> *different Convex project*, so `pnpm exec convex env list --prod` will happily
> print "No environment variables set" for a production deployment that has
> nothing to do with this site. That happened while writing this runbook.
>
> The cure is to name the deployment explicitly with `--deployment <name>`
> rather than trusting `--prod`. Get the real name from the value Vercel
> actually ships:
>
> ```bash
> # Pull OUTSIDE the deploy worktree — never leave an env file in the tree.
> TMPENV=$(mktemp -d)
> (cd "$DEPLOY" && pnpm dlx vercel@latest env pull "$TMPENV/prod.env" --environment=production --yes)
> grep NEXT_PUBLIC_CONVEX_URL "$TMPENV/prod.env"   # → https://<name>.convex.cloud
> rm -rf "$TMPENV"                                 # it holds secrets; do not keep it
> ```
>
> Then either read the variables in the **Convex dashboard** (Settings →
> Environment Variables) for the project that owns `<name>`, or pass that name
> to every CLI call:
>
> ```bash
> cd "$DEPLOY"
> pnpm exec convex dashboard --no-open --deployment <name>   # confirm the target first
> pnpm exec convex env list --deployment <name>
> ```
>
> Everything in this section is a **read** against the production deployment.
> `pnpm exec convex env set` is the only write, and it is conditional — run it
> only if a value is genuinely wrong, and only after `convex dashboard
> --no-open --deployment <name>` has confirmed the target.

### Convex deployment env vars (set with `pnpm exec convex env set`, or the dashboard)

| Variable | Value | Read by | Consequence if missing |
| --- | --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | `https://clerk.assistwithfamilyhistory.com` | `convex/auth.config.ts` | **No trusted provider is registered.** Every authenticated Convex call loses its identity; also the fallback source for `MCP_AUTH_SERVER_URL`. |
| `MCP_RESOURCE_URL` | `https://assistwithfamilyhistory.com/mcp` | `convex/httpRoutes/mcp.ts` | Falls back to the same canonical default in code, so this is a confirmation. A *wrong* value is worse than an absent one. |
| `MCP_AUTH_SERVER_URL` | `https://clerk.assistwithfamilyhistory.com` | `convex/httpRoutes/mcp.ts` | Falls back to `CLERK_JWT_ISSUER_DOMAIN`. If both are absent, `/mcp` throws `Missing MCP_AUTH_SERVER_URL`. |
| `TRUST_BOUNDARY_MODE` | whatever posture is already in force (`shadow` or `enforce`) | `convex/access.ts`, `convex/trustBoundary.ts` | Only the exact string `enforce` denies; anything else is shadow. **Do not change this as part of this release.** |

Read them without changing anything:

```bash
CX=<name>          # the deployment you just read out of Vercel — never assume it
pnpm exec convex env list --deployment "$CX"
```

Set one only if it is genuinely wrong. Naming the deployment is not optional
here; a bare `env set` writes to your **dev** deployment and looks like it
worked:

```bash
pnpm exec convex env set --deployment "$CX" MCP_RESOURCE_URL https://assistwithfamilyhistory.com/mcp
pnpm exec convex env set --deployment "$CX" MCP_AUTH_SERVER_URL https://clerk.assistwithfamilyhistory.com
```

### Vercel Production env vars

Observed present on Vercel Production, 2026-08-17 (names only — no value was
read):

```
CLERK_JWT_ISSUER_DOMAIN
NEXT_PUBLIC_CONVEX_URL
CONVEX_DEPLOY_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_CONVEX_SITE_URL
```

Confirm the list yourself with `pnpm dlx vercel@latest env ls production`. Two notes
that matter for this release:

- `CONVEX_DEPLOY_KEY` being present is what makes item 0c's backend-first
  ordering automatic. If it were removed, Vercel would ship the new frontend
  against the old backend — the exact drift GEN-110 exists to prevent.
- `CONVEX_SITE_URL` is **not** set, and does not need to be.
  `lib/mcp/proxy.ts` derives the `.convex.site` origin from
  `NEXT_PUBLIC_CONVEX_URL` when it is absent, which is why `/mcp` proxies
  correctly today.

No new environment variable is introduced by PR #58. Nothing in this section is
a change; it is a pre-flight read.

**Why the two MCP values matter:** these two values now do more than name the endpoint. The
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

## 3b. Post-deploy verification — four concrete checks

Run these immediately after the production deploy publishes. The first three
need no credentials at all. Every one of them was chosen because it fails
loudly if a specific part of this release did not land.

### (i) The 401 challenge is intact

An unauthenticated `/mcp` call must be refused with a branded challenge that
points a client at the protected-resource metadata. This already passes today,
so it is a **regression** check: it must still pass after the deploy.

```bash
curl -sS -i -X POST https://assistwithfamilyhistory.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected — HTTP **401**, `cache-control: no-store`, and exactly this header:

```
www-authenticate: Bearer realm="assist-with-family-history", error="invalid_token", error_description="A valid Family History OAuth token is required.", resource_metadata="https://assistwithfamilyhistory.com/.well-known/oauth-protected-resource/mcp"
```

with the body:

```json
{"error":"invalid_token","error_description":"A valid Family History OAuth token is required."}
```

And the metadata that header advertises must resolve:

```bash
curl -sS https://assistwithfamilyhistory.com/.well-known/oauth-protected-resource/mcp
```

```json
{"resource":"https://assistwithfamilyhistory.com/mcp","resource_name":"Assist With Family History","authorization_servers":["https://clerk.assistwithfamilyhistory.com"],"bearer_methods_supported":["header"],"resource_documentation":"https://assistwithfamilyhistory.com/ai"}
```

A `resource` or `resource_metadata` naming `discovertheirstories.com` means a
stale `MCP_RESOURCE_URL` slipped past the normalizer in item 3. A **406** or a
plain 500 means the proxy could not reach the Convex site origin.

### (ii) The canonical `family_history_*` tools appear after grant approval

Discovery is grant-filtered, so this check has two halves and the first half is
as important as the second.

**Before approval** — an authenticated but ungranted connection must see an
empty catalogue, and the first tool call must refuse with `GRANT_REQUIRED`
naming `/app/settings/ai`:

```bash
curl -sS -X POST https://assistwithfamilyhistory.com/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: a result whose `tools` array is empty, carrying `resultType`,
`ttlMs`, and `cacheScope`. (A `complete` list result that omits those is the
defect PR #58 fixed; its absence would cause a conforming client to cache the
connection as permanently toolless.)

**After approving the request at `/app/settings/ai`**, the same call must list
**14 canonical tools**, every one prefixed `family_history_`:

```
family_history_get_brief
family_history_search
family_history_get_context
family_history_get_evidence
family_history_save_person
family_history_save_relationship
family_history_save_event
family_history_save_source_evidence
family_history_save_research_work
family_history_save_story_work
family_history_save_records
family_history_save_complete_result
family_history_get_queue
family_history_update_queue
```

Extract just the names:

```bash
curl -sS -X POST https://assistwithfamilyhistory.com/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | python3 -c 'import sys,json;print("\n".join(t["name"] for t in json.load(sys.stdin)["result"]["tools"]))'
```

### (iii) The legacy tool aliases still answer

Namespacing must not break a client that connected before this release. Twelve
of the fourteen canonical tools keep their pre-#58 name as a registered,
deprecated alias on the **same handler and the same scope**
(`lib/mcp/catalog.ts`). The two new tools —
`family_history_get_evidence` and `family_history_save_records` — have no alias,
correctly, because no client ever knew them by another name.

| Legacy alias | Canonical name |
| --- | --- |
| `get_family_history_brief` | `family_history_get_brief` |
| `search_family_history` | `family_history_search` |
| `get_family_history_context` | `family_history_get_context` |
| `save_person` | `family_history_save_person` |
| `save_relationship` | `family_history_save_relationship` |
| `save_event` | `family_history_save_event` |
| `save_source_evidence` | `family_history_save_source_evidence` |
| `save_research_work` | `family_history_save_research_work` |
| `save_story_work` | `family_history_save_story_work` |
| `save_complete_result` | `family_history_save_complete_result` |
| `get_queue` | `family_history_get_queue` |
| `update_queue` | `family_history_update_queue` |

The safest read-only alias to exercise live is `get_family_history_brief`:

```bash
curl -sS -X POST https://assistwithfamilyhistory.com/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_family_history_brief","arguments":{}}}'
```

Expected: the same shape `family_history_get_brief` returns, and **not** an
`UNKNOWN_TOOL` refusal. Aliases are deliberately absent from the advertised
catalogue in (ii) — they are accepted, not advertised. Seeing 26 tools rather
than 14 would itself be the bug.

Cheapest version of the same check, needing no token at all — `/ai.txt` is
generated from the same catalogue:

```bash
curl -sS https://assistwithfamilyhistory.com/ai.txt | sed -n '/^## Tools/,/^$/p'
```

Before the deploy this lists twelve bare legacy names. After it,
`app/ai.txt/route.ts` renders each canonical tool with its scope and its alias
in brackets, so one command confirms (ii) and (iii) at once:

```
- family_history_get_brief (context:read, read-only) [alias: get_family_history_brief] — …
- family_history_get_evidence (evidence:read, read-only) — …
```

Fourteen lines, twelve of them carrying `[alias: …]`.

### (iv) `/app/settings/ai` is reachable and renders the grant UI

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://assistwithfamilyhistory.com/app/settings/ai
```

Expected after deploy: **not 404**. Signed out it redirects to sign-in
(`REQUIRE_AUTH` posture); today, pre-deploy, it is a flat 404, which is the
clearest single signal of whether this release landed.

Then open it signed in as the synthetic acceptance identity and confirm by eye:
the pending request appears with the client's observed name (**not** a tool name
like `save_person` — that was a defect PR #58 fixed), nothing is pre-ticked,
both never-lists render verbatim, the record-boundary choice offers whole
workspace / selected people / queue-only, and the approved connection then shows
activity and an off switch.

---

## 4. Run the live lifecycle once, with the synthetic acceptance identity

**Where:** a terminal, after AWF-0040 through AWF-0042 are released.

**What to run:**

```
MCP_LIFECYCLE_ENDPOINT=https://assistwithfamilyhistory.com/mcp \
MCP_LIFECYCLE_RUN_KEY=codex-test:awf-joined:<unique-run-name> \
MCP_LIFECYCLE_TOKEN=<access token for the retained synthetic subject> \
MCP_LIFECYCLE_OWNER_ID=<the retained synthetic subject> \
NEXT_PUBLIC_CONVEX_URL=<production Convex URL> \
CONVEX_AUTH_TOKEN=<short-lived token for that same subject> \
pnpm mcp:lifecycle
```

Run it from the pinned deploy worktree (`cd "$DEPLOY"`), so the harness source is
the same commit production is running.

### 4a. Exactly what the harness needs

Read from `scripts/mcp-lifecycle.ts`. It is an interactive TTY program — do not
pipe its output or run it detached, because it stops and waits for a person.

| Variable | Required | What it must contain |
| --- | --- | --- |
| `MCP_LIFECYCLE_ENDPOINT` | yes | `https://assistwithfamilyhistory.com/mcp` |
| `MCP_LIFECYCLE_RUN_KEY` | yes | Must begin with the acceptance prefix `codex-test:awf-joined:` — see 4b. Lowercased on read. |
| `MCP_LIFECYCLE_TOKEN` | yes | An OAuth access token for the **synthetic** acceptance subject. Environment only; the harness refuses it as an argument and never prints it. |
| `MCP_LIFECYCLE_OWNER_ID` | for step 11 | The same synthetic subject. Without it, cleanup is skipped rather than guessed. |
| `NEXT_PUBLIC_CONVEX_URL` | for step 11 | The production Convex cloud URL — the same one item 3 has you read out of Vercel. |
| `CONVEX_AUTH_TOKEN` | for step 11 | A short-lived Convex token for that same subject, used to call `mcpAcceptanceFixture.clear`. |
| `MCP_LIFECYCLE_TOKEN_OTHER_OWNER` | optional | A second owner's token. Enables the real cross-owner half of step 8; skipped honestly if absent. |
| `MCP_LIFECYCLE_EVIDENCE_IDS` | optional | `media:<id>,document:<id>` — exercises real evidence delivery in step 6; skipped honestly if absent. |

If any of the three step-11 variables is missing, the harness still runs the
ladder but cannot clean up after itself — which means synthetic rows stay in
production until you clear them by hand. Set all three before you start.

### 4b. The acceptance prefix is a hard refusal, not a convention

`FAMILY_HISTORY_ACCEPTANCE_PREFIX` in `convex/mcpAcceptanceFixture.ts` is the
exact string:

```
codex-test:awf-joined:
```

Both the harness and the server-side fixture refuse anything else, so the run
key must be that prefix plus a unique suffix, e.g.
`codex-test:awf-joined:2026-08-17-prod-first`. Every record the run creates
carries that marker visibly, and step 11 deletes exactly the marked graph and
re-queries for zero residue. Reuse of a previous suffix muddles the cleanup
boundary — always pick a new one.

### 4c. Where it stops and waits for a person — four pauses

The harness calls `waitForPerson()` and blocks on **Press Enter** at four
points. Have the browser open at
`https://assistwithfamilyhistory.com/app/settings/ai`, signed in as the
synthetic identity, before starting.

1. **Step 3 — approve the connection.** After it proves an unapproved connection
   sees an empty catalogue, it asks you to find the pending request named with
   your run marker and approve it with at least `context:read`, `evidence:read`,
   `research:write`, `story:draft`, `queue:read`, and `queue:work` across the
   whole workspace.
2. **Step 5 — assign one Queue directive.** Only if no marked directive already
   exists: create one in the app assigned to the chosen AI, whose text begins
   with the run marker. Assignment is a person's act, deliberately not the
   harness's.
3. **Step 10 — turn the connection off.** Do not sign out and do not wait: the
   same token must stay valid, because that is precisely what the step tests.
   The very next call must refuse `GRANT_REVOKED` and discovery must return zero
   tools.
4. **Step 10 again — reconnect.** In the client, disconnect and re-add the
   server, then approve the fresh request at the same page. Tools must reappear.

**Why a human must do it:** these are the moments where a person's authority is
the thing under test. A harness that could approve or revoke on its own would be
proving the wrong thing. It also needs credentials, which the engineering agent
has neither sought nor been given.

**Safety:** the harness refuses to start unless the run key matches
`codex-test:awf-joined:`. It reads the token from the environment only, never
accepts it as an argument, and never prints it. Everything it writes carries the
visible synthetic marker, and step 11 removes exactly that marked graph and
re-queries for zero residue.

**What to record:** paste the final JSON summary line into AWF-0043. Only after
it passes end to end may that exact client's name appear on `/ai`.

**Rollback:** run `mcpAcceptanceFixture.clear` with the same run key. It refuses
if anything unmarked references the marked graph.

---

## Explicitly NOT done, and not to be done without a separate decision

- No token server was written. The provider remains the authorization server.
- No public registration endpoint exists in **this repository**. DCR is served
  by Clerk, and as of 2026-08-17 it is live there (§1). Nobody in this lane
  enabled it, and nothing here should re-enable, disable, or reconfigure it.
- No secret, environment variable, or deployment was created or changed. The
  2026-08-17 readiness pass **listed environment-variable names** on Vercel
  Production and made unauthenticated GET/POST probes of the public production
  endpoints. No value was read, and nothing was written.
- No real family record, no Scott account, and no production client was used.
- No client name (Claude, ChatGPT, Codex, Grok, Hermes, or any other) has been
  added to `/ai` or `/ai.txt`. Per AWF-WO-011 that requires that exact client's
  full lifecycle proof, which has not been run.

## What is already true without any provider change

The product-grant layer works today against the provider exactly as it is
configured now:

- an unapproved connection sees zero tools and gets `GRANT_REQUIRED` with a
  recovery that names `https://assistwithfamilyhistory.com/app/settings/ai`;
- revocation takes effect on the very next request, because the grant is
  re-resolved per request and the transport is stateless — no waiting for a JWT
  to expire;
- scopes, record boundaries, and the Queue principal all derive from the grant.

None of that depends on items 1–3. They make client identity honest and close
the cross-resource replay gap; they are not what makes the permission real.
