# GEN-87/88 Guarded Rollout Runbook

This is the production procedure for moving the Convex trust boundary from
shadow to enforce. Do not skip the observation window.

Since 2026-11-24 (pull request 170) Convex refuses a missing identity, a
mismatched owner or a foreign reference in **both** modes. Shadow no longer
lets those calls through, so a legitimate flow that lacks a token already fails
in shadow. The flip still changes two things: the Next server refuses to call
Convex without a token (lib/convex/server.ts), and the legacy guest-source
transfer is refused (`guest_source_unverified`). The observation window below
is how you prove legitimate traffic carries a token before that.

## 1. Configure Clerk identity

In the production Clerk instance:

1. Create a JWT template named exactly **convex** using Clerk's Convex preset.
2. Confirm its audience is **convex**.
3. Copy the template's exact issuer URL.
4. Confirm its subject claim is the same Clerk user ID already stored as the
   user's vaultOwnerId.

Do not mix Clerk development keys or issuer with a production Convex
deployment.

## 2. Environment matrix

| Variable | Vercel Next server | Convex deployment | Required posture |
| --- | --- | --- | --- |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | yes | no | Production Clerk app |
| CLERK_SECRET_KEY | yes | no | Production Clerk app |
| CLERK_JWT_ISSUER_DOMAIN | yes | yes | Exact convex template issuer |
| NEXT_PUBLIC_CONVEX_URL | yes | no | Same Convex deployment being configured |
| TRUST_BOUNDARY_MODE | yes | yes | Start at shadow |
| TRUST_BOUNDARY_SUPER_ADMIN_IDS | no | yes | Comma-separated exact Clerk subjects |
| REQUIRE_AUTH | yes | no | true |
| ALLOW_ANONYMOUS_VAULT | yes | no | false or unset |
| NEXT_PUBLIC_ALLOW_ANONYMOUS_VAULT | yes | no | false or unset |

TRUST_BOUNDARY_MODE is server-only. Do not create a public-prefixed twin.

Configure Convex and deploy the shadow implementation:

~~~bash
pnpm exec convex env set --prod CLERK_JWT_ISSUER_DOMAIN 'https://production-clerk-issuer'
pnpm exec convex env set --prod TRUST_BOUNDARY_MODE shadow
pnpm exec convex env set --prod TRUST_BOUNDARY_SUPER_ADMIN_IDS 'user_superadmin_clerk_id'
pnpm exec convex deploy --message 'GEN-87/88 shadow trust boundary'
~~~

Then redeploy Vercel with its matching shadow value.

## 3. Observe representative traffic

Record the start in epoch milliseconds:

~~~bash
node -e 'process.stdout.write(String(Date.now()))'
~~~

Exercise at least one complete legitimate cycle:

- signed-in dashboard, people, person, story, place, research, and operations;
- draft save, import, citation, media, research, and publish preview;
- published story by slug and legacy ID;
- draft or review story returns not found publicly;
- Open Graph image and sitemap;
- desktop and mobile public-story layouts.

Do not use another real family's data for a mismatch probe. Automated tests
cover that condition safely.

## 4. Read the shadow summary

The query defaults to seven days and caps at 10,000 rows. Use the rollout start
timestamp and an exact subject configured in
TRUST_BOUNDARY_SUPER_ADMIN_IDS:

~~~bash
ROLLOUT_START_EPOCH_MS=1783876512000 # replace with the recorded rollout start
pnpm exec convex run --prod \
  --identity '{"subject":"user_superadmin_clerk_id","issuer":"operator","tokenIdentifier":"operator|user_superadmin_clerk_id"}' \
  trustBoundary:getShadowLogSummary \
  "{\"since\":${ROLLOUT_START_EPOCH_MS},\"limit\":10000}"
~~~

Do not flip unless:

- mode is shadow;
- truncated is false;
- legitimate signed-in traffic has zero missing_identity, owner_mismatch, or
  reference_owner_mismatch denials;
- every function, reason, and caller count is understood;
- no legitimate workflow depends on guest_source_unverified,
  publish_gate_failed, direct_publish_bypass, or
  published_edit_requires_review.

Hostile probes may make total nonzero. The acceptance condition is **zero
legitimate denials**, not necessarily zero hostile traffic.

The summary counts refused actions only. A refused mutation rolls back its own
writes, so shadow reports it as a `Trust boundary shadow denial` line in the
Convex function logs instead. Search the production logs for that text over the
same window and apply the same zero-legitimate-denials rule.

## 5. Flip to enforce

1. Set Vercel Production to TRUST_BOUNDARY_MODE=enforce and redeploy Next
   first, so the server proves it can mint and attach the token. (Convex owner
   checks already refuse in shadow; only the guest-source rule is still
   permissive there.)
2. Confirm one signed-in private request succeeds.
3. Flip Convex:

~~~bash
pnpm exec convex env set --prod TRUST_BOUNDARY_MODE enforce
pnpm exec convex env get --prod TRUST_BOUNDARY_MODE
~~~

4. Repeat the signed-in private and public-story checks.
5. Run the summary query once more and confirm its returned mode is enforce.

Enforce denials throw instead of entering the shadow table. Use Convex and
Vercel error logs for new enforcement incidents.

## 6. Roll back

Restore Convex first so refusals are recorded again in the shadow summary and
function logs. Since pull request 170 this does **not** reopen owner checks: a
call without a matching signed-in owner stays refused in shadow. Only the
guest-source transfer becomes permissive again.

~~~bash
pnpm exec convex env set --prod TRUST_BOUNDARY_MODE shadow
pnpm exec convex env get --prod TRUST_BOUNDARY_MODE
~~~

Then restore Vercel to shadow and redeploy Next. Leave the issuer and
superadmin configuration in place, reproduce the workflow, and inspect its
summary record before trying another flip.
