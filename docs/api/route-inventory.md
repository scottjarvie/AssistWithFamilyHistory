# API Route Inventory

Last updated: 2026-07-12

## Purpose

This inventory classifies every current `app/api/**/route.ts` surface. The machine-readable companion is [`capability-manifest.json`](capability-manifest.json).

Assist With Family History has useful internal APIs, but they are not yet a public or stable agent API. Treat them as internal app routes unless this inventory says otherwise. Future OpenAPI and capability docs should start from this table.

## Owner And Auth Baseline

All `/api/**` routes are in the protected route set when `REQUIRE_AUTH=true`.

Every owner-scoped route resolves the active owner with
`getVaultAccessContext()` and uses `getAuthedConvexClient()`. Convex verifies
the attached Clerk JWT, requires its subject to match `vaultOwnerId`, and
checks referenced records before private work.

The public non-API route `/stories/[id]` is intentionally outside this
inventory. Its two anonymous Convex queries enforce published status and build
the redacted allowlisted DTO in the backend.

## Capability Presets To Consider Later

These are planning terms only. They are not implemented scopes yet.

| Preset | Meaning | Current status |
| --- | --- | --- |
| Read-only assistant | Read owner-scoped people, context packs, stories, documents, queue summaries | Future candidate |
| Import agent | Import user-provided capture packages; no provider crawling | Future candidate after intake hardening |
| Research operator | Create tasks/checks and prepare handoffs | Future candidate after queue/runbook gates |
| Story writer | Save story drafts, revise story content, and request review inside owner vault | Future candidate; cannot publish public stories |
| Trusted operator | Higher-risk merges, provisional-relative decisions, bulk operations, public story publish | Future candidate; requires review gates |
| Admin/security tool | Cross-user or incident workflows | Not present |

## Route Table

