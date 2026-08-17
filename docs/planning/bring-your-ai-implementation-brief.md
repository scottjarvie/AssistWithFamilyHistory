# AWF-WO-011 implementation brief — working notes

> Working engineering notes for the Bring Your AI build. The product contract is
> `docs/planning/family-history-bring-your-ai-alignment.md`; the tracker truth is
> AWF-WO-011 and Cards AWF-0034, AWF-0038, AWF-0040 through AWF-0043. Where this
> file appears to disagree with the alignment document, the alignment document
> wins.

## The shape of the existing system

- `app/mcp/route.ts` proxies to Convex via `lib/mcp/proxy.ts`. The real MCP
  server is `convex/httpRoutes/mcp.ts` (`handleMcp`, `createFamilyHistoryServer`).
- `verifyOAuth` proves issuer, signature, `at+jwt` type, expiry, subject, and
  client id, then builds a `VerifiedPrincipal`. Token `scope`/`scp` is parsed
  into `principal.scopes` and never consulted again.
- Domain behaviour lives in `convex/mcpFamilyHistory.ts`; Queue behaviour in
  `convex/queue.ts` behind an `agent*` function family. The Queue principal in
  `createFamilyHistoryServer` hard-codes
  `["queue:read","queue:claim","queue:update","queue:complete"]`.
- Shared vocabulary, limits, and machine error codes live in `lib/mcp/contract.ts`.
- `convex/mcpAcceptanceFixture.ts` marks and clears synthetic acceptance graphs;
  it is gated to one production deployment and one retained test subject.

## The gap in one sentence

The edge proves *who* is calling but never asks *what the person allowed*, so an
OAuth login behaves like blanket product authority and a disconnect does not
take effect until the JWT expires.

## Design decisions for this build

### Product grant is the authority, not the token

Provider identity scopes (`openid`, `offline_access`) are never treated as
Family History authority. Every `/mcp` request resolves a durable product grant
for (owner, issuer, client id). Absent, pending, expired, or revoked grants fail
closed. Because the transport is stateless and every JSON-RPC message is its own
HTTP request, resolving the grant per request makes revocation immediate — an
already-issued JWT stops mattering the moment the grant leaves `active`.

### Consent happens in the product, not only at the provider

The provider consent screen can only speak the provider's identity scopes. The
first call from an unrecognised client therefore creates a **pending** grant
request (bounded and rate limited) and returns a refusal that tells the AI to
ask the person to approve the connection at `/settings/ai`. The person sees the
exact client, chooses scopes, record boundary, and expiry, and approves. The
snapshot of exactly what was shown is stored on the grant.

### Scope ceiling

Six scopes, and nothing above them:

`family_history:context:read`, `family_history:evidence:read`,
`family_history:research:write`, `family_history:story:draft`,
`family_history:queue:read`, `family_history:queue:work`.

Archive/restore, export, permanent delete, publication, identity merge, sharing,
and provider actions are outside the ceiling and have no tool.

### Namespacing with compatibility aliases

`family_history_*` names are canonical. The twelve existing names stay
registered as aliases on the same handlers so nothing that already connected
breaks. Aliases are recorded for a later sunset, not removed now.

### Batch is the normal case

A census page touches a dozen people at once. `family_history_save_records` is
one call, one approval, one Convex transaction, per-item results, and
skipped-with-reason — the batch path the domain actually needs. Per-item
failures are caught inside the mutation so one bad row does not discard the
pass. `family_history_save_complete_result` stays as the atomic all-or-nothing
alternative.

### Evidence is delivered, not scraped

`family_history_get_evidence` returns protected bytes as MCP content blocks for
reviewed, AI-allowed media and documents inside the grant boundary, in batches,
with per-item size caps and honest skipped reasons. An AI must never be told to
fetch a private URL itself.

---

# What was actually built (backend spine, 2026-08-16)

> Everything below is in the working tree on `claude/bring-your-ai-implementation`.
> `pnpm verify` passes all 50 steps (49 before, plus the new `check:mcp-contract`).
> No provider setting, secret, environment variable, deployment, or real family
> record was touched. Provider-side items are written up separately in
> `docs/operations/bring-your-ai-provider-actions.md`.

## The shape in one paragraph

