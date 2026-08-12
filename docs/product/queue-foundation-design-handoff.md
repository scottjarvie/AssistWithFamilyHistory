# Family History Queue foundation and Claude Design handoff

Status: backend/source authority and expiry repair under normal software review. This document is a behavior and integration contract, not a claim that the repair, a final Queue screen, external AI connection, deployment, or authenticated production journey is live.

## Product boundary

The Family History Queue preserves a person's directive across sessions. It is not the internal Cards / Work Orders tracker, the research-operations readiness table, a generic todo list, or an autonomous task runner.

The product exposes exactly four Queue states:

| State | Meaning | Required visible content |
| --- | --- | --- |
| **Needs You** | Work is stopped on one decision, fact, file, review, or authority only the person can provide | The smallest exact question or action |
| **Working** | An authorized person or AI has an unexpired claim and is actively doing bounded work | The current genealogy-language step and who picked it up |
| **Waiting for your AI** | The directive is saved but nothing is running | Who it was left for, when, and connection/retry truth |
| **Done** | The result or cancellation is recorded and traceable | Readable result, references, provenance, and remaining uncertainty |

Failure, retry, disconnection, cancellation, completion, and handoff expiry are conditions inside those states. They are not a fifth state. A retryable failure returns to **Waiting for your AI** because nothing is running. An exhausted failure or expired handoff becomes **Needs You** with an exact action. A cancellation is **Done** with its reason retained.

## Audit of existing work and status surfaces

| Existing surface | Current meaning | Queue relationship |
| --- | --- | --- |
| `researchTasks` | Internal research todo / in-progress / blocked / done records, optionally assigned | Do not migrate or relabel. A user may attach a task to a new directive, but task state remains domain state. |
| `/app/operations` and `getOperationsQueue` | Derived evidence/readiness rows for people and provisional relatives | Not product Queue items. A row may inspire a directive or become optional context. |
| `researchChecks` | Evidence/readiness facts such as missing, in progress, complete, or needs review | Not Queue state. May be attached as work-thread context. |
| `importRuns` | Completed capture/merge outcomes with counts, warnings, provenance, and partial outcomes | Historical result, not active Queue work. A new review directive may reference an import run. |
| `familySearchSync` | Provider-specific sync/conflict/error state | Not Queue state and not proof of a connected provider job. |
| `sourceFacts` | Candidate / accepted / conflict / rejected evidence status | Not Queue state. A comparison directive may attach relevant evidence. |
| story draft / review / published and `storyReviewEvents` | Content maturity, publish safety, reviewer assignment, and history | Not Queue state. A revision or review directive may attach a story, but publication remains a separate human gate. |
| provisional-relative merge state | Identity-graph proposal / promotion / merge / dismissal | Not Queue state. Merge or promotion cannot be authorized by a Queue directive alone. |
| `/api/process` | One explicit first-party AI request/response with rate and privacy gates | Transient request, not a durable Queue runner. It is not automatically adapted. |
| `agentActivity` | Sparse API-call telemetry for the planned agent platform | Not the Queue history. Queue uses content-bearing, owner-visible `queueActivity` with the Queue item's deletion lifecycle. |
| `researchLog` | Research activity rows with their own status vocabulary | Not Queue history and not automatically imported. |
| API keys and scope presets | Human-managed credential lifecycle and planning scope vocabulary | Key resolution for incoming chosen-AI requests remains unimplemented. The Queue tool boundary cannot be called externally until that identity gate is real. |

There is no production data migration or backfill. Existing rows do not prove that a person issued a Queue directive, so silently converting them would create false product history.

## Durable model

`queueItems` is owner-scoped and stores:

- verbatim directive plus a derived short summary; context remains optional;
- requested outcome, high/normal/low priority, and a required reason for high priority;
- exactly one product state plus a non-state condition;
- optional context references grouped as research subject, evidence, and work thread;
- assigned actor, independently listed Queue operations, and a scope note that attached records grant no domain write authority;
- submitted, picked-up, updated, completed, canceled, lease, retry, and handoff-expiry timestamps where applicable;
- exact required action, current next step, result summary/references, failure/retry detail, and cancellation reason;
- optimistic `version` for compare-and-set concurrency; and
- creator and current actor attribution.

`queueActivity` is append-only and records the event, from/to product states,
actor, safe summary, the relevant next step/question/answer/result detail,
idempotency command id, resulting item version, and time. It does not duplicate
a raw directive, source payload, or secret. These details are private
content-bearing history and are deleted with the Queue item.

`queueCommandReceipts` makes commands idempotent per owner. Replaying the same command key and actor returns the recorded result; reusing a key for another command or actor fails closed.

## Domain context adapters

The directive is sufficient. Optional context is capped at 20 unique, owner-verified references:

- **Research subject:** person, relationship, place, or event.
- **Evidence:** source, citation, media, or context item.
- **Work thread:** research task, research check, story, import run, or provisional relative.

The server loads every reference and verifies its `vaultOwnerId` before saving it. A caller cannot infer access from a Convex id, and attaching a reference does not grant permission to mutate that record. Collection/project types remain unimplemented because this repository has no corresponding durable owner-scoped model to validate.

Every public Queue read and mutation is fail-closed locally after Clerk/Convex
identity resolution. Queue access does not inherit the broader legacy
trust-boundary shadow behavior: anonymous callers and supplied-owner mismatches
stop before Queue rows can be read or changed, regardless of
`TRUST_BOUNDARY_MODE`. Internal chosen-AI functions still require a
server-derived `VerifiedQueuePrincipal`; this source does not expose one through
MCP or a public credential resolver.

## Commands and transition safety

