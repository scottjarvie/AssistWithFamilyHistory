# API Route Inventory

Last updated: 2026-05-21

## Purpose

This inventory classifies every current `app/api/**/route.ts` surface. The machine-readable companion is [`capability-manifest.json`](capability-manifest.json).

Discover Their Stories has useful internal APIs, but they are not yet a public or stable agent API. Treat them as internal app routes unless this inventory says otherwise. Future OpenAPI and capability docs should start from this table.

## Owner And Auth Baseline

All `/api/**` routes are in the protected route set when `REQUIRE_AUTH=true`.

Every owner-scoped route should resolve the active owner with `getVaultAccessContext()` and pass `vaultOwnerId` into file storage, Convex queries, and Convex mutations.

The public non-API route `/stories/[id]` is intentionally outside this inventory. It is public by design and only returns stories with status `published`.

## Capability Presets To Consider Later

These are planning terms only. They are not implemented scopes yet.

| Preset | Meaning | Current status |
| --- | --- | --- |
| Read-only assistant | Read owner-scoped people, context packs, stories, documents, queue summaries | Future candidate |
| Import agent | Import user-provided capture packages; no provider crawling | Future candidate after intake hardening |
| Research operator | Create tasks/checks and prepare handoffs | Future candidate after queue/runbook gates |
| Story writer | Save drafts and change story status inside owner vault | Future candidate after publish safety work |
| Trusted operator | Higher-risk merges, provisional-relative decisions, bulk operations | Future candidate; needs review gates |
| Admin/security tool | Cross-user or incident workflows | Not present |

## Route Table

| Route | Methods | Primary behavior | Owner boundary | API status | Risk / notes |
| --- | --- | --- | --- | --- | --- |
| `/api/context-reports` | POST | Create historical context report for owner vault | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; needs context validation and provenance expectations before agent support |
| `/api/convex/documents` | GET | Read owner documents, optionally by person/type | Uses `getVaultAccessContext()` | Internal now; future read-only candidate | Sensitive derived artifacts; no OpenAPI/capability doc yet |
| `/api/convex/people` | GET | Read people explorer from Convex vault | Uses `getVaultAccessContext()` | Internal now; future read-only candidate | Owner-scoped read |
| `/api/convex/stats` | GET | Read dashboard/vault stats | Uses `getVaultAccessContext()` | Internal now; future read-only candidate | Low write risk, still private vault metadata |
| `/api/import` | POST | Preview or merge FamilySearch capture package artifacts; `?preview=true` validates without saving/merging | Uses `getVaultAccessContext()` | Internal now; future import-agent candidate | High data-integrity risk; provider API access is pending; browser/user-initiated capture only; future scopes should split validate from merge |
| `/api/operations/checks` | POST | Upsert research check state for a person | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; `completionSource: "ai_agent"` requires summary, notes, and confidence gates |
| `/api/operations/provisional` | POST | Promote or merge provisional relatives | Uses `getVaultAccessContext()` and Convex owner checks | Internal only for now | High data-integrity risk; requires explicit human review confirmation |
| `/api/operations/queue` | GET | Read operations queue with filters/sorting; `?format=handoff` exports agent handoff packet | Uses `getVaultAccessContext()` | Future read-only/handoff candidate | Stable tie-break sorting and handoff export exist; still internal/private |
| `/api/operations/tasks` | POST | Create research task, optionally linked to person | Uses `getVaultAccessContext()` | Internal now; future research-operator candidate | Write route; acceptable candidate after runbook gates |
| `/api/people` | GET | Read local artifact-backed person list | Uses `getVaultAccessContext()` | Internal/legacy read | Reads local raw artifact index, not full Convex people explorer |
| `/api/people/[id]` | GET | Resolve person metadata, stored runs, latest run, vault-only status | Uses `getVaultAccessContext()` | Internal/legacy read | Owner-scoped bridge across Convex and local artifacts |
| `/api/people/[id]/context-pack` | GET | Read JSON or Markdown AI context pack | Uses `getVaultAccessContext()` | Strong future read-only/agent-handoff candidate | Sensitive; should expose provenance/weak-claim details before broad agent use |
| `/api/people/[id]/contextualized` | GET, POST | Read or save contextualized dossier; POST syncs document metadata | Uses `getVaultAccessContext()` | Internal/legacy browser workflow | Mixed artifact/doc workflow; see `GEN-40` for read/write contract cleanup |
| `/api/people/[id]/raw` | GET | Read or generate raw evidence document and sync metadata | Uses `getVaultAccessContext()` | Internal/legacy browser workflow | GET can have generation/sync side effects; see `GEN-40` |
| `/api/people/[id]/runs/[runId]/pack` | GET | Read stored evidence pack for a specific run | Uses `getVaultAccessContext()` | Internal/legacy read; future read-only candidate with caution | Sensitive source evidence; should stay owner-scoped |
| `/api/people/[id]/stories` | POST | Save story draft for person and refresh research checks | Uses `getVaultAccessContext()` | Internal now; future story-writer candidate | Write route; publish safety and story quality gates should come first |
| `/api/process` | POST | Submit prompt/data to OpenRouter with client or server key | Protected by required-auth middleware, does not use vault owner | Internal AI utility | High privacy/abuse risk; should not become broad public API without quotas/disclosure |
| `/api/stories/[id]` | PATCH | Update story title/content/type/tags | Uses `getVaultAccessContext()` and Convex owner checks | Internal now; future story-writer candidate | Owner-protected write |
| `/api/stories/[id]/status` | PATCH | Change story status between draft/review/published | Uses `getVaultAccessContext()` and Convex owner checks | Internal now; future story-writer/trusted-operator candidate | Publish action requires explicit human review confirmation |

## Current Gaps

- No OpenAPI document exists.
- Machine-readable capability manifest exists, but it is still internal planning rather than a public contract.
- No API key model, scopes, tiers, quotas, request IDs, or usage endpoint exists.
- No `/me`, `/capabilities`, `/openapi`, or `/usage` first-success path exists.
- Legacy raw/contextualized document routes blur read/write semantics; see `GEN-40`.
- Anonymous preview behavior needs product/security decision before public beta; see `GEN-39`.

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
```