A pure-data catalog (`lib/mcp/catalog.ts`) names every tool, its scope, and its
compatibility alias. A pure authorizer (`lib/mcp/authorize.ts`) turns *one*
resolved grant plus a tool name plus the call's own arguments into a permit or a
keyed refusal, and the same function answers both `tools/list` and `tools/call`.
`convex/mcpGrants.ts` resolves exactly one grant per HTTP request and owns the
person-facing lifecycle. The transport wires those together and registers only
what the grant permits. The write mutations re-check the grant themselves, so
the data layer refuses independently of the transport.

## Files

| File | What it is |
| --- | --- |
| `lib/mcp/catalog.ts` | Pure data: scope ceiling, scope consent copy, 14 tools with alias/scope/writes/description/humanSummary/implementedBy, `NEVER_EXPOSED`, `NEVER_PERMITTED`, and a structural contract assertion. No Convex imports. |
| `lib/mcp/authorize.ts` | The one authorizer. Refusal dictionary, expiry-at-read-time, record-boundary extraction from call arguments, `permittedTools`, `queueScopesForGrant`. Pure. |
| `lib/mcp/clientMetadata.ts` | Strict CIMD validation. Pure, no network. |
| `lib/mcp/contract.ts` | Added five grant error codes and the batch/evidence/metadata limits. |
| `lib/mcp/testSupport.ts` | `seedGrant` for tests. Not imported by the product. |
| `convex/mcpGrants.ts` | `resolveForRequest`, `touchGrantUse`, `recordGrantActivity`, `assertGrantPermits`, and the owner-scoped lifecycle (list, approve, deny, reduce, revoke, remove, activity). |
| `convex/mcpClientTrust.ts` | CIMD fetch + cache with a 24h TTL; bounded DCR record shape with a cap and cleanup. **No public registration endpoint.** |
| `convex/mcpEvidence.ts` | `getEvidenceBatch` — the gate, the boundary, and the honest skip reasons. |
| `convex/mcpFamilyHistory.ts` | Added `saveRecords`; every mutation now takes `grantId` and re-validates it. |
| `convex/httpRoutes/mcp.ts` | Per-request grant resolution, preflight refusals, scope-filtered registration, canonical+alias registration, grant-derived Queue scopes, the two new tools, audience check. |
| `convex/schema.ts` | `mcpGrants`, `mcpClientRegistrations`; `grantId`/`clientId` on `agentActivity` plus a `by_owner_grant` index. |
| `scripts/check-mcp-contract.ts` | Wired into `pnpm verify` as `check:mcp-contract`. |
| `docs/operations/bring-your-ai-provider-actions.md` | The SEND TO CODEX items. |

## The grant model

`mcpGrants` keys on server-derived `vaultOwnerId` + verified `clientId` +
`issuer`. Status is one of `pending | active | revoked | expired | denied`.

- **One grant decides a call, entirely.** Scopes are never summed across grants.
  If a person has re-approved without revoking, the most recently consented
  active grant governs and the others are left alone.
- **Resolved on every HTTP request.** The Streamable HTTP transport is
  stateless, so each JSON-RPC message is its own request. Re-resolving per
  request is exactly what makes revocation immediate: an already-issued Clerk
  access token stops mattering the moment the grant leaves `active`. There is a
  comment saying so at the resolution site and at the top of `convex/mcpGrants.ts`.
- **Expiry is filtered in code at read time**, never inferred from the token's
  lifetime. A grant past `expiresAt` reads as expired even before anything
  rewrites its status row.
- **Consent happens in the product.** The provider consent screen can only speak
  identity scopes, so the first call from an unknown client creates ONE pending
  grant request (max 5 pending per owner, deduplicated per `clientId`) and
  refuses with `GRANT_REQUIRED` whose recovery points at `/settings/ai`.
- **`consentSnapshot`** freezes the exact scope labels, boundary, expiry, and
  both never-lists shown at approval, so a later catalog edit cannot rewrite
  what somebody agreed to.
- **`observedClientName`** is taken from the client's own header and stored as a
  label for the person to recognise. It is never authority.

Record boundary is `whole_workspace | selected_people | queue_only`, with
optional `personIds` / `queueItemIds`.

## Error codes

