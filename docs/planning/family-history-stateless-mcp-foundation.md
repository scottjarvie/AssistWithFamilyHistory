# Family History stateless MCP foundation

> Status: implemented in source; local proof in progress; deployed and named-client proof separate
>
> Date: 2026-08-12
>
> Work Order: AWF-WO-006 · Card: AWF-0033

## Product job

Assist With Family History is the durable research-to-story workspace. A
person's chosen AI may do research, compare evidence, identify uncertainty,
correct records, and draft narratives. The product keeps the durable people,
relationships, events, places, sources, citations, findings, stories, Queue
state, provenance, and human review boundary.

The first remote MCP surface therefore follows a useful work loop rather than
exposing database CRUD:

1. orient to a bounded private workspace brief;
2. search summaries before inventing duplicates;
3. hydrate one stable record and its connected evidence/work;
4. preserve a complete research result in one replay-safe transaction;
5. use granular saves for partial work or intentional corrections;
6. continue assigned Queue work with attributable state and no implicit domain
   authority.

## Connection and identity contract

- Canonical resource: `https://discovertheirstories.com/mcp`.
- Transport: stateless remote Streamable HTTP MCP. The v2 server implements the
  modern 2026-07-28 request shape and retains a stateless 2025-era fallback
  through the same tool factory.
- Anonymous requests receive HTTP 401 with a Bearer
  `WWW-Authenticate` challenge pointing to
  `/.well-known/oauth-protected-resource/mcp`.
- Access tokens are verified as Clerk-shaped JWT OAuth access tokens against the
  configured issuer JWKS, exact issuer, access-token header type, expiry,
  subject, and OAuth client identifier. Ordinary Clerk session JWTs are rejected.
- The server derives `vaultOwnerId` from the verified subject on every call.
  No tool accepts `userId`, `ownerId`, `workspaceId`, or `vaultOwnerId`.
- Queue operations use the bounded actor `oauth-chosen-ai`. That identity may
  work only Queue items explicitly assigned to it; Queue context never expands
  domain authority.

## First tool catalog

| Tool | Workflow outcome | Important boundary |
|---|---|---|
| `get_family_history_brief` | First-call map of recent people, stories, open research, findings, and Queue work | Bounded; broad discovery omits living-person notes |
| `search_family_history` | Search people, sources, stories, research, and events before creating | Bounded owner-wide scan and result cap |
| `get_family_history_context` | Hydrate one person, story, source, event, relationship, task, or finding | Stable IDs; reviewed AI-allowed loose context/media only |
| `save_person` | Create or correct a person | Stable create key; optimistic `updatedAt` correction |
| `save_relationship` | Preserve a direct relationship and dated facts | Both people must already belong to this vault |
| `save_event` | Preserve an event and additive person roles | Omitted roles are not silently removed |
| `save_source_evidence` | Save source, citation, links, and evidence facts together | Evidence candidates/conflicts do not overwrite conclusions |
| `save_research_work` | Save a task and/or durable finding | Keeps research status, detail, outputs, and model provenance |
| `save_story_work` | Save or correct a private draft/review story | Cannot publish or edit an already published story |
| `save_complete_result` | Save one normal finished research pass atomically | At most ten records per supported kind; all-or-nothing |
| `get_queue` | List or hydrate bounded assigned Queue work | Queue read scope only |
| `update_queue` | Claim, checkpoint, ask the person, complete, or fail | Exact version, lease, assignment, and operation receipt required |

## Durable write contract

Every write has an `operationId`. The server hashes the semantic tool input and
stores an owner-scoped receipt. Retrying the same operation and input returns
the original result with `deduplicated: true`; reusing an operation ID for
different work fails closed.

Creates also use a semantic `createKey`, such as a provider record key or a
stable research-result key. Reusing it returns the same canonical record rather
than creating a duplicate. Corrections require the exact `updatedAt` value last
read and fail with `STALE_VERSION` when another actor changed the record first.

The complete-result tool is the normal save path after a coherent research
pass. Its source, citation, evidence links, findings, events, and story drafts
share one Convex transaction. Granular tools remain available for intentional
corrections or incomplete work.

Machine errors include a stable code, plain message, and recovery step. The
first surface exposes no delete, publish, identity merge, sharing grant, or
external-provider action.

## Privacy and provenance

- Owner scope is applied before every durable read and write.
- Broad brief/search results are summaries and never include living-person
  notes. Exact person context also removes those notes and includes loose
  context/media only when both reviewed and allowed for AI use.
- Sources remain containers; citations remain specific references; citation
  links attach the evidence to people, relationships, events, or places.
- Extracted facts keep confidence and candidate/accepted/conflict/rejected
  status. They do not silently rewrite the canonical person conclusion.
- AI story work remains private `draft` or `review` work with provenance.
  Existing human publication and living-person review gates remain authoritative.
- Successful MCP writes append an owner-scoped `agentActivity` receipt without
  copying private record content into the public tracker or release notes.

## Current, Partial, Later

### Current in source and focused local proof

- Branded `/mcp` proxy and Convex stateless handler.
- OAuth protected-resource metadata and real anonymous resource challenge.
- Twelve workflow tools with server-derived tenant identity and bounded reads.
- Replay-safe canonical writes, stable record keys, optimistic corrections,
  complete-result transactions, and MCP-attributed activity.
- Queue read/continuation as the explicit OAuth chosen-AI actor.
- `/ai`, `/ai.txt`, and `/llms.txt` setup/discovery surfaces.

### Partial until exact deployed proof

- The configured provider issuer may validate tokens, but registration,
  authorization, consent, scopes, redirect behavior, reconnect, and revocation
  must be exercised with a compatible named client before being called current.
- Source/local/CI proof does not establish production Convex deployment,
  Vercel routing, public reachability, or an authenticated production vault.
- The official v2 MCP client plus a generated signed JWT and isolated synthetic
  tenant prove protocol negotiation, catalog discovery, a canonical write, and
  the resource/owner boundary in the real handler; they are not a provider
  registration or consent journey.

### Later, not implied by this foundation

- Per-client or per-project granular grant UI and a broad client matrix.
- Private media delivery, mobile-specific setup, and delegated collaboration.
- Identity merge, destructive delete, story publication, sharing changes, bulk
  export, or autonomous external FamilySearch actions.

## Proof matrix

| Boundary | Required proof | Current evidence target |
|---|---|---|
| Contract | exact catalog, no tenant selector, input caps | transport and contract tests |
| Tenant | two isolated owners and cross-vault reference denial | Convex runtime tests |
| Idempotency | same operation replay; changed-input conflict | Convex runtime tests |
| Corrections | stale `updatedAt` rejection | Convex runtime tests |
| Canonical product visibility | MCP writes read through existing vault/Queue product functions | Convex runtime and signed transport tests |
| OAuth edge | metadata, anonymous challenge, exact issuer/access-token JWT | official-client and signed transport tests |
| Local app | `/ai`, `/ai.txt`, `/mcp` method behavior and responsive setup UI | route smoke and browser proof |
| Protected release | PR review and exact-head CI | GitHub evidence after publication |
| Deployment | exact commit and provider deployment | Vercel/Convex evidence after merge |
| Named client | registration, consent, tool list, write, reconnect/revoke | unproved until a sanctioned compatible client path exists |

Synthetic proof uses the official v2 MCP client, generated signing keys,
isolated in-memory owners, and clearly marked records. It never reads or writes
real genealogy data or another person's account.
