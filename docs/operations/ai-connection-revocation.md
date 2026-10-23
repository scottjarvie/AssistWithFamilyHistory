# AI connection removal and reapproval

Implementation contract, 23 October 2026. This describes source behavior and
synthetic regression coverage, not deployed or authenticated-browser proof.

“Remove from this list” hides a closed connection using optional `hiddenAt`.
It does not delete the grant. Revoked/denied status, consent receipt, chosen
permissions, record boundary and expiry remain durable. Removing a pending or
expired connection records a revocation as well, preventing sign-in from
turning that removal into automatic permission. Active connections must first
be revoked. Owner checks apply even if the wider trust-boundary mode is shadow.

A later request for the same owner, issuer and client remains refused. It
reveals the most recent closed connection in settings so the owner can use
“Review and approve again”. Showing a row grants no authority. The approval
form starts with its saved scopes and record boundary; an existing end date
starts the new approval with a visible seven-day choice rather than unlimited
access. The owner reviews a new duration (including no end date) and presses
“Approve exactly this”. This explicit settings action creates a new grant and
consent receipt, preserving the old revocation row as hidden history. Another
active grant for that owner/issuer/client prevents duplicate reapproval.

The shared `effectiveScopes`/expiry helpers remain authoritative. Full grants
include current and future ordinary tools; chosen grants never acquire future
permissions automatically. The seven-scope frozen legacy inference baseline
is unchanged. Only demonstrably automatic legacy sign-in expiry receipts may
ignore old dates at read time; explicit and ambiguous dates remain enforced.

## Legacy uncertainty

Rows deleted by the earlier removal implementation are absent evidence. This
fix cannot reconstruct their owner/client identity, revocation, narrowing,
expiry or consent. A missing row is therefore still indistinguishable from a
client that has never connected. No restoration, cleanup or migration is
claimed, implemented or run. Do not infer historical consent or recreate rows
from guesses. Recovery of a particular old deletion would require separately
reviewed reliable evidence and explicit scope.

## Verification and release boundary

`convex/mcpGrantDefaults.test.ts` runs real handlers in an isolated in-memory
Convex test backend: sign-in, narrowing, chosen date, revoke, remove, refusal,
owner isolation, explicit reapproval and refusal after revoking again. Hidden
rows are filtered before the visible 100-row limit. The settings render contract
checks the reapproval controls and saved selections; it is not browser proof.

The new optional schema field and backend logic must be released through the
ordinary coordinated production path in [how production deploys](how-production-deploys.md).
No production rows are changed by this implementation lane. Authenticated
localhost desktop/mobile screenshots and persistence proof remain a separate
release gate owned by the coordinator.