| Route | Methods | Primary behavior | Owner boundary | API status | Risk / notes |
| --- | --- | --- | --- | --- | --- |
| `/api/ai-connections` | POST | Approve, decline, narrow, revoke, or remove one chosen-AI MCP connection grant | Clerk session, server-derived owner, and owner-scoped `convex/mcpGrants.ts` mutations that authorize again | Internal human API; a chosen AI can never call this route | Person-only connection control. Widening is not reachable here — `reduce` only narrows and more permission needs a fresh approval. Revocation takes effect on the connection's very next MCP request |
| `/api/capabilities` | GET | Return internal capability actions for the requesting actor role | Protected route; no vault data read | Internal now; future agent-discovery candidate | Story capabilities distinguish writer/reviewer/trusted publisher actions |
| `/api/keys` | GET, POST | List the owner's agent API keys; mint a new key (raw secret returned once, only the SHA-256 hash stored) | Uses `getVaultAccessContext()`; mint binds to the signed-in owner | Internal-only (human-managed); agents do not mint keys | Credential management. POST generates + hashes the secret server-side and returns it once; GET never returns the hash. Scopes from `lib/auth/scopes.ts` |
| `/api/keys/[keyId]` | PATCH, DELETE | PATCH suspends/reactivates a key; DELETE revokes it (idempotent) | Uses `getVaultAccessContext()` and Convex owner check | Internal-only (human-managed) | Credential suspend/revoke; owner-guarded in the Convex mutation |
| `/api/context-items` | POST | Create review-first loose context item for a person | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; AI use is blocked unless context is reviewed and non-private |
| `/api/context-reports` | POST | Create historical context report for owner vault | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; needs context validation and provenance expectations before agent support |
| `/api/convex/documents` | GET | Read owner documents, optionally by person/type | Uses `getVaultAccessContext()` | Internal now; future read-only candidate | Sensitive derived artifacts; no OpenAPI/capability doc yet |
| `/api/convex/people` | GET | Read people explorer from Convex vault | Uses `getVaultAccessContext()` | Internal now; future read-only candidate | Owner-scoped read |
| `/api/convex/stats` | GET | Read dashboard/vault stats | Uses `getVaultAccessContext()` | Internal now; future read-only candidate | Low write risk, still private vault metadata |
| `/api/first-start` | POST | Atomically create two people and their known relationship in a genuinely empty private workspace | Clerk session, server-derived owner, and Convex owner binding | Internal human API | Idempotent operation ID; user-supplied statements are marked unsourced; no AI handoff is created by this route |
| `/api/import` | POST | Preview or merge FamilySearch capture package artifacts; `?preview=true` validates without saving/merging | Uses `getVaultAccessContext()` | Internal now; future import-agent candidate | High data-integrity risk; provider API access is pending; browser/user-initiated capture only; future scopes should split validate from merge |
| `/api/media/[mediaId]/file` | GET | Stream a stored media file to its owner | Uses `getVaultAccessContext()` and a Convex owner check | Not an agent route; an AI reaches media through `family_history_get_evidence` | The signed storage URL is resolved server-side and never returned; missing and other-owner items both answer 404 |
| `/api/mcp-media-upload/[uploadRef]/[token]` | PUT | Relay one checksum-bound connected-AI image upload from the first-party hostname to private B2 | Opaque short-lived bearer capability; Convex resolves owner, active grant-bound session, object key, type, length, and SHA-256; caller supplies none of them | MCP byte transport only | Uniform 404 for invalid/expired/revoked/cross-owner capabilities; provider URL is consumed server-to-server and never returned; private no-store response |
| `/api/media/upload` | POST | Store a scan, photo, record PDF, or recording in the vault, optionally onto an existing media item | Uses `getVaultAccessContext()` and Convex owner checks | Not an agent route | Bytes go to private Convex file storage; every upload arrives private, unreviewed, and `aiUseAllowed: false`, and replacing bytes resets review |
| `/api/media/review` | POST | Update media privacy, review, rights, AI-use, proposed date/location decision, and review note fields | Uses `getVaultAccessContext()` and Convex owner checks | Internal person-only route | Privacy-sensitive write route; AI use requires reviewed media with usable rights but may remain private. Accepting GPS/date evidence does not publish it |
| `/api/operations/checks` | POST | Upsert research check state for a person | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; `completionSource: "ai_agent"` requires summary, notes, and confidence gates |
| `/api/operations/provisional` | POST | Promote or merge provisional relatives | Uses `getVaultAccessContext()` and Convex owner checks | Internal only for now | High data-integrity risk; requires explicit human review confirmation |
| `/api/operations/queue` | GET | Read operations queue with filters/sorting; `?format=handoff` exports agent handoff packet | Uses `getVaultAccessContext()` | Future read-only/handoff candidate | Stable tie-break sorting and handoff export exist; still internal/private |
| `/api/operations/tasks` | POST | Create research task, optionally linked to person | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; acceptable candidate after runbook gates |
| `/api/queue` | GET, POST | Cursor-page the owner Queue or create a directive-first item | Clerk session plus Convex owner binding and owner-verified context references | Internal human API; chosen-AI boundary not externally connected | Directive is the only required product field. GET is capped at 50 and filters by exact Queue state or priority. |
| `/api/queue/[id]` | GET, PATCH, DELETE | Read bounded history; assign, claim, checkpoint, resume, complete, cancel, or reopen; confirmed hard delete | Clerk session plus Convex owner/item checks, version checks, leases, and idempotency receipts | Internal human API; MCP-friendly agent commands remain internal | Queue commands never grant domain record mutation, identity merge, publication, access, or outside-action authority. |
| `/api/people` | GET | Read local artifact-backed person list | Uses `getVaultAccessContext()` | Internal/legacy read | Reads local raw artifact index, not full Convex people explorer |
| `/api/people/[id]` | GET | Resolve person metadata, stored runs, latest run, vault-only status | Uses `getVaultAccessContext()` | Internal/legacy read | Owner-scoped bridge across Convex and local artifacts |
| `/api/people/[id]/context-pack` | GET | Read JSON or Markdown AI context pack | Uses `getVaultAccessContext()` | Strong future read-only/agent-handoff candidate | Sensitive; should expose provenance/weak-claim details before broad agent use |
| `/api/people/[id]/contextualized` | GET, POST | Read or save contextualized dossier; POST syncs document metadata | Uses `getVaultAccessContext()` | Internal/legacy browser workflow | Mixed artifact/doc workflow; see [`legacy-document-route-boundary.md`](legacy-document-route-boundary.md). Keep out of read-only agent scopes until method semantics are split |
| `/api/people/[id]/raw` | GET | Read or generate raw evidence document and sync metadata | Uses `getVaultAccessContext()` | Internal/legacy browser workflow | GET can have generation/sync side effects; see [`legacy-document-route-boundary.md`](legacy-document-route-boundary.md). Keep out of read-only agent scopes until method semantics are split |
| `/api/people/[id]/runs/[runId]/pack` | GET | Read stored evidence pack for a specific run | Uses `getVaultAccessContext()` | Internal/legacy read; future read-only candidate with caution | Sensitive source evidence; should stay owner-scoped |
| `/api/people/[id]/stories` | POST | Save story draft for person and refresh research checks | Uses `getVaultAccessContext()` | Internal now; future story-writer candidate | Write route; lower risk than publish, but story-writer scope must preserve provenance and cannot publish |
| `/api/process` | POST | Submit prompt/data to OpenRouter with client or server key | Protected by required-auth middleware, does not use vault owner | Internal AI utility | High privacy/abuse risk; should not become broad public API without quotas/disclosure |
| `/api/stories/[id]` | PATCH | Update story title/content/type/tags | Uses `getVaultAccessContext()` and Convex owner checks | Internal now; future story-writer candidate | Owner-protected write; content changes should keep story in draft/review until gates pass |
| `/api/stories/[id]/review` | PATCH | Assign a story reviewer, optionally require second approval, and record review history | Uses `getVaultAccessContext()` and Convex owner checks | Internal now; future reviewer/trusted-operator candidate | Explicit `story_writer` role is denied reviewer assignment |
| `/api/stories/[id]/status` | GET, PATCH | Preview publish readiness or change story status between draft/review/published | Clerk JWT plus Convex owner and record checks | Internal now; future story-writer/trusted-operator candidate | Convex recomputes publish safety and human/second-review gates, then records publish confirmation atomically |
| `/api/vault/migrate-guest` | POST | Re-tag a preview guest vault to the signed-in Clerk user | Destination is bound to the verified Clerk subject | Shadow-only legacy path | Enforce denies the unsigned guest source until a signed guest capability exists |