`GRANT_REQUIRED`, `GRANT_REVOKED`, `GRANT_EXPIRED`, `SCOPE_NOT_GRANTED`,
`OUTSIDE_GRANT_BOUNDARY` were added to `McpMachineErrorCode`. Every message says
what happened and what to do. **An unknown tool name and a tool the grant does
not cover return byte-identical refusals**, and a boundary refusal is decided
from the caller's own arguments before any lookup — so no refusal anywhere can
be used to discover whether a record, a tool, or another owner exists.

They travel on the existing `MCP_FAMILY_HISTORY_ERROR:` string-marker path that
`toolError()` parses, because that is how errors already reach the wire here.
**`FamilyHistoryMcpError` in `lib/mcp/contract.ts` is still unused; the two
paths were not unified.** Unifying them is a clean, separate cleanup.

## Final tool inventory

14 canonical tools, 12 compatibility aliases. Every alias is registered on the
**same handler** with the **same scope**, described as deprecated in its own
tool description, and carries a `sunsetNote` in the catalog. Nothing was removed.

| Canonical | Alias | Scope | Writes |
| --- | --- | --- | --- |
| `family_history_get_brief` | `get_family_history_brief` | `context:read` | no |
| `family_history_search` | `search_family_history` | `context:read` | no |
| `family_history_get_context` | `get_family_history_context` | `context:read` | no |
| `family_history_get_evidence` | — | `evidence:read` | no |
| `family_history_save_person` | `save_person` | `research:write` | yes |
| `family_history_save_relationship` | `save_relationship` | `research:write` | yes |
| `family_history_save_event` | `save_event` | `research:write` | yes |
| `family_history_save_source_evidence` | `save_source_evidence` | `research:write` | yes |
| `family_history_save_research_work` | `save_research_work` | `research:write` | yes |
| `family_history_save_story_work` | `save_story_work` | `story:draft` | yes |
| `family_history_save_records` | — | `research:write` (+ `story:draft` when the batch carries stories) | yes |
| `family_history_save_complete_result` | `save_complete_result` | `research:write` (+ `story:draft` when it carries stories) | yes |
| `family_history_get_queue` | `get_queue` | `queue:read` | no |
| `family_history_update_queue` | `update_queue` | `queue:work` | yes |

Queue principal scopes now derive from the grant instead of the old hard-coded
`["queue:read","queue:claim","queue:update","queue:complete"]`:
`queue:read` → `["queue:read"]`; `queue:work` → the full claim/update/complete
set. A grant with neither gets an empty scope list and no Queue tool.

## Batch shape — `family_history_save_records`

```
input:  { operationId, summary, people?, relationships?, events?, evidence?, stories? }
caps:   people/relationships/events 50, evidence 20, stories 10, request 256 KiB
output: { summary, results: { people: [{index, createKey?, id?, status, reason?, whatToDo?}], relationships: [...], events: [...], evidence: [...], stories: [...] },
          counts: { created, updated, skipped, failed },
          provenance: { clientId, grantId, at },
          note,
          operationId, deduplicated }
```

- `status` is `created | updated | skipped | failed`. `skipped` means the
  `createKey` already mapped to a record — an idempotent no-op, not a problem.
- Failures are caught **inside** the mutation, so one bad row does not discard
  the pass. That is the family "honest partial result" convention: a partial
  answer with its gaps named beats a refusal.
- **In-batch cross references.** A relationship may name
  `person1CreateKey` / `person2CreateKey`; an event role may name
  `personCreateKey`; evidence links and facts may name `targetCreateKey` /
  `personCreateKey`; a story may name `personCreateKey`. Each resolves against
  the people created earlier in the *same call* first, then against
  `mcpRecordKeys` for a key from a previous call. An unresolvable key fails that
  one row with a reason. No id is ever guessed.
- Replay by `operationId` returns the stored receipt. Replay by `createKey` with
  a fresh `operationId` reuses the records and reports them as `skipped`.
- `family_history_save_complete_result` is unchanged and stays the atomic
  all-or-nothing alternative. Both tool descriptions now say which to use when.

## Evidence shape — `family_history_get_evidence`

```
input:  { items: [{kind: "media"|"document", id}] }   // max 10
output: { delivered: [{id, kind, title, mimeType, sizeBytes}],
          skipped:   [{id, kind, reason, whatToDo}],
          note }
content blocks: text for documents, image for image mime types, resource/blob otherwise
```

