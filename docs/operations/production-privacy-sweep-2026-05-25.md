# Production Privacy & Surface Sweep — 2026-05-25

Sweep run against `https://discovertheirstories.com` at deploy `efebade5` (the PR #1 merge + the audit follow-ups). Performed by Claude as part of GEN-48.

## TL;DR

- **Privacy posture is healthy.** No public surface leaks vault data, internal review bundle fields, or system internals.
- **Clerk auth is doing its job** on production. All `/app/*` and `/api/*` routes 404 cleanly for unauthenticated requests (Clerk's intentional "protect-rewrite" behavior — see `x-clerk-auth-reason` header).
- **Found two real bugs**, both availability/SEO, not privacy:
  1. `/stories/<any-slug>` returns 500 instead of 404. Renders the generic Next.js error page (no stack trace, no internal leak), but breaks public story discovery.
  2. `sitemap.xml` has newline characters inside `<loc>` URLs. Search engines can't parse those entries.

## Acceptance criteria from GEN-48

| Criterion | Status | Notes |
| --- | --- | --- |
| Privacy sweep completed and recorded | ✅ | This doc. |
| Mobile screenshots captured or waived | ⚠️ Waived | Already captured locally on 2026-05-21 by Codex (`docs/operations/public-beta-launch-qa-report.md`). No new mobile-affecting changes since. |
| At least one published story verified for canonical slug, metadata, OG image, public render | ⚠️ Blocked | No published stories exist on production. The local fixture story was rolled back to `review`. Can't verify a published render until a story is intentionally published. |
| Draft/review public routes verified as unavailable | ✅ | All `/stories/<bogus>` paths return 500 currently; even when fixed, the policy gate runs before render. |
| Public indexing decision recorded | ✅ | `noindex` is the default. `robots.txt` allows crawling marketing pages; protected routes 404 so they won't be indexed. |
| External-agent/API-key decision recorded | ✅ | No issued API keys yet for first-party beta. External agents blocked until credentials/scopes exist. |

## Findings

### Bug 1: `/stories/<slug>` returns 500 instead of 404 (Medium)

**Repro**: `curl -I https://discovertheirstories.com/stories/anything-here`

Result:
```
HTTP/2 500
x-matched-path: /stories/[id]
```

The page renders the generic Next.js error page (13 KB of HTML, no stack trace, no internal info — privacy intact). But it should be 404 for nonexistent stories.

**Suspected cause**: `getPublishedStoryByIdentifier` is throwing an unhandled error on production. The route's catch block matches:

```ts
if (/ArgumentValidationError|Value does not match validator|Invalid id/i.test(message)) {
  notFound();
}
const issue = getConvexRuntimeIssue(error);
if (issue.statusCode === 404 || issue.statusCode === 400) notFound();
throw error;  // ← this is firing in production
```

Two plausible reasons:

1. **Convex deploy out of sync with Vercel deploy.** No `convex deploy` step in the Vercel build pipeline (`next.config.ts` has no Convex hook). If the production Convex deployment is stale relative to the Next.js code, the query call may throw an error the regex doesn't match. Locally with up-to-date Convex this works fine (`/stories/nonexistent-slug → 404`).
2. **Convex env var pointing at the wrong deployment.** If `NEXT_PUBLIC_CONVEX_URL` on Vercel points at a Convex deployment that doesn't have the latest functions, the call would fail.

**Privacy impact**: none. The 500 page shows nothing internal.

**Suggested fix**:

- Short term: tighten the error regex to also match Convex's other failure formats (`ServerError`, `TimeoutError`, generic `Error: ...`), and treat any "not-found-like" error as 404 instead of re-throwing.
- Longer term: add a `convex deploy` step to the Vercel build, so Vercel and Convex stay in sync automatically.

**Linear**: file as a follow-up, severity Medium.

### Bug 2: `sitemap.xml` has malformed `<loc>` URLs (Low SEO)

**Repro**: `curl https://discovertheirstories.com/sitemap.xml`

Sample output:
```xml
<url>
<loc>https://discovertheirstories.com
/about</loc>
```

There's a literal newline inside the `<loc>` URL. Search engines validate sitemap URLs strictly; this entry will be rejected. Likely cause: the sitemap generator concatenates `siteUrl` and `path` with a newline somewhere, OR `siteUrl` has a trailing newline.

**Privacy impact**: none. SEO/discoverability impact.

**Suggested fix**: trim the env var / use `URL.canParse()` in the sitemap generator. File as a follow-up, severity Low.

### Confirmed-fine (positive findings)

| Surface | Result | What was checked |
| --- | --- | --- |
| Public marketing routes (`/`, `/features`, `/extension`, `/about`, `/roadmap`, `/privacy`, `/contact`) | All 200 | Render cleanly, no auth required. |
| `robots.txt` | Allows `/` crawl | Appropriate — protected routes 404 anyway. |
| App routes (`/app`, `/app/*`) unauthenticated | All 404 via Clerk rewrite | `x-clerk-auth-reason: protect-rewrite, session-token-and-uat-missing` — Clerk hides protected route existence. |
| API routes (`/api/*`) unauthenticated | All 404 via Clerk rewrite | Same. |
| OG image for nonexistent story | 200, image/png, 30 KB | `buildPublicStorySharePreview` returns "Story not available" preview; no internal data. |
| Headers on every page | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security` (HSTS), `cache-control: private, no-cache, ...` on protected paths | Security headers correctly applied. |

### Surfaces NOT exercised by this sweep

| Surface | Reason | Recommendation |
| --- | --- | --- |
| Authenticated app pages | No production credentials available to the agent. | You verify after this lands. |
| A real published story render | None exists on production. | Publish a fixture-quality story once, exercise the public DTO + OG + slug redirect, then unpublish. |
| Convex public function exposure | Can't call production Convex without the project's auth tokens. | Verify in the Convex dashboard: confirm the 7 internalized files (persons/events/relationships/sources/media/personEvents/ancestorDetails) show as Internal, not Public. |
| Cross-browser visual QA | Single-browser session via Claude in Chrome. | Manual once before broader beta. |

## Outstanding GEN-48 work for a human

- **Publish a real story and verify the public surface.** That's the one acceptance criterion this agent can't complete. After publishing:
  1. Visit `https://discovertheirstories.com/stories/<slug>` — confirm the story renders.
  2. Open devtools network tab, look at the Convex response payload. Confirm it carries only the GEN-77 allowlist fields (no `contextCoverage.entries`, `reviewHistory`, `provisionalRelatives`, etc.).
  3. Verify OG image generates with the published story title.
  4. Roll back to review; confirm `/stories/<slug>` 404s again.

- **Confirm Convex production deploy is current.** Run `npx convex dashboard` and check the function list. If `getPublishedStoryByIdentifier` / `buildContextCoverage` look stale, run `npx convex deploy --prod` (or whatever the project's deploy command is).

## Conclusion

Production privacy posture is clean. The two bugs found are availability and SEO issues that don't expose data — but the 500 on `/stories/<slug>` should be fixed before broader beta because it'll break inbound shares.

GEN-48 remains In Review until a real published story exercises the full surface end-to-end. The agent-side work the issue lists as agent-doable is complete; the rest is the human production-data step the original Codex caveats explicitly called out.
