# Opus audit follow-up for PR #136

Audit: claude-opus-5-5 at `494c3cfa`; fixes by gpt-6.1-sol on MacBook Pro.

- Acceptance cleanup calls the shared Queue counter-removal helper before deleting each item, as normal deletion does. A real fixture run/clear/repeated-clear test restores every counter to the pre-run values while retaining unrelated work.
- Person assignment clears only the system-generated `queue-expiry` question. It retains an AI's actual question. The original expiry/reassign/claim expectation is restored, with a separate preservation test.
- Context and From writes normalize each ID against the table for its declared kind before the same-owner check. A mismatched-kind test refuses the write.
- Website azp accepts production apex/www, registered local origins, and HTTPS FH deployment/git aliases under the exact `assistwithfamilyhistory` project and `jarvies-projects` team. Tests refuse other projects, teams, arbitrary Vercel hosts, HTTP previews and suffix lookalikes. Missing azp and OAuth-marker behavior stay unchanged. The PR's Vercel status target verifies the current project/team slugs; the old ignored local .vercel metadata is stale and was not used as authority.
- Scott explicitly skipped another actual-token inspection, accepting the Plants/Homes native-token evidence. No sign-in retry is pending.

Verification: `pnpm verify` passed **all 56 steps**, including the build, in 100 seconds: **166 Node**, **7 process-route**, **478 Convex/feature tests across 45 files**. An owned runtime slot was acquired and released. No living-person or second-review rule changed. No index or schema changed in this follow-up.

## Release sequence after Scott checks the pushed diff

1. Deploy the reviewed backend first, using the qualified production binding (the documented production deployment is `accomplished-dodo-308`; never trust the local default). Inspect the deployment plan and refuse index deletions.
2. Immediately run `internal.queue.backfillQueueCounters` with `dryRun: true`, resuming every cursor to completion for each owner. Report aggregate scanned, changed, suggestion and input totals without owner identifiers. Then apply the same resumable backfill with dryRun false, finish every owner, and verify readiness/counts. The function already supports dry-run mode. Existing 601-row synthetic counts remain test evidence only; production counts have not yet been observed.
3. Merge only after backend and backfill receipts; let the normal frontend release run. Verify the production release and public `/ai.txt` tool/permission fingerprint. Keep publication and authenticated/provider proof separate.

This follow-up only prepares and pushes the audit fixes. No production deploy, counter migration or merge has been performed.