Gate: `aiUseAllowed === true && reviewStatus === "reviewed" && rightsStatus !== "restricted"`,
plus the grant's record boundary, checked item by item. Reasons are
`NOT_REVIEWED`, `AI_USE_NOT_ALLOWED`, `RIGHTS_RESTRICTED`, `TOO_LARGE`,
`BYTES_NOT_AVAILABLE`, `OUTSIDE_GRANT_BOUNDARY`. Per-item cap 2 MiB, whole-call
budget 6 MiB with a running budget that turns exhaustion into a skip.

**A raw storage URL is never returned.** Resource blocks use an opaque
`familyhistory://media/<id>` URI. The Convex query hands the URL to the
transport action, which fetches the bytes; the model-facing result never
contains it.

**Honest limit, deliberately surfaced rather than hidden:** `documents` rows
really do hold `contentMarkdown`/`contentText` in Convex, so those are delivered
as genuine text. `media` rows hold `filePath`/`url` references, and the byte
store (`lib/storage/objectStore.ts`, Backblaze B2) lives in the Node/Next
runtime with no caller anywhere yet. Media with a fetchable HTTPS `url` is
delivered; everything else returns metadata with `BYTES_NOT_AVAILABLE` and a
useful `whatToDo`. The encoder is built so wiring B2 later is a source swap at
the `fetchable` list, not a redesign. `/ai.txt` says this plainly.

Person documents carry no separate AI-use review flag in the schema, so the
living-person rule that governs the rest of this surface governs them: a
document attached to a living person is skipped as `AI_USE_NOT_ALLOWED`.

## Client trust

`convex/mcpClientTrust.ts` validates a Client ID Metadata Document when the
verified `client_id` is an HTTPS URL: HTTPS only, no credentials/query/fragment,
**redirects refused rather than followed**, ≤32 KiB, JSON content type,
`client_id` exactly equal to the fetched URL, `redirect_uris` present and all
HTTPS or loopback, public clients must declare `token_endpoint_auth_method:
"none"` and `code_challenge_methods_supported` containing `S256`, and IP
literals / `localhost` / `*.local` / `*.internal` / `169.254.169.254` /
`metadata.google.internal` all rejected. Verdicts are cached for 24 hours and
re-fetched after.

A code comment records the honest limit: DNS-level SSRF cannot be fully closed
inside the Convex runtime, because we cannot resolve a hostname and pin the
connection to the address we checked. The host allowlist plus the no-redirect
policy are the mitigation, and the fetched document is never echoed to a model.

An opaque provider-issued client identifier — what production issues today —
is reported honestly as `provenance: "manual"`, `trusted: false`.

DCR exists only as a **record shape** with `MAX_DCR_REGISTRATIONS = 50` and a
30-day expiry with a cleanup mutation. There is no public registration endpoint
in this repository.

## Design decisions I made or changed

1. **Discovery with no grant returns an empty tool list, not a protocol error.**
   The MCP server refuses `tools/list` outright when it has no tools registered,
   which reads as a broken server rather than an unapproved connection. So the
   transport answers `tools/list` itself with `{tools: []}` in that case, and the
   `instructions` returned at `initialize` explain what the person needs to do.
2. **Refusals are answered before the MCP server sees the call.** A `tools/call`
   for a name the grant does not permit is intercepted at the HTTP layer and
   answered with the machine error. Registering the tool and refusing inside the
   handler would have meant advertising it; not registering it would have meant
   "unknown tool" with no recovery text. This gives filtered discovery *and* an
   actionable error, from one authorizer.
3. **Aliases are listed as well as callable.** `tools/list` now returns 26
   entries for a full grant. Hiding the aliases would have been tidier for a
   model but would have broken discovery for a client that refreshes its catalog
   and then calls the old name.
4. **`selected_people` refuses what it cannot attribute.** For record kinds the
   transport cannot tie to a person from the arguments alone — a source, a
   relationship update, a bare event id — a `selected_people` grant refuses
   rather than guessing. `whole_workspace` is the grant to choose for broad
   reading. `family_history_get_evidence` is the deliberate exception: it names
   nothing at the transport layer and the Convex query checks each item's person
   individually, so one out-of-bounds item skips instead of killing the batch.
5. **The audience check is tolerant when the claim is absent.** See provider
   action 2. Present-and-wrong is a rejection; absent is accepted and the grant
   remains the authority. Tightening to "required" is one line, gated on the
   provider change.
