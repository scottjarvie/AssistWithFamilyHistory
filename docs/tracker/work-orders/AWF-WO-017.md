---
id: AWF-WO-017
title: Finish Bring Your AI to the family standard and prove it with real clients
execution: proposed
audit: not-audited
cards: AWF-0062, AWF-0063, AWF-0064, AWF-0043, AWF-0050
created: 2026-10-06
updated: 2026-10-06
proposed-by: Claude (Opus 5.5) from Scott's site-guide and readiness request
---

## Goal

Make connecting an AI as simple as the family standard promises, give it tools
for every building block, and prove it with real clients starting with Claude.

## Why this bundle exists

The engineering is strong but no real AI client has connected, the approval step
contradicts the family rule, and the tools cover only part of the site.

## Current truth

Stateless `/mcp` with 16 tools and immediate revocation is live. First contact
creates a pending zero-permission grant. Conformance gaps per AWF-0063. No named
client proof since the 12–13 August disposable client.

## Sequence

1. Conformance fixes (AWF-0063); includes AWF-WO-014's discover, header, cache
   and output-schema items, which this order supersedes once approved.
2. Sign-in is the approval (AWF-0062), per AWF-0052 decision 8.
3. Real-client proof with Claude (chat or Cowork) on a marked test account:
   connect, list, read, batch save, read-back, correction, evidence read and
   upload, renewal, revoke, reconnect, cleanup (AWF-0043). Record client and
   date; only then name it on `/ai`.
4. Target tool catalogue for the Site Guide blocks (AWF-0064), built as the
   AWF-WO-015/016 records land.
5. Repeat real-client proof with ChatGPT and Codex or Claude Code.
6. Rework `/ai` around per-client steps and a "did it work?" check.

## Dependencies

- AWF-0052 decision 8 for step 2.
- AWF-WO-015 records for step 4.

## Exclusions

- No AI authority to publish, delete, merge, share or act on FamilySearch.
- No CIMD work until the identity provider supports it.

## Stop rules

Stop if a real client cannot complete the standard path; record the failure and
keep its name unclaimed. Do not weaken the server to pass.

## Verification

Focused MCP tests; `pnpm verify`; live probes on apex and www with redirects
off; dated real-client lifecycle receipts with zero residue.

## Human gates

Scott's approval; Scott signs in and clicks Allow for each real-client run on a
marked test account (or approves the test account to use).

## Execution evidence

None yet. Proposed on 2026-10-06; Scott approves scope before it becomes Ready.

## History

- 2026-10-06: Proposed from the Site Guide draft and the MCP, media and page audits.
