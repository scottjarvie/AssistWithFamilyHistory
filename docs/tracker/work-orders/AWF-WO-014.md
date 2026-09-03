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

## Sequence

1. Record the current operation-level contract from source and tests, including
   backing operations, privacy/provenance boundaries, schemas, results, errors,
   batch behavior, receipts, replay, and recovery.
2. Choose the smallest canonical representation that avoids duplicating Zod
   behavior or weakening Convex boundaries.
3. Generate or validate the catalog, transport registration, public guides,
   machine manifest, and lifecycle harness against that representation.
4. Prove no wire, authority, privacy, or mutation behavior changed, then publish
   through the normal protected release path.

## Exclusions

- No new tool, public API, SDK, CLI, generic CRUD surface, alias removal, or
  widened/default/raised permission.
- No admin, delete, publish, merge, share, FamilySearch/provider action,
  billing, export, or archive/restore authority.
- No provider credential or production-family-data work.

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
