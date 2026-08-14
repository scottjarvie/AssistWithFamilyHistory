---
id: AWF-WO-010
title: Make one person and relationship the first private workspace start
execution: ready
audit: not-audited
cards: AWF-0006
created: 2026-08-14
updated: 2026-08-14
proposed-by: Codex from Scott's portfolio reset
approved-by: Scott via coordinator delegation
approved-on: 2026-08-14
executed-by: Codex
---

## Goal

Let a newcomer begin useful private family-history work by adding one person
and one known relationship directly, without requiring an import or AI
connection, while preserving the existing reviewed-capture and chosen-AI paths
as optional accelerators.

## Why this is the next bounded slice

The empty workspace now explains two working starts, but both depend on bringing
something external into the product. The Project Philosophy says People and
relationships are the friendliest primary start. One owner-scoped connected
pair is small enough to design, characterize, implement, and prove without
turning onboarding into a broad tree builder.

## Requirements

- Start only from a genuinely empty private workspace.
- Create one person with the minimum useful identity fields and one explicit
  known relationship to a second person; optional fields never block the start.
- Keep living/deceased state explicit and never infer death from age.
- Preserve provenance for person and relationship creation, including actor,
  time, and whether the person or chosen AI supplied the information.
- Reuse the canonical people/relationship model and normal UI; do not create a
  parallel onboarding database or raw CRUD surface.
- Make review, correction, cancellation, duplicate detection, and backend
  failure understandable before expanding into more tree-building behavior.
- Keep capture/import and chosen-AI setup available but optional.

## Sequence

1. Characterize current owner-scoped person and relationship reads/writes with
   focused contracts before changing behavior.
2. Design the smallest empty-workspace entry and confirmation/recovery states.
3. Implement through canonical services and normal people/relationship UI.
4. Prove one marked synthetic connected pair at phone and desktop widths,
   including correction, cancellation, duplicate, and backend-error behavior.
5. Release through a normal protected PR and verify exact-main deployment.
6. Run isolated signed-in acceptance, confirm normal UI/Queue context can see
   the result, and remove the exact synthetic graph and session artifacts.
7. Record Current / Partial / Later truth; leave independent audit separate.

## Dependencies

- Version 2.0.1 empty-workspace first journey and current private owner model.
- Existing people, relationship, source/provenance, tenant, and deletion
  contracts.
- A clearly marked non-privileged synthetic identity and disposable deceased
  family fixture; no real family data.

## Exclusions

- No full tree editor, provider sync, broad import redesign, collaboration,
  sharing, publishing, merge, account deletion, or autonomous research.
- No Scott or another family's records, living/private source material,
  provider defaults, secrets, billing, DNS, or auth-policy change.
- AWF-0037 joined MCP acceptance and AWF-0038 standards compatibility remain
  separate routes; this Work Order must not absorb them.

## Stop rules

- Stop for any cross-owner read/write, ambiguous destructive cleanup, material
  product choice about required genealogy fields, or provider/security change.
- Stop release if the manual start bypasses canonical provenance, duplicate,
  correction, living-person, or tenant boundaries.

## Verification

- Focused behavior-lock and owner-isolation contracts plus `pnpm verify`.
- Empty, create, correction, duplicate, cancel, backend-error, narrow-phone,
  desktop, keyboard, focus, target-size, overflow, and console proof.
- Protected PR/CI, exact-main deployment, isolated signed-in lifecycle, normal
  UI visibility, exact fixture/session cleanup, and separate audit truth.

## Human gates

Scott explicitly selected this outcome as the next soft-launch goal. Execution
is Ready for the remaining browser-host proof; routine marked synthetic proof
needs no further approval inside the exclusions.

## Current truth

The bounded slice is released in production. It adds
an empty-workspace first start, a canonical idempotent owner-scoped mutation,
visible manual unsourced provenance, normal People/person visibility, and an
explicit optional Queue handoff. Exact-main deployment and anonymous live proof
are complete. Isolated signed-in creation, UI/Queue visibility, responsive
interaction, and exact synthetic cleanup remain before completion.

## Execution evidence

- `convex/privateFirstStart.test.ts`: atomic creation, no Queue by default,
  idempotent replay, second-start refusal, and cross-owner rejection.
- `pnpm test`: 107 tests passed; `pnpm test:convex`: 98 tests passed.
- Typecheck, lint, protected-route, trust-boundary, owned-table, Convex auth and
  visibility, person-identifier, focused first-start, and production webpack
  build checks passed locally on 2026-08-14.
- Signed-in phone/desktop interaction and synthetic lifecycle evidence remain
  open; protected release and exact-main deployment are complete.
- PR #53 merged as `83bc85907a6ac66da064adbe32ba8cc3e22bc205`;
  exact-main Actions `31816195194` passed the full verify, build, server, and
  route-smoke lane; production deployment `5909121902` completed successfully.
- The canonical `/updates` rendered 2.1.0 at 390×844 with zero console errors.
  Anonymous page and POST access failed closed with Clerk and created no data.
  The retained identity had no reusable credential/session in the approved
  browser host, so no live family fixture was created and nothing required
  cleanup.

## History

- 2026-08-14 · Codex — released the source through PR #53 and exact-main
  production, then returned execution to Ready with the signed-in browser-host
  acceptance gap explicit and no live fixture created.
- 2026-08-14 · Codex — activated from Scott's explicit next-goal direction and
  implemented the bounded source slice; protected release proof continues.
- 2026-08-14 · Codex — proposed from the Core/Project Philosophy and live empty-
  workspace evidence during Scott's portfolio reset.
