---
id: AWF-WO-014
title: Lock the existing chosen-AI wire contracts and truth surfaces together
execution: proposed
audit: not-audited
cards: AWF-0022, AWF-0050
created: 2026-09-03
updated: 2026-09-03
proposed-by: Codex from the bounded MCP readiness audit
---

## Goal

Turn the sixteen existing MCP operations into one versioned, reviewable
contract so a change to a request, result, error, receipt, replay rule, alias,
permission, or public explanation cannot ship as unnoticed drift.

## Why this bundle exists

The current catalog is authoritative for names and permissions, and this audit
adds checks for its public and machine-readable representations. Runtime schemas
and behavior are still split across transport registration, handlers, and tests.
Closing that gap coherently affects every chosen-AI operation and should be one
approved refactor rather than scattered documentation patches.

## Current truth

Name, alias, required-permission, consent-copy, and authority-tier parity are
checked in the current release branch. Input schemas remain transport-owned,
while result, error, receipt, and replay behavior remains distributed across
handlers and tests. This order is only proposed; no contract refactor has begun.

The final 2026-07-28 currency audit found the modern server posture sound but
under-pinned at the product layer. The official v2 HTTP entry serves a fresh
server per request, supplies `server/discover`, validates standard routing
headers, and supplies private zero-TTL cache defaults. Existing Family History
tests prove modern official-client calls without a session plus immediate grant
narrowing and revocation, but do not directly assert discover, cache, or header
failure contracts. All tool results already include structured content; none
advertises an output schema, and closed-world tools omit `openWorldHint: false`.

Exact issuer validation protects bearer tokens at the resource server. RFC
9207 issuer validation occurs earlier, in the OAuth client authorization-code
flow, so it cannot be claimed until a named-client lifecycle proves it. The
provider advertises support for the authorization-response issuer parameter,
which makes that proof possible. CIMD is the final specification's standard
direction; the provider's live DCR endpoint is compatibility only and no CIMD
support is advertised. The 2025 stateless protocol fallback remains enabled
without named-client evidence that it is needed. This order does not authorize
removing it prematurely.

## Sequence

1. Record the current operation-level contract from source and tests, including
   backing operations, privacy/provenance boundaries, schemas, results, errors,
   batch behavior, receipts, replay, and recovery.
2. Add explicit 2026-07-28 conformance checks for `server/discover`, modern
   calls without initialize/session state, cache hints on granted list results,
   and standard routing-header presence and mismatch rejection.
3. Choose the smallest canonical representation that avoids duplicating Zod
   behavior or weakening Convex boundaries.
4. Advertise useful output schemas and complete closed-world annotations for
   exactly the existing sixteen tools, proving every current wire result still
   validates and that `structuredContent` remains present.
5. Generate or validate the catalog, transport registration, public guides,
   machine manifest, and lifecycle harness against that representation.
6. In the named-client lifecycle, prove RFC 9207 authorization-response issuer
   validation and record whether that client empirically needs the 2025
   stateless fallback. Keep CIMD first and DCR compatibility-only in truth
   surfaces; do not change provider state in this order.
7. Prove no wire, authority, privacy, or mutation behavior changed, then publish
   through the normal protected release path.

## Exclusions

- No new tool, public API, SDK, CLI, generic CRUD surface, alias removal, or
  widened/default/raised permission.
- No admin, delete, publish, merge, share, FamilySearch/provider action,
  billing, export, or archive/restore authority.
- No provider credential or production-family-data work.
- No new product tool. The audit found metadata and proof gaps, not a missing
  Family History operation.

## Dependencies

- The deployed chosen-AI grant, transport, catalog, lifecycle harness, and
  media/privacy contracts from the two active chosen-AI delivery orders.
- The documentation reconciliation Card and the new operation-contract Card.
- Scott's approval before changing schema ownership across all sixteen tools.

## Stop rules

Stop if centralization would change a wire shape, alias, permission, denial,
privacy boundary, or mutation result instead of describing and checking it.
Keep any new capability, generic API, provider change, or named-client work in a
separate approved outcome.

## Verification

- Focused catalog/transport/handler/lifecycle parity tests.
- Direct modern `server/discover`, no-session, cache-hint, and routing-header
  conformance tests, plus schema validation of representative success and
  refusal results for every registered tool family.
- Existing denial, revocation, batch/replay, evidence, media, privacy, and
  connection-centre contracts.
- Full `pnpm verify`, protected PR CI, exact-main deployment, live discovery and
  public truth probes, then separate independent audit.

## Human gates

Scott must approve this proposed cross-tool refactor. Once Ready, ordinary
implementation, tests, protected PR, CI, and deployment are executor work; any
scope widening, provider change, production data, or named-client setup remains
outside this order.

## Execution evidence

None yet. The 2026-09-03 audit and the passing name/permission/public-truth
checks establish the need and safe boundary, not completion.

## Approval boundary

This Work Order is proposed, not Ready. Approval authorizes only the contract
inventory/refactor and its gates for the existing sixteen tools. It does not
authorize a new capability or provider change.

## History

- 2026-09-03 · Codex — proposed after comparing the current Family History
  implementation with proven contract-first and authority-tier patterns in the
  sibling Assist repositories.
- 2026-09-03 · Codex — added the evidence-backed final 2026-07-28 protocol
  delta: product-owned transport conformance checks, output schemas, complete
  annotations, client-side issuer proof, and evidence-based legacy retention;
  no new tool or authority is proposed.
