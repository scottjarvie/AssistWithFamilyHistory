# Whole-tree import: separate access and release review

Status: **HOLD — local code/tests only; no grant or production change applied.**
Written2026-10-27 for PR86. This is a release decision record, not approval.
PR90's pending exact-candidate publication approval covers neither these tools
nor a later combined SHA. A green verifier is code evidence, not consent to
extend existing connections.

| New MCP tool | Existing permission | Additional capability |
|---|---|---|
| `family_history_begin_tree_import` | `family_history:research:write` | Create/reopen an owner import session, including label, root outside ID and progress. |
| `family_history_import_tree_batch` | `family_history:research:write` | Send up to500 top-level source/person/relationship/media/citation/note records per call, plus bounded nested facts/targets; refresh verified imported state, write private records, keys, proposed duplicate links and receipts. Dry-run is non-writing. |
| `family_history_get_tree_import` | `family_history:context:read` | List ten recent sessions, or read owner progress, cursor, recent batch failures and paginated proposed duplicate metadata/names. |

All three require whole-workspace boundaries. Active full grants and chosen
grants containing the required existing scope would gain the corresponding
tools automatically when this catalog/backend is deployed. Full grant defaults
and the frozen legacy-full baseline are unchanged. No new scope, new approval
receipt, grant migration or opt-in is introduced by this patch. Therefore the
absence of a settings/grant diff does **not** mean access is unchanged.

Selected-people boundaries are refused for all three tools. Expired, revoked,
wrong-owner and insufficient-scope connections remain refused. The internal
data functions recheck the grant. Outside IDs are owner/system scoped;
importKey/session does not create a new tenant boundary. Existing tenant mode,
issuer configuration and the separate PR89 readiness hold remain untouched.

This feature also adds three persistent tables, additive schema/indexes,
owner-table entries in the existing explicit guest migration, and a shared
MCP request ceiling of1MiB. It adds no cron/scheduler, provider login/fetch,
identity merge, public publishing, export or deletion tool. Media starts
private, unreviewed and AI-disallowed. Import fingerprints protect later human
record/link edits but are not an access-control mechanism or new consent.

Before a production release, separately review whether existing whole-workspace
research/context consent should include these bulk/session tools, or whether
an explicit additional opt-in/capability gate is required. If a gate is chosen,
its design, implementation, positive/negative tests and user-facing consent
must be reviewed as a separate access change. Do not silently broaden grants,
set shadow mode, weaken a boundary or treat this document as authorization.

Later release evidence must pin the actual full candidate, confirm schema/index
and backend/frontend outcomes, and keep hosted-client/scale proof distinct from
offline tests. The normal500-record call cap is not a promise that every maximally
rich batch fits request/runtime limits; previews above the2MiB internal state
budget refuse without saving. General public note retrieval and its UI remain
follow-up. No real grants, tokens, family records or provider sessions were used
or changed to produce the local proof.
