# Family History Bring Your AI alignment

> Status: evidence-backed alignment and implementation plan; no provider,
> account, secret, deployment, or production-data change is authorized by this
> document
>
> Date: 2026-08-16
>
> Tracker: AWF-WO-011 · AWF-0034 · AWF-0038 · AWF-0040 through AWF-0043

## Outcome

Assist With Family History should let a person connect a conforming chosen AI
to an explicitly bounded part of the person's private research workspace, give
that AI provenance-aware evidence and Queue context, and preserve proposed or
reviewed results so the person can inspect, correct, accept, or reject them.

The durable split is:

> **Assist With Family History owns private identity, grants, records,
> provenance, Queue continuity, review state, activity, and final human
> authority. The person's chosen AI owns conversation, research, comparison,
> synthesis, and drafting inside the permission the person granted.**

The adopted family direction is the Bring Your AI MCP/OAuth standard in
[Assist With Life draft PR #16](https://github.com/scottjarvie/assistwithlife/pull/16),
paired with Core Philosophy sections 5 and 16. The current MCP authorization
spec also makes Client ID Metadata Documents the preferred discovery path and
retains Dynamic Client Registration as compatibility fallback:
[MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Evidence boundary

This audit read the canonical Project Philosophy, tracker, Queue contract,
Clerk/Convex identity boundary, MCP transport and tool implementations, setup
surfaces, FamilySearch capture/storage contracts, and dated production
acceptance receipts at repository main `f643dd7`.

Public read-only probes on 2026-08-16 verified:

- `https://assistwithfamilyhistory.com/.well-known/oauth-protected-resource/mcp`
  returns the branded resource and Clerk authorization-server origin;
- anonymous `POST https://assistwithfamilyhistory.com/mcp` returns HTTP 401
  with the resource-metadata challenge;
- Clerk authorization-server and OpenID metadata expose authorization, token,
  revocation, introspection, JWKS, PKCE, and the provider identity scopes;
- that live metadata exposes neither
  `client_id_metadata_document_supported: true` nor a
  `registration_endpoint`; and
- `/ai.txt` truthfully describes the twelve-tool production foundation and its
  broad-client, reconnect, and revocation gaps.

No authenticated connection, private record, provider dashboard, client
registration, token, or production mutation was used during this audit.

## Current, Partial, and Later

| Layer | Honest state | Evidence and boundary |
| --- | --- | --- |
| Stateless Streamable HTTP MCP | **Current** | Branded `/mcp`, modern stateless handler plus retained fallback, protected-resource metadata, anonymous challenge, and proxy regression tests exist and have dated live proof. |
| Owner identity and tenant isolation | **Current, with one token-boundary gap** | Every tool derives the vault owner from the verified OAuth subject and accepts no owner/workspace selector. The edge verifies issuer, signature, access-token type, expiry, subject, and client id. It does not enforce a product grant or resource-specific audience. |
| Workflow-native Family History tools | **Current foundation** | Brief, search, context, people, relationships, events, sources/citations/facts, research, private story work, complete-result save, corrections, and Queue continuation exist with bounded reads, idempotency, stable keys, optimistic updates, and canonical UI reflection. |
| Provenance-aware private evidence retrieval | **Partial** | Context can include reviewed AI-allowed context/media metadata. There is no batch MCP evidence delivery path for protected images, PDFs, audio, raw capture artifacts, or source files with size/fallback behavior. FamilySearch capture remains user-mediated and must not become unattended provider access. |
| Narrow OAuth/product scopes | **Partial and not enforceable today** | OAuth token scopes are parsed, but MCP domain tools do not check them. Queue tools receive a hard-coded full Queue scope set after login. The live provider advertises identity scopes such as `openid` and `offline_access`, not Family History operation scopes. |
| Consent and durable grants | **Partial** | One disposable PKCE client showed provider consent for `openid offline_access`. There is no owner-visible Family History grant binding client, record boundary, operations, expiry, activity, and revoke state. |
| Client discovery/registration | **Partial** | A manually created disposable public client proved one lifecycle. The live authorization server advertises neither Client ID Metadata Documents nor DCR. No named client is currently claimed compatible. |
| Revocation | **Partial** | Client/session cleanup prevents new tokens, but an issued Clerk JWT remains valid until expiry. There is no server-enforced active-grant check on every discovery/tool call. |
| Human connection experience | **Partial** | `/ai` and `/ai.txt` provide the endpoint, capability truth, first call, tool list, safety, and stale-tool recovery. There is no connection center showing selected scope, clients, last use, activity, expiry, or revoke. |
| Queue to reviewed result | **Partial** | Queue lifecycle, exact actor leases, result links, source-aware saves, and cleanup rails exist. AWF-WO-009 has protected release evidence, but the final authenticated Queue claim -> evidence -> save -> completion -> UI lifecycle remains unproved. |
| Real client matrix | **Later until proved** | Claude, ChatGPT, Codex, Grok, Hermes, and other conforming clients are intended clients, not current compatibility claims. Each name requires its own real lifecycle receipt. |
| Destructive/outside-world tools | **Later / excluded** | Publication, deletion, identity merge, sharing grants, export, and autonomous FamilySearch/provider actions remain outside this connection tranche. |

## The missing system

The production foundation authenticates a client, but it does not yet turn
that authentication into the person's narrow, visible, revocable product
permission. The missing system is therefore not another collection of record
tools. It is the joined connection contract below.

### 1. Metadata-first client onboarding

- Keep the canonical stateless Streamable HTTP resource at `/mcp`.
- Prefer a stable HTTPS Client ID Metadata Document as the client identifier.
- Validate the fetched metadata, exact `client_id`, redirect URIs, public-client
  PKCE posture, response size, redirects, caching, and SSRF protections.
- Offer DCR only as a bounded compatibility fallback, with registration rate
  limits, safe defaults, inventory, expiry/cleanup, and explicit consent.
- Keep manual pre-registration only for isolated acceptance or a client whose
  documented path genuinely requires it.
- Do not name a client on `/ai` until its discover -> consent -> tools -> read ->
  write -> correction -> revoke -> reconnect lifecycle passes.

The live Clerk instance does not currently advertise CIMD or DCR. AWF-0038
therefore begins with a decision-ready architecture spike: prefer provider-
native CIMD if it becomes available; otherwise evaluate a mature authorization
adapter/gateway that keeps Clerk as person authentication. Do not hand-write a
new token server or enable public DCR as a shortcut.

### 2. Product-owned grants and narrow scopes

An OAuth identity is necessary but not sufficient. Every MCP request should
resolve an active owner/client grant stored by Family History and fail closed
when that grant is absent, expired, or revoked.

The grant record should contain:

- server-derived owner and verified client identity;
- connection label and metadata URL or registered-client provenance;
- record boundary: whole private workspace, selected people/research threads,
  or explicitly attached Queue context;
- operation scopes;
- consented, issued, last-used, expires, and revoked timestamps;
- current status and revocation reason; and
- a safe activity link without copying private record content into telemetry.

Initial product scope families:

| Scope | Allows | Does not allow |
| --- | --- | --- |
| `family_history:context:read` | Bounded briefs, search summaries, and hydrated allowed records | Private evidence bytes, writes, or another record boundary |
| `family_history:evidence:read` | Reviewed, AI-allowed source/media retrieval through protected MCP delivery | Scraping private pages, raw living/private notes, or provider sessions |
| `family_history:research:write` | Save proposed source-aware findings, tasks, events, and relationship suggestions | Silent promotion to canonical conclusions, merge, publish, or delete |
| `family_history:story:draft` | Save private drafts and corrections and request human review | Public publication or editing published work |
| `family_history:queue:read` | Read Queue work assigned to this connection | Claiming or changing Queue state |
| `family_history:queue:work` | Claim, checkpoint, ask, fail, and complete explicitly assigned Queue work | Domain mutation beyond separately granted scopes |

Archive/restore, export, permanent delete, publication, sharing, identity merge,
and provider actions stay outside the initial scope ceiling.

### 3. Provenance-aware workflow tools

Preserve the strong existing tool behavior and shape the public catalog around
five coherent jobs:

1. **List assigned work** — actionable Queue items for this connection.
2. **Get one research brief** — selected people, relationships, questions,
   claims, uncertainty, sources, review rules, grant boundary, and next action.
3. **Retrieve evidence in batches** — protected images/files/content blocks,
   stable ids, rights/privacy labels, size caps, and useful blocked-source
   recovery.
4. **Save one reviewed result** — one idempotent normal call that preserves
   sources, candidate claims, conflicts, uncertainty, narrative sections,
   provenance, review status, Queue result links, and the AI/client identity.
5. **Correct or continue** — optimistic corrections, partial follow-up,
   archive/restore only if later granted, and honest blocked/failed research.

Canonical tool names must be clearly Family History namespaced so one assistant
can connect to several Assist products without ambiguous `save_person` or
`update_queue` collisions. Implementation should choose spec-valid names and a
short compatibility transition based on real client refresh behavior.

The normal save path should produce proposed or review-ready work. An AI may
preserve candidate evidence and an explicit user-requested correction, but it
must not silently promote an uncertain claim, merge identities, or publish a
story. The person remains the authority for accepted conclusions and public
meaning.

### 4. Human connection and correction experience

`/ai` remains the public setup and education page. Add an authenticated
connection center at `/settings/ai` (or the signed-in route chosen by the app's
navigation contract) where a person can:

- see each connected client, how it identified itself, selected record boundary,
  read/write scopes, expiry, last use, and recent safe activity;
- approve or deny the exact requested scope;
- reduce or revoke a grant immediately;
- understand that Queue context is not a blanket record permission;
- copy a manual Queue brief when no compatible client can connect; and
- see exact client instructions only for clients with completed lifecycle proof.

The plain-text guide should be generated from the live tool/scope contract and
name the first call, evidence batch path, one-call reviewed save, correction,
blocked-source behavior, approval expectations, stale-tool recovery, and the
current verified-client list.

### 5. Acceptance and truth promotion

The connection becomes **Current** only after all of these pass against marked,
isolated records:

1. CIMD discovery or the explicitly documented DCR/pre-registration fallback;
2. sign-in, exact consent, and narrow active grant creation;
3. tool list filtered or denied by scope;
4. Queue assignment and bounded provenance-aware brief;
5. protected evidence retrieval where the scenario needs it;
6. reviewed result save and canonical product visibility;
7. one intentional correction with stale-write refusal;
8. cross-owner and out-of-grant refusal without record-existence leakage;
9. revoke and immediate denial, then reconnect/stale-tool recovery;
10. exact fixture, grant, registration, session, token-artifact, and client
    cleanup followed by a zero-result re-query; and
11. separate source/local, PR/CI, deployment, public, authenticated-client,
    cleanup, and independent-audit receipts.

Run the first lifecycle with any conforming client path that can be safely
tested. Add Claude, ChatGPT, Codex, Grok, Hermes, or another name to public
guidance only after that exact client passes the full lifecycle.

## Failure modes this plan prevents

- OAuth login being mistaken for blanket Family History authority.
- A token with only identity scopes calling every write tool.
- A Queue item silently granting domain-write access.
- DCR becoming an unaudited public client-creation surface.
- Client metadata redirects or internal-network fetches becoming SSRF.
- Approval fatigue from many tiny writes instead of one reviewed-result save.
- A model scraping private evidence URLs instead of using protected delivery.
- Duplicate or overwritten records on retry or stale correction.
- An AI result losing its sources, uncertainty, actor, client, or review state.
- A disconnected client retaining access until JWT expiry.
- Public documentation naming a client from source compatibility alone.

## Ordered delivery

AWF-WO-011 groups the work as one outcome:

1. **Decision and threat model:** resolve AWF-0034 and AWF-0038 without changing
   provider state during the spike.
2. **Authorization/grants:** implement metadata-first onboarding, DCR fallback
   policy, product scopes, active-grant enforcement, consent, activity, and
   immediate revocation.
3. **Domain workflow:** add protected evidence batches and a review-first result
   contract while preserving idempotency, correction, provenance, Queue
   authority, and human gates.
4. **Connection experience:** deliver `/settings/ai`, generated agent guidance,
   and manual fallback.
5. **Lifecycle proof:** complete the joined Queue-to-reviewed-result path,
   revocation/reconnect, cleanup, and exact-client truth promotion.

Scott approved this scope on 2026-08-16 through the Bring Your AI Implementation
Program — August 2026 (`planning/mcp-program-2026-08.md` in Assist With Life),
which places Family History in Wave 2 and asks for the full connection loop
rather than an MVP slice. The Work Order is therefore **Ready**. Provider,
production identity/security, account, secret, and real-family-data changes
remain explicit gates even after scope approval.

## Verification baseline

- focused metadata/CIMD/DCR security tests, including redirect, SSRF, size,
  replay, and malformed-client cases;
- scope matrix tests for every tool plus absent/expired/revoked grant denial;
- two-owner, out-of-boundary, record-existence, idempotency, and stale-correction
  adversarial tests;
- private evidence content/size/fallback and living/private review gates;
- Queue assignment, lease, complete-save, correction, result-link, and activity
  tests;
- generated `/ai.txt`/tool/scope parity and anonymous discovery/challenge tests;
- `pnpm verify`;
- desktop and phone connection-center checks with console, keyboard, focus,
  overflow, and reduced-motion review;
- protected PR/CI and exact deployment proof; and
- one complete real compatible-client lifecycle with exact cleanup and separate
  independent audit.

## Planning artifact verification

On 2026-08-16:

- Project Philosophy render/check passed with SHA-256
  `387f95b5832867173238e945d49e47e823512a288c874647b497860c5bec6b6f`;
- tracker build/parity verified the proposed Work Order and grouped Cards;
- `pnpm verify` passed all 48 steps after the clean checkout's dependencies were
  synchronized to its existing lockfile; and
- rendered tracker checks at 1280px and 390px found AWF-WO-011 and its Cards,
  zero page-level horizontal overflow, and no console warnings.

The optional `pnpm tracker:verify-browser` suite passed four of six scenarios.
Its Work Order assertion is hard-coded to an old count, and its desktop pointer
drag did not reorder the first two Backlog Cards in the current content shape.
AWF-0044 records that separate tracker-software test gap; it does not change the
MCP/OAuth plan or make the generated source/parity proof fail.
