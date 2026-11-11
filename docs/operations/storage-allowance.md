# Storage allowance operations

No settings row means enforcement off. Administrators resolve through the
existing Convex `requireTrustBoundarySuperAdmin` boundary
(`TRUST_BOUNDARY_SUPER_ADMIN_IDS`), not the web server's separate admin list.
All allowance settings and meter functions require a website-person session.
Do not change runtime credentials or access lists as part of this release.

## Shipping

After review, merging to main triggers the existing Vercel release command:

```sh
npx --no-install convex deploy --cmd 'npx --no-install next build'
```

Do not run that command manually. No production read, deploy, backfill, cleanup
or enforcement change was performed while building this draft.

## All-account preflight and backfill

Use an explicitly selected, reviewed deployment. This resumable driver discovers
owners from media, upload sessions, counters, reservations and overrides, and
checks the Convex system storage inventory for unregistered blobs. It
reports accounts seen, bytes, file references, unknown sizes and missing owners.
The dry run writes only its job metadata; it changes no counters, settings or files.
The existing `usageLimits:dryRunPage` remains a fully read-only query.

```sh
pnpm exec convex run usageRecount:allAccountsStep '{}'
pnpm exec convex run usageRecount:allAccountsStep '{"jobId":"<returned-job-id>"}'
```

Repeat the second command until `done`. Start the separately reviewed backfill:

```sh
pnpm exec convex run usageRecount:allAccountsStep '{"dryRun":false}'
pnpm exec convex run usageRecount:allAccountsStep '{"jobId":"<returned-job-id>"}'
```

Each call reads a bounded source page or advances one owner's bounded recount.
After discovery, counting and validation, its final step records
`backfillCompletedAt`. It refuses completion if any source has no owner or an
unknown size, or any counter remains unready. Fix unresolved records under a
separate review and start a fresh job. Concurrent byte writes bump each owner's
revision and restart that owner's recount. A guest migration invalidates both
counter rows and requires a target recount; it is still denied in enforce mode.
Legacy media with no owner is reported as unattributed, never assigned to a
person mentioned in the file. Keep account IDs and results out of public PRs.

Before enabling limits, confirm the existing trust boundary is enforced. Set the
site's upload/day/in-flight budgets appropriately for its advertised capabilities.
Default AI batch reliability budgets preserve this site's existing aggregate
per-kind limits and 256 KiB request ceiling; settings may override them. The brief
returns the effective budgets. Unknown accounts warn before backfill and start
at ready zero after it. Uncounted meter and AI output contain no byte numbers.

## Finding abandoned bytes

Convex upload URLs cannot bind a resulting blob ID to the reservation in advance.
A response lost before staging is recovered by paginating the `_storage` system
table. The sweep ignores objects younger than 25 hours (past upload URL validity,
reservation lifetime and a safety interval). For each older object it checks
`media.by_storage` and `uploadReservations.by_storage` in the same transaction.
Any reference preserves the blob. Dry run is the default:

```sh
pnpm exec convex run usageLimits:sweepUnclaimedStorage '{"cursor":null}'
pnpm exec convex run usageLimits:sweepUnclaimedStorage '{"cursor":null,"dryRun":false}'
```

Repeat with the returned cursor. The second command deletes real data and needs
separate approval after the dry run is reviewed. It is not scheduled destructively
by this release. Ordinary reservation expiry deletes only its own staged object,
and only if no media references it. B2 cleanup protects active originals, copies
and replacement history; it subtracts only after successful provider deletion.
A provider failure retains accounting and retries at most eight attempts; after
that the hold remains for operator review. Its `dryRun:true` action lists candidate
keys without deleting anything.

The recount verifies Convex storage metadata, but B2 totals come from pinned
manifests and tracked failed-copy holds. It cannot prove B2 object existence or
find unregistered B2 versions: a separate provider inventory is needed for that.
The Convex sweep closes the unclaimed Convex-blob gap. Pending declared sizes are
reservations, not stored-byte recount totals; multipart parts are provider-native
and no second local original is staged. Export JSON streams directly to the
request and is never stored, counted or quota-refused; it ends with the request.
There are no other generated binary outputs beyond image viewing copies.

## Code ceilings retained

Upload policy defaults live in `siteDefaults` (web, image, original), with settings
overrides. Rendered images cannot exceed the 20 MiB supported transport ceiling.
The independent 3 MiB JPEG generator output bound is not an editable upload cap;
a legacy `maxFileBytes.copy` value cannot disable generation. Existing technical
ceilings remain: 20 MiB relay bodies/multipart threshold, 16 MiB parts, 30-minute
and two-hour sessions, two-hour reservations, 100 rows per recount/sweep page,
500 admin rows, 256 KiB AI requests, 100,000-character source text, per-kind record
batch limits, and evidence reply budgets in `lib/mcp/contract.ts`. Transport
numbers in tool prose describe transport, not policy. Downloads/exports are not
newly gated by this change. Enforced web refusals roll back their mutation, so
history retains warn/off events rather than a durable log of every refusal.

For older Convex records missing size metadata, repair one page at a time first:

```sh
pnpm exec convex run usageRecount:repairConvexSizesPage '{"cursor":null}'
```

Repeat returned cursors to completion. It reads actual object sizes and updates
record metadata only; it never changes a file. Exact B2 manifests have always
required original and copy sizes. The all-account driver also reports unclaimed
Convex inventory entries and refuses to mark backfill complete while any remain.
Settle active uploads and review the unclaimed sweep before backfilling.

Backend and Next upload-route changes roll back together by reverting this PR;
keep enforcement off throughout a rollback. Old undeclared starts still work in
off/warn and close once on. No separate installed uploader or Node script was
added. Physical limits additionally include a ten-minute finalizer lease and
25-hour unclaimed-blob safety age. The operator GB-to-byte conversion factor in
`UsageLimitsView` is a unit conversion, not an allowance policy literal.
