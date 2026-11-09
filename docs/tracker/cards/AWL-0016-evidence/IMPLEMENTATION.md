# AWL-0016 Family History implementation

Prepared on MacBook Pro using gpt-6.1-sol. Base: `00c893aff4a7d94301d998de0bc53518e55d66eb`.
Authority: approved build brief in Assist With Life origin/main, Core 1.24.0 section 4; Scott's Family History decisions and audit lessons 1–17.

## Data and authority

- Optional `addedBy` defaults at read time to person or ai_on_request from the stored creator. Existing AI research tasks are not classified as unsolicited ideas.
- Legacy `needs_you` rows project to Answered when a result is present, AI working when pickedUpAt is present, otherwise Waiting on AI; the exact old question becomes the input flag. Subsequent authorized edits write the projected state. Original activity remains.
- Source facts, connections, provisional relatives, media review, living-person rules and second review retain their own authority. Accepting Queue work never accepts a genealogy conclusion or an identity merge.
- New suggestions display the person’s saved connection name, falling back to Your AI. This display label never participates in grant or claim authority.
- Queue ownership is the verified individual OAuth/Clerk subject. Suggestion rows are private to that person. Withdraw also checks the issuing credential, not the shared chosen-AI assignment label.
- New MCP Queue creation requires explicit `addedBy`. Suggestions additionally require `family_history:queue:suggest`. No AWL-0015 grant default, restriction lineage, frozen legacy baseline or self-restoration rule was changed. New tools use the existing effective powers and record-boundary decisions; optional From references cannot widen those boundaries.
- The Queue mutation helper refuses every work command for open suggestions and archived items in the mutation transaction. Review uses person-session mutations, never an MCP accept/dismiss tool.
- Dismiss reasons remain word for word. Dismissed-idea checks use a fixed-size SHA-256 idea key with an owner-scoped index, without a scan cap. The dismissal marker remains after restore or acceptance.
- A missing, deleted, foreign or mismatched From record removes only the From link, not the Queue item. Record references without a standalone route have a person-only origin read view, which links to an existing workspace where available.

## Counts and ship-time counter backfill

Normal Queue lists filter in the database before cursor pagination. Navigation calls the existing HTTP route's count-only mode, which reads one owner counter row (or one owner item to distinguish an empty Queue from an uninitialized count). It never fetches Queue history or collects the Queue. Counts fail soft as unavailable, never a fabricated zero.

New Queue writes and every work/review/archive/withdraw/delete transition update `queueCounters` atomically, including exact three-state and record totals for the Me summary. Every flagged non-archived item counts, including Answered. The flag tab is an overlay, not a work lane; open suggestions remain absent from ordinary work lanes and their counts. Suggestion/archive views do not group rows into work states or show work-state summaries; an open suggestion says Awaiting your decision, never Ready for pickup. Rows show lettered options, evidence and a direct From link.

Existing owners need **only a counter-marker backfill**, not a state/origin/content migration. `internal.queue.backfillQueueCounters` processes 100 records per cursor batch. `dryRun: true` writes nothing and reports counts. Live batches mark each item once, maintain counters alongside concurrent normal edits, record the next cursor, and replay the last batch safely. Totals become available only after the last batch. Run it person by person at ship time, only after lead approval; never during this draft build.

Synthetic in-memory Convex fixture: 601 historic rows; dry run scans all 601, reports 601 markers needed, 301 open suggestions and 300 flagged Answered items. After the live synthetic pass, another dry run reports 0 markers needed and the same totals. Production has not been queried or changed.

## Audit lessons applied

1. AI update schemas expose no flag clear. Completion and failure preserve an existing flag; mutation tests and canonical/alias transport tests cover attempted clears.
2. The tab and pill include flagged Answered items. Archive and restore update the same total.
3. Indexed dismissal rule checks and resumable counter backfill have no first-N correctness cutoff. Tests exceed 500 rows.
4. Nav is count-only, uses incremental counters and fails soft.
5. Asking or failing without retry clears the claim and lease, preserves the state, and retains the question until a person responds. Flagged or archived rows do not stall expiry reconciliation.
6. Non-work rows are filtered before pagination/reach accounting. Existing research steps remain record-level records, not implicit Queue work.
7. Shared server/setup instructions address the AI and name the person's exclusive accept/dismiss/clear authority.
8. Grant rules and historical security assertions stay intact; new tools use the current effective powers and boundaries. The Queue state assertions adapt to the approved three-state model plus flag.
9. Invalid From references hide only their link.
10. Withdrawal uses the same command receipt, actor-attributed history and counter transaction as other decisions.
11. AI archive and withdrawal refuse a flagged item with `Only the person can clear Needs your input`. The person's archive remains available. AI Queue archive/restore uses the existing archive power as well as Queue work; it never adds a grant power.

12. A permanent first-person-action marker is set on review, the start of Edit first, and replies; restore/reopen never clears it. Withdrawal checks it before replay receipts as well as before new writes.

13. Audited every old-state reader in production UI, briefs, API/tool schemas, public copy, README and current product documentation. The Me card now uses counters and the flag; AI briefs separate work from person questions. Each flagged Queue row and detail shows the question, Answer and Archive. Historical design baselines and tracker evidence retain their original vocabulary; see READER-AUDIT.md.
14. Questions require an unclaimed item or the caller's exact credential-held claim. Claims now record the credential alongside the chosen-AI assignment; another credential, a person's claim, canceled work, archived work and expired handoffs cannot be wiped by a question. Legacy shared claims without a credential fail closed until release or expiry. Answered follow-up questions remain allowed under Core section 4 and lesson 2.
15. New suggestion reads inherit selected-person and named-Queue reach before pagination, including accepted suggestions, dismiss reasons and withdrawals. Selected-person connections can read suggestions with a directly approved person From record; unlinked or unattributable suggestions fail closed. Existing ordinary Queue reach is unchanged. Nav/person counts require a website person token; no whole-owner suggestion count is returned to MCP. Transport tests exercise all four statuses through one-record pages.
16. `auth.config.ts` registers only the configured Clerk issuer with `applicationID: convex`; MCP OAuth tokens are verified separately for the /mcp resource. Public Queue functions additionally require that configured website issuer and refuse OAuth client/scope claims and any exposed non-Convex audience. No sid or azp claim is required by this guard. Synthetic tests inject an AI-token identity with the same owner and issuer and confirm read/count/review/reply refusal. The touched Me stats action uses the same person check. No auth provider or dashboard configuration changed.

17. A native Clerk website fixture uses exactly `aud, exp, fva, iat, iss, nbf, sid, sts, sub, v`. It has no azp, client_id, scope or scp and can read counts and accept a suggestion. Separate cases refuse each OAuth marker and a present foreign azp; a matching azp remains valid. The issuer/audience checks are unchanged. The local session and Convex-cookie bridge use the same optional-azp and OAuth-marker policy, covered by a signed native-claim fixture. A dev/Sandbox-only inspection of this site's actual token is recorded separately; no token or claim values belong in Git.

## Scope and evidence limits

Worktree only, draft PR only. No production config, deployment, authentication, database, source import or owner-checkout change. No subagents. All backend execution is synthetic. Browser checks use the development-only invented-record harness with no backend configured; these are not authenticated live-product or provider proofs.

The approved brief supersedes survey proposals to use `origin` or bulk-migrate historical suggestions. It adds withdrawal, Edit first, archive/restore, From records and a removable suggestion power. The later audit lessons require the small counter backfill described above.

## Verification

Final results are recorded in VERIFICATION.md. Earlier checks are not evidence for later edits.