## Current Gaps

- No OpenAPI document exists.
- Machine-readable capability manifest exists, but it is still internal planning rather than a public contract.
- No API key model, scopes, tiers, quotas, request IDs, or usage endpoint exists.
- No `/me`, `/capabilities`, `/openapi`, or `/usage` first-success path exists.
- Legacy raw/contextualized document routes blur read/write semantics and are documented as internal legacy browser workflows in [`legacy-document-route-boundary.md`](legacy-document-route-boundary.md).
- Anonymous preview behavior needs product/security decision before public beta; see `GEN-39`.
- Story writer vs trusted publisher authority is enforced for explicit agent roles, but issued API keys/scopes are not implemented yet.
- Public beta is status-only for now: `published` means publicly renderable, while draft/review 404. Readable slugs and noindex/index metadata exist; richer sharing settings remain separate work.

## Completion Policy For Feature Work

Any issue that touches these routes or creates a new route should include:

```markdown
## API impact

- API impact: none / read / write / admin / docs-only / unknown
- API parity: now / next / browser-only / agent-first / research-needed
- Endpoint changes:
- Scope/tier impact:
- OpenAPI/capability manifest impact:
- SDK/CLI/docs impact:
- Security/abuse/privacy risk:
- Verification plan:
```

Run this after adding or removing API routes:

```bash
pnpm check:api-inventory
pnpm check:protected-routes
pnpm check:trust-boundary
pnpm check:convex-client-auth
```
