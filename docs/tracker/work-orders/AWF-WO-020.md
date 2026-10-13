---
id: AWF-WO-020
title: Complete local Live and isolated record-only Sandbox
execution: active
audit: not-audited
cards: AWF-0069
created: 2026-10-07
updated: 2026-10-13
approved-by: Scott Jarvie
approval-evidence: "2026-10-07 owner chat: make a plan and keep going until it's complete, for every site in both local Live and Sandbox."
---

## Goal

Both local modes authenticate the correct owner and demonstrate durable private record flows.

## Current truth

Source prepared; backend/runtime/browser acceptance pending.

## Sequence

Implement fixed public auth and supported audience-tokenbridge; preserve SSR owner/backend checks; prepare own isolated record-only native snapshot; independent review; exact dependency installation; coordinator native provisioning/adoption; browser read/reload and synthetic persistence proof.

## Dependencies

Supported Clerk Convex JWT template, current production trust boundary, exact runtime dependencies and shared router.

## Exclusions

Production secrets/deployments, provider changes, real genealogy copies, hosted auth changes, media/MCP capability acceptance.

## Stop rules

Refuse issuer/origin/subject/audience mismatch, anonymous local fallback, occupied listeners, default codegen removing snapshot guards and unsupported server capabilities.

## Verification

Scoped auth/launcher tests, exact type/lint checks, snapshot guard hashes and owner isolation lifecycle; actual browser acceptance separately.

## Human gates

Own browser sign-in and OS trust prompts if required. No secret disclosure in chat.

## Execution evidence

[Local development](../../operations/local-development.md) documents the modes and guards. Scoped launcher and JWT/session tests pass; full typecheck passes. Runtime/browser acceptance remains pending, and Local Live is withheld until production owner enforcement is independently verified.

## History

2026-10-07 Codex: prepared source only under direct owner authorization; coordinator owns runtime acceptance.

2026-10-13 Claude: merged into main so local modes run from the normal checkout.
