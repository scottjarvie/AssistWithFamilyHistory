---
id: AWF-WO-002
title: Make the private-beta first-use journey truthful and provable
execution: superseded
audit: not-audited
cards: AWF-0005 AWF-0007 AWF-0012
created: 2026-08-08
updated: 2026-08-14
proposed-by: Codex
---

## Goal

Give a new beta user an accurate public promise, a clear route into one safe
reviewed FamilySearch import, and end-to-end evidence that a synthetic capture
can become a grounded, explicitly reviewed, reversible public story without
crossing privacy or owner boundaries.

## Current truth

This original four-Card bundle is superseded. Later protected releases fixed
the public promise, canonical identity, sign-in, empty-workspace guidance,
Queue, and chosen-AI setup in smaller slices with exact evidence. AWF-0005 is
closed against those releases. The still-useful direct person/relationship
start moved to proposed AWF-WO-010. Capture-to-story and broader identity/
recovery proof remain Later Cards rather than one ceremonial mega-journey.

## Sequence

1. Build a sentence-by-sentence claim and data-location matrix from current
   source, deployed configuration, and public routes.
2. Correct public truth surfaces and explain the Discover Their Stories /
   Assist With Family History relationship without changing product identity.
3. Design the empty-vault first-use path around the existing reviewed import
   contracts and user-mediated FamilySearch boundary.
4. Add focused synthetic fixtures and acceptance tests before changing the
   dashboard, onboarding, or import UI.
5. Prove deployed sign-in, tenant boundaries, cross-owner denial, and account
   recovery with synthetic identities before relying on them.
6. Publish all software/content changes through a normal branch, PR, full CI,
   and deployment; never use the state fast lane for implementation.
7. With the exact required human authorization, prove the deployed synthetic
   capture → review → story → publish → public read → unpublish path and clean
   up the test data.
8. Leave execution evidence complete but audit `not-audited` until a separate
   AI reviews the implementation and external receipts.

## Dependencies

- Scott approval moving this Work Order from Proposed to Ready.
- Current import, privacy, owner-isolation, story, and public-route contracts.
- A clearly synthetic deceased-person capture fixture and isolated QA owner.
- Provider access sufficient to read exact Clerk, Convex, GitHub, and Vercel
  state without exposing secrets or private family content.

## Exclusions

- No product Queue, MCP, chosen-AI connection, complete export/deletion, shared
  identity, Support Desk, family-row redesign, broad theme work, or unrelated
  application feature.
- No real FamilySearch person, living-person material, production owner vault,
  or private family record in tests, screenshots, logs, or tracker evidence.
- No rebranding away from Discover Their Stories and no change to another
  Assist repository from this Work Order.
- Independent audit is not part of executor completion.

## Stop rules

- Stop before any production write, durable test-account creation, auth-policy
  change, production-data inspection, identity/provider reconfiguration, or
  destructive cleanup until Scott approves that exact gate.
- Stop if the synthetic fixture can be mistaken for a real person or contains
  private/living data.
- Stop publication if public copy would describe an unproved capability as current.
- Stop direct-main publication for any software, content, route, test, config,
  or mixed change; all implementation uses normal safeguards.

## Verification

- Run `pnpm verify` and targeted import, privacy, auth, owner-isolation, story,
  route, and public-beta contracts.
- Exercise invalid, warning, duplicate, partial-response, backend-unavailable,
  cross-owner, living/private, publish-blocked, public-filtered, and unpublish
  fixtures.
- Check the public and first-use flow at 320, 390, 768, 1280, and 1440 pixels,
  including keyboard order, skip/focus, 44px actions, contrast, reduced motion,
  overflow, loading/empty/error states, and browser console.
- Record exact commit, PR, Actions runs, deployment, aliases, authenticated
  environment, route outcomes, audit rows, and approved cleanup receipt.

## Human gates

Scott must approve this proposed scope. A second explicit approval is required
before a production write, production test account, real-provider auth change,
or destructive production cleanup. If preview/isolated QA proof is sufficient,
prefer it and report production behavior as unverified. A separate AI must award
the final audit result.

## Execution evidence

No implementation is attributed to this Work Order. It is superseded by the
smaller completed AWF-WO-007/AWF-WO-008 releases and proposed AWF-WO-010. The
original intake evidence remains useful historical context, not current scope.

## History

- 2026-08-14 · Codex portfolio reset — superseded the oversized pre-rebrand
  bundle, closed its shipped public-truth outcome, and moved the one remaining
  first-use job into AWF-WO-010.
- 2026-08-08 · Codex — proposed from a Core v1.6.3 compliance and product-gap
  audit of tracker truth, current source, all 46 local checks, public routes,
  responsive signed-out journeys, Assist With Life listing, and Vercel state.