6. **`agentActivity` gained `grantId`/`clientId`** rather than a new table, as
   asked. `detail` stays short and masked.
7. **`mcpGrants` was added to `OWNED_TABLES`** in `convex/vaultMigration.ts` so a
   grant created before sign-up follows the person instead of being orphaned.
   `check:owned-tables-parity` catches this, which is how it was found.

## Test coverage added

- `convex/mcpGrantEnforcement.test.ts` (22) — scope↔tool matrix both ways;
  unknown tool maps to no scope; alias and canonical resolve identically and
  behave identically end to end; two half-permissions never sum; absent /
  pending / expired / revoked / denied denied on **both** discovery and call;
  exactly one pending request per client; expiry decided in code while the token
  is still valid; revoke denies the very next request with the same token;
  discovery shows exactly the approved surface; ungranted and unknown tools
  return byte-identical refusals; `selected_people` sideways walk refused; real
  vs invented id indistinguishable; `queue_only` reaches no record tool;
  cross-owner isolation; no refusal text names a record, owner, or table; the
  data layer refuses a write with no grant, a borrowed grant, and a read-only
  grant; audience accepted-when-absent and rejected-when-wrong.
- `convex/mcpBatch.test.ts` (4) — a census household created in one call with
  in-batch `createKey` cross-references actually wired to the right people; one
  bad row does not discard the pass and every failure carries reason +
  `whatToDo`; `operationId` replay idempotent and `createKey` replay reuses;
  over-cap refused before anything is written.
- `convex/mcpEvidence.test.ts` (8) — unreviewed / not-AI-allowed /
  rights-restricted / oversize all skip and deliver nothing; reference-only media
  returns `BYTES_NOT_AVAILABLE`; documents return real text; living-person
  documents withheld; `selected_people` boundary enforced per item; another
  owner's evidence and an invented id indistinguishable; a grant without
  `evidence:read` cannot call the tool at all.
- `convex/mcpClientTrust.test.ts` (13) — redirect refused (both status and
  `redirected`), oversize by declared length and by body, non-JSON, wrong
  `client_id`, missing/insecure redirect URIs, PKCE not declared, confidential
  client refused, every private-network/metadata host refused, and a
  private-network client identifier never reaching `fetch` at all.
- `scripts/check-mcp-contract.ts` — the same parity assertions as a build gate,
  plus source-level checks that the transport registers every canonical tool,
  resolves the grant per request, registers aliases on the same handler, derives
  Queue scopes from the grant, no longer contains the hard-coded Queue scope set,
  and that every `implementedBy` claim points at a function that exists.
- Existing suites updated to seed a grant: `mcpFamilyHistory.test.ts`,
  `mcpTransport.test.ts`, `mcpAcceptanceFixture.test.ts`.

## Deliberately deferred

- **The connection centre UI at `/settings/ai`.** The Convex functions it needs
  are exported and owner-scoped (`listConnections`, `approveGrant`, `denyGrant`,
  `reduceGrantScopes`, `revokeGrant`, `removeGrant`,
  `recentConnectionActivity`), and `FAMILY_HISTORY_SCOPE_INFO` exists precisely
  so the consent screen can be written from data. Not built — that is the next
  stage, along with the lifecycle harness.
- **Widening a grant.** `reduceGrantScopes` only ever narrows; widening throws
  and requires a fresh approval, so the person sees a new consent screen. A
  "re-approve with more" flow belongs with the UI.
- **Unifying `FamilyHistoryMcpError` with the string-marker error path.** Both
  exist; only the marker is used. Clean, separate, low risk.
- **Byte delivery for `media`.** Blocked on nothing in this repo except that
  `lib/storage/objectStore.ts` has no caller. Wiring it is a source swap at the
  `fetchable` list in the evidence tool.
- **Any named-client compatibility claim.** Unchanged: no client is named until
  its own full lifecycle passes.

## Reading order for the next stage

1. `lib/mcp/catalog.ts` — what exists and what it costs in permission.
2. `lib/mcp/authorize.ts` — the single decision, including every refusal string
   the UI will want to echo.
3. `convex/mcpGrants.ts` — the lifecycle functions the connection centre calls.
4. `convex/mcpGrantEnforcement.test.ts` — the behaviour the UI must not weaken.