| Command | Allowed actor and state | Result |
| --- | --- | --- |
| Create | Verified owner; directive only is valid | Waiting; `disconnected` until an AI is assigned |
| Assign | Verified owner; any non-Done item | Waiting for the named AI |
| Claim | Assigned AI or owner; Waiting, or an expired Working lease | Working with bounded lease and current step; an AI lease cannot outlive its handoff authority |
| Checkpoint | Current actor with an unexpired lease | Working; advances version and lease |
| Request user action | Current assigned AI with unexpired lease | Needs You with exact action |
| Resume | Verified owner; Needs You | Waiting for your AI |
| Failure | Current assigned AI with unexpired lease | Waiting with scheduled retry, or Needs You after exhaustion/non-retryable failure |
| Complete | Current actor with unexpired lease | Done with readable result |
| Cancel | Verified owner; non-Done | Done with cancellation result/reason |
| Reopen | Verified owner; Done | Waiting for your AI |
| Expire | Scheduled and read-reconciled internal boundary after a real lease/handoff deadline | Needs You with reconnect/reassign action and one attributable, idempotent expiry event |
| Delete | Verified owner plus exact destructive confirmation | Hard-delete item, content-bearing activity, and command receipts in bounded batches |

All mutations are atomic Convex transactions. Stale versions return a retryable conflict instead of overwriting newer work. Claims are actor-bound and time-bounded. A chosen AI cannot checkpoint, fail, request user action, or complete after handoff authority expires even if a nominal lease was longer. Reassigning an expired item clears the stale deadline unless the person supplies a new future deadline; resuming an expired item also removes the expired deadline, and reopening disconnected work remains honestly disconnected. No Queue command changes a person, relationship, source, claim, story publication state, identity, access grant, or provider account.

## Query, filtering, retention, and representable service states

- Item lists use owner/state/priority indexes and cursor pagination capped at 50 items per request.
- Activity uses item/time indexes and cursor pagination capped at 100 rows per request.
- New lease and handoff deadlines schedule only lifecycle reconciliation, not
  research or autonomous work. Bounded item reads also reconcile a missed or
  pre-existing deadline, so scheduler delay cannot make stale Working authority
  look current indefinitely.
- The integration contract represents `loading`, `empty`, `ready`,
  `permission_denied`, `error`, `retry`, `disconnected_ai`, and
  `expired_handoff`; loading is a client state and the latter two derive from
  item conditions rather than becoming product states.
- Item conditions let the designed experience distinguish disconnected AI, scheduled retry, and expired handoff without inventing product states.
- Queue directives, results, and activity are private owner content. They belong in user export and account deletion. The implemented item deletion removes content and history rather than retaining a content-bearing audit row.
- This foundation does not define a global retention deadline. Queue continuity is durable until the owner deletes it; optional handoff expiry ends authority/claim continuity, not the user's record.

## Narrow chosen-AI / MCP boundary

`lib/queue/agentTools.ts` defines seven MCP-friendly workflow tools:

1. `list_queue_items`
2. `get_queue_item`
3. `claim_queue_item`
4. `checkpoint_queue_item`
5. `request_user_action`
6. `complete_queue_item`
7. `report_queue_failure`

Each tool requires a specific Queue scope. The server derives owner and actor from a `VerifiedQueuePrincipal`; a request cannot supply an arbitrary owner id and become authorized. Actual mutations additionally require that exact AI to be assigned to the item and hold the corresponding item operation.

There are deliberately no Queue tools for record deletion, identity merge, evidence promotion, publication, access changes, purchases, or outside communication. Those remain separate domain operations and human gates.

The repository still lacks incoming API-key resolution to a server-trusted principal, a live `/mcp` endpoint, `/ai`, `/ai.txt`, `/settings/ai`, client installation/revocation proof, and a real chosen-AI round trip. The Queue tools remain internal until AWF-0009 supplies and proves that identity boundary. Do not advertise a connected AI or MCP support from this source foundation.

## Claude Design handoff

Claude Design may decide final page composition, card layout, responsive information hierarchy, motion, and visual treatment. It must preserve these behavior slots and truths:

- Directive, product state, and handoff line are always available.
- **Working** shows the current step; **Needs You** shows the exact question/action.
- Optional context is grouped by research subject, evidence, and work thread.
- Result and activity are readable without reopening the originating AI conversation.
- Waiting copy says nothing is running; disconnected and retry-scheduled conditions are not rendered as Working.
- Filter and pagination controls operate over server cursors; the design must not assume the whole Queue is loaded.
- Concurrency conflicts prompt reload/retry and never silently discard newer history.
- Permission denied, backend unavailable, empty, retry, disconnected-AI, and expired-handoff states need complete treatments.
- Human-only claim/checkpoint/complete remains usable with no AI connection.
- Destructive deletion requires explicit confirmation; publication/merge/access controls do not belong in generic Queue actions.
- Preserve Discover Their Stories' archival research-to-story character and existing signed-in shell seams. This handoff does not authorize a new navigation destination or a generic sibling visual design.

## Verification boundary

Source verification covers pure state/authority contracts and real Convex-runtime fixtures for Queue-local fail-closed anonymous/cross-owner denial even in legacy shadow mode, owner isolation, foreign-reference rejection, directive-only creation, pagination, handoff-capped claim leases, automatic and read-time expiry, expired-authority rejection, idempotent recovery/reassignment, actor authority, optimistic concurrency, Needs You/resume, retry/exhaustion, completion/activity attribution, human-only operation, and hard deletion.

Deployment, Convex schema publication, authenticated production behavior, a real chosen-AI connection, and the final designed Queue screen remain separate proof gates and must be reported separately.
